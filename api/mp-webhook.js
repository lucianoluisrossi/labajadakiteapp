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
        let subscription = await getSubscriptionStatus(data.id);
        if (!subscription) {
            // MP a veces envía un payment ID en lugar de preapproval ID — intentar como pago
            const payment = await getPaymentDetails(data.id);
            if (payment?.payer?.email && payment?.status) {
                const payerEmail = payment.payer.email;
                const isApproved = payment.status === 'approved';
                const docId = payerEmail.replace(/[.#$[\]@]/g, '_');
                if (isApproved) {
                    await db.collection(VIP_COLLECTION).doc(docId).set({
                        email: payerEmail, payment_id: payment.id,
                        status: 'authorized', active: true,
                        updated_at: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                }
                await saveLog(db, { type, preapproval_id: String(data.id), payer_email: payerEmail, status: payment.status, active: isApproved, result: 'ok', reason: 'fallback a payment API' });
                return res.status(200).json({ ok: true });
            }
            await saveLog(db, { type, preapproval_id: data?.id, result: 'error', reason: 'no subscription data from MP API' });
            return res.status(200).json({ ok: true, ignored: 'no subscription data' });
        }

        const { status, payer_id, id, next_payment_date } = subscription;
        // Intentar obtener email: del campo directo o consultando al usuario de MP
        const payer_email = subscription.payer_email || await getPayerEmail(payer_id) || '';
        const isActive = status === 'authorized' || status === 'active';

        // Si no hay email, buscar el documento por preapproval_id en kiter_vip
        let docId = null;
        if (payer_email) {
            docId = payer_email.replace(/[.#$[\]@]/g, '_');
        } else {
            const existing = await db.collection(VIP_COLLECTION).where('preapproval_id', '==', id).limit(1).get();
            if (!existing.empty) {
                docId = existing.docs[0].id;
            } else if (payer_id) {
                docId = `payer_${payer_id}`;
            }
        }

        if (!docId) {
            await saveLog(db, { type, preapproval_id: id, status, result: 'error', reason: 'no se encontró documento VIP para actualizar' });
            return res.status(200).json({ ok: true });
        }

        await db.collection(VIP_COLLECTION).doc(docId).set({
            email: payer_email || null,
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
