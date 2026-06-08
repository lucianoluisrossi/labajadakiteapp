// api/admin-mp-subscriptions.js
// Lista suscriptores activos en MercadoPago y cruza con kiter_vip en Firestore

import { initFirebase } from './_firebase.js';

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();
    if (!MP_ACCESS_TOKEN) return res.status(500).json({ error: 'MP_ACCESS_TOKEN no configurado' });

    const db = initFirebase();
    if (!db) return res.status(500).json({ error: 'Firebase no disponible' });

    try {
        // Obtener lista de IDs de suscripciones activas
        const mpRes = await fetch('https://api.mercadopago.com/preapproval/search?status=authorized&limit=100', {
            headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` }
        });
        if (!mpRes.ok) {
            const err = await mpRes.json();
            return res.status(mpRes.status).json({ error: err.message || mpRes.status });
        }
        const mpData = await mpRes.json();
        const ids = (mpData.results || []).map(r => r.id);

        // Consultar cada suscripción individualmente para obtener payer_email
        const details = await Promise.all(ids.map(async id => {
            try {
                const r = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
                    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` }
                });
                return r.ok ? await r.json() : null;
            } catch { return null; }
        }));

        // Obtener emails VIP activos en Firestore
        const vipSnap = await db.collection('kiter_vip').where('active', '==', true).get();
        const vipEmails = new Set(
            vipSnap.docs
                .map(d => (d.data().email || '').toLowerCase())
                .filter(Boolean)
        );

        const FREQ = { monthly: 'mensual', days: 'días', years: 'anual' };

        const subscriptions = details.filter(Boolean).map(s => {
            const email = (s.payer_email || '').toLowerCase();
            const nextPayment = s.next_payment_date
                ? new Date(s.next_payment_date).toLocaleDateString('es-AR')
                : null;
            const freq = s.auto_recurring
                ? `${s.auto_recurring.frequency} ${FREQ[s.auto_recurring.frequency_type] || s.auto_recurring.frequency_type}`
                : null;
            return {
                preapprovalId: s.id,
                email: email || null,
                amount: s.auto_recurring?.transaction_amount ?? '—',
                frequency: freq,
                nextPayment,
                status: s.status,
                inFirestore: email ? vipEmails.has(email) : false
            };
        });

        return res.status(200).json({ ok: true, total: subscriptions.length, subscriptions });
    } catch(e) {
        return res.status(500).json({ error: e.message });
    }
}
