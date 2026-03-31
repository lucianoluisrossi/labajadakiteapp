// api/sms-webhook.js
// Recibe respuestas SMS entrantes de Twilio (ej: "STOP" para darse de baja)
//
// POST /api/sms-webhook  — configurar en Twilio como "A message comes in"

import crypto from 'crypto';
import { removeSmsSubscriber } from './_firebase.js';

function validateTwilioSignature(req) {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) return true;

    const signature = req.headers['x-twilio-signature'];
    if (!signature) return false;

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host  = req.headers['x-forwarded-host'] || req.headers.host;
    const url   = `${proto}://${host}${req.url}`;

    const params     = req.body || {};
    const sortedKeys = Object.keys(params).sort();
    const str        = url + sortedKeys.map(k => k + params[k]).join('');

    const expected = crypto.createHmac('sha1', authToken).update(str).digest('base64');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function twiml(text) {
    const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    res.setHeader('Content-Type', 'text/xml');

    if (!validateTwilioSignature(req)) {
        return res.status(403).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }

    const from = req.body?.From || '';
    const body = (req.body?.Body || '').trim().toLowerCase();
    const phone = from.replace(/^\+/, ''); // quitar + del E.164

    const STOP_WORDS = ['stop', 'salir', 'baja', 'cancelar'];

    if (STOP_WORDS.some(w => body === w)) {
        await removeSmsSubscriber(phone);
        return res.status(200).send(twiml(
            'Listo, te diste de baja de las alertas de La Bajada. Para volver a suscribirte ingresa a labajada.vercel.app'
        ));
    }

    // Cualquier otro mensaje: recordar cómo darse de baja
    return res.status(200).send(twiml(
        'Estas suscripto a las alertas de viento de La Bajada. Para darte de baja responde: STOP'
    ));
}
