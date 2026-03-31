// api/sms-subscribe.js
// Endpoint para suscribirse a alertas SMS desde la app
//
// POST /api/sms-subscribe
// Body JSON: { phone: "2983595133", minWind: 15 }
//
// Normaliza el número a formato E.164 argentino (5492983595133)
// Guarda en Firestore sms_subscribers
// Envía SMS de confirmación

import { addSmsSubscriber } from './_firebase.js';

// ── Normalizar número argentino a E.164 sin + ────────────────────────────────
function normalizeArgentinePhone(input) {
    if (!input) return null;
    let digits = String(input).replace(/\D/g, '');

    // Ya en formato completo con 549
    if (digits.startsWith('549') && digits.length === 13) return digits;
    // Con código de país 54 pero sin el 9 de móvil
    if (digits.startsWith('54') && digits.length === 12) return '549' + digits.slice(2);
    // Con 0 adelante (ej: 02983595133)
    if (digits.startsWith('0')) digits = digits.slice(1);
    // 10 dígitos: código de área + número (ej: 2983595133)
    if (digits.length === 10) return '549' + digits;

    return null; // número inválido
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
        console.error('Error enviando SMS de confirmación:', e);
        return false;
    }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { phone, minWind } = req.body || {};

    const normalized = normalizeArgentinePhone(phone);
    if (!normalized) {
        return res.status(400).json({ ok: false, error: 'Número de teléfono inválido' });
    }

    const wind = parseInt(minWind) || 15;
    if (wind < 8 || wind > 35) {
        return res.status(400).json({ ok: false, error: 'Viento mínimo fuera de rango' });
    }

    const saved = await addSmsSubscriber(normalized, { minWind: wind });
    if (!saved) {
        return res.status(500).json({ ok: false, error: 'Error guardando suscripción' });
    }

    // Confirmación por SMS (no bloqueante para la respuesta)
    sendSms(normalized,
`La Bajada Kitesurf - Claromeco

Suscripto a alertas de viento!
Viento minimo configurado: ${wind} kts

Te avisaremos cuando haya condiciones favorables.
Para darte de baja responde: STOP`
    ).catch(() => {});

    return res.status(200).json({
        ok: true,
        phone: normalized,
        minWind: wind
    });
}
