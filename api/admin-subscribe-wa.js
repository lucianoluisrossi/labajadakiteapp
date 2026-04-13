// api/admin-subscribe-wa.js
// Alta manual de suscriptor WA desde panel admin
// Body: { phone: "2983123456", name: "Juan" }
// chatId resultante: 5492983123456@c.us

import { initFirebase } from './_firebase.js';
import admin from 'firebase-admin';

async function sendWelcome(chatId, name) {
    const instanceId = process.env.GREENAPI_INSTANCE_ID;
    const token      = process.env.GREENAPI_TOKEN;
    if (!instanceId || !token) return;
    const message =
`🪁 ¡Bienvenido a La Bajada Wind Alert, ${name}!

Te avisaremos cuando el viento supere 14 kts en condiciones ideales (9 a 19hs) 🌊

Para dejar de recibir alertas mandá *STOP*.`;
    await fetch(`https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message })
    });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { phone, name } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'Falta phone' });

    // Normalizar: quitar espacios, guiones, paréntesis, el 0 inicial y el 15
    const digits = phone.replace(/\D/g, '').replace(/^0/, '').replace(/^15/, '');
    if (digits.length < 8) return res.status(400).json({ error: 'Número demasiado corto' });

    // chatId argentino: 549XXXXXXXXXX@c.us
    const chatId = `549${digits}@c.us`;
    const nombre = (name || '').trim() || 'Kitero';

    const db = initFirebase();
    if (!db) return res.status(500).json({ error: 'Firebase no disponible' });

    await db.collection('greenapi_subscribers').doc(chatId).set({
        chatId,
        name: nombre,
        active: true,
        subscribedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    try {
        await sendWelcome(chatId, nombre);
    } catch (e) {
        console.error('Error enviando bienvenida WA:', e.message);
    }

    return res.status(200).json({ ok: true, chatId });
}
