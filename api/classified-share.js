// /api/classified-share.js  (ruta pública: /c/:id, ver rewrites en vercel.json)
// Página mínima con etiquetas Open Graph para que el link del clasificado muestre foto, título y precio
// al compartirlo en WhatsApp/redes, y que redirige a la app abierta en ese aviso (#clasificado=ID).

import { initFirebase } from './_firebase.js';
import { isValidClassifiedId } from './classified-image.js';

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

export function formatClassifiedPrice(c) {
    if (c.category === 'perdido') return 'Perdido';
    if (c.category === 'encontrado') return 'Encontrado';
    const symbol = c.currency === 'USD' ? 'U$D' : '$';
    return `${symbol} ${Number(c.price || 0).toLocaleString('es-AR')}`;
}

export function buildSharePage({ id, classified, origin }) {
    const target = `/#clasificado=${id}`;
    const title = classified
        ? `${classified.title} · ${formatClassifiedPrice(classified)}`
        : 'Clasificados · La Bajada Kite App';
    const description = classified?.description || 'Equipos de kite en venta en La Bajada, Claromecó.';
    const image = classified?.photoURL ? `${origin}/api/classified-image?id=${id}` : `${origin}/logo.png`;

    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="La Bajada Kite App">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${escapeHtml(`${origin}/c/${id}`)}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${escapeHtml(target)}">
</head>
<body>
<p><a href="${escapeHtml(target)}">Ver el aviso en La Bajada Kite App</a></p>
<script>location.replace(${JSON.stringify(target)});</script>
</body>
</html>`;
}

export default async function handler(req, res) {
    const id = String(req.query?.id || '');
    if (!isValidClassifiedId(id)) {
        res.setHeader('Location', '/');
        return res.status(302).end();
    }

    const host = req.headers?.['x-forwarded-host'] || req.headers?.host || 'www.labajadakite.app';
    const origin = `https://${host}`;

    let classified = null;
    const db = initFirebase();
    if (db) {
        try {
            const snap = await db.collection('classifieds').doc(id).get();
            if (snap.exists) classified = snap.data();
        } catch (e) {
            console.error('Error leyendo clasificado para compartir:', e);
        }
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
    return res.status(200).send(buildSharePage({ id, classified, origin }));
}
