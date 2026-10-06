// Función Serverless para proxy de la API de Ecowitt (Vercel)
// Esto evita problemas de CORS y permite que el frontend llame a /api/data de forma segura.

// NOTA: La clave de la aplicación y la MAC se dejan aquí ya que son públicas.

import { initFirebase } from './_firebase.js';
import admin from 'firebase-admin';

const ECOWITT_URL = 'https://api.ecowitt.net/api/v3/device/real_time';

// URL de la API de Ecowitt con la unidad de Presión cambiada a HPA (pressure_unitid=3)
const FULL_API_URL = `${ECOWITT_URL}?application_key=515398061FDA504607F0329996375FC2&api_key=2b181909-3bd1-4a8f-8cf1-91cb95e75ff5&mac=C8:C9:A3:1C:0D:E5&call_back=all&temp_unitid=1&pressure_unitid=3&wind_speed_unitid=8&rainfall_unitid=12&solar_irradiance_unitid=14&capacity_unitid=25`;

// --- Acceso al viento en vivo ---
// /api/data          → público, cacheado 15 min en el CDN de Vercel (usuarios gratis)
// /api/data?live=1   → requiere ID token de Firebase de un VIP o de una cuenta en prueba
const FREE_CACHE_SECONDS = 15 * 60;
const TRIAL_DAYS = 7;
// Cuentas creadas antes del lanzamiento cuentan la prueba desde esta fecha
const TRIAL_LAUNCH_MS = Date.parse('2026-10-07T00:00:00-03:00');
const ACCESS_CACHE_MS = 5 * 60 * 1000;
const accessCache = new Map(); // uid -> { access, exp }

const toDocId = (email) => email.trim().toLowerCase().replace(/[.#$[\]@]/g, '_');

async function isActiveVip(db, email) {
    const snap = await db.collection('kiter_vip').doc(toDocId(email)).get();
    return snap.exists && snap.data().active === true;
}

// { live, reason: 'vip' | 'trial' | 'none', trial_ends }
export async function getLiveAccess(db, auth, { uid, email }) {
    const cached = accessCache.get(uid);
    if (cached && cached.exp > Date.now()) return cached.access;

    let access;
    if (await isActiveVip(db, email)) {
        access = { live: true, reason: 'vip', trial_ends: null };
    } else {
        const userDoc = await db.collection('usuarios').doc(uid).get();
        const mpEmail = userDoc.exists ? userDoc.data().mp_email : null;
        if (mpEmail && await isActiveVip(db, mpEmail)) {
            access = { live: true, reason: 'vip', trial_ends: null };
        } else {
            const user = await auth.getUser(uid);
            const createdMs = Date.parse(user.metadata.creationTime);
            const trialEnds = Math.max(createdMs, TRIAL_LAUNCH_MS) + TRIAL_DAYS * 864e5;
            access = trialEnds > Date.now()
                ? { live: true, reason: 'trial', trial_ends: new Date(trialEnds).toISOString() }
                : { live: false, reason: 'none', trial_ends: new Date(trialEnds).toISOString() };
        }
    }
    accessCache.set(uid, { access, exp: Date.now() + ACCESS_CACHE_MS });
    return access;
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).send({ error: 'Método no permitido. Solo GET.' });
    }

    let access = null;
    if (req.query?.live) {
        const token = (req.headers?.authorization || '').replace(/^Bearer /, '');
        if (!token) return res.status(401).json({ error: 'token requerido' });

        const db = initFirebase();
        if (!db) return res.status(500).json({ error: 'Firebase error' });

        let decoded;
        try {
            decoded = await admin.auth().verifyIdToken(token);
        } catch (e) {
            return res.status(401).json({ error: 'token inválido' });
        }
        // Cuentas anónimas o sin email no acceden al vivo (ni a la prueba)
        if (!decoded.email) return res.status(403).json({ access: { live: false, reason: 'none', trial_ends: null } });

        try {
            access = await getLiveAccess(db, admin.auth(), { uid: decoded.uid, email: decoded.email });
        } catch (e) {
            console.error('Error verificando acceso al vivo:', e);
            return res.status(500).json({ error: 'Error verificando acceso' });
        }
        if (!access.live) return res.status(403).json({ access });
    }

    try {
        const response = await fetch(FULL_API_URL, {
            // Es una buena práctica agregar un User-Agent
            headers: { 'User-Agent': 'LaBajada-Dashboard-Vercel-Function' }
        });
        
        // Si la respuesta de Ecowitt no es 200, devolvemos el error.
        if (!response.ok) {
            console.error(`Error de la API de Ecowitt: ${response.status}`);
            return res.status(response.status).json({ error: `Fallo al obtener datos de Ecowitt: ${response.statusText}` });
        }

        const data = await response.json();
        
        // Vivo: sin caché y con el estado de acceso. Gratis: el CDN lo sirve hasta 15 min.
        if (access) {
            res.setHeader('Cache-Control', 'private, no-store');
            return res.status(200).json({ ...data, access });
        }
        res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${FREE_CACHE_SECONDS}`);
        res.status(200).json(data);

    } catch (error) {
        console.error('Error Serverless al procesar la solicitud de Ecowitt:', error);
        res.status(500).json({ error: 'Error interno del servidor Serverless al contactar la fuente de datos.' });
    }
}
