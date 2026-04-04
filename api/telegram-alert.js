// api/telegram-alert.js
// Alerta de viento para canal de Telegram
// Condiciones: ≥14 kts constante 30 min + dirección on-shore + anti-spam 3hs

import { initFirebase, getWhatsAppSubscribers } from './_firebase.js';
import admin from 'firebase-admin';

const TELEGRAM_API = 'https://api.telegram.org/bot';

// --- Configuración del spot ---
const WIND_THRESHOLD    = 14;                        // kts mínimos
const GOOD_DIRECTIONS   = ['ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO']; // favorables La Bajada (excluye N, NE, NO, NNE, NNO)
const CONSISTENCY_MS    = 30 * 60 * 1000;            // ventana consistencia: 30 min
const MIN_READINGS      = 3;                         // mínimo de lecturas en esa ventana
const ALERT_INTERVAL_MS = 3 * 60 * 60 * 1000;       // anti-spam: 1 alerta cada 3hs
const HOUR_START        = 9;                         // horario alerta inicio (hora Argentina)
const HOUR_END          = 19;                        // horario alerta fin

// --- Helpers ---
function degreesToCardinal(deg) {
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
    return dirs[Math.round(deg / 22.5) % 16];
}

function isWithinAlertHours() {
    const arHour = (new Date().getUTCHours() - 3 + 24) % 24;
    return arHour >= HOUR_START && arHour < HOUR_END;
}

async function sendToChannel(text) {
    const token  = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) throw new Error('Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID');
    const res  = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.description || `HTTP ${res.status}`);
    return true;
}

async function sendViaGreenAPI(chatId, text) {
    const instanceId = process.env.GREENAPI_INSTANCE_ID;
    const token      = process.env.GREENAPI_TOKEN;
    if (!instanceId || !token) return false;
    try {
        const res = await fetch(`https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, message: text })
        });
        if (!res.ok) { const j = await res.json(); console.error('Green API error:', j); }
        return res.ok;
    } catch (e) {
        console.error('Error Green API:', e);
        return false;
    }
}

async function sendToGreenAPITargets(db, text) {
    const results = [];

    // Grupo(s): GREENAPI_GROUP_ID separados por coma
    const groups = (process.env.GREENAPI_GROUP_ID || '').split(',').map(s => s.trim()).filter(Boolean);
    for (const g of groups) results.push(await sendViaGreenAPI(g, text));

    // Contactos fijos: GREENAPI_CONTACTS separados por coma
    const contacts = (process.env.GREENAPI_CONTACTS || '').split(',').map(s => s.trim()).filter(Boolean);
    for (const c of contacts) results.push(await sendViaGreenAPI(c, text));

    // Suscriptores a demanda (desde Firestore)
    try {
        const snap = await db.collection('greenapi_subscribers').where('active', '==', true).get();
        const subs = snap.docs.map(d => d.data().chatId).filter(Boolean);
        for (const chatId of subs) results.push(await sendViaGreenAPI(chatId, text));
    } catch (e) { console.warn('Error cargando suscriptores Green API:', e); }

    return results.filter(Boolean).length;
}

async function sendWhatsApp(to, text) {
    const sid   = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from  = process.env.TWILIO_WHATSAPP_FROM;
    if (!sid || !token || !from) { console.warn('Faltan vars Twilio'); return false; }
    try {
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({ From: from, To: to, Body: text }).toString()
        });
        if (!res.ok) { const j = await res.json(); console.error('Twilio error:', j.message); }
        return res.ok;
    } catch (e) {
        console.error('Error enviando WhatsApp:', e);
        return false;
    }
}

async function getCurrentWind() {
    const APP_KEY = process.env.ECOWITT_APP_KEY;
    const API_KEY = process.env.ECOWITT_API_KEY;
    const MAC     = process.env.ECOWITT_MAC;
    if (!APP_KEY || !API_KEY || !MAC) { console.error('Faltan vars Ecowitt'); return null; }
    try {
        const url = `https://api.ecowitt.net/api/v3/device/real_time?application_key=${APP_KEY}&api_key=${API_KEY}&mac=${MAC}&call_back=all&wind_speed_unitid=8&temp_unitid=1`;
        const res  = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.code !== 0 || !data.data) return null;
        const wind = data.data.wind || {};
        return {
            speed:     parseFloat(wind.wind_speed?.value     || 0),
            gust:      parseFloat(wind.wind_gust?.value      || 0),
            direction: parseInt(wind.wind_direction?.value   || 0),
        };
    } catch (e) {
        console.error('Error obteniendo viento:', e);
        return null;
    }
}

async function checkConsistency(db) {
    const since = admin.firestore.Timestamp.fromMillis(Date.now() - CONSISTENCY_MS);
    const snap  = await db.collection('wind_history')
        .where('t', '>=', since)
        .orderBy('t', 'asc')
        .get();

    if (snap.empty || snap.size < MIN_READINGS) {
        return { ok: false, reason: `Solo ${snap.size} lecturas en 30 min (mín ${MIN_READINGS})` };
    }

    const readings = snap.docs.map(d => d.data().v || 0);
    const avg      = readings.reduce((a, b) => a + b, 0) / readings.length;

    if (avg < WIND_THRESHOLD) {
        return { ok: false, reason: `Promedio 30 min: ${avg.toFixed(1)} kts (mín ${WIND_THRESHOLD})` };
    }
    return { ok: true, avg: avg.toFixed(1), count: readings.length };
}

async function getLastAlertTime(db) {
    try {
        const doc = await db.collection('telegram_alerts').doc('last_alert').get();
        return doc.exists ? (doc.data().sentAt?.toMillis() || 0) : 0;
    } catch { return 0; }
}

async function saveLastAlertTime(db) {
    await db.collection('telegram_alerts').doc('last_alert').set({
        sentAt: admin.firestore.FieldValue.serverTimestamp()
    });
}

// --- Handler principal ---
export default async function handler(req, res) {
    // Seguridad opcional con ALERT_API_KEY
    const expectedKey = process.env.ALERT_API_KEY;
    if (expectedKey) {
        const apiKey = req.headers['x-api-key'] || req.query.key;
        if (apiKey !== expectedKey) return res.status(401).json({ error: 'No autorizado' });
    }

    const isTest = req.query.test === 'true';

    // 1. Horario (9-19hs Argentina)
    if (!isTest && !isWithinAlertHours()) {
        return res.status(200).json({ ok: true, skipped: 'Fuera de horario (9-19hs AR)' });
    }

    const db = initFirebase();
    if (!db) return res.status(500).json({ error: 'Firebase no disponible' });

    // 2. Anti-spam: máximo 1 alerta cada 3hs
    if (!isTest) {
        const lastAlert = await getLastAlertTime(db);
        const sinceLastMs = Date.now() - lastAlert;
        if (sinceLastMs < ALERT_INTERVAL_MS) {
            const nextInMin = Math.round((ALERT_INTERVAL_MS - sinceLastMs) / 60000);
            return res.status(200).json({ ok: true, skipped: `Anti-spam: próxima alerta en ${nextInMin} min` });
        }
    }

    // 3. Dirección actual on-shore
    const wind = await getCurrentWind();
    if (!wind) return res.status(500).json({ error: 'No se pudo obtener viento actual' });

    const cardinal = degreesToCardinal(wind.direction);
    if (!isTest && !GOOD_DIRECTIONS.includes(cardinal)) {
        return res.status(200).json({ ok: true, skipped: `Dirección no favorable: ${cardinal}` });
    }

    // 4. Consistencia 30 min en Firestore
    const consistency = isTest
        ? { ok: true, avg: wind.speed.toFixed(1), count: 3 }
        : await checkConsistency(db);
    if (!consistency.ok) {
        return res.status(200).json({ ok: true, skipped: consistency.reason });
    }

    // ✅ Todo OK — enviar alerta al canal
    const isEpic = ['E', 'ESE'].includes(cardinal);
    const msg =
`${isEpic ? '🔥🪁 <b>¡EPICOOO EN LA BAJADA!</b> 🪁🔥' : '🪁 <b>¡Buenas condiciones en La Bajada!</b>'}

💨 Viento: <b>${wind.speed.toFixed(1)} kts</b>
📊 Promedio 30 min: <b>${consistency.avg} kts</b> (${consistency.count} lecturas)
🧭 Dirección: <b>${cardinal}</b>${isEpic ? ' 🔥 ÉPICO' : ' — on shore ✅'}
💥 Ráfagas: <b>${wind.gust.toFixed(1)} kts</b>

${isEpic ? '🚀 ¡ESTO ES LO QUE ESPERABAS!' : '🔥 ¡Momento de salir!'}
🔗 <a href="https://test02-labajadakite.vercel.app">Ver cámara en vivo →</a>`;

    // Telegram
    try { await sendToChannel(msg); } catch(e) {
        return res.status(500).json({ error: 'Error enviando mensaje a Telegram', detail: e.message });
    }

    // WhatsApp — texto plano (sin HTML)
    const waMsg = msg.replace(/<b>/g,'*').replace(/<\/b>/g,'*').replace(/<[^>]+>/g,'');

    // WhatsApp suscriptores individuales (Twilio)
    const waSubscribers = await getWhatsAppSubscribers();
    const waResults = await Promise.allSettled(
        waSubscribers.map(s => sendWhatsApp(s.phone, waMsg))
    );
    const waSent = waResults.filter(r => r.status === 'fulfilled' && r.value).length;

    // WhatsApp grupos, contactos y suscriptores (Green API)
    const groupSent = await sendToGreenAPITargets(db, waMsg);

    await saveLastAlertTime(db);
    return res.status(200).json({ ok: true, sent: true,
        wind: { speed: wind.speed.toFixed(1), cardinal, avg: consistency.avg, readings: consistency.count },
        telegram: true,
        whatsapp: { sent: waSent, total: waSubscribers.length },
        whatsappGroup: { sent: groupSent }
    });
}
