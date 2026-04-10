// api/greenapi-webhook.js
// Recibe mensajes entrantes de Green API (WhatsApp)
// HOLA / QUIERO / START → suscribir
// STOP / CHAU / SALIR  → desuscribir

import { initFirebase } from './_firebase.js';
import admin from 'firebase-admin';

const SUBSCRIBE_TEXT   = 'suscribirme a alertas';
const UNSUBSCRIBE_TEXT = 'stop';
const COLLECTION           = 'greenapi_subscribers';

async function sendReply(chatId, message) {
    const instanceId = process.env.GREENAPI_INSTANCE_ID;
    const token      = process.env.GREENAPI_TOKEN;
    if (!instanceId || !token) return;
    await fetch(`https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message })
    });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const body = req.body;

    // Solo procesar mensajes entrantes de texto
    if (body?.typeWebhook !== 'incomingMessageReceived') return res.status(200).json({ ok: true });

    // Green API puede enviar estructura anidada (messageData) o plana (raíz)
    const typeMessage = body?.messageData?.typeMessage || body?.typeMessage;
    const isText = typeMessage === 'textMessage' || typeMessage === 'extendedTextMessage';
    if (!isText) return res.status(200).json({ ok: true });

    const chatId  = body?.senderData?.chatId || body?.chatId || '';
    const name    = body?.senderData?.senderName || body?.senderName || 'Kitero';
    const text    = (
        body?.messageData?.textMessageData?.textMessage ||
        body?.messageData?.extendedTextMessageData?.text ||
        body?.extendedTextMessage?.text ||
        body?.textMessage ||
        ''
    ).trim().toLowerCase();

    // Ignorar mensajes de grupos (terminan en @g.us)
    if (chatId.endsWith('@g.us')) return res.status(200).json({ ok: true });

    console.log('Green API webhook — from:', chatId, '| text:', text);

    const db = initFirebase();
    if (!db) return res.status(500).json({ error: 'Firebase no disponible' });

    if (text === SUBSCRIBE_TEXT) {
        await db.collection(COLLECTION).doc(chatId).set({
            chatId, name, active: true,
            subscribedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        await sendReply(chatId,
`🪁 ¡Bienvenido a La Bajada Wind Alert, ${name}!

Te avisaremos cuando el viento supere 14 kts en condiciones ideales (9 a 19hs) 🌊

Para dejar de recibir alertas mandá *STOP*.`
        );
        return res.status(200).json({ ok: true, action: 'subscribed' });
    }

    if (text === UNSUBSCRIBE_TEXT) {
        await db.collection(COLLECTION).doc(chatId).set({
            active: false,
            unsubscribedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        await sendReply(chatId,
`✅ Te dimos de baja de las alertas de La Bajada.
Si querés volver a suscribirte mandá *HOLA*.`
        );
        return res.status(200).json({ ok: true, action: 'unsubscribed' });
    }

    // Mensaje no reconocido
    await sendReply(chatId,
`🪁 *La Bajada Wind Alert*

Mandá *HOLA* para recibir alertas de viento cuando las condiciones sean ideales.
Mandá *STOP* para cancelar.`
    );
    return res.status(200).json({ ok: true, action: 'unknown' });
}
