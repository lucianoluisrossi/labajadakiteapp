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

    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'email requerido' });

    const db = initFirebase();
    if (!db) return res.status(500).json({ error: 'Firebase error' });

    try {
        // 1. Buscar por email en Firestore (doc guardado con email)
        const docId = email.replace(/[.#$[\]@]/g, '_');
        const doc = await db.collection(VIP_COLLECTION).doc(docId).get();
        if (doc.exists && doc.data().active === true) {
            return res.status(200).json({ active: true, status: doc.data().status });
        }

        // 2. Buscar por payer_id en Firestore (cuando MP no devuelve email)
        const snapshot = await db.collection(VIP_COLLECTION)
            .where('active', '==', true)
            .get();
        // Si hay docs activos, buscar si alguno matchea via MP API
        if (!snapshot.empty) {
            const mp = await searchMPByEmail(email);
            if (mp && (mp.status === 'authorized' || mp.status === 'active')) {
                // Guardar el email para futuras consultas
                const payerDocId = `payer_${mp.payer_id}`;
                await db.collection(VIP_COLLECTION).doc(docId).set({
                    email,
                    preapproval_id: mp.id,
                    payer_id: mp.payer_id,
                    status: mp.status,
                    active: true,
                    next_payment_date: mp.next_payment_date || null
                }, { merge: true });
                // También actualizar el doc por payer_id con el email
                await db.collection(VIP_COLLECTION).doc(payerDocId).set({ email }, { merge: true });
                return res.status(200).json({ active: true, status: mp.status });
            }
        }

        // 3. Consultar MP directamente por email como último recurso
        const mp = await searchMPByEmail(email);
        if (mp && (mp.status === 'authorized' || mp.status === 'active')) {
            await db.collection(VIP_COLLECTION).doc(docId).set({
                email,
                preapproval_id: mp.id,
                payer_id: mp.payer_id,
                status: mp.status,
                active: true,
                next_payment_date: mp.next_payment_date || null
            }, { merge: true });
            return res.status(200).json({ active: true, status: mp.status });
        }

        return res.status(200).json({ active: false });

    } catch (error) {
        console.error('Error consultando VIP:', error);
        return res.status(500).json({ error: error.message });
    }
}
