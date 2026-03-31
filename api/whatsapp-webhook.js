// api/whatsapp-webhook.js
// Webhook de Twilio WhatsApp — La Bajada Kitesurf
//
// POST /api/whatsapp-webhook — mensajes entrantes de Twilio (form-encoded)
//
// Flujo: cualquier mensaje suscribe al usuario.
//        "STOP" / "stop" / "salir" / "cancelar" da de baja.
//
// Responde con TwiML <Message> para reply inmediato (sin llamada extra a la API).
// Twilio env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM

import crypto from 'crypto';
import { addWhatsAppSubscriber, removeWhatsAppSubscriber } from './_firebase.js';

// ── Validación de firma Twilio (HMAC-SHA1) ───────────────────────────────────
function validateTwilioSignature(req) {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) return true; // Sin token configurado: saltar validación

    const signature = req.headers['x-twilio-signature'];
    if (!signature) return false;

    // URL completa tal como Twilio la conoce
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host  = req.headers['x-forwarded-host'] || req.headers.host;
    const url   = `${proto}://${host}${req.url}`;

    // Parámetros POST ordenados alfabéticamente concatenados a la URL
    const params     = req.body || {};
    const sortedKeys = Object.keys(params).sort();
    const str        = url + sortedKeys.map(k => k + params[k]).join('');

    const expected = crypto.createHmac('sha1', authToken).update(str).digest('base64');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// ── Respuesta TwiML ──────────────────────────────────────────────────────────
function twimlMessage(text) {
    // Escapar caracteres XML especiales
    const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`;
}

function twimlEmpty() {
    return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    // Twilio espera Content-Type: text/xml en la respuesta
    res.setHeader('Content-Type', 'text/xml');

    try {
        // Validar firma
        if (!validateTwilioSignature(req)) {
            console.warn('Firma Twilio inválida');
            return res.status(403).send(twimlEmpty());
        }

        // Twilio envía form-encoded: From=whatsapp:+549... Body=Hola
        const from = req.body?.From || '';   // "whatsapp:+5492983595133"
        const body = (req.body?.Body || '').trim().toLowerCase();

        // Extraer número limpio (sin "whatsapp:+")
        const phone = from.replace(/^whatsapp:\+?/, '');

        if (!phone) {
            return res.status(400).send(twimlEmpty());
        }

        const STOP_WORDS = ['stop', 'salir', 'baja', 'darme de baja', 'cancelar'];
        const wantsToStop = STOP_WORDS.some(w => body === w);

        if (wantsToStop) {
            await removeWhatsAppSubscriber(phone);
            return res.status(200).send(twimlMessage(
`👋 Te diste de baja de las alertas de viento de La Bajada.

Para volver a suscribirte mandá cualquier mensaje.

🔗 labajada.vercel.app`
            ));
        }

        const saved = await addWhatsAppSubscriber(phone);
        return res.status(200).send(twimlMessage(
`🪁 ¡Bienvenido a La Bajada — Claromecó!

${saved ? '✅ Quedás suscripto a las alertas de viento.' : 'Ya estabas suscripto. ✅'}

Te avisamos cuando haya:
• Viento favorable sostenido (5+ min)
• Condiciones épicas E/ESE/SE 17-25 kts
• Viento peligroso (>30 kts)
• Offshore activo

Para darte de baja mandá: STOP

🔗 labajada.vercel.app`
        ));

    } catch (error) {
        console.error('Error en webhook WhatsApp:', error);
        return res.status(500).send(twimlEmpty());
    }
}
