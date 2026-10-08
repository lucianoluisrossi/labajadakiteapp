// Módulo compartido: verifica que quien llama a un endpoint tenga sesión de Firebase y el rol pedido.
// El cliente manda `Authorization: Bearer <ID token>`; el rol sale de usuarios/{uid}.role.

import admin from 'firebase-admin';

// Devuelve { uid, email, role } o null (ya respondió 401/403/500).
export async function requireRole(req, res, db, roles = ['admin']) {
    if (!db) { res.status(500).json({ error: 'Firebase no disponible' }); return null; }
    const token = (req.headers?.authorization || '').replace(/^Bearer /, '');
    if (!token) { res.status(401).json({ error: 'Sesión requerida' }); return null; }

    let decoded;
    try {
        decoded = await admin.auth().verifyIdToken(token);
    } catch (e) {
        res.status(401).json({ error: 'Sesión inválida' });
        return null;
    }

    const userDoc = await db.collection('usuarios').doc(decoded.uid).get();
    const role = userDoc.exists ? userDoc.data().role : null;
    if (!roles.includes(role)) {
        res.status(403).json({ error: 'Sin permiso' });
        return null;
    }
    return { uid: decoded.uid, email: decoded.email || null, role };
}
