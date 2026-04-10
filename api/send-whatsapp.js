// api/send-whatsapp.js
// Envía un mensaje de recordatorio VIP a un suscriptor de WhatsApp

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { chatId, nombre } = req.body || {};
    if (!chatId) return res.status(400).json({ error: 'Falta chatId' });

    const instanceId = process.env.GREENAPI_INSTANCE_ID;
    const token      = process.env.GREENAPI_TOKEN;
    if (!instanceId || !token) return res.status(500).json({ error: 'Faltan credenciales Green API' });

    const nombre_ = nombre || 'Kitero';
    const message =
`🪁 *La Bajada Kite App*

Hola ${nombre_}! Ya estás recibiendo las alertas de viento de La Bajada.

Si querés acceder a todas las funciones de la comunidad (chat, galería, clasificados) y apoyar el desarrollo de la app, podés suscribirte como Kiter VIP 👇

🌊 labajadakite.app`;

    try {
        const r = await fetch(`https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, message })
        });
        const json = await r.json();
        if (!r.ok) return res.status(500).json({ error: json });
        return res.json({ ok: true });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
