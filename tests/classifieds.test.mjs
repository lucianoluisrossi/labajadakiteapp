// Tests de clasificados: imagen (base64 → binario), link compartido con Open Graph y resumen diario.

import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
const ts = (ms) => ({ toMillis: () => ms });

const fakeDb = {
    collection: (col) => ({
        doc: (id) => ({
            get: async () => ({ exists: store.has(`${col}/${id}`), data: () => store.get(`${col}/${id}`) }),
            set: async (d, opts) => { store.set(`${col}/${id}`, { ...(opts?.merge ? store.get(`${col}/${id}`) : {}), ...d }); },
        }),
        where: (field, op, value) => ({
            get: async () => ({
                docs: [...store.entries()]
                    .filter(([k, d]) => k.startsWith(`${col}/`) && d[field]?.toMillis() >= value.toMillis())
                    .map(([k, d]) => ({ id: k.slice(col.length + 1), data: () => d })),
            }),
        }),
    }),
};

mock.module(new URL('../api/_firebase.js', import.meta.url).href, { namedExports: { initFirebase: () => fakeDb } });
mock.module('firebase-admin', {
    defaultExport: { firestore: { Timestamp: { fromMillis: ts }, FieldValue: { serverTimestamp: () => 'TS' } } },
});

Object.assign(process.env, { TELEGRAM_BOT_TOKEN: 'bot', TELEGRAM_CHAT_ID: '@canal', GREENAPI_INSTANCE_ID: '1', GREENAPI_TOKEN: 't' });
delete process.env.CRON_SECRET;

const { default: imageHandler } = await import('../api/classified-image.js');
const { default: shareHandler } = await import('../api/classified-share.js');
const { default: digestHandler, buildDigest } = await import('../api/classifieds-digest.js');

let calls, failures;
globalThis.fetch = async (url, opts) => {
    const method = url.match(/\/(sendPhoto|sendMessage|sendMediaStatus)/)?.[1] || url;
    calls.push({ method, body: JSON.parse(opts.body) });
    return failures.has(method) ? { ok: false, status: 500, json: async () => ({}) } : { ok: true, json: async () => ({ ok: true }) };
};

beforeEach(() => { store.clear(); calls = []; failures = new Set(); });

function mockRes() {
    const out = { headers: {} };
    out.res = {
        setHeader: (k, v) => { out.headers[k] = v; },
        status: (code) => { out.code = code; return { json: (b) => { out.body = b; }, send: (b) => { out.body = b; }, end: () => {} }; },
    };
    return out;
}

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const now = Date.now();
const classified = (extra = {}) => ({
    title: 'Kite Core XR7 12m', category: 'kites', price: 350000, currency: 'ARS', description: 'Impecable',
    photoURL: `data:image/png;base64,${PNG_1PX}`, status: 'disponible', createdAt: ts(now - 3600e3), ...extra,
});

// --- classified-image ------------------------------------------------------

test('imagen: decodifica el base64 y responde con su content-type y caché', async () => {
    store.set('classifieds/abc', classified());
    const r = mockRes();
    await imageHandler({ query: { id: 'abc' } }, r.res);
    assert.equal(r.code, 200);
    assert.equal(r.headers['Content-Type'], 'image/png');
    assert.match(r.headers['Cache-Control'], /s-maxage/);
    assert.deepEqual(r.body, Buffer.from(PNG_1PX, 'base64'));
});

test('imagen: sin foto redirige al logo; id inválido 400', async () => {
    store.set('classifieds/nofoto', classified({ photoURL: null }));
    let r = mockRes();
    await imageHandler({ query: { id: 'nofoto' } }, r.res);
    assert.equal(r.code, 302);
    assert.equal(r.headers.Location, '/logo.png');

    r = mockRes();
    await imageHandler({ query: { id: '../etc' } }, r.res);
    assert.equal(r.code, 400);
});

// --- classified-share ------------------------------------------------------

test('compartir: página con Open Graph del aviso y redirección a la app', async () => {
    store.set('classifieds/abc', classified());
    const r = mockRes();
    await shareHandler({ query: { id: 'abc' }, headers: { host: 'www.labajadakite.app' } }, r.res);
    assert.equal(r.code, 200);
    assert.match(r.body, /<meta property="og:title" content="Kite Core XR7 12m · \$ 350\.000">/);
    assert.match(r.body, /og:image" content="https:\/\/www\.labajadakite\.app\/api\/classified-image\?id=abc"/);
    assert.match(r.body, /location\.replace\("\/#clasificado=abc"\)/);
});

test('compartir: escapa HTML del título (sin inyección en la página)', async () => {
    store.set('classifieds/xss', classified({ title: '"><script>alert(1)</script>' }));
    const r = mockRes();
    await shareHandler({ query: { id: 'xss' }, headers: { host: 'x.app' } }, r.res);
    assert.doesNotMatch(r.body, /<script>alert/);
    assert.match(r.body, /&quot;&gt;&lt;script&gt;/);
});

test('compartir: aviso inexistente muestra página genérica; id inválido redirige al inicio', async () => {
    let r = mockRes();
    await shareHandler({ query: { id: 'noexiste' }, headers: { host: 'x.app' } }, r.res);
    assert.equal(r.code, 200);
    assert.match(r.body, /Clasificados · La Bajada Kite App/);

    r = mockRes();
    await shareHandler({ query: { id: 'a/b' }, headers: {} }, r.res);
    assert.equal(r.code, 302);
});

// --- classifieds-digest ----------------------------------------------------

async function runDigest(query = {}) {
    const r = mockRes();
    await digestHandler({ query, headers: {} }, r.res);
    return r;
}

test('resumen: dry run arma el mensaje sin enviar ni marcar', async () => {
    store.set('classifieds/a1', classified());
    const r = await runDigest({ dry: '1' });
    assert.equal(r.body.dry, true);
    assert.match(r.body.html, /Kite Core XR7 12m/);
    assert.match(r.body.html, /\/c\/a1/);
    assert.equal(calls.length, 0);
    assert.equal(store.get('classifieds/a1').broadcastAt, undefined);
});

test('resumen: envía foto + lista a Telegram, estado de WhatsApp y marca broadcastAt', async () => {
    store.set('classifieds/a1', classified());
    store.set('classifieds/a2', classified({ title: 'Tabla', featured: true, photoURL: null }));
    const r = await runDigest();
    assert.equal(r.body.sent, 2);
    const photo = calls.find(c => c.method === 'sendPhoto');
    assert.equal(photo.body.photo, 'https://www.labajadakite.app/api/classified-image?id=a1');
    assert.ok(photo.body.caption.indexOf('Tabla') < photo.body.caption.indexOf('Kite Core'), 'destacado primero');
    assert.ok(calls.some(c => c.method === 'sendMediaStatus'));
    assert.equal(store.get('classifieds/a1').broadcastAt, 'TS');
});

test('resumen: no repite avisos ya difundidos, ni vendidos, ni de más de 24 h', async () => {
    store.set('classifieds/old', classified({ createdAt: ts(now - 30 * 3600e3) }));
    store.set('classifieds/sold', classified({ status: 'vendido' }));
    store.set('classifieds/done', classified({ broadcastAt: ts(now) }));
    const r = await runDigest();
    assert.equal(r.body.sent, 0);
    assert.equal(calls.length, 0);
});

test('resumen: si falla sendPhoto cae a sendMessage; el estado de WhatsApp es opcional', async () => {
    store.set('classifieds/a1', classified());
    failures.add('sendPhoto');
    failures.add('sendMediaStatus');
    const r = await runDigest();
    assert.equal(r.body.telegram, true);
    assert.equal(r.body.whatsappStatus, false);
    assert.ok(calls.some(c => c.method === 'sendMessage'));
});

test('buildDigest: máximo 6 avisos y "…y N más"', () => {
    const items = Array.from({ length: 9 }, (_, i) => ({ id: `id${i}`, ...classified({ title: `Aviso ${i}` }) }));
    const d = buildDigest(items);
    assert.equal((d.html.match(/• /g) || []).length, 6);
    assert.match(d.html, /…y 3 más en la app/);
    assert.ok(d.html.length <= 1024);
    assert.doesNotMatch(d.plain, /<b>/);
});
