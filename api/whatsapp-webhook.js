// api/whatsapp-webhook.js
// Recibe mensajes entrantes de WhatsApp (Twilio Sandbox)
// HOLA / JOIN / QUIERO → suscribir
// STOP / CHAU / SALIR → desuscribir

import { addWhatsAppSubscriber, removeWhatsAppSubscriber } from './_firebase.js';

export const config = { api: { bodyParser: false } };

const SUBSCRIBE_KEYWORDS   = ['hola', 'join', 'quiero', 'suscribir', 'alertas', 'start'];
const UNSUBSCRIBE_KEYWORDS = ['stop', 'chau', 'salir', 'cancelar', 'baja'];

function twimlResponse(text) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${text}</Message></Response>`;
}

async function parseBody(req) {
    return new Promise((resolve) => {
        let raw = '';
        req.on('data', chunk => { raw += chunk.toString(); });
        req.on('end', () => {
            const params = {};
            new URLSearchParams(raw).forEach((v, k) => { params[k] = v; });
            resolve(params);
        });
    });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const body   = await parseBody(req);
    const from   = body.From  || '';
    const text   = (body.Body || '').trim().toLowerCase();
    const name   = body.ProfileName || 'Kitero';

    console.log('WA webhook — from:', from, '| body:', text);

    res.setHeader('Content-Type', 'text/xml');

    if (!from.startsWith('whatsapp:')) {
        return res.status(200).send(twimlResponse('OK'));
    }

    if (SUBSCRIBE_KEYWORDS.some(k => text.includes(k))) {
        await addWhatsAppSubscriber(from, name);
        return res.status(200).send(twimlResponse(
`🪁 ¡Bienvenido a La Bajada Wind Alert, ${name}!

Te avisaremos cuando el viento sea ≥14 kts en condiciones ideales (9 a 19hs).

Para dejar de recibir alertas mandá *STOP*.`
        ));
    }

    if (UNSUBSCRIBE_KEYWORDS.some(k => text.includes(k))) {
        await removeWhatsAppSubscriber(from);
        return res.status(200).send(twimlResponse(
`✅ Te dimos de baja de las alertas de La Bajada.
Si querés volver a suscribirte mandá *HOLA*.`
        ));
    }

    return res.status(200).send(twimlResponse(
`🪁 *La Bajada Wind Alert*

Mandá *HOLA* para recibir alertas de viento.
Mandá *STOP* para cancelar.`
    ));
}
