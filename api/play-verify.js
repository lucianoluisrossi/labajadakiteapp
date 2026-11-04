// /api/play-verify.js
// La app Android (TWA) manda el purchaseToken de una compra de Google Play; se valida con Google
// y se activa el VIP del email de la sesión. También sirve para restaurar compras al abrir la app.

import { initFirebase } from './_firebase.js';
import admin from 'firebase-admin';
import { getPlaySubscription, acknowledgePlaySubscription, readPlaySubscription, playTokenId, PLAY_PRODUCT_ID } from './_play.js';

const VIP_COLLECTION = 'kiter_vip';
const PURCHASES_COLLECTION = 'play_purchases'; // token → dueño; solo lo lee el servidor

const toDocId = (email) => email.trim().toLowerCase().replace(/[.#$[\]@]/g, '_');

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const db = initFirebase();
    if (!db) return res.status(500).json({ error: 'Firebase no disponible' });

    let user;
    try {
        user = await admin.auth().verifyIdToken((req.headers?.authorization || '').replace(/^Bearer /, ''));
    } catch (e) {
        return res.status(401).json({ error: 'Sesión requerida' });
    }
    if (!user.email) return res.status(400).json({ error: 'La cuenta no tiene email' });

    const purchaseToken = req.body?.purchaseToken;
    if (typeof purchaseToken !== 'string' || !purchaseToken) return res.status(400).json({ error: 'Falta purchaseToken' });

    // Un token queda atado a la primera cuenta que lo valida
    const tokenId = playTokenId(purchaseToken);
    const owner = await db.collection(PURCHASES_COLLECTION).doc(tokenId).get();
    if (owner.exists && owner.data().uid !== user.uid) {
        return res.status(409).json({ error: 'Esta compra está vinculada a otra cuenta' });
    }

    let sub;
    try {
        sub = await getPlaySubscription(purchaseToken);
    } catch (e) {
        console.error('play-verify: Google Play API', e.message);
        return res.status(502).json({ error: 'No se pudo verificar la compra' });
    }
    if (!sub) return res.status(400).json({ error: 'Compra inválida' });

    const { active, vip_until, needsAck } = readPlaySubscription(sub);
    const now = admin.firestore.FieldValue.serverTimestamp();

    await db.collection(PURCHASES_COLLECTION).doc(tokenId).set({
        uid: user.uid, email: user.email, purchase_token: purchaseToken, updated_at: now,
    }, { merge: true });

    await db.collection(VIP_COLLECTION).doc(toDocId(user.email)).set({
        email: user.email,
        source: 'play',
        play_token_id: tokenId,
        play_product_id: PLAY_PRODUCT_ID,
        active,
        vip_until,
        updated_at: now,
    }, { merge: true });

    if (needsAck) {
        try {
            await acknowledgePlaySubscription(purchaseToken);
        } catch (e) {
            // El VIP ya quedó activo; la app reintenta al abrirse (restaurar compras)
            console.error('play-verify: acknowledge', e.message);
            return res.status(502).json({ error: 'No se pudo confirmar la compra', active });
        }
    }

    return res.status(200).json({ active, vip_until });
}
