// api/admin-resolve-payer-docs.js
// Resuelve docs huérfanos en kiter_vip con id payer_{payerId}
// Para cada uno: consulta MP por preapproval_id → obtiene email → migra doc → borra el huérfano

import { initFirebase } from './_firebase.js';
import admin from 'firebase-admin';

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

async function getSubscriptionByPreapproval(preapprovalId) {
    const res = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` }
    });
    if (!res.ok) return null;
    return await res.json();
}

async function getPayerEmail(payerId) {
    if (!payerId) return null;
    try {
        const res = await fetch(`https://api.mercadopago.com/users/${payerId}`, {
            headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` }
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.email || null;
    } catch(e) { return null; }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const db = initFirebase();
    if (!db) return res.status(500).json({ error: 'Firebase no disponible' });

    // Buscar todos los docs con id que empiece con payer_
    const snap = await db.collection('kiter_vip').get();
    const payerDocs = snap.docs.filter(d => d.id.startsWith('payer_'));

    if (payerDocs.length === 0) {
        return res.status(200).json({ ok: true, resolved: 0, failed: 0, results: [] });
    }

    const results = [];

    for (const docSnap of payerDocs) {
        const data = docSnap.data();
        const payerId = docSnap.id.replace('payer_', '');
        const preapprovalId = data.preapproval_id;
        let email = null;
        let source = null;

        // Intentar obtener email via preapproval
        if (preapprovalId) {
            const subscription = await getSubscriptionByPreapproval(preapprovalId);
            if (subscription) {
                email = subscription.payer_email || null;
                if (!email && subscription.payer_id) {
                    email = await getPayerEmail(subscription.payer_id);
                    if (email) source = 'users_api';
                } else if (email) {
                    source = 'preapproval';
                }
            }
        }

        // Fallback: intentar directo por payer_id del doc id
        if (!email && payerId) {
            email = await getPayerEmail(payerId);
            if (email) source = 'users_api_fallback';
        }

        if (!email) {
            results.push({ docId: docSnap.id, status: 'failed', reason: 'no se pudo obtener email desde MP' });
            continue;
        }

        try {
            const newDocId = email.replace(/[.#$[\]@]/g, '_');

            // Verificar si ya existe el doc destino
            const existing = await db.collection('kiter_vip').doc(newDocId).get();

            if (existing.exists()) {
                // Ya existe — solo actualizar campos faltantes y borrar huérfano
                await db.collection('kiter_vip').doc(newDocId).set({
                    ...data,
                    email,
                    updated_at: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } else {
                // Crear doc nuevo con email
                await db.collection('kiter_vip').doc(newDocId).set({
                    ...data,
                    email,
                    updated_at: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            // Borrar doc huérfano
            await db.collection('kiter_vip').doc(docSnap.id).delete();

            results.push({ docId: docSnap.id, status: 'resolved', newDocId, email, source });
        } catch(e) {
            results.push({ docId: docSnap.id, status: 'error', reason: e.message });
        }
    }

    const resolved = results.filter(r => r.status === 'resolved').length;
    const failed   = results.filter(r => r.status !== 'resolved').length;

    console.log(`Resolver payer docs: ${resolved} resueltos, ${failed} fallidos`);
    return res.status(200).json({ ok: true, resolved, failed, results });
}
