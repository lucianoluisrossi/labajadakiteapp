// Módulo compartido de emails (Resend): remitente, link de baja firmado y plantilla de la campaña v2.

import crypto from 'node:crypto';

export const SITE_URL = 'https://www.labajadakite.app';
export const FROM_EMAIL = 'La Bajada App <noreply@labajadakite.app>';
export const UNSUBSCRIBES = 'email_unsubscribes';

// Firma del link de baja: evita que alguien dé de baja emails ajenos
const secret = () => process.env.EMAIL_UNSUB_SECRET || process.env.RESEND_API_KEY || '';
const normalize = (email) => String(email || '').trim().toLowerCase();

export const emailDocId = (email) => normalize(email).replace(/[.#$[\]@/]/g, '_');

export function unsubscribeToken(email) {
    return crypto.createHmac('sha256', secret()).update(normalize(email)).digest('hex').slice(0, 32);
}

export function isValidUnsubscribe(email, token) {
    const expected = unsubscribeToken(email);
    return typeof token === 'string' && token.length === expected.length
        && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export function unsubscribeUrl(email) {
    return `${SITE_URL}/api/email-unsubscribe?e=${encodeURIComponent(normalize(email))}&t=${unsubscribeToken(email)}`;
}

// Headers para que Gmail/Outlook muestren "Desuscribirse" (one-click, RFC 8058)
export const unsubscribeHeaders = (email) => ({
    'List-Unsubscribe': `<${unsubscribeUrl(email)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
});

export async function loadUnsubscribed(db) {
    const snap = await db.collection(UNSUBSCRIBES).get();
    return new Set(snap.docs.map(d => normalize(d.data().email)).filter(Boolean));
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

export const LAUNCH_SUBJECT = '🪁 La Bajada App se renovó (y tiene Vista 3D del spot)';

export function launchEmailHtml({ name, email }) {
    const nombre = escapeHtml(name || 'Kiter');
    const item = (icon, title, text) => `
      <tr><td style="padding:8px 0;vertical-align:top;font-size:22px;width:36px">${icon}</td>
      <td style="padding:8px 0;line-height:1.5;color:#374151"><strong style="color:#111827">${title}</strong> ${text}</td></tr>`;
    return `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
  <div style="background:linear-gradient(90deg,#0ea5e9,#22d3ee);background-color:#0ea5e9;border-radius:16px 16px 0 0;padding:28px 24px;text-align:center;color:#fff">
    <div style="font-size:44px;line-height:1">🪁</div>
    <h1 style="margin:10px 0 4px;font-size:24px;font-weight:800">¡Nos renovamos!</h1>
    <p style="margin:0;font-size:15px;opacity:.9">Nueva versión de La Bajada App</p>
  </div>
  <div style="padding:24px;background:#ffffff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 16px 16px">
    <p style="margin:0 0 12px;line-height:1.6">Hola ${nombre}, rediseñamos la app para que en un vistazo sepas si hay viento en La Bajada:</p>
    <table style="border-collapse:collapse;width:100%">
      ${item('🌬️', 'Todo el viento en una pantalla.', 'Cámara, estado del spot y viento, sin scrollear.')}
      ${item('🌐', 'Nueva Vista 3D del spot.', 'Mirá de dónde entra el viento, la bandera flameando y los kites en el agua.')}
      ${item('👇', 'Pestañas abajo:', 'Pronóstico, Comunidad, Clasificados y Más, todo a un toque.')}
      ${item('🏷️', 'Clasificados renovados:', 'compartí tu aviso con un link y vendé más rápido.')}
    </table>
    <div style="text-align:center;margin:24px 0 8px">
      <a href="${SITE_URL}" style="display:inline-block;background:#0ea5e9;color:#fff;font-weight:700;padding:14px 28px;border-radius:12px;text-decoration:none;font-size:15px">Abrir la app</a>
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;text-align:center">
      La Bajada · Claromecó, Buenos Aires ·
      <a href="${unsubscribeUrl(email)}" style="color:#9ca3af">Darme de baja</a>
    </p>
  </div>
</div>`;
}
