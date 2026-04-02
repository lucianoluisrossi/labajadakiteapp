// /api/vip-status.js
// Consulta si un email tiene suscripción VIP activa

import { initFirebase } from './_firebase.js';

const VIP_COLLECTION = 'kiter_vip';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'email requerido' });

    const db = initFirebase();
    if (!db) return res.status(500).json({ error: 'Firebase error' });

    try {
        const docId = email.replace(/[.#$[\]]/g, '_');
        const doc = await db.collection(VIP_COLLECTION).doc(docId).get();

        if (!doc.exists) return res.status(200).json({ active: false });

        const data = doc.data();
        return res.status(200).json({
            active: data.active === true,
            status: data.status,
            next_payment_date: data.next_payment_date || null
        });

    } catch (error) {
        console.error('Error consultando VIP:', error);
        return res.status(500).json({ error: error.message });
    }
}
