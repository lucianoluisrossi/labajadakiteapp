// /api/admin-send-campaign.js
// Campaña de email "Nueva versión" (v2) a todos los usuarios registrados, solo admin.
//   POST { mode: 'test' }            → envía la campaña solo al email del admin
//   POST { mode: 'send', limit? }    → envía el siguiente lote (por defecto 90, para el límite diario de Resend)
// Recuerda a quién ya se le envió (email_campaigns/{id}/sent) y saltea a quienes se dieron de baja.

import { initFirebase } from './_firebase.js';
import admin from 'firebase-admin';
import { requireRole } from './_auth.js';
import {
    FROM_EMAIL, LAUNCH_SUBJECT, launchEmailHtml, unsubscribeHeaders, loadUnsubscribed, emailDocId,
} from './_email.js';

const CAMPAIGN_ID = 'v2-lanzamiento';
const BATCH_SIZE = 100;     // máximo de Resend por request /emails/batch
const DEFAULT_LIMIT = 90;   // plan gratis de Resend: 100 emails por día

const buildEmail = ({ email, name }) => ({
    from: FROM_EMAIL,
    to: email,
    subject: LAUNCH_SUBJECT,
    html: launchEmailHtml({ name, email }),
    headers: unsubscribeHeaders(email),
});

async function resend(path, body) {
    const res = await fetch(`https://api.resend.com${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `Resend HTTP ${res.status}`);
    return data;
}

async function listRegisteredUsers() {
    const users = [];
    let pageToken;
    do {
        const result = await admin.auth().listUsers(1000, pageToken);
        result.users.forEach(u => { if (u.email) users.push({ email: u.email.trim().toLowerCase(), name: u.displayName || '' }); });
        pageToken = result.pageToken;
    } while (pageToken);
    return users;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const db = initFirebase();
    const caller = await requireRole(req, res, db, ['admin']);
    if (!caller) return;
    if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY no configurada' });

    const { mode, limit } = req.body || {};

    try {
        if (mode === 'test') {
            if (!caller.email) return res.status(400).json({ error: 'Tu cuenta no tiene email' });
            await resend('/emails', buildEmail({ email: caller.email, name: 'Admin (prueba)' }));
            return res.status(200).json({ ok: true, test: true, to: caller.email });
        }
        if (mode !== 'send') return res.status(400).json({ error: "mode debe ser 'test' o 'send'" });

        const sentRef = db.collection('email_campaigns').doc(CAMPAIGN_ID).collection('sent');
        const [users, unsubscribed, sentSnap] = await Promise.all([
            listRegisteredUsers(), loadUnsubscribed(db), sentRef.get(),
        ]);
        const alreadySent = new Set(sentSnap.docs.map(d => d.id));
        const seen = new Set();
        const pending = users.filter(u => {
            const id = emailDocId(u.email);
            if (seen.has(id) || alreadySent.has(id) || unsubscribed.has(u.email)) return false;
            seen.add(id);
            return true;
        });

        const toSend = pending.slice(0, Math.max(1, Math.min(Number(limit) || DEFAULT_LIMIT, 1000)));
        let sent = 0;
        for (let i = 0; i < toSend.length; i += BATCH_SIZE) {
            const chunk = toSend.slice(i, i + BATCH_SIZE);
            await resend('/emails/batch', chunk.map(buildEmail));
            const batch = db.batch();
            chunk.forEach(u => batch.set(sentRef.doc(emailDocId(u.email)), {
                email: u.email, at: admin.firestore.FieldValue.serverTimestamp()
            }));
            await batch.commit();
            sent += chunk.length;
        }

        return res.status(200).json({
            ok: true, sent, remaining: pending.length - sent,
            total: users.length, unsubscribed: unsubscribed.size, alreadySent: alreadySent.size + sent,
        });
    } catch (e) {
        console.error('Error en campaña de email:', e);
        return res.status(500).json({ error: e.message });
    }
}
