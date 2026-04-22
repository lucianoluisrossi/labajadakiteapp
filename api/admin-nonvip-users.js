// api/admin-nonvip-users.js
// Retorna usuarios autenticados en Firebase que NO son VIP activos

import { initFirebase } from './_firebase.js';
import admin from 'firebase-admin';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const db = initFirebase();
    if (!db) return res.status(500).json({ error: 'Firebase no disponible' });

    try {
        // Obtener todos los emails VIP activos
        const vipSnap = await db.collection('kiter_vip').where('active', '==', true).get();
        const vipEmails = new Set(vipSnap.docs.map(d => (d.data().email || '').toLowerCase()).filter(Boolean));

        // Listar todos los usuarios de Firebase Auth
        const allUsers = [];
        let pageToken;
        do {
            const result = await admin.auth().listUsers(1000, pageToken);
            result.users.forEach(u => {
                if (u.email) allUsers.push({ uid: u.uid, email: u.email, name: u.displayName || '' });
            });
            pageToken = result.pageToken;
        } while (pageToken);

        // Filtrar no-VIP
        const nonVip = allUsers.filter(u => !vipEmails.has(u.email.toLowerCase()));

        return res.status(200).json({ ok: true, total: allUsers.length, nonVip });
    } catch(e) {
        console.error('admin-nonvip-users error:', e.message);
        return res.status(500).json({ error: e.message });
    }
}
