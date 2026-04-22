// api/admin-send-vip-email.js
// Envía email de invitación VIP a usuarios autenticados no-suscriptos
// Usa Resend (resend.com) via fetch nativo — sin SDK adicional

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = 'La Bajada App <noreply@labajadakite.app>';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    if (!RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY no configurada' });

    const { users } = req.body || {};
    if (!Array.isArray(users) || !users.length) {
        return res.status(400).json({ error: 'Se requiere array de usuarios' });
    }

    let sent = 0;
    const errors = [];

    for (const { email, name } of users) {
        if (!email) continue;
        const nombre = name || 'Kiter';
        const html = `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2937">
  <h2 style="font-size:20px;font-weight:800;margin-bottom:8px">🪁 Hola ${nombre}</h2>
  <p style="margin:0 0 16px;line-height:1.6">
    Ya usás <strong>La Bajada App</strong> para seguir el viento en Claromecó.<br>
    Con <strong>Kiter VIP ($5.000/mes)</strong> ayudás a mantener la estación meteorológica
    funcionando y accedés a las alertas automáticas por WhatsApp cuando las condiciones
    están buenas para salir al agua.
  </p>
  <a href="https://www.labajadakite.app" style="display:inline-block;background:#0ea5e9;color:#fff;font-weight:700;padding:12px 24px;border-radius:10px;text-decoration:none;font-size:14px">
    Suscribirme como Kiter VIP
  </a>
  <p style="margin-top:24px;font-size:12px;color:#6b7280">
    La Bajada · Claromecó, Buenos Aires · Para darte de baja respondé este mail con "baja".
  </p>
</div>`;

        try {
            const r = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${RESEND_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: FROM_EMAIL,
                    to: email,
                    subject: '🪁 Hacete Kiter VIP y mantené La Bajada en pie',
                    html
                })
            });
            const data = await r.json();
            if (r.ok) { sent++; }
            else { errors.push({ email, error: data.message || r.status }); }
        } catch(e) {
            errors.push({ email, error: e.message });
        }
    }

    return res.status(200).json({ ok: true, sent, errors });
}
