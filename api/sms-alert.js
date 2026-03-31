// api/sms-alert.js
// Cron serverless (cada 15 min) — evalúa viento y envía alertas SMS via Twilio
//
// Tipos de alerta:
//   ÉPICO:      E/ESE/SE, 17-25 kts sostenido 10 min
//   EXTREMAS:   >30 kts o rachas >=35 kts sostenido 3 min
//   OFFSHORE:   viento offshore >=12 kts sostenido 5 min
//   BUENAS:     >= minWind del suscriptor, <27 kts, onshore, sostenido 5 min
//
// Trackers en Firestore (condition_tracker, prefijo "sms_")
// Cooldown: no repite el mismo tipo en 2h (sms_alert_log)

import { initFirebase, getSmsSubscribers } from './_firebase.js';
import admin from 'firebase-admin';

const TRACKER_COLLECTION = 'condition_tracker';
const LOG_COLLECTION     = 'sms_alert_log';

const SUSTAINED_MINUTES = { epic: 10, dangerous: 3, offshore: 5, good: 5 };

const CONFIG = {
    dangerousSpeed:  30,
    dangerousGust:   35,
    epicMinWind:     17,
    epicMaxWind:     25,
    epicMinDeg:      68,
    epicMaxDeg:     146,
    offshoreStart:  292.5,
    offshoreEnd:     67.5,
    cooldownMinutes: 120,
};

// ── Ecowitt ───────────────────────────────────────────────────────────────────
async function getWindData() {
    const url = 'https://api.ecowitt.net/api/v3/device/real_time?application_key=515398061FDA504607F0329996375FC2&api_key=2b181909-3bd1-4a8f-8cf1-91cb95e75ff5&mac=C8:C9:A3:1C:0D:E5&call_back=all&temp_unitid=1&pressure_unitid=3&wind_speed_unitid=8&rainfall_unitid=12&solar_irradiance_unitid=14&capacity_unitid=25';
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.code !== 0 || !data.data) return null;
        const wind = data.data.wind || {};
        return {
            speed: parseFloat(wind.wind_speed?.value || 0),
            gust:  parseFloat(wind.wind_gust?.value  || 0),
            direction: parseInt(wind.wind_direction?.value || 0),
        };
    } catch (e) {
        console.error('Error Ecowitt:', e);
        return null;
    }
}

function degreesToCardinal(deg) {
    const d = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
    return d[Math.round(deg / 22.5) % 16];
}

// ── Evaluadores ───────────────────────────────────────────────────────────────
function isEpicNow(speed, dir)          { return speed >= CONFIG.epicMinWind && speed < CONFIG.epicMaxWind && dir >= CONFIG.epicMinDeg && dir <= CONFIG.epicMaxDeg; }
function isDangerousNow(speed, gust)    { return speed > CONFIG.dangerousSpeed || gust >= CONFIG.dangerousGust; }
function isOffshoreNow(speed, dir)      { return (dir >= CONFIG.offshoreStart || dir <= CONFIG.offshoreEnd) && speed >= 12; }
function isGoodNow(speed, dir, minWind) { return speed >= minWind && speed <= 27 && !(dir >= CONFIG.offshoreStart || dir <= CONFIG.offshoreEnd); }

// ── Tracker de condición sostenida ────────────────────────────────────────────
async function updateTracker(db, docId, conditionMet, requiredMinutes) {
    const now    = Date.now();
    const docRef = db.collection(TRACKER_COLLECTION).doc(docId);

    if (conditionMet) {
        const doc      = await docRef.get();
        const existing = doc.exists ? doc.data() : null;
        if (existing?.startedAt) {
            await docRef.update({ lastSeen: now });
            const minutesActive = (now - existing.startedAt) / 60000;
            return { sustained: minutesActive >= requiredMinutes, minutesActive: Math.round(minutesActive) };
        } else {
            await docRef.set({ startedAt: now, lastSeen: now });
            return { sustained: false, minutesActive: 0 };
        }
    } else {
        await docRef.set({ startedAt: null, lastSeen: now, brokenAt: now });
        return { sustained: false, minutesActive: 0 };
    }
}

// ── Enviar SMS via Twilio ─────────────────────────────────────────────────────
async function sendSms(to, text) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    const from       = process.env.TWILIO_SMS_FROM;
    if (!accountSid || !authToken || !from) return false;

    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    try {
        const response = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${auth}`
                },
                body: new URLSearchParams({ From: from, To: `+${to}`, Body: text }).toString()
            }
        );
        return response.ok;
    } catch (e) {
        console.error('Error enviando SMS a', to, ':', e);
        return false;
    }
}

// ── Handler principal ─────────────────────────────────────────────────────────
export default async function handler(req, res) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers['authorization'] !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'No autorizado' });
    }

    try {
        const wind = await getWindData();
        if (!wind) return res.status(500).json({ ok: false, error: 'Sin datos de viento' });

        const cardinal = degreesToCardinal(wind.direction);
        console.log(`🌬️ SMS-alert: ${wind.speed.toFixed(1)} kts ${cardinal}, rachas ${wind.gust.toFixed(1)}`);

        const db = initFirebase();
        if (!db) return res.status(500).json({ ok: false, error: 'Firebase no disponible' });

        // Trackers globales (prefijo sms_)
        const trackers = {
            epic:      await updateTracker(db, 'sms_epic',      isEpicNow(wind.speed, wind.direction),     SUSTAINED_MINUTES.epic),
            dangerous: await updateTracker(db, 'sms_dangerous', isDangerousNow(wind.speed, wind.gust),     SUSTAINED_MINUTES.dangerous),
            offshore:  await updateTracker(db, 'sms_offshore',  isOffshoreNow(wind.speed, wind.direction), SUSTAINED_MINUTES.offshore),
        };

        const subscribers = await getSmsSubscribers();
        if (!subscribers.length) {
            return res.status(200).json({ ok: true, wind, trackers, subscribers: 0, sent: 0 });
        }

        // Cooldown: no repetir mismo tipo en 2h
        const cooldownTime     = new Date(Date.now() - CONFIG.cooldownMinutes * 60000);
        const recentAlertTypes = new Set();
        try {
            const logSnap = await db.collection(LOG_COLLECTION).orderBy('timestamp', 'desc').limit(10).get();
            logSnap.docs.forEach(doc => {
                const d = doc.data();
                const t = d.timestamp?.toDate?.() || new Date(0);
                if (t > cooldownTime) recentAlertTypes.add(d.alertType);
            });
        } catch (e) { console.log('Sin logs SMS previos:', e.message); }

        let sent = 0, skipped = 0;
        const alertTypesSent = new Set();

        await Promise.allSettled(subscribers.map(async (sub) => {
            const minWind     = sub.config?.minNavigableWind || 15;
            const goodCond    = isGoodNow(wind.speed, wind.direction, minWind);
            const goodTracker = await updateTracker(db, `sms_good_${sub.phone}`, goodCond, SUSTAINED_MINUTES.good);

            let alert = null;
            if (trackers.epic.sustained) {
                alert = { type: 'epic', text:
`La Bajada - EPICO!
${wind.speed.toFixed(0)} kts del ${cardinal} sostenido ${trackers.epic.minutesActive}+ min
Rafagas: ${wind.gust.toFixed(0)} kts
Condiciones excepcionales E/ESE/SE!
labajada.vercel.app` };
            } else if (trackers.dangerous.sustained) {
                alert = { type: 'dangerous', text:
`La Bajada - CONDICIONES EXTREMAS
${wind.speed.toFixed(0)} kts del ${cardinal}
Rafagas: ${wind.gust.toFixed(0)} kts
NO NAVEGAR - viento excesivo.
labajada.vercel.app` };
            } else if (trackers.offshore.sustained) {
                alert = { type: 'offshore', text:
`La Bajada - OFFSHORE ACTIVO
${wind.speed.toFixed(0)} kts del ${cardinal} sostenido ${trackers.offshore.minutesActive}+ min
NO NAVEGAR - riesgo de ser arrastrado mar adentro.
labajada.vercel.app` };
            } else if (goodTracker.sustained) {
                alert = { type: 'good', text:
`La Bajada - Esta soplando!
${wind.speed.toFixed(0)} kts del ${cardinal} sostenido ${goodTracker.minutesActive}+ min
Rafagas: ${wind.gust.toFixed(0)} kts
labajada.vercel.app` };
            }

            if (!alert || recentAlertTypes.has(alert.type)) { skipped++; return; }

            const ok = await sendSms(sub.phone, alert.text);
            if (ok) { sent++; alertTypesSent.add(alert.type); }
            else skipped++;
        }));

        // Log
        if (sent > 0) {
            for (const type of alertTypesSent) {
                await db.collection(LOG_COLLECTION).add({
                    timestamp:          admin.firestore.FieldValue.serverTimestamp(),
                    alertType:          type,
                    windSpeed:          wind.speed,
                    windGust:           wind.gust,
                    windDirection:      wind.direction,
                    cardinal,
                    subscribersSent:    sent,
                    subscribersSkipped: skipped,
                    createdAt:          new Date().toISOString(),
                }).catch(e => console.error('Error log SMS:', e.message));
            }
        }

        return res.status(200).json({
            ok: true,
            wind: { speed: wind.speed.toFixed(1), gust: wind.gust.toFixed(1), direction: cardinal },
            trackers,
            alert: alertTypesSent.size > 0 ? { types: [...alertTypesSent] } : null,
            subscribers: { total: subscribers.length, sent, skipped },
        });

    } catch (error) {
        console.error('Error en sms-alert:', error);
        return res.status(500).json({ ok: false, error: error.message });
    }
}
