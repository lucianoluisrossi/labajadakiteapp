// Tests de permisos de endpoints de admin, campaña de email "Nueva versión" y baja de emails.

import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map(); // 'ruta/doc' -> datos

const collection = (path) => ({
    doc: (id) => ({
        get: async () => ({ exists: store.has(`${path}/${id}`), data: () => store.get(`${path}/${id}`) }),
        set: async (d) => { store.set(`${path}/${id}`, d); },
        collection: (sub) => collection(`${path}/${id}/${sub}`),
        _path: `${path}/${id}`,
    }),
    get: async () => ({
        docs: [...store.entries()]
            .filter(([k]) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/'))
            .map(([k, d]) => ({ id: k.slice(path.length + 1), data: () => d })),
    }),
    where: () => ({ get: async () => ({ docs: [] }) }),
});
const fakeDb = {
    collection,
    batch: () => {
        const ops = [];
        return { set: (ref, d) => ops.push([ref._path, d]), commit: async () => ops.forEach(([p, d]) => store.set(p, d)) };
    },
};

const tokens = new Map();
let authUsers = [];
mock.module(new URL('../api/_firebase.js', import.meta.url).href, { namedExports: { initFirebase: () => fakeDb } });
mock.module('firebase-admin', {
    defaultExport: {
        auth: () => ({
            verifyIdToken: async (t) => { if (!tokens.has(t)) throw new Error('invalid'); return tokens.get(t); },
            listUsers: async () => ({ users: authUsers, pageToken: undefined }),
        }),
        firestore: { FieldValue: { serverTimestamp: () => 'TS' } },
    },
});

process.env.RESEND_API_KEY = 're_test';
const { default: campaign } = await import('../api/admin-send-campaign.js');
const { default: unsubscribe } = await import('../api/email-unsubscribe.js');
const { default: nonVip } = await import('../api/admin-nonvip-users.js');
const { default: notifyNovedades } = await import('../api/notify-novedades.js');
const { unsubscribeToken } = await import('../api/_email.js');

let resendCalls;
globalThis.fetch = async (url, opts) => {
    resendCalls.push({ url, body: JSON.parse(opts.body) });
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
};

beforeEach(() => {
    store.clear(); tokens.clear(); resendCalls = [];
    tokens.set('admin-tok', { uid: 'adm', email: 'admin@x.com' });
    tokens.set('user-tok', { uid: 'usr', email: 'user@x.com' });
    tokens.set('editor-tok', { uid: 'edi', email: 'editor@x.com' });
    store.set('usuarios/adm', { role: 'admin' });
    store.set('usuarios/edi', { role: 'editor' });
    authUsers = [
        { email: 'A@x.com', displayName: 'Ana' }, { email: 'b@x.com', displayName: 'Beto' },
        { email: 'c@x.com', displayName: '' }, { email: null },
    ];
});

async function call(handler, { method = 'POST', token, body = {}, query = {} } = {}) {
    const out = { headers: {} };
    const res = {
        setHeader: (k, v) => { out.headers[k] = v; },
        json: (b) => { out.code = out.code ?? 200; out.body = b; },
        status: (code) => { out.code = code; return { json: (b) => { out.body = b; }, send: (b) => { out.body = b; }, end: () => {} }; },
    };
    await handler({ method, body, query, headers: token ? { authorization: `Bearer ${token}` } : {} }, res);
    return out;
}

// --- Permisos ---------------------------------------------------------------

test('endpoint de admin sin sesión: 401; con usuario común: 403; con admin: pasa', async () => {
    assert.equal((await call(nonVip, { method: 'GET' })).code, 401);
    assert.equal((await call(nonVip, { method: 'GET', token: 'basura' })).code, 401);
    assert.equal((await call(nonVip, { method: 'GET', token: 'user-tok' })).code, 403);
    assert.equal((await call(nonVip, { method: 'GET', token: 'admin-tok' })).code, 200);
});

test('notify-novedades: editor puede, usuario común no', async () => {
    assert.equal((await call(notifyNovedades, { token: 'user-tok', body: { titulo: 'x', texto: 'y' } })).code, 403);
    const r = await call(notifyNovedades, { token: 'editor-tok', body: { titulo: 'x', texto: 'y' } });
    assert.notEqual(r.code, 401);
    assert.notEqual(r.code, 403);
});

// --- Campaña ----------------------------------------------------------------

test('campaña: prueba va solo al email del admin, con link de baja', async () => {
    const r = await call(campaign, { token: 'admin-tok', body: { mode: 'test' } });
    assert.equal(r.code, 200);
    assert.equal(resendCalls.length, 1);
    assert.match(resendCalls[0].url, /\/emails$/);
    assert.equal(resendCalls[0].body.to, 'admin@x.com');
    assert.match(resendCalls[0].body.html, /email-unsubscribe\?e=admin%40x\.com&t=/);
    assert.match(resendCalls[0].body.headers['List-Unsubscribe'], /^<https:\/\/www\.labajadakite\.app\/api\/email-unsubscribe/);
});

test('campaña: usuario común no puede enviarla', async () => {
    assert.equal((await call(campaign, { token: 'user-tok', body: { mode: 'send' } })).code, 403);
    assert.equal(resendCalls.length, 0);
});

test('campaña: envía por lote a todos, saltea dados de baja y no repite en el siguiente lote', async () => {
    store.set('email_unsubscribes/b_x_com', { email: 'b@x.com' });
    let r = await call(campaign, { token: 'admin-tok', body: { mode: 'send' } });
    assert.equal(r.body.sent, 2);
    assert.equal(r.body.remaining, 0);
    const batch = resendCalls[0];
    assert.match(batch.url, /\/emails\/batch$/);
    assert.deepEqual(batch.body.map(e => e.to).sort(), ['a@x.com', 'c@x.com']);
    assert.ok(store.has('email_campaigns/v2-lanzamiento/sent/a_x_com'));

    resendCalls = [];
    r = await call(campaign, { token: 'admin-tok', body: { mode: 'send' } });
    assert.equal(r.body.sent, 0);
    assert.equal(resendCalls.length, 0);
});

test('campaña: respeta el límite del lote', async () => {
    authUsers = Array.from({ length: 150 }, (_, i) => ({ email: `u${i}@x.com`, displayName: '' }));
    const r = await call(campaign, { token: 'admin-tok', body: { mode: 'send' } });
    assert.equal(r.body.sent, 90);
    assert.equal(r.body.remaining, 60);
    assert.equal(resendCalls[0].body.length, 90);
});

test('campaña: escapa el nombre en el HTML', async () => {
    authUsers = [{ email: 'x@x.com', displayName: '<script>alert(1)</script>' }];
    await call(campaign, { token: 'admin-tok', body: { mode: 'send' } });
    assert.doesNotMatch(resendCalls[0].body[0].html, /<script>/);
});

// --- Baja -------------------------------------------------------------------

test('baja: link firmado válido registra la baja; token inválido no', async () => {
    let r = await call(unsubscribe, { method: 'GET', query: { e: 'b@x.com', t: 'falso' } });
    assert.equal(r.code, 400);
    assert.equal(store.has('email_unsubscribes/b_x_com'), false);

    r = await call(unsubscribe, { method: 'GET', query: { e: 'B@x.com', t: unsubscribeToken('b@x.com') } });
    assert.equal(r.code, 200);
    assert.equal(store.get('email_unsubscribes/b_x_com').email, 'b@x.com');

    r = await call(unsubscribe, { method: 'POST', query: { e: 'c@x.com', t: unsubscribeToken('c@x.com') } });
    assert.equal(r.code, 200);
});
