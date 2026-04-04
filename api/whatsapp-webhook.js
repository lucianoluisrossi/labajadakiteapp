// api/whatsapp-webhook.js
// Recibe mensajes entrantes de WhatsApp (Twilio Sandbox)
// HOLA / JOIN / QUIERO → suscribir
// STOP / CHAU / SALIR → desuscribir

import { addWhatsAppSubscriber, removeWhatsAppSubscriber } from './_firebase.js';

const SUBSCRIBE_KEYWORDS   = ['hola', 'join', 'quiero', 'suscribir', 'alertas', 'start'];
const UNSUBSCRIBE_KEYWORDS = ['stop', 'chau', 'salir', 'cancelar', 'baja'];

function twimlResponse(text) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response><Message>${text}</Message></Response>`;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const from = req.body?.From || '';   // whatsapp:+54911xxxxxxxx
    const body = (req.body?.Body || '').trim().toLowerCase();
    const name = req.body?.ProfileName || 'Kitero';

    if (!from.startsWith('whatsapp:')) {
        return res.status(400).end();
    }

    const phone = from; // guardamos con el prefijo whatsapp:

    res.setHeader('Content-Type', 'text/xml');

    if (SUBSCRIBE_KEYWORDS.some(k => body.includes(k))) {
        await addWhatsAppSubscriber(phone, name);
        return res.status(200).send(twimlResponse(
            `🪁 ¡Bienvenido a La Bajada Wind Alert, ${name}!

Te avisaremos cuando el viento sea ≥14 kts en condiciones ideales (9 a 19hs).

Para dejar de recibir alertas mandá *STOP*.`
        ));
    }

    if (UNSUBSCRIBE_KEYWORDS.some(k => body.includes(k))) {
        await removeWhatsAppSubscriber(phone);
        return res.status(200).send(twimlResponse(
            `✅ Listo, te dimos de baja de las alertas de La Bajada.
Si querés volver a suscribirte mandá *HOLA*.`
        ));
    }

    // Mensaje no reconocido
    return res.status(200).send(twimlResponse(
        `🪁 *La Bajada Wind Alert*

Mandá *HOLA* para recibir alertas de viento.
Mandá *STOP* para cancelar.`
    ));
}
