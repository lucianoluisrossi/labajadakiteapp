// /api/vip-expire.js
// Cron diario: desactiva VIPs pausados o cancelados cuyo período pago (vip_until) ya venció.
// No toca documentos sin vip_until (VIP manuales o anteriores al cambio) ni suscripciones authorized.

import { initFirebase } from './_firebase.js';
import admin from 'firebase-admin';

const VIP_COLLECTION = 'kiter_vip';

export default async function handler(req, res) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers?.authorization !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'unauthorized' });
    }

    const db = initFirebase();
    if (!db) return res.status(500).json({ error: 'Firebase error' });

    try {
        const now = new Date().toISOString();
        const snap = await db.collection(VIP_COLLECTION).where('vip_until', '<=', now).get();
        const expired = snap.docs.filter(d => {
            const v = d.data();
            return v.active === true && ['paused', 'cancelled'].includes(v.status);
        });

        for (const d of expired) {
            await d.ref.set({ active: false, expired_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }

        console.log(`vip-expire: ${expired.length} VIP desactivados`);
        return res.status(200).json({ ok: true, expired: expired.map(d => d.id) });
    } catch (error) {
        console.error('Error en vip-expire:', error);
        return res.status(500).json({ error: error.message });
    }
}
