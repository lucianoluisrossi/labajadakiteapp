// /api/classified-image.js
// Sirve la foto de un clasificado como imagen (en Firestore se guarda como data URL base64).
// La usan la vista previa de links compartidos (og:image) y el resumen diario de Telegram/WhatsApp.

import { initFirebase } from './_firebase.js';

export const isValidClassifiedId = (id) => /^[A-Za-z0-9]{1,40}$/.test(id);

export default async function handler(req, res) {
    const id = String(req.query?.id || '');
    if (!isValidClassifiedId(id)) return res.status(400).json({ error: 'id inválido' });

    const db = initFirebase();
    if (!db) return res.status(500).json({ error: 'Firebase error' });

    try {
        const snap = await db.collection('classifieds').doc(id).get();
        const photo = snap.exists ? snap.data().photoURL || '' : '';

        if (/^https?:\/\//.test(photo)) {
            res.setHeader('Location', photo);
            return res.status(302).end();
        }
        const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(photo);
        if (!match) {
            res.setHeader('Location', '/logo.png');
            return res.status(302).end();
        }

        res.setHeader('Content-Type', match[1]);
        res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
        return res.status(200).send(Buffer.from(match[2], 'base64'));
    } catch (e) {
        console.error('Error sirviendo imagen de clasificado:', e);
        return res.status(500).json({ error: 'Error interno' });
    }
}
