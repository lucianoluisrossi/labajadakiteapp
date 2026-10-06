// Tests de /api/data: viento en vivo para VIP o prueba, con demora (caché CDN) para el resto.

import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
const users = new Map();   // uid -> creationTime
const tokens = new Map();  // token -> { uid, email }

const fakeDb = {
    collection: (col) => ({
        doc: (id) => ({ get: async () => ({ exists: store.has(`${col}/${id}`), data: () => store.get(`${col}/${id}`) }) }),
    }),
};
const fakeAuth = {
    verifyIdToken: async (t) => { if (!tokens.has(t)) throw new Error('invalid'); return tokens.get(t); },
    getUser: async (uid) => ({ metadata: { creationTime: users.get(uid) } }),
};

mock.module(new URL('../api/_firebase.js', import.meta.url).href, { namedExports: { initFirebase: () => fakeDb } });
mock.module('firebase-admin', { defaultExport: { auth: () => fakeAuth } });

const { default: handler } = await import('../api/data.js');

globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ code: 0, data: { wind: { wind_speed: { value: '18', time: '1760000000' } } } }) });

let uidSeq = 0;
beforeEach(() => { store.clear(); users.clear(); tokens.clear(); });

// Cada test usa un uid nuevo para no depender del caché de acceso en memoria
function account({ email = 'a@b.com', createdDaysAgo = 400 } = {}) {
    const uid = `u${++uidSeq}`;
    users.set(uid, new Date(Date.now() - createdDaysAgo * 864e5).toUTCString());
    tokens.set(`tok-${uid}`, { uid, email });
    return { uid, token: `tok-${uid}` };
}

async function call({ live = false, token } = {}) {
    const out = { headers: {} };
    const res = {
        setHeader: (k, v) => { out.headers[k] = v; },
        status: (code) => { out.code = code; return { json: (b) => { out.body = b; }, send: (b) => { out.body = b; } }; },
    };
    await handler({ method: 'GET', query: live ? { live: '1' } : {}, headers: token ? { authorization: `Bearer ${token}` } : {} }, res);
    return out;
}

test('público: devuelve datos con caché CDN de 15 min y sin info de acceso', async () => {
    const r = await call();
    assert.equal(r.code, 200);
    assert.match(r.headers['Cache-Control'], /s-maxage=900/);
    assert.equal(r.body.access, undefined);
});

test('vivo sin token: 401', async () => {
    assert.equal((await call({ live: true })).code, 401);
});

test('vivo con token inválido: 401', async () => {
    assert.equal((await call({ live: true, token: 'basura' })).code, 401);
});

test('vivo con cuenta sin email (anónima): 403', async () => {
    const { token } = account({ email: null });
    assert.equal((await call({ live: true, token })).code, 403);
});

test('VIP activo: vivo sin caché', async () => {
    const { token } = account({ email: 'A@B.com' });
    store.set('kiter_vip/a_b_com', { active: true });
    const r = await call({ live: true, token });
    assert.equal(r.code, 200);
    assert.equal(r.headers['Cache-Control'], 'private, no-store');
    assert.equal(r.body.access.reason, 'vip');
    assert.equal(r.body.data.wind.wind_speed.value, '18');
});

test('VIP por mp_email vinculado: vivo', async () => {
    const { uid, token } = account({ email: 'login@x.com' });
    store.set(`usuarios/${uid}`, { mp_email: 'pago@y.com' });
    store.set('kiter_vip/pago_y_com', { active: true });
    assert.equal((await call({ live: true, token })).body.access.reason, 'vip');
});

test('cuenta nueva (2 días): prueba VIP con vivo y fecha de fin', async () => {
    const { token } = account({ createdDaysAgo: 2 });
    const r = await call({ live: true, token });
    assert.equal(r.code, 200);
    assert.equal(r.body.access.reason, 'trial');
    assert.ok(Date.parse(r.body.access.trial_ends) > Date.now());
});

test('cuenta con prueba vencida: 403 con trial_ends para el mensaje del modal', async () => {
    const { token } = account({ createdDaysAgo: 400 });
    const r = await call({ live: true, token });
    // Las cuentas viejas cuentan la prueba desde el lanzamiento; pasada esa semana, 403
    if (Date.now() > Date.parse('2026-10-14T00:00:00-03:00')) {
        assert.equal(r.code, 403);
        assert.equal(r.body.access.reason, 'none');
        assert.ok(r.body.access.trial_ends);
    } else {
        assert.equal(r.body.access.reason, 'trial');
    }
});

test('VIP inactivo y prueba vencida: 403', async () => {
    const { uid, token } = account({ createdDaysAgo: 400 });
    store.set('kiter_vip/a_b_com', { active: false });
    users.set(uid, new Date(Date.parse('2026-01-01')).toUTCString());
    const r = await call({ live: true, token });
    if (Date.now() > Date.parse('2026-10-14T00:00:00-03:00')) assert.equal(r.code, 403);
});
