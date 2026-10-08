// /api/classifieds-digest.js
// Cron diario: un solo resumen con los clasificados publicados en las últimas 24 h
// → canal de Telegram (foto + lista) y estado de WhatsApp (Green API, beta: si falla no corta nada).
// ?dry=1 arma el mensaje y lo devuelve sin enviar ni marcar (para probar en previews).

import { initFirebase } from './_firebase.js';
import admin from 'firebase-admin';
import { escapeHtml, formatClassifiedPrice } from './classified-share.js';

const SITE_URL = 'https://www.labajadakite.app';
const WINDOW_MS = 24 * 3600 * 1000;
const MAX_ITEMS = 6;
const CAPTION_MAX = 1024;

export function buildDigest(items) {
    const shown = items.slice(0, MAX_ITEMS);
    const lines = shown.map(i =>
        `• <b>${escapeHtml(i.title)}</b> — ${escapeHtml(formatClassifiedPrice(i))}${i.featured ? ' ⭐' : ''}\n  ${SITE_URL}/c/${i.id}`
    );
    const more = items.length > shown.length ? `\n\n…y ${items.length - shown.length} más en la app` : '';
    let html = `🏷️ <b>Nuevos clasificados en La Bajada</b>\n\n${lines.join('\n')}${more}\n\n👉 ${SITE_URL}`;
    if (html.length > CAPTION_MAX) html = html.slice(0, CAPTION_MAX - 1) + '…';
    const plain = html.replace(/<b>/g, '*').replace(/<\/b>/g, '*').replace(/<[^>]+>/g, '');
    const withPhoto = shown.find(i => i.photoURL);
    const photo = withPhoto ? `${SITE_URL}/api/classified-image?id=${withPhoto.id}` : null;
    return { html, plain, photo };
}

async function telegram(method, body) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return false;
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, parse_mode: 'HTML', ...body })
    });
    if (!res.ok) console.error(`Telegram ${method} falló:`, await res.json().catch(() => ({})));
    return res.ok;
}

async function sendWhatsAppStatus(photo, caption) {
    const instanceId = process.env.GREENAPI_INSTANCE_ID;
    const token = process.env.GREENAPI_TOKEN;
    if (!instanceId || !token || !photo) return false;
    try {
        const res = await fetch(`https://api.green-api.com/waInstance${instanceId}/sendMediaStatus/${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urlFile: photo, fileName: 'clasificado.jpg', caption })
        });
        if (!res.ok) console.warn('Green API sendMediaStatus no disponible:', res.status);
        return res.ok;
    } catch (e) {
        console.warn('Green API sendMediaStatus error:', e.message);
        return false;
    }
}

export default async function handler(req, res) {
    const cronSecret = process.env.CRON_SECRET;
    const dry = Boolean(req.query?.dry);
    if (!dry && cronSecret && req.headers?.authorization !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'unauthorized' });
    }

    const db = initFirebase();
    if (!db) return res.status(500).json({ error: 'Firebase error' });

    try {
        const since = admin.firestore.Timestamp.fromMillis(Date.now() - WINDOW_MS);
        const snap = await db.collection('classifieds').where('createdAt', '>=', since).get();
        const items = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(i => !i.broadcastAt && i.status !== 'vendido')
            .sort((a, b) => (b.featured === true) - (a.featured === true)
                || (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

        if (items.length === 0) return res.status(200).json({ ok: true, sent: 0 });

        const digest = buildDigest(items);
        if (dry) return res.status(200).json({ ok: true, dry: true, count: items.length, ...digest });

        const telegramOk = digest.photo
            ? await telegram('sendPhoto', { photo: digest.photo, caption: digest.html }) || await telegram('sendMessage', { text: digest.html, disable_web_page_preview: true })
            : await telegram('sendMessage', { text: digest.html, disable_web_page_preview: true });
        const statusOk = await sendWhatsAppStatus(digest.photo, digest.plain);

        if (telegramOk || statusOk) {
            const sentAt = admin.firestore.FieldValue.serverTimestamp();
            await Promise.all(items.map(i => db.collection('classifieds').doc(i.id).set({ broadcastAt: sentAt }, { merge: true })));
        }
        return res.status(200).json({ ok: true, sent: items.length, telegram: telegramOk, whatsappStatus: statusOk });
    } catch (e) {
        console.error('Error en resumen de clasificados:', e);
        return res.status(500).json({ error: e.message });
    }
}
