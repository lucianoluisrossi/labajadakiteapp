// api/whatsapp-webhook.js
// Webhook de WhatsApp Cloud API (Meta) — La Bajada Kitesurf
//
// GET  /api/whatsapp-webhook  — verificación del webhook por Meta
// POST /api/whatsapp-webhook  — mensajes entrantes
//
// Flujo: cualquier mensaje suscribe al usuario.
//        "STOP" / "stop" / "salir" / "cancelar" da de baja.

import { addWhatsAppSubscriber, removeWhatsAppSubscriber } from './_firebase.js';

const WA_API_BASE = 'https://graph.facebook.com/v19.0';

async function sendWhatsAppMessage(to, text) {
    const token   = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;

    if (!token || !phoneId) {
        console.error('WHATSAPP_TOKEN o WHATSAPP_PHONE_ID no configurados');
        return false;
    }

    try {
        const response = await fetch(`${WA_API_BASE}/${phoneId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to,
                type: 'text',
                text: { body: text }
            })
        });

        if (!response.ok) {
            const err = await response.text();
            console.error('Error WhatsApp API:', err);
        }
        return response.ok;
    } catch (error) {
        console.error('Error enviando mensaje WhatsApp:', error);
        return false;
    }
}

export default async function handler(req, res) {

    // ── GET: verificación del webhook ────────────────────────────────────────
    if (req.method === 'GET') {
        const mode      = req.query['hub.mode'];
        const token     = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
            console.log('Webhook de WhatsApp verificado correctamente');
            return res.status(200).send(challenge);
        }
        return res.status(403).json({ error: 'Verificación fallida' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    // ── POST: mensaje entrante ───────────────────────────────────────────────
    try {
        const body = req.body;

        // Meta requiere 200 rápido; lo respondemos antes de procesar
        res.status(200).json({ ok: true });

        // Validar que sea evento de WhatsApp Business
        if (body.object !== 'whatsapp_business_account') return;

        const messages = body.entry?.[0]?.changes?.[0]?.value?.messages;
        if (!messages?.length) return; // puede ser status update, ignorar

        const message = messages[0];
        if (message.type !== 'text') return; // ignorar imagen, audio, etc.

        const phone = message.from; // número en formato E.164 sin + (ej: 5492983595133)
        const text  = message.text.body.trim().toLowerCase();

        const STOP_WORDS = ['stop', 'salir', 'baja', 'darme de baja', 'cancelar', 'no quiero'];
        const wantsToStop = STOP_WORDS.some(w => text === w);

        if (wantsToStop) {
            await removeWhatsAppSubscriber(phone);
            await sendWhatsAppMessage(phone,
`👋 Te diste de baja de las alertas de viento de La Bajada.

Para volver a suscribirte mandá cualquier mensaje.

🔗 labajada.vercel.app`
            );
        } else {
            const saved = await addWhatsAppSubscriber(phone);
            await sendWhatsAppMessage(phone,
`🪁 *¡Bienvenido a La Bajada — Claromecó!*

${saved ? '✅ Quedás suscripto a las alertas de viento.' : 'Ya estabas suscripto. ✅'}

*Te avisamos cuando haya:*
• Viento favorable sostenido (5+ min)
• Condiciones épicas E/ESE/SE 17-25 kts
• Viento peligroso (>30 kts)
• Offshore activo

Para darte de baja mandá: *STOP*

🔗 labajada.vercel.app`
            );
        }

    } catch (error) {
        console.error('Error en webhook WhatsApp:', error);
        // No relanzar: ya respondimos 200 a Meta
    }
}
