// api/notify-novedades.js
// Envía una novedad del spot a todos los suscriptores de WhatsApp (Green API)

import { initFirebase } from './_firebase.js';
import admin from 'firebase-admin';

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
        return res.ok;
    } catch (e) {
        console.error(`Error Green API [${chatId}]:`, e.message);
        return false;
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { titulo, texto } = req.body || {};
    if (!titulo || !texto) return res.status(400).json({ error: 'Faltan titulo o texto' });

    let db;
    try {
        db = initFirebase();
    } catch (e) {
        console.error('Error inicializando Firebase:', e);
        return res.status(500).json({ error: 'Firebase init failed' });
    }

    // Armar mensaje
    const textoTruncado = texto.length > 300 ? texto.substring(0, 297) + '...' : texto;
    const message = `📢 *Nueva novedad de La Bajada*\n\n*${titulo}*\n\n${textoTruncado}\n\n🪁 labajadakite.app`;

    // Obtener suscriptores activos
    let subs = [];
    try {
        const snap = await db.collection('greenapi_subscribers').where('active', '==', true).get();
        subs = snap.docs.map(d => d.data().chatId).filter(Boolean);
    } catch (e) {
        console.error('Error leyendo suscriptores:', e);
        return res.status(500).json({ error: 'Error leyendo suscriptores' });
    }

    if (subs.length === 0) return res.json({ ok: true, sent: 0, message: 'Sin suscriptores activos' });

    // Enviar a cada suscriptor con delay para evitar rate limit
    let sent = 0;
    for (const chatId of subs) {
        const ok = await sendViaGreenAPI(chatId, message);
        if (ok) sent++;
        // Delay de 1s entre mensajes para respetar rate limit de Green API
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`[notify-novedades] Enviado a ${sent}/${subs.length} suscriptores`);
    return res.json({ ok: true, sent, total: subs.length });
}
