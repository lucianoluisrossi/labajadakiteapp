// /api/email-unsubscribe.js
// Baja de emails de campañas. GET desde el link del email (muestra confirmación) o POST one-click (Gmail/Outlook).
// El link va firmado (ver _email.js) para que nadie pueda dar de baja emails ajenos.

import { initFirebase } from './_firebase.js';
import admin from 'firebase-admin';
import { UNSUBSCRIBES, emailDocId, isValidUnsubscribe } from './_email.js';

const page = (title, text) => `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="font-family:Arial,sans-serif;max-width:420px;margin:60px auto;padding:0 16px;text-align:center;color:#1f2937">
<div style="font-size:44px">🪁</div><h1 style="font-size:20px">${title}</h1><p style="color:#4b5563;line-height:1.5">${text}</p>
<a href="https://www.labajadakite.app" style="color:#0ea5e9;font-weight:700">Ir a La Bajada App</a></body></html>`;

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();
    const email = String(req.query?.e || '').trim().toLowerCase();
    const token = String(req.query?.t || '');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!email || !isValidUnsubscribe(email, token)) {
        return res.status(400).send(page('Link inválido', 'El link de baja no es válido. Respondé el email y te damos de baja a mano.'));
    }

    const db = initFirebase();
    if (!db) return res.status(500).send(page('Error', 'No pudimos procesar la baja. Probá de nuevo más tarde.'));

    await db.collection(UNSUBSCRIBES).doc(emailDocId(email)).set({
        email, at: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(200).send(page('Listo, te dimos de baja', 'No vas a recibir más emails de La Bajada App. La app la seguís usando igual.'));
}
