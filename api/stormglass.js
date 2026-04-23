// api/stormglass.js
// Proxy para Stormglass Point Forecast API — retorna pronóstico de viento 5 días
// Coordenadas: La Bajada, Claromecó (-38.861195, -60.079119)
// Fuente: icon (DWD ~13km, mejor para costa argentina)

const STORMGLASS_API_KEY = process.env.STORMGLASS_API_KEY;
const LAT = -38.861195;
const LNG = -60.079119;
const M_S_TO_KNOTS = 1.94384;

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();
    if (!STORMGLASS_API_KEY) return res.status(500).json({ error: 'STORMGLASS_API_KEY no configurada' });

    const now = Math.floor(Date.now() / 1000);
    const end = now + 5 * 24 * 3600;

    const url = `https://api.stormglass.io/v2/weather/point?lat=${LAT}&lng=${LNG}&params=windSpeed,windDirection,gust&source=icon&start=${now}&end=${end}`;

    try {
        const r = await fetch(url, { headers: { 'Authorization': STORMGLASS_API_KEY } });
        const data = await r.json();
        if (!r.ok) return res.status(r.status).json({ error: data.errors?.key || r.status });

        // Filtrar horas relevantes (cada 3h) y convertir a nudos
        const hours = (data.hours || [])
            .filter((_, i) => i % 3 === 0)
            .map(h => ({
                time: h.time,
                windKt: Math.round((h.windSpeed?.icon ?? 0) * M_S_TO_KNOTS),
                gustKt: Math.round((h.gust?.icon ?? 0) * M_S_TO_KNOTS),
                dir: Math.round(h.windDirection?.icon ?? 0)
            }));

        return res.status(200).json({ ok: true, hours });
    } catch(e) {
        return res.status(500).json({ error: e.message });
    }
}
