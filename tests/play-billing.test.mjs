// Tests de las compras de Google Play (app Android / TWA): /api/play-verify y renovación en vip-expire.
// Firestore y firebase-admin se reemplazan por fakes en memoria; fetch se mockea por URL.
// Correr con: npm test

import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// --- Fakes -----------------------------------------------------------------

const store = new Map(); // 'coleccion/docId' -> datos

const docRef = (col, id) => ({
    get: async () => ({ exists: store.has(`${col}/${id}`), data: () => store.get(`${col}/${id}`) }),
    set: async (data, opts) => {
        const prev = opts?.merge ? store.get(`${col}/${id}`) || {} : {};
        store.set(`${col}/${id}`, { ...prev, ...data });
    },
});

const fakeDb = {
    collection: (col) => ({
        doc: (id) => docRef(col, id),
        where: (field, op, value) => ({
            get: async () => ({
                docs: [...store.entries()]
                    .filter(([key, d]) => key.startsWith(`${col}/`) && d[field] != null && d[field] <= value)
                    .map(([key, d]) => { const id = key.slice(col.length + 1); return { id, data: () => d, ref: docRef(col, id) }; }),
            }),
        }),
    }),
};

// ID tokens válidos: 'tok-<uid>' → { uid, email: '<uid>@mail.com' }
mock.module(new URL('../api/_firebase.js', import.meta.url).href, {
    namedExports: { initFirebase: () => fakeDb },
});
mock.module('firebase-admin', {
    defaultExport: {
        firestore: { FieldValue: { serverTimestamp: () => 'TS' } },
        auth: () => ({
            verifyIdToken: async (t) => {
                if (!t.startsWith('tok-')) throw new Error('bad token');
                const uid = t.slice(4);
                return { uid, email: `${uid}@mail.com` };
            },
        }),
    },
});

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.PLAY_SERVICE_ACCOUNT = JSON.stringify({
    client_email: 'sa@test.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
});

const { default: verify } = await import('../api/play-verify.js');
const { default: vipExpire } = await import('../api/vip-expire.js');

// Respuestas de Google por fragmento de URL; lo no listado responde 404.
let playApi = {};
let acks = [];
globalThis.fetch = async (url, opts = {}) => {
    if (url === 'https://oauth2.googleapis.com/token') {
        return { ok: true, status: 200, json: async () => ({ access_token: 'AT', expires_in: 3600 }) };
    }
    if (url.endsWith(':acknowledge')) {
        acks.push(url);
        return { ok: true, status: 200, json: async () => ({}) };
    }
    const key = Object.keys(playApi).find(k => url.endsWith(`/tokens/${k}`));
    const r = key ? playApi[key] : { status: 404, body: {} };
    return { ok: r.status < 300, status: r.status, json: async () => r.body };
};

beforeEach(() => { store.clear(); playApi = {}; acks = []; delete process.env.CRON_SECRET; });

// --- Helpers ---------------------------------------------------------------

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const PAST = new Date(Date.now() - 86400000).toISOString();

const sub = ({ state = 'SUBSCRIPTION_STATE_ACTIVE', expiry = FUTURE, ack = 'ACKNOWLEDGEMENT_STATE_PENDING', productId = 'vip_mensual' } = {}) =>
    ({ status: 200, body: { subscriptionState: state, acknowledgementState: ack, lineItems: [{ productId, expiryTime: expiry }] } });

async function callVerify(body, token = 'tok-ana') {
    const out = {};
    const res = { status: (code) => { out.code = code; return { json: (b) => { out.body = b; } }; } };
    await verify({ method: 'POST', body, headers: token ? { authorization: `Bearer ${token}` } : {} }, res);
    return out;
}

async function callExpire() {
    const out = {};
    const res = { status: (code) => { out.code = code; return { json: (b) => { out.body = b; } }; } };
    await vipExpire({ headers: {} }, res);
    return out;
}

const tokenId = (t) => crypto.createHash('sha256').update(t).digest('hex');

// --- /api/play-verify --------------------------------------------------------

test('compra activa: activa el VIP del email de la sesión y la reconoce en Google', async () => {
    playApi = { P1: sub() };
    const out = await callVerify({ purchaseToken: 'P1' });
    assert.equal(out.code, 200);
    assert.equal(out.body.active, true);
    const vip = store.get('kiter_vip/ana_mail_com');
    assert.equal(vip.active, true);
    assert.equal(vip.source, 'play');
    assert.equal(vip.vip_until, FUTURE);
    assert.equal(vip.play_token_id, tokenId('P1'));
    assert.equal(vip.play_purchase_token, undefined, 'el token no se guarda en kiter_vip');
    assert.equal(store.get(`play_purchases/${tokenId('P1')}`).uid, 'ana');
    assert.equal(acks.length, 1);
});

test('compra ya reconocida: no la vuelve a reconocer', async () => {
    playApi = { P1: sub({ ack: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }) };
    const out = await callVerify({ purchaseToken: 'P1' });
    assert.equal(out.code, 200);
    assert.equal(acks.length, 0);
});

test('suscripción cancelada pero dentro del período pago: sigue VIP', async () => {
    playApi = { P1: sub({ state: 'SUBSCRIPTION_STATE_CANCELED', ack: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }) };
    const out = await callVerify({ purchaseToken: 'P1' });
    assert.equal(out.body.active, true);
});

test('suscripción vencida: no activa', async () => {
    playApi = { P1: sub({ state: 'SUBSCRIPTION_STATE_EXPIRED', expiry: PAST }) };
    const out = await callVerify({ purchaseToken: 'P1' });
    assert.equal(out.code, 200);
    assert.equal(out.body.active, false);
    assert.equal(store.get('kiter_vip/ana_mail_com').active, false);
    assert.equal(acks.length, 0);
});

test('producto ajeno: no activa', async () => {
    playApi = { P1: sub({ productId: 'otro' }) };
    const out = await callVerify({ purchaseToken: 'P1' });
    assert.equal(out.body.active, false);
});

test('token inexistente en Google: 400 y nada escrito', async () => {
    const out = await callVerify({ purchaseToken: 'NOPE' });
    assert.equal(out.code, 400);
    assert.equal(store.size, 0);
});

test('token de otra cuenta: 409', async () => {
    playApi = { P1: sub() };
    await callVerify({ purchaseToken: 'P1' }, 'tok-ana');
    const out = await callVerify({ purchaseToken: 'P1' }, 'tok-beto');
    assert.equal(out.code, 409);
    assert.equal(store.has('kiter_vip/beto_mail_com'), false);
});

test('sin sesión: 401', async () => {
    const out = await callVerify({ purchaseToken: 'P1' }, null);
    assert.equal(out.code, 401);
});

test('sin purchaseToken: 400', async () => {
    const out = await callVerify({});
    assert.equal(out.code, 400);
});

test('Google caído: 502 y nada escrito', async () => {
    playApi = { P1: { status: 503, body: {} } };
    const out = await callVerify({ purchaseToken: 'P1' });
    assert.equal(out.code, 502);
    assert.equal(store.has('kiter_vip/ana_mail_com'), false);
});

// --- vip-expire con compras de Play -------------------------------------------

function seedPlayVip(token, vipUntil) {
    store.set('kiter_vip/ana_mail_com', { email: 'ana@mail.com', active: true, source: 'play', vip_until: vipUntil, play_token_id: tokenId(token) });
    store.set(`play_purchases/${tokenId(token)}`, { uid: 'ana', purchase_token: token });
}

test('vip-expire: suscripción de Play renovada extiende vip_until', async () => {
    seedPlayVip('P1', PAST);
    playApi = { P1: sub({ ack: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }) };
    const out = await callExpire();
    assert.equal(out.code, 200);
    const vip = store.get('kiter_vip/ana_mail_com');
    assert.equal(vip.active, true);
    assert.equal(vip.vip_until, FUTURE);
});

test('vip-expire: suscripción de Play vencida desactiva', async () => {
    seedPlayVip('P1', PAST);
    playApi = { P1: sub({ state: 'SUBSCRIPTION_STATE_EXPIRED', expiry: PAST }) };
    await callExpire();
    assert.equal(store.get('kiter_vip/ana_mail_com').active, false);
});

test('vip-expire: si Google falla, no desactiva', async () => {
    seedPlayVip('P1', PAST);
    playApi = { P1: { status: 503, body: {} } };
    await callExpire();
    assert.equal(store.get('kiter_vip/ana_mail_com').active, true);
});
