// ux-improvements.js
// Mejoras UX/UI para La Bajada Kite App

// ====================================
// 1. BARRA DE INTENSIDAD DE VIENTO
// ====================================

let lastWindSpeed = null; // Para calcular tendencia

function updateWindIntensity(speed) {
    const intensityBar = document.getElementById('wind-intensity-bar');
    const percentageSpan = document.getElementById('wind-percentage');
    const intensityContainer = document.getElementById('wind-intensity-container');
    
    if (!intensityBar || !percentageSpan || !intensityContainer) return;
    
    if (speed === null || isNaN(speed)) {
        intensityContainer.style.opacity = '0.3';
        intensityBar.style.width = '0%';
        percentageSpan.textContent = '--%';
        return;
    }
    
    intensityContainer.style.opacity = '1';
    
    // Calcular porcentaje (0-30 kts como rango)
    const maxWind = 30;
    const percentage = Math.min(Math.round((speed / maxWind) * 100), 100);
    
    // Animar barra
    intensityBar.style.width = `${percentage}%`;
    percentageSpan.textContent = `${percentage}%`;
}

// ====================================
// 2. INDICADOR DE TENDENCIA
// ====================================

function updateWindTrend(currentSpeed) {
    const trendEl = document.getElementById('wind-trend');
    if (!trendEl) return;
    
    if (currentSpeed === null || isNaN(currentSpeed)) {
        trendEl.textContent = '→';
        trendEl.title = 'Sin datos';
        return;
    }
    
    if (lastWindSpeed === null) {
        trendEl.textContent = '→';
        trendEl.title = 'Calculando tendencia...';
        lastWindSpeed = currentSpeed;
        return;
    }
    
    const diff = currentSpeed - lastWindSpeed;
    
    if (diff > 2) {
        trendEl.textContent = '↗';
        trendEl.title = `Subiendo (+${diff.toFixed(1)} kts)`;
        trendEl.classList.add('text-green-600');
        trendEl.classList.remove('text-gray-500', 'text-red-600');
    } else if (diff < -2) {
        trendEl.textContent = '↘';
        trendEl.title = `Bajando (${diff.toFixed(1)} kts)`;
        trendEl.classList.add('text-red-600');
        trendEl.classList.remove('text-gray-500', 'text-green-600');
    } else {
        trendEl.textContent = '→';
        trendEl.title = 'Estable';
        trendEl.classList.add('text-gray-500');
        trendEl.classList.remove('text-green-600', 'text-red-600');
    }
    
    lastWindSpeed = currentSpeed;
}

// ====================================
// 3. ALERTA DE RACHAS FUERTES
// ====================================

function updateGustAlert(speed, gust) {
    const gustContainer = document.getElementById('gust-info-container');
    const gustLabel = document.getElementById('gust-label');
    
    if (!gustContainer || !gustLabel || speed === null || gust === null) return;
    
    const gustDiff = ((gust - speed) / speed) * 100;
    
    if (gustDiff > 30) {
        // Rachas significativas - alertar
        gustContainer.classList.remove('bg-white/30', 'border-gray-200/50');
        gustContainer.classList.add('bg-orange-100', 'border-orange-300');
        gustLabel.textContent = '⚠️ RACHAS:';
        gustLabel.classList.add('text-orange-700');
    } else {
        // Rachas normales
        gustContainer.classList.remove('bg-orange-100', 'border-orange-300');
        gustContainer.classList.add('bg-white/30', 'border-gray-200/50');
        gustLabel.textContent = 'Racha:';
        gustLabel.classList.remove('text-orange-700');
    }
}

// ====================================
// 4. BADGE DE NOTIFICACIONES
// ====================================

function updateNotificationBadge() {
    const badge = document.getElementById('notification-badge');
    if (!badge) return;
    
    // Verificar si las notificaciones están activadas
    if ('Notification' in window) {
        if (Notification.permission === 'granted') {
            // Notificaciones activas - ocultar badge
            badge.classList.add('hidden');
        } else {
            // Notificaciones no activas - mostrar badge
            badge.classList.remove('hidden');
        }
    }
}

// Click en badge: scroll al panel de notificaciones
document.addEventListener('DOMContentLoaded', () => {
    const badge = document.getElementById('notification-badge');
    if (badge) {
        badge.addEventListener('click', () => {
            const notificationsCard = document.getElementById('notifications-card');
            if (notificationsCard) {
                notificationsCard.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center' 
                });
                
                // Highlight del panel
                notificationsCard.classList.add('ring-4', 'ring-blue-400', 'ring-opacity-50');
                setTimeout(() => {
                    notificationsCard.classList.remove('ring-4', 'ring-blue-400', 'ring-opacity-50');
                }, 2000);
            }
        });
    }
    
    // Verificar badge al cargar
    updateNotificationBadge();
    
    // Actualizar badge si cambian los permisos
    if ('Notification' in window) {
        // Revisar cada 5 segundos
        setInterval(updateNotificationBadge, 5000);
    }
});

// ====================================
// 5. TIMESTAMP ÚLTIMA ACTUALIZACIÓN
// ====================================

let lastUpdateTimestamp = null;

function updateTimestamp(updateTime) {
    lastUpdateTimestamp = updateTime;
    updateTimeDisplay();
}

function updateTimeDisplay() {
    const timeSpan = document.getElementById('time-since-update');
    if (!timeSpan || !lastUpdateTimestamp) return;
    
    const now = Date.now();
    const diff = now - lastUpdateTimestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (seconds < 60) {
        timeSpan.textContent = `${seconds}s`;
    } else if (minutes < 60) {
        timeSpan.textContent = `${minutes}m`;
    } else {
        timeSpan.textContent = `${hours}h ${minutes % 60}m`;
    }
    
    // Color según antigüedad
    if (minutes > 10) {
        timeSpan.classList.add('text-red-600', 'font-bold');
    } else if (minutes > 5) {
        timeSpan.classList.remove('text-red-600');
        timeSpan.classList.add('text-orange-600', 'font-bold');
    } else {
        timeSpan.classList.remove('text-red-600', 'text-orange-600', 'font-bold');
    }
}

// Actualizar cada 10 segundos
setInterval(updateTimeDisplay, 10000);

// ====================================
// 6. FUNCIÓN PRINCIPAL DE ACTUALIZACIÓN
// ====================================

function updateUXImprovements(windSpeed, windGust, updateTime) {
    // 1. Barra de intensidad
    updateWindIntensity(windSpeed);
    
    // 2. Tendencia - DESHABILITADA
    // updateWindTrend(windSpeed);
    
    // 3. Alerta de rachas
    updateGustAlert(windSpeed, windGust);
    
    // 4. Timestamp
    if (updateTime) {
        updateTimestamp(updateTime);
    }
}

// Exportar función global
window.updateUXImprovements = updateUXImprovements;

console.log('✨ UX Improvements cargadas');
