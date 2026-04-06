// /api/vip-status.js
// Consulta si un email tiene suscripción VIP activa

import { initFirebase } from './_firebase.js';

const VIP_COLLECTION = 'kiter_vip';
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

async function searchMPByEmail(email) {
    const res = await fetch(`https://api.mercadopago.com/preapproval/search?payer_email=${encodeURIComponent(email)}&status=authorized`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.results?.[0] || null;
}

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const { email, uid } = req.query;
    if (!email) return res.status(400).json({ error: 'email requerido' });

    const db = initFirebase();
    if (!db) return res.status(500).json({ error: 'Firebase error' });

    try {
        // Obtener mp_email alternativo si el usuario lo registró
        let altEmail = null;
        if (uid) {
            const userDoc = await db.collection('usuarios').doc(uid).get();
            if (userDoc.exists && userDoc.data().mp_email) {
                altEmail = userDoc.data().mp_email;
            }
        }

        // Helper: chequear un email en Firestore + MP API
        async function checkEmail(emailToCheck) {
            const docId = emailToCheck.replace(/[.#$[\]@]/g, '_');
            const d = await db.collection(VIP_COLLECTION).doc(docId).get();
            if (d.exists && d.data().active === true) return { active: true, status: d.data().status };
            const mp = await searchMPByEmail(emailToCheck);
            if (mp && (mp.status === 'authorized' || mp.status === 'active')) {
                await db.collection(VIP_COLLECTION).doc(docId).set({
                    email: emailToCheck, preapproval_id: mp.id, payer_id: mp.payer_id,
                    status: mp.status, active: true, next_payment_date: mp.next_payment_date || null
                }, { merge: true });
                return { active: true, status: mp.status };
            }
            return null;
        }

        // 1. Chequear email de la app
        const result = await checkEmail(email);
        if (result) return res.status(200).json(result);

        // 2. Chequear mp_email alternativo si existe y es distinto
        if (altEmail && altEmail.toLowerCase() !== email.toLowerCase()) {
            const altResult = await checkEmail(altEmail);
            if (altResult) return res.status(200).json(altResult);
        }

        return res.status(200).json({ active: false });

    } catch (error) {
        console.error('Error consultando VIP:', error);
        return res.status(500).json({ error: error.message });
    }
}
