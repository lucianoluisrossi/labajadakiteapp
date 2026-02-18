// notifications-integration.js
// Integra UI de configuración de push con el PushNotificationManager
// No hay notificaciones locales - todo se maneja via push del servidor

console.log('🔔 Inicializando sistema de notificaciones...');

// Detectar iOS
const _isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

if (_isIOS) {
    console.log('📱 iOS detectado: sistema de notificaciones desactivado');
} else {

let _initRetries = 0;
const _maxRetries = 50;

function initializeNotificationsUI() {
    if (!window.pushManager) {
        _initRetries++;
        if (_initRetries > _maxRetries) {
            console.warn('⚠️ pushManager no disponible tras 5s, abortando');
            return;
        }
        setTimeout(initializeNotificationsUI, 100);
        return;
    }
    
    console.log('✅ pushManager disponible, inicializando UI...');
    
    window.pushManager.loadPreferences();

    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    const enableNotificationsBtn = document.getElementById('enable-notifications-btn');
    const testNotificationBtn = document.getElementById('test-notification-btn');
    const saveConfigBtn = document.getElementById('save-config-btn');
    const notificationsExpandBtn = document.getElementById('notifications-expand-btn');
    const notificationsContent = document.getElementById('notifications-content');
    const expandIcon = document.getElementById('expand-icon');

    const minWindSlider = document.getElementById('min-wind-slider');
    const minWindValue = document.getElementById('min-wind-value');
    const maxWindSlider = document.getElementById('max-wind-slider');
    const maxWindValue = document.getElementById('max-wind-value');

    function updateNotificationsUI() {
        const status = window.pushManager.getStatus();
        
        if (status.enabled && status.pushSubscribed) {
            statusIndicator.classList.remove('bg-gray-400', 'bg-yellow-400');
            statusIndicator.classList.add('bg-green-500');
            statusText.textContent = 'Push activadas ✓ (alertas con la app cerrada)';
            statusText.classList.remove('text-gray-600');
            statusText.classList.add('text-green-700', 'font-semibold');
            
            enableNotificationsBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg><span>Notificaciones Activadas</span>';
            enableNotificationsBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
            enableNotificationsBtn.classList.add('bg-green-600', 'hover:bg-green-700', 'cursor-default');
            enableNotificationsBtn.disabled = true;
            
        } else if (status.enabled && !status.pushSubscribed) {
            // Permiso dado pero no suscripto a push - reintentamos
            statusIndicator.classList.remove('bg-green-500', 'bg-gray-400');
            statusIndicator.classList.add('bg-yellow-400');
            statusText.textContent = 'Permiso OK pero falta suscripción push';
            statusText.classList.remove('text-green-700', 'font-semibold');
            statusText.classList.add('text-gray-600');
            
            enableNotificationsBtn.disabled = false;
            enableNotificationsBtn.innerHTML = '<span>Reintentar Suscripción</span>';
            
        } else if (!status.supported) {
            statusIndicator.classList.remove('bg-green-500', 'bg-yellow-400');
            statusIndicator.classList.add('bg-gray-400');
            statusText.textContent = 'No soportadas en este navegador';
            enableNotificationsBtn.disabled = true;
            enableNotificationsBtn.classList.add('opacity-50', 'cursor-not-allowed');
            
        } else if (status.permission === 'denied') {
            statusIndicator.classList.remove('bg-green-500', 'bg-gray-400');
            statusIndicator.classList.add('bg-yellow-400');
            statusText.textContent = 'Permisos denegados — revisa config del navegador';
            
        } else {
            statusIndicator.classList.remove('bg-green-500', 'bg-yellow-400');
            statusIndicator.classList.add('bg-gray-400');
            statusText.textContent = 'Notificaciones desactivadas';
            statusText.classList.remove('text-green-700', 'font-semibold');
            statusText.classList.add('text-gray-600');
            
            enableNotificationsBtn.disabled = false;
            enableNotificationsBtn.classList.remove('opacity-50', 'cursor-not-allowed', 'cursor-default', 'bg-green-600', 'hover:bg-green-700');
            enableNotificationsBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
        }
    }

    // --- EVENT LISTENERS ---

    if (notificationsExpandBtn && notificationsContent) {
        notificationsExpandBtn.addEventListener('click', () => {
            notificationsContent.classList.toggle('hidden');
            if (expandIcon) expandIcon.classList.toggle('rotate-180');
        });
    }

    if (enableNotificationsBtn) {
        enableNotificationsBtn.addEventListener('click', async () => {
            enableNotificationsBtn.disabled = true;
            enableNotificationsBtn.innerHTML = '<span>Activando...</span>';
            
            const granted = await window.pushManager.requestPermission();
            if (granted) {
                updateNotificationsUI();
                window.pushManager.savePreferences();
            } else {
                alert('No se pudo activar las notificaciones. Verifica los permisos del navegador.');
                enableNotificationsBtn.disabled = false;
                enableNotificationsBtn.innerHTML = '<span>Activar Notificaciones</span>';
            }
        });
    }

    if (testNotificationBtn) {
        testNotificationBtn.addEventListener('click', () => {
            if (window.pushManager.permission !== 'granted') {
                alert('Primero debes activar las notificaciones');
                return;
            }
            window.pushManager.sendNotification({
                title: '🪁 Notificación de Prueba',
                body: 'Todo funciona correctamente. Te avisaremos cuando haya viento!',
                tag: 'test-notification',
            });
        });
    }

    if (minWindSlider && minWindValue) {
        minWindSlider.addEventListener('input', (e) => {
            minWindValue.textContent = e.target.value;
        });
        minWindSlider.addEventListener('change', (e) => {
            window.pushManager.setConfig({ minNavigableWind: parseInt(e.target.value) });
            window.pushManager.savePreferences();
        });
    }

    if (maxWindSlider && maxWindValue) {
        maxWindSlider.addEventListener('input', (e) => {
            maxWindValue.textContent = e.target.value;
        });
        maxWindSlider.addEventListener('change', (e) => {
            window.pushManager.setConfig({ maxGoodWind: parseInt(e.target.value) });
            window.pushManager.savePreferences();
        });
    }

    if (saveConfigBtn) {
        saveConfigBtn.addEventListener('click', () => {
            const newConfig = {
                minNavigableWind: parseInt(minWindSlider.value),
                maxGoodWind: parseInt(maxWindSlider.value)
            };
            
            window.pushManager.setConfig(newConfig);
            window.pushManager.savePreferences();
            
            saveConfigBtn.textContent = '✓ Guardado';
            saveConfigBtn.classList.add('bg-green-500', 'text-white');
            
            setTimeout(() => {
                saveConfigBtn.textContent = 'Guardar Configuración';
                saveConfigBtn.classList.remove('bg-green-500', 'text-white');
            }, 2000);
        });
    }

    // Cargar config en sliders
    const config = window.pushManager.config;
    if (minWindSlider) minWindSlider.value = config.minNavigableWind || 15;
    if (minWindValue) minWindValue.textContent = config.minNavigableWind || 15;
    if (maxWindSlider) maxWindSlider.value = config.maxGoodWind || 27;
    if (maxWindValue) maxWindValue.textContent = config.maxGoodWind || 27;

    updateNotificationsUI();
    setTimeout(() => updateNotificationsUI(), 2000);

    console.log('✅ Sistema de notificaciones inicializado');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeNotificationsUI);
} else {
    initializeNotificationsUI();
}

} // Cierre del else de !_isIOS
