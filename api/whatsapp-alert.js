// api/whatsapp-alert.js
// Cron serverless (cada 15 min) — evalúa viento y envía alertas por WhatsApp
//
// Tipos de alerta (misma lógica que push-alert.js):
//   ÉPICO:      E/ESE/SE, 17-25 kts sostenido 10 min
//   EXTREMAS:   >30 kts o rachas >=35 kts sostenido 3 min
//   OFFSHORE:   viento offshore >=12 kts sostenido 5 min
//   BUENAS:     >= minWind del suscriptor, <27 kts, onshore, sostenido 5 min
//
// Trackers en Firestore (colección condition_tracker, prefijo "wa_"):
//   wa_epic / wa_dangerous / wa_offshore — globales
//   wa_good_{phone}                      — por suscriptor (minWind variable)
//
// Cooldown: no repite el mismo tipo de alerta en 2h (colección whatsapp_alert_log)

import { initFirebase, getWhatsAppSubscribers } from './_firebase.js';
import admin from 'firebase-admin';

const TRACKER_COLLECTION  = 'condition_tracker';
const LOG_COLLECTION      = 'whatsapp_alert_log';

const SUSTAINED_MINUTES = {
    epic:      10,
    dangerous:  3,
    offshore:   5,
    good:       5,
};

const CONFIG = {
    dangerousSpeed:  30,
    dangerousGust:   35,
    epicMinWind:     17,
    epicMaxWind:     25,
    epicMinDeg:      68,   // E
    epicMaxDeg:     146,   // SE
    offshoreStart:  292.5,
    offshoreEnd:     67.5,
    cooldownMinutes: 120,
};

// ── Ecowitt ──────────────────────────────────────────────────────────────────
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

// ── Evaluadores ──────────────────────────────────────────────────────────────
function isEpicNow(speed, dir) {
    return speed >= CONFIG.epicMinWind && speed < CONFIG.epicMaxWind &&
           dir   >= CONFIG.epicMinDeg  && dir  <= CONFIG.epicMaxDeg;
}
function isDangerousNow(speed, gust) {
    return speed > CONFIG.dangerousSpeed || gust >= CONFIG.dangerousGust;
}
function isOffshoreNow(speed, dir) {
    return (dir >= CONFIG.offshoreStart || dir <= CONFIG.offshoreEnd) && speed >= 12;
}
function isGoodNow(speed, dir, minWind) {
    const offshore = dir >= CONFIG.offshoreStart || dir <= CONFIG.offshoreEnd;
    return speed >= minWind && speed <= 27 && !offshore;
}

// ── Tracker de condición sostenida en Firestore ──────────────────────────────
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

// ── Enviar mensaje WhatsApp via Twilio ───────────────────────────────────────
async function sendWhatsAppMessage(to, text) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    const from       = process.env.TWILIO_WHATSAPP_FROM; // ej: whatsapp:+14155238886

    if (!accountSid || !authToken || !from) {
        console.error('Variables Twilio no configuradas');
        return false;
    }

    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const url  = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${auth}`
            },
            body: new URLSearchParams({
                From: from,
                To:   `whatsapp:+${to}`,
                Body: text
            }).toString()
        });
        return response.ok;
    } catch (error) {
        console.error('Error enviando WhatsApp a', to, ':', error);
        return false;
    }
}

// ── Handler principal ────────────────────────────────────────────────────────
export default async function handler(req, res) {
    // Seguridad: el cron de Vercel envía Authorization: Bearer <CRON_SECRET>
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers['authorization'] !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'No autorizado' });
    }

    try {
        // 1. Datos de viento
        const wind = await getWindData();
        if (!wind) return res.status(500).json({ ok: false, error: 'Sin datos de viento' });

        const cardinal = degreesToCardinal(wind.direction);
        console.log(`🌬️ WA-alert: ${wind.speed.toFixed(1)} kts ${cardinal}, rachas ${wind.gust.toFixed(1)}`);

        // 2. Firebase
        const db = initFirebase();
        if (!db) return res.status(500).json({ ok: false, error: 'Firebase no disponible' });

        // 3. Trackers globales (prefijo wa_ para no interferir con push-alert)
        const trackers = {
            epic:      await updateTracker(db, 'wa_epic',      isEpicNow(wind.speed, wind.direction),      SUSTAINED_MINUTES.epic),
            dangerous: await updateTracker(db, 'wa_dangerous', isDangerousNow(wind.speed, wind.gust),      SUSTAINED_MINUTES.dangerous),
            offshore:  await updateTracker(db, 'wa_offshore',  isOffshoreNow(wind.speed, wind.direction),  SUSTAINED_MINUTES.offshore),
        };

        console.log('📊 Trackers WA:', JSON.stringify(trackers));

        // 4. Suscriptores activos
        const subscribers = await getWhatsAppSubscribers();
        if (!subscribers.length) {
            return res.status(200).json({ ok: true, wind, trackers, subscribers: 0, sent: 0 });
        }

        // 5. Cooldown: no repetir mismo tipo en 2h
        const cooldownMs   = CONFIG.cooldownMinutes * 60 * 1000;
        const cooldownTime = new Date(Date.now() - cooldownMs);
        const recentAlertTypes = new Set();

        try {
            const logSnap = await db.collection(LOG_COLLECTION)
                .orderBy('timestamp', 'desc')
                .limit(10)
                .get();
            logSnap.docs.forEach(doc => {
                const d       = doc.data();
                const logTime = d.timestamp?.toDate?.() || new Date(0);
                if (logTime > cooldownTime) recentAlertTypes.add(d.alertType);
            });
        } catch (e) {
            console.log('Sin logs WA previos:', e.message);
        }

        console.log('🕐 Cooldown WA activo para:', [...recentAlertTypes]);

        // 6. Enviar por suscriptor
        let sent = 0, skipped = 0;
        const alertTypesSent = new Set();

        await Promise.allSettled(subscribers.map(async (sub) => {
            const minWind  = sub.config?.minNavigableWind || 15;
            const goodCond = isGoodNow(wind.speed, wind.direction, minWind);
            const goodTracker = await updateTracker(
                db,
                `wa_good_${sub.phone}`,
                goodCond,
                SUSTAINED_MINUTES.good
            );

            // Elegir alerta (prioridad: epic > dangerous > offshore > good)
            let alert = null;
            if (trackers.epic.sustained) {
                alert = {
                    type: 'epic',
                    message:
`👑 *¡CONDICIONES ÉPICAS en La Bajada!*

💨 ${wind.speed.toFixed(0)} kts del ${cardinal} — sostenido ${trackers.epic.minutesActive}+ min
💥 Ráfagas: ${wind.gust.toFixed(0)} kts

🔥 Viento E/ESE perfecto para el spot.
¡A preparar el equipo!

🔗 labajada.vercel.app`
                };
            } else if (trackers.dangerous.sustained) {
                alert = {
                    type: 'dangerous',
                    message:
`⚠️ *¡CONDICIONES EXTREMAS en La Bajada!*

💨 ${wind.speed.toFixed(0)} kts del ${cardinal}
💥 Ráfagas: ${wind.gust.toFixed(0)} kts

🚫 Viento excesivo — no navegar.

🔗 labajada.vercel.app`
                };
            } else if (trackers.offshore.sustained) {
                alert = {
                    type: 'offshore',
                    message:
`🚨 *VIENTO OFFSHORE activo en La Bajada*

💨 ${wind.speed.toFixed(0)} kts del ${cardinal} — sostenido ${trackers.offshore.minutesActive}+ min

❌ No navegar — riesgo de ser arrastrado mar adentro.

🔗 labajada.vercel.app`
                };
            } else if (goodTracker.sustained) {
                alert = {
                    type: 'good',
                    message:
`🪁 *¡Está soplando en Claromecó!*

💨 ${wind.speed.toFixed(0)} kts del ${cardinal} — sostenido ${goodTracker.minutesActive}+ min
💥 Ráfagas: ${wind.gust.toFixed(0)} kts

¡Buenas condiciones en La Bajada!

🔗 labajada.vercel.app`
                };
            }

            if (!alert)                            { skipped++; return; }
            if (recentAlertTypes.has(alert.type))  { skipped++; return; }

            const ok = await sendWhatsAppMessage(sub.phone, alert.message);
            if (ok) {
                sent++;
                alertTypesSent.add(alert.type);
            }
        }));

        // 7. Loguear
        if (sent > 0) {
            for (const type of alertTypesSent) {
                try {
                    await db.collection(LOG_COLLECTION).add({
                        timestamp:         admin.firestore.FieldValue.serverTimestamp(),
                        alertType:         type,
                        windSpeed:         wind.speed,
                        windGust:          wind.gust,
                        windDirection:     wind.direction,
                        cardinal,
                        subscribersSent:   sent,
                        subscribersSkipped: skipped,
                        createdAt:         new Date().toISOString(),
                    });
                } catch (e) {
                    console.error('Error guardando log WA:', e.message);
                }
            }
        }

        return res.status(200).json({
            ok: true,
            wind: { speed: wind.speed.toFixed(1), gust: wind.gust.toFixed(1), direction: cardinal, degrees: wind.direction },
            trackers,
            alert: alertTypesSent.size > 0 ? { types: [...alertTypesSent] } : null,
            subscribers: { total: subscribers.length, sent, skipped },
            cooldown: { recentTypes: [...recentAlertTypes] },
        });

    } catch (error) {
        console.error('Error en whatsapp-alert:', error);
        return res.status(500).json({ ok: false, error: error.message });
    }
}
