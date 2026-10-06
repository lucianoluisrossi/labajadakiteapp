// Tests del webhook de MercadoPago y del cron de vencimiento VIP.
// Firestore y firebase-admin se reemplazan por fakes en memoria; fetch se mockea por URL.
// Correr con: npm test

import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// --- Fakes -----------------------------------------------------------------

const store = new Map();   // 'coleccion/docId' -> datos
const logs = [];           // entradas de mp_webhook_log

const docRef = (col, id) => ({
    get: async () => ({ exists: store.has(`${col}/${id}`), data: () => store.get(`${col}/${id}`) }),
    set: async (data, opts) => {
        const prev = opts?.merge ? store.get(`${col}/${id}`) || {} : {};
        store.set(`${col}/${id}`, { ...prev, ...data });
    },
});

const query = (col, field, op, value) => {
    const docs = () => [...store.entries()]
        .filter(([key, d]) => key.startsWith(`${col}/`) && (op === '<=' ? d[field] != null && d[field] <= value : d[field] === value))
        .map(([key, d]) => { const id = key.slice(col.length + 1); return { id, data: () => d, ref: docRef(col, id) }; });
    const get = async () => ({ docs: docs(), empty: docs().length === 0 });
    return { get, limit: () => ({ get }) };
};

const fakeDb = {
    collection: (col) => ({
        add: async (data) => { if (col === 'mp_webhook_log') logs.push(data); },
        doc: (id) => docRef(col, id),
        where: (field, op, value) => query(col, field, op, value),
    }),
};

mock.module(new URL('../api/_firebase.js', import.meta.url).href, {
    namedExports: { initFirebase: () => fakeDb },
});
mock.module('firebase-admin', {
    defaultExport: { firestore: { FieldValue: { serverTimestamp: () => 'TS', increment: (n) => ({ increment: n }) } } },
});

process.env.MP_PLAN_ID = 'PLAN';
const { default: handler, computeVipUntil, verifySignature } = await import('../api/mp-webhook.js');
const { default: vipExpire } = await import('../api/vip-expire.js');

// Respuestas de la API de MP por sufijo de URL; lo no listado responde 404.
let mpApi = {};
let mpCalls = 0;
globalThis.fetch = async (url) => {
    mpCalls++;
    const key = Object.keys(mpApi).find(k => url.endsWith(k));
    const r = key ? mpApi[key] : { status: 404, body: {} };
    if (r === 'network') throw new Error('ECONNRESET');
    return { ok: r.status < 300, status: r.status, json: async () => r.body };
};

beforeEach(() => {
    store.clear(); logs.length = 0; mpApi = {}; mpCalls = 0;
    delete process.env.MP_WEBHOOK_SECRET; delete process.env.CRON_SECRET;
});

// --- Helpers ---------------------------------------------------------------

async function callWebhook(body, { headers = {}, query = {} } = {}) {
    const out = {};
    const res = { status: (code) => { out.code = code; return { json: (b) => { out.body = b; }, end: () => {} }; } };
    await handler({ method: 'POST', body, headers, query }, res);
    return out;
}

async function callExpire(headers = {}) {
    const out = {};
    const res = { status: (code) => { out.code = code; return { json: (b) => { out.body = b; } }; } };
    await vipExpire({ headers }, res);
    return out;
}

const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();
const vip = (email = 'a@b.com') => store.get(`kiter_vip/${email.replace(/[.#$[\]@]/g, '_')}`);

const subscription = (status, extra = {}) => ({
    status: 200,
    body: {
        id: 'S1', status, payer_email: 'a@b.com', preapproval_plan_id: 'PLAN',
        auto_recurring: { frequency: 1, frequency_type: 'months' },
        summarized: { last_charged_date: daysAgo(5) },
        ...extra,
    },
});

const payment = (status, subscriptionId = 'S1') => ({
    status: 200,
    body: {
        id: 77, status, payer: { email: 'a@b.com' },
        point_of_interaction: subscriptionId ? { transaction_data: { subscription_id: subscriptionId } } : {},
    },
});

// --- Escenarios de suscripción --------------------------------------------

test('alta: suscripción authorized activa el VIP', async () => {
    mpApi = { '/preapproval/S1': subscription('authorized') };
    const r = await callWebhook({ type: 'subscription_preapproval', data: { id: 'S1' } });
    assert.equal(r.code, 200);
    assert.equal(vip().active, true);
    assert.equal(vip().preapproval_id, 'S1');
});

test('cobro aprobado (factura) activa el VIP vía /authorized_payments', async () => {
    mpApi = {
        '/authorized_payments/INV1': { status: 200, body: { id: 'INV1', preapproval_id: 'S1', payment: { id: 9, status: 'approved' } } },
        '/preapproval/S1': subscription('authorized'),
    };
    const r = await callWebhook({ type: 'subscription_authorized_payment', data: { id: 'INV1' } });
    assert.equal(r.code, 200);
    assert.equal(vip().active, true);
});

test('cobro aprobado (payment) activa el VIP y guarda payment_id', async () => {
    mpApi = { '/v1/payments/1': payment('approved'), '/preapproval/S1': subscription('authorized') };
    await callWebhook({ type: 'payment', data: { id: 1 } });
    assert.equal(vip().active, true);
    assert.equal(vip().payment_id, 77);
});

test('cobro rechazado con suscripción authorized: sigue VIP (MP reintenta)', async () => {
    mpApi = { '/v1/payments/2': payment('rejected'), '/preapproval/S1': subscription('authorized') };
    await callWebhook({ type: 'payment', data: { id: 2 } });
    assert.equal(vip().active, true);
});

test('pausa dentro del período pago: mantiene VIP con vip_until futuro', async () => {
    mpApi = { '/preapproval/S1': subscription('paused') };
    await callWebhook({ type: 'subscription_preapproval', data: { id: 'S1' } });
    assert.equal(vip().active, true);
    assert.equal(vip().status, 'paused');
    assert.ok(vip().vip_until > new Date().toISOString());
});

test('cancelación dentro del período pago: mantiene VIP', async () => {
    mpApi = { '/preapproval/S1': subscription('cancelled') };
    await callWebhook({ type: 'subscription_preapproval', data: { id: 'S1' } });
    assert.equal(vip().active, true);
});

test('cancelación con período vencido: baja inmediata', async () => {
    mpApi = { '/preapproval/S1': subscription('cancelled', { summarized: { last_charged_date: daysAgo(40) } }) };
    await callWebhook({ type: 'subscription_preapproval', data: { id: 'S1' } });
    assert.equal(vip().active, false);
});

test('cancelación sin cobros previos: baja inmediata aunque haya next_payment_date', async () => {
    mpApi = { '/preapproval/S1': subscription('cancelled', { summarized: {}, next_payment_date: '2099-01-01T00:00:00Z' }) };
    await callWebhook({ type: 'subscription_preapproval', data: { id: 'S1' } });
    assert.equal(vip().active, false);
});

test('pago aprobado viejo de suscripción cancelada: NO reactiva', async () => {
    mpApi = { '/v1/payments/3': payment('approved'), '/preapproval/S1': subscription('cancelled', { summarized: {} }) };
    await callWebhook({ type: 'payment', data: { id: 3 } });
    assert.equal(vip().active, false);
});

// --- Duplicados ------------------------------------------------------------

test('evento duplicado: se procesa una vez y el reenvío no consulta a MP', async () => {
    mpApi = { '/preapproval/S1': subscription('authorized') };
    const event = { id: 1001, type: 'subscription_preapproval', action: 'updated', data: { id: 'S1' } };

    await callWebhook(event, { headers: { 'x-request-id': 'req-1' } });
    assert.equal(store.get('mpEvents/1001').request_id, 'req-1');
    assert.deepEqual(store.get('mpEvents/1001').raw, event);

    mpCalls = 0;
    const r = await callWebhook(event);
    assert.equal(r.body.duplicate, true);
    assert.equal(mpCalls, 0);
    assert.deepEqual(store.get('mpEvents/1001').duplicates, { increment: 1 });
});

test('evento que falló con 500 no queda marcado y el reintento se procesa', async () => {
    mpApi = { '/preapproval/S1': { status: 503, body: {} } };
    let r = await callWebhook({ id: 2002, type: 'subscription_preapproval', data: { id: 'S1' } });
    assert.equal(r.code, 500);
    assert.equal(store.has('mpEvents/2002'), false);

    mpApi = { '/preapproval/S1': subscription('authorized') };
    r = await callWebhook({ id: 2002, type: 'subscription_preapproval', data: { id: 'S1' } });
    assert.equal(r.code, 200);
    assert.equal(vip().active, true);
});

test('evento sin id de notificación: se procesa siempre', async () => {
    mpApi = { '/preapproval/S1': subscription('authorized') };
    await callWebhook({ type: 'subscription_preapproval', data: { id: 'S1' } });
    mpCalls = 0;
    const r = await callWebhook({ type: 'subscription_preapproval', data: { id: 'S1' } });
    assert.notEqual(r.body.duplicate, true);
    assert.ok(mpCalls > 0);
});

// --- Errores y filtros -----------------------------------------------------

test('falla transitoria de MP (5xx, 401, red) responde 500 para que MP reintente', async () => {
    for (const failure of [{ status: 502, body: {} }, { status: 401, body: {} }, 'network']) {
        mpApi = { '/preapproval/S1': failure };
        const r = await callWebhook({ type: 'subscription_preapproval', data: { id: 'S1' } });
        assert.equal(r.code, 500);
    }
});

test('id inexistente en MP responde 200 y queda en el log', async () => {
    const r = await callWebhook({ type: 'payment', data: { id: 999 } });
    assert.equal(r.code, 200);
    assert.equal(logs.at(-1).result, 'error');
});

test('pago sin suscripción asociada no da VIP', async () => {
    mpApi = { '/v1/payments/4': payment('approved', null) };
    await callWebhook({ type: 'payment', data: { id: 4 } });
    assert.equal(vip(), undefined);
    assert.equal(logs.at(-1).reason, 'pago sin suscripción asociada');
});

test('suscripción de otro plan no da VIP', async () => {
    mpApi = { '/preapproval/S1': subscription('authorized', { preapproval_plan_id: 'OTRO' }) };
    await callWebhook({ type: 'subscription_preapproval', data: { id: 'S1' } });
    assert.equal(vip(), undefined);
});

test('suscripción sin preapproval_plan_id no se bloquea', async () => {
    mpApi = { '/preapproval/S1': subscription('authorized', { preapproval_plan_id: undefined }) };
    await callWebhook({ type: 'subscription_preapproval', data: { id: 'S1' } });
    assert.equal(vip().active, true);
});

test('tópico no manejado se ignora', async () => {
    const r = await callWebhook({ id: 3003, type: 'merchant_order', data: { id: 1 } });
    assert.equal(r.code, 200);
    assert.equal(store.get('mpEvents/3003').response.ignored, true);
});

test('email de MP con mayúsculas y espacios se normaliza', async () => {
    mpApi = { '/preapproval/S1': subscription('authorized', { payer_email: '  Juan.Perez@Gmail.COM ' }) };
    await callWebhook({ type: 'subscription_preapproval', data: { id: 'S1' } });
    assert.equal(vip('juan.perez@gmail.com').email, 'juan.perez@gmail.com');
});

// --- computeVipUntil -------------------------------------------------------

test('computeVipUntil: último cobro + período', () => {
    assert.equal(computeVipUntil({ auto_recurring: { frequency: 7, frequency_type: 'days' }, summarized: { last_charged_date: '2026-10-01T00:00:00Z' } }), '2026-10-08T00:00:00.000Z');
    assert.equal(computeVipUntil({ summarized: { last_charged_date: '2026-10-01T00:00:00Z' } }), '2026-11-01T00:00:00.000Z');
    assert.equal(computeVipUntil({ next_payment_date: '2026-11-05T00:00:00Z' }), null);
});

// --- Firma -----------------------------------------------------------------

// Vectores del test oficial de sdk-nodejs (src/utils/webhook/webhook.spec.ts)
const SECRET = 'your_secret_key_here';
const REQUEST_ID = '2066ca19-c6f1-498a-be75-1923005edd06';
const DATA_ID = 'ord01jq4s4ky8hwq6na5pxb65b3d3';
const TS = '1742505638683';
const hmac = (id, rid, ts, secret = SECRET) =>
    crypto.createHmac('sha256', secret).update((id ? `id:${id};` : '') + (rid ? `request-id:${rid};` : '') + `ts:${ts};`).digest('hex');
const validHeader = `ts=${TS},v1=${hmac(DATA_ID, REQUEST_ID, TS)}`;

test('verifySignature: casos del SDK oficial', () => {
    const base = { xSignature: validHeader, xRequestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET };
    assert.equal(verifySignature(base), 'valid');
    assert.equal(verifySignature({ ...base, xSignature: 'this-is-garbage' }), 'malformed_header');
    assert.equal(verifySignature({ ...base, xSignature: undefined }), 'missing_header');
    assert.equal(verifySignature({ ...base, xSignature: `ts=${TS}` }), 'malformed_header');
    assert.equal(verifySignature({ ...base, secret: 'otra' }), 'mismatch');
    assert.equal(verifySignature({ ...base, secret: undefined }), 'no_secret');
    assert.equal(verifySignature({ ...base, dataId: undefined, xSignature: `ts=${TS},v1=${hmac(undefined, REQUEST_ID, TS)}` }), 'valid');
});

test('firma inválida se registra pero no se rechaza (modo solo registrar)', async () => {
    process.env.MP_WEBHOOK_SECRET = SECRET;
    let r = await callWebhook({ id: 501, type: 'merchant_order', data: { id: DATA_ID } },
        { headers: { 'x-signature': validHeader, 'x-request-id': REQUEST_ID }, query: { 'data.id': DATA_ID } });
    assert.equal(store.get('mpEvents/501').signature, 'valid');

    r = await callWebhook({ id: 502, type: 'merchant_order', data: { id: 'x' } }, { headers: { 'x-signature': 'ts=1,v1=abc' } });
    assert.equal(r.code, 200);
    assert.equal(store.get('mpEvents/502').signature, 'mismatch');
});

// --- Cron vip-expire -------------------------------------------------------

test('vip-expire: solo desactiva pausados/cancelados con vip_until vencido', async () => {
    store.set('kiter_vip/vencido', { active: true, status: 'cancelled', vip_until: daysAgo(1) });
    store.set('kiter_vip/vigente', { active: true, status: 'paused', vip_until: new Date(Date.now() + 864e5).toISOString() });
    store.set('kiter_vip/manual', { active: true, status: 'authorized', manual: true });
    store.set('kiter_vip/authorized_atrasado', { active: true, status: 'authorized', vip_until: daysAgo(3) });

    const r = await callExpire();
    assert.equal(r.code, 200);
    assert.deepEqual(r.body.expired, ['vencido']);
    assert.equal(store.get('kiter_vip/vencido').active, false);
    for (const id of ['vigente', 'manual', 'authorized_atrasado']) assert.equal(store.get(`kiter_vip/${id}`).active, true);
});

test('vip-expire: exige CRON_SECRET si está configurado', async () => {
    process.env.CRON_SECRET = 'xyz';
    assert.equal((await callExpire()).code, 401);
    assert.equal((await callExpire({ authorization: 'Bearer xyz' })).code, 200);
});
