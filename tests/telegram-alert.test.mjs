// Tests del envío de alertas con gráfico (Telegram sendPhoto / Green API sendFileByUrl) y sus fallbacks a texto.

import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
const ts = (ms) => ({ toMillis: () => ms });

const fakeDb = {
    collection: (col) => ({
        doc: (id) => ({
            get: async () => ({ exists: store.has(`${col}/${id}`), data: () => store.get(`${col}/${id}`) }),
            set: async (d) => { store.set(`${col}/${id}`, d); },
        }),
        where: () => ({
            get: async () => ({ docs: [], empty: true }),
            orderBy: () => ({
                get: async () => {
                    const docs = [...store.entries()].filter(([k]) => k.startsWith(`${col}/`)).map(([, d]) => ({ data: () => d }));
                    return { docs, empty: docs.length === 0, size: docs.length };
                },
            }),
        }),
    }),
};

mock.module(new URL('../api/_firebase.js', import.meta.url).href, { namedExports: { initFirebase: () => fakeDb } });
mock.module('firebase-admin', {
    defaultExport: { firestore: { Timestamp: { fromMillis: ts }, FieldValue: { serverTimestamp: () => 'TS' } } },
});

Object.assign(process.env, {
    ECOWITT_APP_KEY: 'k', ECOWITT_API_KEY: 'k', ECOWITT_MAC: 'm',
    TELEGRAM_BOT_TOKEN: 'bot', TELEGRAM_CHAT_ID: '@canal',
    GREENAPI_INSTANCE_ID: '1', GREENAPI_TOKEN: 't', GREENAPI_GROUP_ID: 'grupo@g.us',
});
delete process.env.ALERT_API_KEY;

const { default: handler, buildWindChartConfig } = await import('../api/telegram-alert.js');

let calls, failures;
globalThis.fetch = async (url, opts) => {
    const method = url.match(/\/(sendPhoto|sendMessage|sendFileByUrl|chart\/create)/)?.[1] || (url.includes('ecowitt') ? 'ecowitt' : url);
    calls.push({ method, body: opts?.body ? JSON.parse(opts.body) : null });
    if (failures.has(method)) return { ok: false, status: 500, json: async () => ({ description: 'falla simulada' }) };
    if (method === 'ecowitt') return { ok: true, json: async () => ({ code: 0, data: { wind: { wind_speed: { value: '18', time: '1760000000' }, wind_gust: { value: '22' }, wind_direction: { value: '135' } } } }) };
    if (method === 'chart/create') return { ok: true, json: async () => ({ success: true, url: 'https://quickchart.io/chart/render/abc' }) };
    return { ok: true, json: async () => ({ ok: true }) };
};

beforeEach(() => {
    calls = []; failures = new Set(); store.clear();
    const now = Date.now();
    for (let i = 0; i < 10; i++) store.set(`wind_history/${i}`, { v: 15 + i, t: ts(now - (10 - i) * 60000) });
});

async function runAlert() {
    const out = {};
    const res = { status: (code) => { out.code = code; return { json: (b) => { out.body = b; } }; } };
    await handler({ query: { test: 'true' }, headers: {} }, res);
    return out;
}
const sent = (method) => calls.filter(c => c.method === method);

test('con gráfico: Telegram sendPhoto y WhatsApp sendFileByUrl con el texto como epígrafe', async () => {
    const r = await runAlert();
    assert.equal(r.code, 200);
    assert.equal(r.body.chart, true);
    assert.equal(sent('sendPhoto').length, 1);
    assert.equal(sent('sendPhoto')[0].body.photo, 'https://quickchart.io/chart/render/abc');
    assert.match(sent('sendPhoto')[0].body.caption, /La Bajada/);
    assert.equal(sent('sendFileByUrl').length, 1);
    assert.equal(sent('sendFileByUrl')[0].body.chatId, 'grupo@g.us');
    assert.doesNotMatch(sent('sendFileByUrl')[0].body.caption, /<b>|<a /);
    assert.match(sent('sendFileByUrl')[0].body.caption, /→ https:\/\/labajadakite\.app/);
    assert.equal(sent('sendMessage').length, 0);
});

test('si QuickChart falla, la alerta sale como texto en ambos canales', async () => {
    failures.add('chart/create');
    const r = await runAlert();
    assert.equal(r.code, 200);
    assert.equal(r.body.chart, false);
    assert.equal(sent('sendPhoto').length, 0);
    assert.equal(sent('sendFileByUrl').length, 0);
    assert.equal(sent('sendMessage').length, 2); // Telegram + grupo WA
});

test('si Telegram sendPhoto falla, cae a sendMessage', async () => {
    failures.add('sendPhoto');
    const r = await runAlert();
    assert.equal(r.code, 200);
    assert.ok(sent('sendMessage').some(c => c.body.chat_id === '@canal'));
});

test('si Green API sendFileByUrl falla, cae a sendMessage', async () => {
    failures.add('sendFileByUrl');
    const r = await runAlert();
    assert.equal(r.code, 200);
    assert.ok(sent('sendMessage').some(c => c.body.chatId === 'grupo@g.us'));
    assert.equal(r.body.whatsapp.sent, 1);
});

test('buildWindChartConfig: submuestrea a ≤ 61 puntos, horas 24 h y línea del umbral', () => {
    const now = Date.parse('2026-10-06T20:00:00Z'); // 17:00 en Argentina
    const readings = Array.from({ length: 240 }, (_, i) => ({ ms: now - (239 - i) * 30000, v: 15 }));
    const cfg = buildWindChartConfig(readings);
    assert.ok(cfg.data.labels.length <= 61);
    assert.equal(cfg.data.labels.at(-1), '17:00');
    assert.ok(cfg.data.datasets[1].data.every(v => v === 14));
});
