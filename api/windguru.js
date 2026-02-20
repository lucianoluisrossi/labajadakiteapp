// Vercel Serverless Function para obtener datos de Windguru
// Este archivo debe estar en: api/windguru.js

export default async function handler(req, res) {
    // Habilitar CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Manejar preflight request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const spotId = 1312667; // Claromecó
        const url = `https://www.windguru.cz/int/iapi.php?q=forecast&id_spot=${spotId}&units_wind=kts&units_temp=c`;
        
        console.log('🌊 Fetching Windguru data for spot:', spotId);
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Windguru responded with status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Verificar si Windguru devolvió error
        if (data.return === 'error') {
            console.error('❌ Windguru error:', data.message);
            return res.status(502).json({ 
                error: 'Windguru data not available',
                message: data.message 
            });
        }
        
        console.log('✅ Windguru data fetched successfully');
        
        // Devolver datos con cache
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
        res.status(200).json(data);
        
    } catch (error) {
        console.error('❌ Error fetching Windguru:', error);
        res.status(500).json({ 
            error: 'Failed to fetch Windguru data',
            message: error.message 
        });
    }
}
