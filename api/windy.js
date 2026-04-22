// --- Función Serverless para Vercel ---
// Nombre de archivo: /api/windy.js
//
// Esta función actúa como un proxy seguro para la API "Point Forecast" de Windy.
// Recibe una solicitud POST desde tu index.html (con lat, lon, etc.)
// y le añade la clave API secreta antes de llamar a Windy.

// 1. La URL oficial de la API Point Forecast de Windy
const WINDY_API_URL = 'https://api.windy.com/api/point-forecast/v2';

// 2. Tu clave API de Windy (leída desde las Variables de Entorno de Vercel)
// ¡Nunca pongas la clave aquí directamente!
const WINDY_API_KEY = process.env.WINDY_API_KEY;

export default async function handler(req, res) {
    // 3. Solo aceptamos solicitudes POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido. Solo POST.' });
    }

    // 4. Verificamos que la clave esté configurada en Vercel
    if (!WINDY_API_KEY) {
        console.error("WINDY_API_KEY no está configurada en Vercel.");
        return res.status(500).json({ error: 'Autenticación de API de Windy no configurada en el servidor.' });
    }

    try {
        // 5. Tomamos los parámetros que envía el cliente (tu index.html)
        // (Ej: lat, lon, model, parameters, levels)
        const clientPayload = req.body;

        // 6. Creamos el payload final que enviaremos a Windy,
        // combinando los datos del cliente + la clave secreta del servidor.
        const finalPayload = {
            ...clientPayload,
            key: WINDY_API_KEY 
        };

        // 7. Realizamos la llamada POST a la API de Windy
        const response = await fetch(WINDY_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(finalPayload)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Windy API error:', response.status, JSON.stringify(data));
            throw new Error(JSON.stringify(data) || `HTTP ${response.status}`);
        }

        // 8. Devolvemos los datos del pronóstico (viento, etc.) a tu app
        res.status(200).json(data);

    } catch (error) {
        console.error('Error en la función Serverless (api/windy.js):', error.message);
        res.status(500).json({ error: error.message });
    }
}