// /api/mp-webhook.js
// Recibe notificaciones de MercadoPago sobre suscripciones

import { initFirebase } from './_firebase.js';
import admin from 'firebase-admin';

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const MP_PLAN_ID = process.env.MP_PLAN_ID;
const VIP_COLLECTION = 'kiter_vip';

// null si el recurso no existe (4xx permanente); lanza error si la falla es transitoria
// (5xx, 429, 401/403, red) para que el handler responda 500 y MP reintente.
async function mpGet(path) {
    const res = await fetch(`https://api.mercadopago.com${path}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` }
    });
    if (res.ok) return await res.json();
    if ([401, 403, 429].includes(res.status) || res.status >= 500) {
        throw new Error(`MP API ${res.status} en ${path}`);
    }
    return null;
}

async function getSubscriptionStatus(preapprovalId) {
    return mpGet(`/preapproval/${preapprovalId}`);
}

async function getPaymentDetails(paymentId) {
    return mpGet(`/v1/payments/${paymentId}`);
}

// Factura de un cobro recurrente (data.id de subscription_authorized_payment)
async function getAuthorizedPayment(invoiceId) {
    return mpGet(`/authorized_payments/${invoiceId}`);
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

// Fecha hasta la que está pago el VIP: último cobro + un período. Sin cobros devuelve null
// (no se usa next_payment_date: una suscripción que nunca cobró no tiene período pago).
// ISO UTC para comparar como string en el cron de vencimiento.
export function computeVipUntil(subscription) {
    const last = subscription.summarized?.last_charged_date;
    if (!last) return null;
    const { frequency = 1, frequency_type = 'months' } = subscription.auto_recurring || {};
    const d = new Date(last);
    if (frequency_type === 'days') d.setUTCDate(d.getUTCDate() + frequency);
    else d.setUTCMonth(d.getUTCMonth() + frequency);
    return isNaN(d) ? null : d.toISOString();
}

// Cada resolver devuelve { subscription, payment? }, { notSubscription: payment } o null si el id no existe.
async function fromPreapproval(id) {
    const subscription = await getSubscriptionStatus(id);
    return subscription ? { subscription } : null;
}

async function fromPayment(id) {
    const payment = await getPaymentDetails(id);
    if (!payment) return null;
    const subscriptionId = payment.point_of_interaction?.transaction_data?.subscription_id;
    if (!subscriptionId) return { notSubscription: payment };
    const subscription = await getSubscriptionStatus(subscriptionId);
    return subscription ? { subscription, payment } : null;
}

async function fromInvoice(id) {
    const invoice = await getAuthorizedPayment(id);
    if (!invoice?.preapproval_id) return null;
    const subscription = await getSubscriptionStatus(invoice.preapproval_id);
    return subscription ? { subscription } : null;
}

// MP a veces manda un tipo de id distinto al del tópico: se prueba primero el esperado
const RESOLVERS = {
    subscription_preapproval: [fromPreapproval, fromPayment, fromInvoice],
    payment: [fromPayment, fromInvoice, fromPreapproval],
    subscription_authorized_payment: [fromInvoice, fromPayment, fromPreapproval],
};

async function resolveSubscription(type, id) {
    for (const resolve of RESOLVERS[type]) {
        const result = await resolve(id);
        if (result) return result;
    }
    return null;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { type, data } = req.body || {};
    console.log('MP Webhook recibido:', type, data);

    const db = initFirebase();
    if (!db) return res.status(500).json({ error: 'Firebase error' });

    // Deduplicación por id de notificación. Sin id no se deduplica: type + data.id
    // no alcanza (un alta y una baja de la misma suscripción comparten data.id).
    const notificationId = req.body?.id != null ? String(req.body.id) : null;
    const eventRef = notificationId ? db.collection('mpEvents').doc(notificationId) : null;
    if (eventRef) {
        const prev = await eventRef.get();
        if (prev.exists) {
            await eventRef.set({ duplicates: admin.firestore.FieldValue.increment(1), last_duplicate_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            return res.status(200).json({ ok: true, duplicate: true });
        }
    }

    // Solo se registra en mpEvents lo que terminó en 200; si hubo 500, MP reintenta y se reprocesa.
    const done = async (body) => {
        if (eventRef) {
            await eventRef.set({
                type: type || null,
                action: req.body?.action || null,
                data_id: data?.id != null ? String(data.id) : null,
                request_id: req.headers?.['x-request-id'] || null,
                raw: req.body,
                response: body,
                processed_at: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        return res.status(200).json(body);
    };

    // Tipos no manejados — logueamos para diagnóstico
    if (!RESOLVERS[type]) {
        await saveLog(db, { type, preapproval_id: data?.id, result: 'ignored', reason: `tipo no manejado: ${type}` });
        return done({ ok: true, ignored: true });
    }

    try {
        const resolved = await resolveSubscription(type, data?.id);

        if (!resolved) {
            await saveLog(db, { type, preapproval_id: data?.id, result: 'error', reason: 'no subscription data from MP API' });
            return done({ ok: true, ignored: 'no subscription data' });
        }

        // Pago suelto (no de suscripción): no da VIP
        if (resolved.notSubscription) {
            const p = resolved.notSubscription;
            await saveLog(db, { type, preapproval_id: String(p.id), payer_email: p.payer?.email || null, status: p.status, result: 'ignored', reason: 'pago sin suscripción asociada' });
            return done({ ok: true, ignored: 'not a subscription payment' });
        }

        const { subscription, payment } = resolved;
        const { status, payer_id, id, next_payment_date, preapproval_plan_id } = subscription;

        // Suscripción de otro plan: no da VIP
        if (MP_PLAN_ID && preapproval_plan_id && preapproval_plan_id !== MP_PLAN_ID) {
            await saveLog(db, { type, preapproval_id: id, status, result: 'ignored', reason: `plan ajeno: ${preapproval_plan_id}` });
            return done({ ok: true, ignored: 'other plan' });
        }

        // Intentar obtener email: del campo directo, consultando al usuario de MP o del pago
        const payer_email = (subscription.payer_email || await getPayerEmail(payer_id) || payment?.payer?.email || '').trim().toLowerCase();
        // Pausada o cancelada: mantiene el VIP hasta el fin del período pago; el cron api/vip-expire lo desactiva
        const vip_until = computeVipUntil(subscription);
        const inPaidPeriod = ['paused', 'cancelled'].includes(status) && vip_until && vip_until > new Date().toISOString();
        const isActive = status === 'authorized' || status === 'active' || Boolean(inPaidPeriod);

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
            return done({ ok: true });
        }

        await db.collection(VIP_COLLECTION).doc(docId).set({
            email: payer_email || null,
            preapproval_id: id,
            status,
            active: isActive,
            next_payment_date: next_payment_date || null,
            vip_until,
            ...(payment ? { payment_id: payment.id } : {}),
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        await saveLog(db, { type, preapproval_id: id, payer_email, status, payment_status: payment?.status || null, active: isActive, result: 'ok' });
        console.log(`✅ VIP actualizado (${type}): ${payer_email} → ${status}`);
        return done({ ok: true });

    } catch (error) {
        console.error('Error procesando webhook MP:', error);
        await saveLog(db, { type, preapproval_id: data?.id, result: 'error', reason: error.message }).catch(() => {});
        return res.status(500).json({ error: error.message });
    }
}
