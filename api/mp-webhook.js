// /api/mp-webhook.js
// Recibe notificaciones de MercadoPago sobre suscripciones

import { initFirebase } from './_firebase.js';
import admin from 'firebase-admin';

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const VIP_COLLECTION = 'kiter_vip';

async function getSubscriptionStatus(preapprovalId) {
    const res = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` }
    });
    if (!res.ok) return null;
    return await res.json();
}

async function getPaymentDetails(paymentId) {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` }
    });
    if (!res.ok) return null;
    return await res.json();
}

async function saveLog(db, entry) {
    try {
        await db.collection('mp_webhook_log').add({
            ...entry,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) {
        console.error('Error guardando log:', e.message);
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { type, data } = req.body || {};
    console.log('MP Webhook recibido:', type, data);

    const db = initFirebase();
    if (!db) return res.status(500).json({ error: 'Firebase error' });

    // Pago de suscripción
    if (type === 'payment') {
        try {
            const payment = await getPaymentDetails(data?.id);
            if (!payment) {
                await saveLog(db, { type, preapproval_id: data?.id, result: 'error', reason: 'no payment data from MP API' });
                return res.status(200).json({ ok: true });
            }

            const payerEmail = payment.payer?.email || null;
            const paymentStatus = payment.status; // approved, rejected, cancelled, etc.
            const isApproved = paymentStatus === 'approved';

            if (!payerEmail) {
                await saveLog(db, { type, preapproval_id: data?.id, status: paymentStatus, result: 'error', reason: 'no payer email en payment' });
                return res.status(200).json({ ok: true });
            }

            const docId = payerEmail.replace(/[.#$[\]@]/g, '_');
            if (isApproved) {
                await db.collection(VIP_COLLECTION).doc(docId).set({
                    email: payerEmail,
                    payment_id: payment.id,
                    status: 'authorized',
                    active: true,
                    updated_at: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }

            await saveLog(db, { type, preapproval_id: String(payment.id), payer_email: payerEmail, status: paymentStatus, active: isApproved, result: 'ok' });
            console.log(`✅ Payment procesado: ${payerEmail} → ${paymentStatus}`);
        } catch (error) {
            console.error('Error procesando payment webhook:', error);
            await saveLog(db, { type, preapproval_id: data?.id, result: 'error', reason: error.message }).catch(() => {});
        }
        return res.status(200).json({ ok: true });
    }

    // Pago autorizado de suscripción recurrente
    if (type === 'subscription_authorized_payment') {
        try {
            const payment = await getPaymentDetails(data?.id);
            if (!payment) {
                await saveLog(db, { type, preapproval_id: data?.id, result: 'error', reason: 'no payment data from MP API' });
                return res.status(200).json({ ok: true });
            }
            const payerEmail = payment.payer?.email || null;
            const paymentStatus = payment.status;
            const isApproved = paymentStatus === 'approved';
            if (!payerEmail) {
                await saveLog(db, { type, preapproval_id: data?.id, status: paymentStatus, result: 'error', reason: 'no payer email' });
                return res.status(200).json({ ok: true });
            }
            const docId = payerEmail.replace(/[.#$[\]@]/g, '_');
            if (isApproved) {
                await db.collection(VIP_COLLECTION).doc(docId).set({
                    email: payerEmail,
                    payment_id: payment.id,
                    status: 'authorized',
                    active: true,
                    updated_at: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
            await saveLog(db, { type, preapproval_id: String(payment.id), payer_email: payerEmail, status: paymentStatus, active: isApproved, result: 'ok' });
            console.log(`✅ Subscription payment procesado: ${payerEmail} → ${paymentStatus}`);
        } catch (error) {
            console.error('Error procesando subscription_authorized_payment:', error);
            await saveLog(db, { type, preapproval_id: data?.id, result: 'error', reason: error.message }).catch(() => {});
        }
        return res.status(200).json({ ok: true });
    }

    // Tipos no manejados — logueamos para diagnóstico
    if (type !== 'subscription_preapproval') {
        await saveLog(db, { type, preapproval_id: data?.id, result: 'ignored', reason: `tipo no manejado: ${type}` });
        return res.status(200).json({ ok: true, ignored: true });
    }

    try {
        const subscription = await getSubscriptionStatus(data.id);
        if (!subscription) {
            await saveLog(db, { type, preapproval_id: data?.id, result: 'error', reason: 'no subscription data from MP API' });
            return res.status(200).json({ ok: true, ignored: 'no subscription data' });
        }

        const { status, payer_email, payer_id, id, next_payment_date } = subscription;
        const isActive = status === 'authorized' || status === 'active';

        const emailKey = payer_email || null;
        if (!emailKey && !payer_id) {
            await saveLog(db, { type, preapproval_id: id, status, result: 'error', reason: 'no payer_email ni payer_id' });
            return res.status(200).json({ ok: true, ignored: 'no payer identifier' });
        }

        const docId = emailKey
            ? emailKey.replace(/[.#$[\]@]/g, '_')
            : `payer_${payer_id}`;
        await db.collection(VIP_COLLECTION).doc(docId).set({
            email: payer_email,
            preapproval_id: id,
            status,
            active: isActive,
            next_payment_date: next_payment_date || null,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        await saveLog(db, { type, preapproval_id: id, payer_email, status, active: isActive, result: 'ok' });
        console.log(`✅ VIP actualizado: ${payer_email} → ${status}`);
        return res.status(200).json({ ok: true });

    } catch (error) {
        console.error('Error procesando webhook MP:', error);
        await saveLog(db, { type, preapproval_id: data?.id, result: 'error', reason: error.message }).catch(() => {});
        return res.status(500).json({ error: error.message });
    }
}
