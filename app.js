// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInAnonymously, signInWithPopup, signOut, onAuthStateChanged, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, limit, serverTimestamp, doc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ⭐ SISTEMA DE NOTIFICACIONES PUSH
import { PushNotificationManager } from './notifications.js';
import './notifications-integration.js';

// ⭐ MEJORAS UX/UI
import './ux-improvements.js';

// ⭐ DETECCIÓN iOS
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// ========================================
// SOLUCIÓN DEFINITIVA: Service Worker SOLO en Android/Desktop
// ========================================
// iOS Safari tiene problemas con SW interceptando fetch
// Solución: SW activo en Android/Desktop, desactivado en iOS
if (!isIOS && 'serviceWorker' in navigator) {
    // Registrar SW solo en Android/Desktop (NO en iOS)
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('✅ Service Worker registrado (Android/Desktop):', registration.scope);
            })
            .catch(error => {
                console.error('❌ Error registrando Service Worker:', error);
            });
    });
} else if (isIOS && 'serviceWorker' in navigator) {
    // En iOS: desregistrar cualquier SW que pueda estar activo
    navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(reg => {
            reg.unregister();
        });
    });
    console.log('📱 iOS: Service Worker desactivado (no compatible)');
}

const firebaseConfig = {
  apiKey: "AIzaSyDitwwF3Z5F9KCm9mP0LsXWDuflGtXCFcw",
  authDomain: "labajadakite.firebaseapp.com",
  projectId: "labajadakite",
  storageBucket: "labajadakite.firebasestorage.app", 
  messagingSenderId: "982938582037",
  appId: "1:982938582037:web:7141082f9ca601e9aa221c",
  measurementId: "G-R926P5WBWW"
};

// Variables globales
let db;
let auth; 
let messagesCollection;
let galleryCollection;
let classifiedsCollection;
let currentUser = null;
let pushManager;
const googleProvider = new GoogleAuthProvider();

try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    
    messagesCollection = collection(db, "kiter_board");
    galleryCollection = collection(db, "daily_gallery_meta");
    classifiedsCollection = collection(db, "classifieds");

    // Inicializar pushManager (desactivado en iOS)
    if (!isIOS) {
        pushManager = new PushNotificationManager(app);
        window.pushManager = pushManager;
        console.log("✅ PushManager inicializado (Android/Desktop)");
    } else {
        window.pushManager = null;
        console.log("📱 PushManager no inicializado (iOS)");
        // Ocultar UI de notificaciones en iOS
        const notifCard = document.getElementById('notifications-card');
        const notifBtn = document.getElementById('notifications-settings-btn');
        const welcomeModal = document.getElementById('welcome-clasificados-modal');
        if (notifCard) notifCard.style.display = 'none';
        if (notifBtn) notifBtn.style.display = 'none';
        if (welcomeModal) welcomeModal.style.display = 'none';
    }

    console.log("✅ Firebase inicializado.");

    // --- FUNCIONES DE LOGIN/LOGOUT ---
    async function loginWithGoogle() {
        try {
            const result = await signInWithPopup(auth, googleProvider);
            console.log("✅ Login exitoso:", result.user.displayName);
        } catch (error) {
            console.error("❌ Error en login:", error);
            if (error.code === 'auth/popup-blocked') {
                alert('El navegador bloqueó la ventana emergente. Por favor, permite las ventanas emergentes para esta página.');
            } else if (error.code === 'auth/cancelled-popup-request') {
                // Usuario cerró el popup, no hacer nada
            } else {
                alert('Error al iniciar sesión: ' + error.message);
            }
        }
    }

    async function logout() {
        try {
            await signOut(auth);
            console.log("✅ Sesión cerrada");
        } catch (error) {
            console.error("❌ Error al cerrar sesión:", error);
        }
    }

    // Exponer funciones globalmente para uso en eventos
    window.loginWithGoogle = loginWithGoogle;
    window.logout = logout;
    window.auth = auth;
    window.onAuthStateChanged = onAuthStateChanged;

    document.addEventListener('DOMContentLoaded', () => {
    
    // --- FUNCIÓN PARA ACTUALIZAR UI DE AUTH ---
    function updateAuthUI(user) {
        const authLogin = document.getElementById('auth-login');
        const authUser = document.getElementById('auth-user');
        const userPhoto = document.getElementById('user-photo');
        const userName = document.getElementById('user-name');
        const messageForm = document.getElementById('kiter-board-form');
        const loginPromptMessages = document.getElementById('login-prompt-messages');
        const galleryUploadContainer = document.getElementById('gallery-upload-container');
        const loginPromptGallery = document.getElementById('login-prompt-gallery');
        const classifiedsPublishContainer = document.getElementById('classifieds-publish-container');
        const loginPromptClassifieds = document.getElementById('login-prompt-classifieds');
        
        // Elementos de notificaciones
        const notifLoginRequired = document.getElementById('notif-login-required');
        const notifSettingsLogged = document.getElementById('notif-settings-logged');

        if (user) {
            // Usuario logueado
            if (authLogin) authLogin.classList.add('hidden');
            if (authUser) authUser.classList.remove('hidden');
            if (userPhoto) userPhoto.src = user.photoURL || 'https://via.placeholder.com/40';
            if (userName) userName.textContent = user.displayName || 'Kiter';
            if (messageForm) messageForm.classList.remove('hidden');
            if (loginPromptMessages) loginPromptMessages.classList.add('hidden');
            if (galleryUploadContainer) galleryUploadContainer.classList.remove('hidden');
            if (loginPromptGallery) loginPromptGallery.classList.add('hidden');
            if (classifiedsPublishContainer) classifiedsPublishContainer.classList.remove('hidden');
            if (loginPromptClassifieds) loginPromptClassifieds.classList.add('hidden');
            
            // Notificaciones: Mostrar configuración
            if (notifLoginRequired) notifLoginRequired.classList.add('hidden');
            if (notifSettingsLogged) notifSettingsLogged.classList.remove('hidden');
            
            console.log("✅ Usuario logueado:", user.displayName);
        } else {
            // Usuario no logueado
            if (authLogin) authLogin.classList.remove('hidden');
            if (authUser) authUser.classList.add('hidden');
            if (messageForm) messageForm.classList.add('hidden');
            if (loginPromptMessages) loginPromptMessages.classList.remove('hidden');
            if (galleryUploadContainer) galleryUploadContainer.classList.add('hidden');
            if (loginPromptGallery) loginPromptGallery.classList.remove('hidden');
            if (classifiedsPublishContainer) classifiedsPublishContainer.classList.add('hidden');
            if (loginPromptClassifieds) loginPromptClassifieds.classList.remove('hidden');
            
            // Notificaciones: Mostrar login requerido
            if (notifLoginRequired) notifLoginRequired.classList.remove('hidden');
            if (notifSettingsLogged) notifSettingsLogged.classList.add('hidden');
            
            console.log("ℹ️ Usuario no logueado");
        }
    }

    // --- LISTENER DE ESTADO DE AUTENTICACIÓN (dentro de DOMContentLoaded) ---
    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        updateAuthUI(user);
    });
    console.log("🚀 App iniciada.");

    // --- ELEMENTOS DE NAVEGACIÓN ---
    const viewDashboard = document.getElementById('view-dashboard');
    const viewCommunity = document.getElementById('view-community');
    const viewClassifieds = document.getElementById('view-classifieds');
    const backToHomeBtn = document.getElementById('back-to-home');
    const backToHomeClassifieds = document.getElementById('back-to-home-classifieds');
    const fabContainer = document.getElementById('fab-container');
    const fabCommunity = document.getElementById('fab-community');
    const fabClasificados = document.getElementById('fab-clasificados');
    const fabBackWeather = document.getElementById('fab-back-weather');
    const newMessageToast = document.getElementById('new-message-toast');
    const newPhotoToast = document.getElementById('new-photo-toast');
    const newClassifiedToast = document.getElementById('new-classified-toast');
    const clasificadosBadge = document.getElementById('clasificados-badge');
    const clasificadosMenuBadge = document.getElementById('clasificados-menu-badge');

    // --- LÓGICA DE INSTALACIÓN PWA ---
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevenir que Chrome 76+ muestre el prompt automáticamente
        e.preventDefault();
        // Guardar el evento para dispararlo más tarde
        deferredPrompt = e;
        
        // Opcional: Mostrar un botón o mensaje propio de "Instalar App"
        console.log("PWA lista para ser instalada");
        
        // Intentar disparar el prompt automáticamente después de 3 segundos de navegación
        setTimeout(() => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === 'accepted') {
                        console.log('Usuario aceptó la instalación');
                    }
                    deferredPrompt = null;
                });
            }
        }, 3000);
    });

    window.addEventListener('appinstalled', (e) => {
        console.log('PWA instalada correctamente');
    });

    function switchView(viewName) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Ocultar todas las vistas
        if(viewDashboard) viewDashboard.classList.add('hidden');
        if(viewCommunity) viewCommunity.classList.add('hidden');
        if(viewClassifieds) viewClassifieds.classList.add('hidden');
        
        if (viewName === 'dashboard') {
            if(viewDashboard) viewDashboard.classList.remove('hidden');
            // Mostrar FABs de comunidad y clasificados, ocultar boton volver
            if(fabContainer) fabContainer.classList.remove('hidden');
            if(fabBackWeather) fabBackWeather.classList.add('hidden');
        } else if (viewName === 'community') {
            if(viewCommunity) viewCommunity.classList.remove('hidden');
            // Ocultar FABs, mostrar boton volver verde
            if(fabContainer) fabContainer.classList.add('hidden');
            if(fabBackWeather) fabBackWeather.classList.remove('hidden');
            markMessagesAsRead();
        } else if (viewName === 'classifieds') {
            if(viewClassifieds) viewClassifieds.classList.remove('hidden');
            // Ocultar FABs, mostrar boton volver verde
            if(fabContainer) fabContainer.classList.add('hidden');
            if(fabBackWeather) fabBackWeather.classList.remove('hidden');
            markClassifiedsAsRead();
        }
    }
    
    // Marcar clasificados como leidos
    function markClassifiedsAsRead() {
        const now = Date.now();
        localStorage.setItem('lastClassifiedReadTime', now);
        if (clasificadosBadge) clasificadosBadge.classList.add('hidden');
        if (clasificadosMenuBadge) clasificadosMenuBadge.classList.add('hidden');
        if (newClassifiedToast) newClassifiedToast.classList.add('hidden');
    }

    // --- LISTENERS DE NAVEGACIÓN ---

    if (backToHomeBtn) backToHomeBtn.addEventListener('click', () => switchView('dashboard'));
    if (backToHomeClassifieds) backToHomeClassifieds.addEventListener('click', () => switchView('dashboard'));
    if (fabCommunity) fabCommunity.addEventListener('click', () => switchView('community'));
    if (fabClasificados) fabClasificados.addEventListener('click', () => switchView('classifieds'));
    if (fabBackWeather) fabBackWeather.addEventListener('click', () => switchView('dashboard'));
    if (newMessageToast) newMessageToast.addEventListener('click', () => switchView('community'));
    if (newClassifiedToast) newClassifiedToast.addEventListener('click', () => switchView('classifieds'));
    if (newPhotoToast) {
        newPhotoToast.addEventListener('click', () => {
            switchView('community');
            // Abrir la galería automáticamente
            const gallerySection = document.getElementById('gallery-section');
            if (gallerySection) gallerySection.setAttribute('open', '');
            markPhotosAsRead();
        });
    }
    
    // Marcar fotos como leídas cuando se abre la galería
    const gallerySection = document.getElementById('gallery-section');
    if (gallerySection) {
        gallerySection.addEventListener('toggle', () => {
            if (gallerySection.hasAttribute('open')) {
                markPhotosAsRead();
            }
        });
    }

    // --- COMPRESIÓN ---
    async function compressImageToBase64(file) {
        return new Promise((resolve, reject) => {
            const MAX_WIDTH = 600; 
            const QUALITY = 0.6;   
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    let width = img.width;
                    let height = img.height;
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
                    resolve(dataUrl);
                };
                img.onerror = (err) => reject(err);
            };
            reader.onerror = (err) => reject(err);
        });
    }

    // --- GALERÍA ---
    const galleryUploadInput = document.getElementById('gallery-upload-input');
    const galleryGrid = document.getElementById('gallery-grid');
    const imageModal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-img');

    const handleGalleryUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Verificar que el usuario esté logueado
        if (!currentUser) {
            alert('Debes iniciar sesion para subir fotos');
            e.target.value = '';
            return;
        }
        
        if (!file.type.startsWith('image/')) { alert("Solo imágenes."); return; }

        const inputElement = e.target;
        const labelElement = inputElement.parentElement;
        const spans = labelElement.querySelectorAll('span');
        const originalTexts = []; 
        spans.forEach(s => originalTexts.push(s.textContent));

        spans.forEach(s => s.textContent = "Subiendo...");
        labelElement.classList.add('opacity-50', 'cursor-wait');
        inputElement.disabled = true; 
        
        try {
            const base64String = await compressImageToBase64(file);
            await addDoc(galleryCollection, {
                url: base64String,
                timestamp: serverTimestamp(),
                userId: currentUser.uid,
                userName: currentUser.displayName || 'Kiter'
            });
        } catch (error) {
            console.error("Error subiendo:", error);
            alert("No se pudo subir.");
        } finally {
            spans.forEach((s, index) => s.textContent = originalTexts[index]);
            labelElement.classList.remove('opacity-50', 'cursor-wait');
            inputElement.disabled = false;
            inputElement.value = ''; 
        }
    };

    if (galleryUploadInput && db) {
        galleryUploadInput.addEventListener('change', handleGalleryUpload);
    }

    if (galleryGrid && db) {
        const q = query(galleryCollection, orderBy("timestamp", "desc"), limit(20));
        onSnapshot(q, (snapshot) => {
            galleryGrid.innerHTML = ''; 
            const now = Date.now();
            const oneDay = 24 * 60 * 60 * 1000;
            let hasImages = false;
            const lastPhotoReadTime = parseInt(localStorage.getItem('lastPhotoReadTime') || '0');
            let newestPhotoTime = 0;

            snapshot.forEach((doc) => {
                const data = doc.data();
                if (data.timestamp && data.url) {
                    const imgDate = data.timestamp.toDate();
                    const imgTime = imgDate.getTime();
                    if (imgTime > newestPhotoTime) newestPhotoTime = imgTime;

                    if (now - imgTime < oneDay) {
                        hasImages = true;
                        const imgContainer = document.createElement('div');
                        imgContainer.className = "relative aspect-square cursor-pointer overflow-hidden rounded-lg shadow-md bg-gray-100 hover:opacity-90 transition-opacity";
                        imgContainer.innerHTML = `<img src="${data.url}" class="w-full h-full object-cover" loading="lazy" alt="Foto"><div class="absolute bottom-0 right-0 bg-black bg-opacity-50 text-white text-[10px] px-2 py-1 rounded-tl-lg">${timeAgo(imgDate)}</div>`;
                        imgContainer.addEventListener('click', () => {
                            modalImg.src = data.url;
                            imageModal.classList.remove('hidden');
                        });
                        galleryGrid.appendChild(imgContainer);
                    }
                }
            });
            if (!hasImages) galleryGrid.innerHTML = '<div class="col-span-full text-center text-gray-400 py-4 text-sm">Sin fotos hoy.</div>';
            
            // Notificación de nueva foto
            if (hasImages && newestPhotoTime > lastPhotoReadTime && lastPhotoReadTime > 0) {
                // Solo mostrar si NO estamos viendo la galería abierta
                const gallerySection = document.getElementById('gallery-section');
                const isGalleryOpen = gallerySection && gallerySection.hasAttribute('open');
                if (!isGalleryOpen) {
                    if (newPhotoToast) newPhotoToast.classList.remove('hidden');
                } else {
                    markPhotosAsRead();
                }
            } else if (lastPhotoReadTime === 0 && newestPhotoTime > 0) {
                // Primera vez que carga, inicializar el tiempo
                localStorage.setItem('lastPhotoReadTime', now);
            }
        });
    }

    // --- PIZARRA ---
    const messageForm = document.getElementById('kiter-board-form');
    const messagesContainer = document.getElementById('messages-container');
    const textInput = document.getElementById('message-text');

    // --- BOTONES DE LOGIN/LOGOUT ---
    const btnGoogleLogin = document.getElementById('btn-google-login');
    const btnLogout = document.getElementById('btn-logout');
    const btnGoogleLoginClassifieds = document.getElementById('btn-google-login-classifieds');
    const btnLoginForNotifications = document.getElementById('login-for-notifications');
    
    if (btnGoogleLogin) {
        btnGoogleLogin.addEventListener('click', () => {
            window.loginWithGoogle();
        });
    }
    
    if (btnGoogleLoginClassifieds) {
        btnGoogleLoginClassifieds.addEventListener('click', () => {
            window.loginWithGoogle();
        });
    }
    
    if (btnLoginForNotifications) {
        btnLoginForNotifications.addEventListener('click', () => {
            console.log('👆 Click login notificaciones');
            window.loginWithGoogle();
        });
    }
    
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            window.logout();
        });
    }

    function timeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        let interval = seconds / 3600;
        if (interval > 1) return "hace " + Math.floor(interval) + "h";
        interval = seconds / 60;
        if (interval > 1) return "hace " + Math.floor(interval) + "m";
        return "hace un momento";
    }

    function markMessagesAsRead() {
        const now = Date.now();
        localStorage.setItem('lastReadTime', now);
        const badge = document.getElementById('notification-badge');
        if (badge) badge.classList.add('hidden');
        if (newMessageToast) newMessageToast.classList.add('hidden');
    }

    function markPhotosAsRead() {
        const now = Date.now();
        localStorage.setItem('lastPhotoReadTime', now);
        if (newPhotoToast) newPhotoToast.classList.add('hidden');
    }

    if (messageForm && db) {
        messageForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Verificar que el usuario esté logueado
            if (!currentUser) {
                alert('Debes iniciar sesion para enviar mensajes');
                return;
            }
            
            const author = currentUser.displayName || 'Kiter';
            const text = textInput.value.trim();
            
            if (text) {
                const btn = messageForm.querySelector('button');
                const originalText = btn.innerText;
                btn.innerText = '...';
                btn.disabled = true;
                try {
                    await addDoc(messagesCollection, { 
                        author: author, 
                        text: text, 
                        timestamp: serverTimestamp(),
                        userId: currentUser.uid,
                        userPhoto: currentUser.photoURL || null
                    });
                    textInput.value = ''; 
                    markMessagesAsRead();
                } catch (e) { 
                    console.error(e);
                    alert("Error: " + e.message);
                } finally {
                    btn.innerText = originalText;
                    btn.disabled = false;
                }
            }
        });
    }

    if (messagesContainer && db) {
        const q = query(messagesCollection, orderBy("timestamp", "desc"), limit(50));
        onSnapshot(q, (snapshot) => {
            messagesContainer.innerHTML = ''; 
            const now = Date.now();
            const oneDay = 24 * 60 * 60 * 1000;
            let hasMessages = false;
            const lastReadTime = parseInt(localStorage.getItem('lastReadTime') || '0');
            let newestMessageTime = 0;

            snapshot.forEach((doc) => {
                const data = doc.data();
                if (data.timestamp) {
                    const msgDate = data.timestamp.toDate();
                    const msgTime = msgDate.getTime();
                    if (msgTime > newestMessageTime) newestMessageTime = msgTime;

                    if (now - msgTime < oneDay) {
                        hasMessages = true;
                        const div = document.createElement('div');
                        div.className = "bg-gray-50 p-3 rounded border border-gray-100 text-sm mb-2";
                        div.innerHTML = `<div class="flex justify-between items-baseline mb-1"><span class="font-bold text-blue-900">${data.author}</span><span class="text-xs text-gray-400">${timeAgo(msgDate)}</span></div><p class="text-gray-700 break-words">${data.text}</p>`;
                        messagesContainer.appendChild(div);
                    }
                }
            });
            if (!hasMessages) messagesContainer.innerHTML = '<p class="text-center text-gray-400 text-xs py-2">No hay mensajes recientes.</p>';
            else {
                if (newestMessageTime > lastReadTime && lastReadTime > 0) {
                    if (viewCommunity.classList.contains('hidden')) {
                        if(newMessageToast) newMessageToast.classList.remove('hidden');
                        const badge = document.getElementById('notification-badge');
                        if(badge) badge.classList.remove('hidden');
                    } else { markMessagesAsRead(); }
                } else if (lastReadTime === 0 && newestMessageTime > 0) {
                    localStorage.setItem('lastReadTime', now);
                }
            }
        });
    }

    // --- API CLIMA ---
    const weatherApiUrl = 'api/data';
    const tempEl = document.getElementById('temp-data');
    const humidityEl = document.getElementById('humidity-data');
    const pressureEl = document.getElementById('pressure-data');
    const rainfallDailyEl = document.getElementById('rainfall-daily-data'); 
    const uviEl = document.getElementById('uvi-data'); 
    const errorEl = document.getElementById('error-message');
    const lastUpdatedEl = document.getElementById('last-updated');

    const windHighlightCard = document.getElementById('wind-highlight-card');
    const unifiedWindDataCardEl = document.getElementById('unified-wind-data-card');
    const highlightWindDirEl = document.getElementById('highlight-wind-dir-data');
    const highlightWindSpeedEl = document.getElementById('highlight-wind-speed-data');
    const highlightGustEl = document.getElementById('highlight-gust-data');
    const windArrowEl = document.getElementById('wind-arrow'); 
    const windViewToggle = document.getElementById('wind-view-toggle');

    // --- Toggle vista flecha de viento ---
    // "map" = norte arriba (estándar meteorológico, como Windguru)
    // "cam" = relativo a la cámara del spot (la cámara apunta ~160° aprox SSE)
    const CAMERA_HEADING = 160; // grados hacia donde apunta la cámara
    let windViewMode = localStorage.getItem('windViewMode') || 'map';

    function getWindArrowRotation(degrees) {
        if (windViewMode === 'cam') {
            // Rotar para que "arriba" sea la dirección de la cámara
            return (degrees - CAMERA_HEADING + 360) % 360;
        }
        return degrees; // Vista mapa: norte = arriba
    }

    function updateWindViewToggle() {
        if (!windViewToggle) return;
        if (windViewMode === 'map') {
            windViewToggle.textContent = '📷 Vista cámara';
            windViewToggle.title = 'Relativo a la livecam. Toca para cambiar a vista mapa';
        } else {
            windViewToggle.textContent = '🧭 Vista Windguru';
            windViewToggle.title = 'N=arriba (estándar Windguru). Toca para cambiar a vista cámara';
        }
    }

    if (windViewToggle) {
        updateWindViewToggle();
        windViewToggle.addEventListener('click', () => {
            windViewMode = windViewMode === 'map' ? 'cam' : 'map';
            localStorage.setItem('windViewMode', windViewMode);
            updateWindViewToggle();
            // Redibujar flecha inmediatamente con la última dirección conocida
            if (windArrowEl && windArrowEl.dataset.degrees) {
                const deg = parseFloat(windArrowEl.dataset.degrees);
                windArrowEl.style.transform = 'rotate(' + getWindArrowRotation(deg) + 'deg)';
            }
        });
    }
    const gustInfoContainer = document.getElementById('gust-info-container');
    const verdictCardEl = document.getElementById('verdict-card');
    const verdictDataEl = document.getElementById('verdict-data');
    const stabilityCardEl = document.getElementById('stability-card');
    const stabilityDataEl = document.getElementById('stability-data');

    const skeletonLoaderIds = ['verdict-data-loader','highlight-wind-dir-data-loader', 'highlight-wind-speed-data-loader', 'highlight-gust-data-loader','temp-data-loader', 'humidity-data-loader', 'pressure-data-loader', 'rainfall-daily-data-loader', 'uvi-data-loader','stability-data-loader'];
    const dataContentIds = ['verdict-data','highlight-wind-dir-data', 'highlight-wind-speed-data', 'highlight-gust-data','temp-data', 'humidity-data', 'pressure-data','rainfall-daily-data', 'uvi-data','stability-data','wind-intensity-container','time-since-update'];

    let lastUpdateTime = null;

    function showSkeletons(isLoading) {
        skeletonLoaderIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = isLoading ? 'block' : 'none';
        });
        dataContentIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = isLoading ? 'none' : 'block';
        });
        if (isLoading && lastUpdatedEl) lastUpdatedEl.textContent = 'Actualizando...';
    }
    
    const connectionWarning = document.getElementById('connection-warning');
    const connectionWarningText = document.getElementById('connection-warning-text');
    const STALE_DATA_THRESHOLD_MINUTES = 15;

    function updateTimeAgo() {
        if (!lastUpdateTime) return;
        const now = new Date();
        const secondsAgo = Math.round((now - lastUpdateTime) / 1000);
        const minutesAgo = Math.floor(secondsAgo / 60);
        
        if (secondsAgo < 5) lastUpdatedEl.textContent = "Actualizado ahora";
        else if (secondsAgo < 60) lastUpdatedEl.textContent = `Actualizado hace ${secondsAgo} seg.`;
        else lastUpdatedEl.textContent = `Actualizado: ${lastUpdateTime.toLocaleTimeString('es-AR')}`;

        // Mostrar/ocultar banner de conexión desactualizada
        if (connectionWarning) {
            if (minutesAgo >= STALE_DATA_THRESHOLD_MINUTES) {
                connectionWarning.classList.remove('hidden');
                if (connectionWarningText) {
                    connectionWarningText.textContent = `Última actualización hace ${minutesAgo} minutos. Posible problema de conexión en la estación.`;
                }
            } else {
                connectionWarning.classList.add('hidden');
            }
        }
    }

    function convertDegreesToCardinal(degrees) {
        if (degrees === null || isNaN(degrees)) return 'N/A';
        const val = Math.floor((degrees / 22.5) + 0.5);
        const arr = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
        return arr[val % 16];
    }

    function calculateGustFactor(speed, gust) {
        if (speed === null || gust === null || speed <= 0) return { factor: null, text: 'N/A', color: ['bg-gray-100', 'border-gray-300'] };
        const MIN_KITE_WIND = 12; 
        if (speed < MIN_KITE_WIND) return { factor: null, text: 'N/A', color: ['bg-gray-100', 'border-gray-300'] };
        if (gust <= speed) return { factor: 0, text: 'Ultra Estable', color: ['bg-green-400', 'border-green-600'] };
        const factor = (1 - (speed / gust)) * 100; 
        if (factor <= 15) return { factor, text: 'Estable', color: ['bg-green-300', 'border-green-500'] }; 
        else if (factor <= 30) return { factor, text: 'Racheado', color: ['bg-yellow-300', 'border-yellow-500'] }; 
        else return { factor, text: 'Muy Racheado', color: ['bg-red-400', 'border-red-600'] }; 
    }
    
    function getSpotVerdict(speed, gust, degrees) {
        // Actualizar tracker de condición épica
        updateEpicTracker(speed, degrees);

        // ⭐ ÉPICO: E/ESE/SE (68°-146°), >=17 y <25 kts, sostenido 10+ minutos
        if (epicSustained) {
            return ["¡ÉPICO! 👑", ['bg-gradient-to-r', 'from-yellow-400', 'to-amber-500', 'border-yellow-600', 'shadow-xl']];
        }

        // Si está en condición épica pero aún no sostenida, mostrar que se está formando
        if (isEpicCondition(speed, degrees) && epicConsecutiveCount > 0) {
            const minutesLeft = Math.ceil((EPIC_SUSTAINED_READINGS - epicConsecutiveCount) * 30 / 60);
            return ["ÉPICO en " + minutesLeft + "min...", ['bg-gradient-to-r', 'from-yellow-200', 'to-amber-300', 'border-yellow-400']];
        }

        // Offshore siempre peligroso
        if (degrees !== null && (degrees > 292.5 || degrees <= 67.5)) return ["VIENTO OFFSHORE!", ['bg-red-400', 'border-red-600']];
        if (speed === null) return ["Calculando...", ['bg-gray-100', 'border-gray-300']];
        if (speed <= 14) return ["FLOJO...", ['bg-blue-200', 'border-blue-400']];
        else if (speed <= 16) return ["ACEPTABLE", ['bg-cyan-300', 'border-cyan-500']];
        else if (speed <= 19) return ["¡IDEAL!", ['bg-green-300', 'border-green-500']];
        else if (speed <= 22) return ["¡MUY BUENO!", ['bg-yellow-300', 'border-yellow-500']];
        else if (speed <= 27) return ["¡FUERTE!", ['bg-orange-300', 'border-orange-500']];
        else if (speed > 33) return ["¡DEMASIADO FUERTE!", ['bg-purple-400', 'border-purple-600']];
        else return ["¡MUY FUERTE!", ['bg-red-400', 'border-red-600']];
    }

    const allColorClasses = [
        'bg-gray-100', 'border-gray-300', 'bg-blue-200', 'border-blue-400', 'bg-green-300', 'border-green-500',
        'bg-yellow-300', 'border-yellow-500', 'bg-orange-300', 'border-orange-500', 'bg-red-400', 'border-red-600','bg-cyan-300', 'border-cyan-500',
        'bg-purple-400', 'border-purple-600', 'text-red-600', 'text-green-600', 'text-yellow-600', 'text-gray-900',
        'bg-green-400', 'border-green-600', 'bg-gray-50', 'bg-white/30', 'bg-cyan-300', 'border-cyan-500',
        'bg-gradient-to-r', 'from-yellow-400', 'to-amber-500', 'border-yellow-600', 'shadow-xl'
    ];

    function updateCardColors(element, newClasses) {
        if (!element) return;
        element.classList.remove(...allColorClasses);
        element.classList.add(...newClasses);
    }

    // --- ESTA ES LA FUNCIÓN QUE FALTABA ---
        
        function getUnifiedWindColorClasses(speedInKnots, degrees) {
        // 1. SEGURIDAD PRIMERO: Si es Offshore, tarjeta ROJA. (desactivado)
        /*if (degrees !== null) {
             if ((degrees > 292.5 || degrees <= 67.5)) { 
                return ['bg-red-400', 'border-red-600'];
            }
        }*/
    
        // 2. Escala Kitera (Igualada a Veredicto)
        if (speedInKnots !== null && !isNaN(speedInKnots)) {
            if (speedInKnots <= 14) return ['bg-blue-200', 'border-blue-400'];       // Flojo
            else if (speedInKnots <= 16) return ['bg-cyan-300', 'border-cyan-500'];  // Aceptable
            else if (speedInKnots <= 19) return ['bg-green-300', 'border-green-500'];// Ideal
            else if (speedInKnots <= 22) return ['bg-yellow-300', 'border-yellow-500']; // Muy Bueno
            else if (speedInKnots <= 27) return ['bg-orange-300', 'border-orange-500']; // Fuerte
            else if (speedInKnots <= 33) return ['bg-red-400', 'border-red-600'];    // Muy Fuerte
            else return ['bg-purple-400', 'border-purple-600'];                      // Demasiado Fuerte
        }
        
        return ['bg-gray-100', 'border-gray-300']; 
    }
        


    function getWindyColorClasses(speedInKnots) {
        if (speedInKnots !== null && !isNaN(speedInKnots)) {
            if (speedInKnots <= 10) return ['bg-blue-200', 'border-blue-400']; 
            else if (speedInKnots <= 16) return ['bg-green-300', 'border-green-500']; 
            else if (speedInKnots <= 21) return ['bg-yellow-300', 'border-yellow-500']; 
            else if (speedInKnots <= 27) return ['bg-orange-300', 'border-orange-500']; 
            else if (speedInKnots <= 33) return ['bg-red-400', 'border-red-600']; 
            else return ['bg-purple-400', 'border-purple-600']; 
        }
        return ['bg-gray-100', 'border-gray-300']; 
    }
    
    function getMockWeatherData() {
        return {
            code: 0, msg: "success",
            data: {
                outdoor: { temperature: { value: "24.5", unit: "°C" }, humidity: { value: "55", unit: "%" } },
                wind: { wind_speed: { value: "19.5", unit: "kts" }, wind_gust: { value: "24.2", unit: "kts" }, wind_direction: { value: "95", unit: "deg" } },
                pressure: { relative: { value: "1015", unit: "hPa" } },
                rainfall: { daily: { value: "0.0", unit: "mm" } },
                solar_and_uvi: { uvi: { value: "7" } }
            }
        };
    }

    // Buffer circular para promedio de viento (4 minutos = 8 lecturas cada 30 seg)
    const WIND_BUFFER_SIZE = 8;
    const windSpeedBuffer = [];
    const windGustBuffer = [];

    // ⭐ Tracker de condición ÉPICA sostenida (requiere 10 min = 20 lecturas a 30seg)
    const EPIC_SUSTAINED_READINGS = 20;
    let epicConsecutiveCount = 0;
    let epicSustained = false;

    function isEpicCondition(speed, degrees) {
        return degrees !== null && speed !== null &&
               speed >= 17 && speed < 25 &&
               degrees >= 68 && degrees <= 146;
    }

    function updateEpicTracker(speed, degrees) {
        if (isEpicCondition(speed, degrees)) {
            epicConsecutiveCount++;
            if (epicConsecutiveCount >= EPIC_SUSTAINED_READINGS) {
                epicSustained = true;
            }
        } else {
            epicConsecutiveCount = 0;
            epicSustained = false;
        }
    }
    
    function addToBuffer(buffer, value, maxSize) {
        if (value === null) return;
        buffer.push(value);
        if (buffer.length > maxSize) {
            buffer.shift();
        }
    }
    
    function getBufferAverage(buffer) {
        if (buffer.length === 0) return null;
        const sum = buffer.reduce((a, b) => a + b, 0);
        return Math.round((sum / buffer.length) * 10) / 10; // 1 decimal
    }
    
    function getBufferMax(buffer) {
        if (buffer.length === 0) return null;
        return Math.max(...buffer);
    }

    async function fetchWithBackoff(url, options, retries = 2, delay = 500) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error("Network error");
            return response.json();
        } catch (error) {
            if (retries > 0) {
                await new Promise(res => setTimeout(res, delay));
                return fetchWithBackoff(url, options, retries - 1, delay * 2);
            }
            throw error;
        }
    }
    
    async function fetchWeatherData() {
        showSkeletons(true);
        errorEl.classList.add('hidden'); 
        let json;
        try {
            try {
                json = await fetchWithBackoff(weatherApiUrl, {});
            } catch (e) {
                console.warn("API real falló, usando MOCK.");
                json = getMockWeatherData();
            }

            // Verificar si hay datos válidos (no array vacío)
            const hasValidData = json.code === 0 && json.data && !Array.isArray(json.data);
            
            if (hasValidData) {
                const data = json.data;
                
                // Solo actualizar lastUpdateTime cuando hay datos reales de la estación
                if (data.outdoor?.temperature?.time) {
                    lastUpdateTime = new Date(data.outdoor.temperature.time * 1000);
                } else {
                    lastUpdateTime = new Date();
                }
                updateTimeAgo();
                
                const windSpeedRaw = (data.wind?.wind_speed?.value) ? parseFloat(data.wind.wind_speed.value) : null;
                const windGustRaw = (data.wind?.wind_gust?.value) ? parseFloat(data.wind.wind_gust.value) : null; 
                const windDirDegrees = (data.wind?.wind_direction?.value) ? parseFloat(data.wind.wind_direction.value) : null;
                
                // Agregar al buffer y calcular promedios (4 min)
                addToBuffer(windSpeedBuffer, windSpeedRaw, WIND_BUFFER_SIZE);
                addToBuffer(windGustBuffer, windGustRaw, WIND_BUFFER_SIZE);
                
                const windSpeedValue = getBufferAverage(windSpeedBuffer) ?? windSpeedRaw;
                const windGustValue = getBufferMax(windGustBuffer) ?? windGustRaw;
                
                const [verdictText, verdictColors] = getSpotVerdict(windSpeedValue, windGustValue, windDirDegrees);
                updateCardColors(verdictCardEl, verdictColors);
                verdictDataEl.textContent = verdictText;
                
                if (windArrowEl && windDirDegrees !== null) {
                    windArrowEl.dataset.degrees = windDirDegrees;
                    windArrowEl.style.transform = `rotate(${getWindArrowRotation(windDirDegrees)}deg)`;
                    const isOffshore = (windDirDegrees > 292.5 || windDirDegrees <= 67.5);
                    const isCross = (windDirDegrees > 67.5 && windDirDegrees <= 112.5) || (windDirDegrees > 247.5 && windDirDegrees <= 292.5);
                    const isOnshore = !isOffshore && !isCross;

                    windArrowEl.classList.remove('text-red-600', 'text-green-600', 'text-yellow-600', 'text-gray-900');
                    if (isOffshore) windArrowEl.classList.add('text-red-600');
                    else if (isCross) windArrowEl.classList.add('text-yellow-600');
                    else windArrowEl.classList.add('text-green-600');
                }

                updateCardColors(windHighlightCard, ['bg-gray-100', 'border-gray-300']); 
                updateCardColors(unifiedWindDataCardEl, getUnifiedWindColorClasses(windSpeedValue, windDirDegrees));
                if (gustInfoContainer) updateCardColors(gustInfoContainer, getUnifiedWindColorClasses(windGustValue, windDirDegrees));

                highlightWindSpeedEl.innerHTML = (windSpeedValue !== null) 
                    ? `${windSpeedValue} <span class="text-xl font-bold align-baseline">kts</span>` 
                    : 'N/A';
                highlightGustEl.textContent = windGustValue ?? 'N/A';
                highlightWindDirEl.textContent = convertDegreesToCardinal(windDirDegrees); 

                if(tempEl) tempEl.textContent = data.outdoor?.temperature?.value ? `${data.outdoor.temperature.value} ${data.outdoor.temperature.unit}` : 'N/A';
                if(humidityEl) humidityEl.textContent = data.outdoor?.humidity?.value ? `${data.outdoor.humidity.value}%` : 'N/A';
                if(pressureEl) pressureEl.textContent = data.pressure?.relative?.value ? `${data.pressure.relative.value} hPa` : 'N/A'; 
                if(rainfallDailyEl) rainfallDailyEl.textContent = data.rainfall?.daily?.value ? `${data.rainfall.daily.value} mm` : 'N/A'; 
                if(uviEl) uviEl.textContent = data.solar_and_uvi?.uvi?.value ?? 'N/A'; 

                const stability = calculateGustFactor(windSpeedValue, windGustValue);
                if (stabilityCardEl) updateCardColors(stabilityCardEl, stability.color);
                if (stabilityDataEl) stabilityDataEl.textContent = stability.text;
                
                // ⭐ MEJORAS UX: Actualizar barra, tendencia, timestamp
                if (window.updateUXImprovements) {
                    window.updateUXImprovements(windSpeedValue, windGustValue, lastUpdateTime);
                }
                
                showSkeletons(false);
                
            } else {
                // Data vacío o inválido - estación sin conexión
                console.warn('Estación sin datos - posible desconexión');
                showSkeletons(false);
                
                // Mostrar banner de advertencia inmediatamente
                if (connectionWarning) {
                    connectionWarning.classList.remove('hidden');
                    if (connectionWarningText) {
                        connectionWarningText.textContent = 'La estación meteorológica no está reportando datos. Posible corte de conexión.';
                    }
                }
                
                updateCardColors(verdictCardEl, ['bg-amber-300', 'border-amber-500']);
                verdictDataEl.textContent = 'SIN DATOS';
            }
        } catch (error) {
            console.error(error);
            errorEl.classList.remove('hidden');
            showSkeletons(false);
            updateCardColors(verdictCardEl, ['bg-red-400', 'border-red-600']);
            verdictDataEl.textContent = 'Error API';
        }
    }
    
    fetchWeatherData();
    setInterval(fetchWeatherData, 30000);
    setInterval(updateTimeAgo, 5000);

    // --- SPONSOR CAROUSEL ---
    const sponsorTrack = document.getElementById('sponsor-track');
    const sponsorDots = document.querySelectorAll('.sponsor-dot');
    let currentSponsor = 0;
    const totalSponsors = document.querySelectorAll('.sponsor-slide').length;

    function goToSponsor(index) {
        currentSponsor = index;
        if (sponsorTrack) {
            sponsorTrack.style.transform = `translateX(-${index * 100}%)`;
        }
        sponsorDots.forEach((dot, i) => {
            dot.classList.toggle('bg-gray-400', i === index);
            dot.classList.toggle('bg-gray-300', i !== index);
        });
    }

    function nextSponsor() {
        goToSponsor((currentSponsor + 1) % totalSponsors);
    }

    // Click en indicadores
    sponsorDots.forEach(dot => {
        dot.addEventListener('click', () => {
            goToSponsor(parseInt(dot.dataset.index));
        });
    });

    // Auto-rotate cada 4 segundos
    if (totalSponsors > 1) {
        setInterval(nextSponsor, 7000);
    }

    // --- ESCUELAS CAROUSEL ---
    const escuelasTrack = document.getElementById('escuelas-track');
    const escuelasDots = document.querySelectorAll('.escuela-dot');
    let currentEscuela = 0;
    const totalEscuelas = document.querySelectorAll('.escuela-slide').length;

    function goToEscuela(index) {
        currentEscuela = index;
        if (escuelasTrack) {
            escuelasTrack.style.transform = `translateX(-${index * 100}%)`;
        }
        escuelasDots.forEach((dot, i) => {
            dot.classList.toggle('bg-gray-400', i === index);
            dot.classList.toggle('bg-gray-300', i !== index);
        });
    }

    function nextEscuela() {
        goToEscuela((currentEscuela + 1) % totalEscuelas);
    }

    // Click en indicadores de escuelas
    escuelasDots.forEach(dot => {
        dot.addEventListener('click', () => {
            goToEscuela(parseInt(dot.dataset.index));
        });
    });

    // Auto-rotate cada 5 segundos
    if (totalEscuelas > 1) {
        setInterval(nextEscuela, 5000);
    }

    // --- MODAL BIENVENIDA CLASIFICADOS ---
    const welcomeClasificadosModal = document.getElementById('welcome-clasificados-modal');
    const btnWelcomeClasificadosClose = document.getElementById('btn-welcome-clasificados-close');
    const btnWelcomeClasificadosNever = document.getElementById('btn-welcome-clasificados-never');
    const WELCOME_CLASIFICADOS_KEY = 'welcomeClasificadosStartV2';
    const WELCOME_CLASIFICADOS_DISABLED = 'welcomeClasificadosDisabled';
    const WELCOME_CLASIFICADOS_DAYS = 4; // Días que se mostrará el modal

    // Verificar si debemos mostrar el modal (durante 4 días desde la primera vez)
    function shouldShowWelcomeModal() {
        // Si el usuario deshabilitó el modal, no mostrar
        if (localStorage.getItem(WELCOME_CLASIFICADOS_DISABLED) === 'true') {
            return false;
        }
        const startDate = localStorage.getItem(WELCOME_CLASIFICADOS_KEY);
        if (!startDate) {
            // Primera vez - guardar fecha de inicio
            localStorage.setItem(WELCOME_CLASIFICADOS_KEY, Date.now().toString());
            return true;
        }
        // Verificar si pasaron 4 días
        const daysPassed = (Date.now() - parseInt(startDate)) / (1000 * 60 * 60 * 24);
        return daysPassed < WELCOME_CLASIFICADOS_DAYS;
    }

    // Mostrar modal durante el período de 4 días
    if (!isIOS && welcomeClasificadosModal && shouldShowWelcomeModal()) {
        // Mostrar después de 2 segundos para no interrumpir la carga inicial
        setTimeout(() => {
            welcomeClasificadosModal.classList.remove('hidden');
        }, 2000);
    }

    // Cerrar modal y activar notificaciones
    if (btnWelcomeClasificadosClose) {
        btnWelcomeClasificadosClose.addEventListener('click', async () => {
            welcomeClasificadosModal.classList.add('hidden');
            
            // Intentar activar notificaciones
            if (window.pushManager) {
                const granted = await window.pushManager.requestPermission();
                if (granted) {
                    console.log('✅ Notificaciones activadas desde el modal');
                    // Marcar como no volver a mostrar si activa
                    localStorage.setItem(WELCOME_CLASIFICADOS_DISABLED, 'true');
                    
                    // Scroll al panel de notificaciones para mostrar la configuración
                    setTimeout(() => {
                        const notificationsCard = document.getElementById('notifications-card');
                        if (notificationsCard) {
                            notificationsCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }, 500);
                }
            }
        });
    }

    // Recordarme después - no deshabilitar, solo cerrar
    if (btnWelcomeClasificadosNever) {
        btnWelcomeClasificadosNever.addEventListener('click', () => {
            welcomeClasificadosModal.classList.add('hidden');
            // NO marcamos como disabled, así vuelve a aparecer
        });
    }

    // Cerrar al hacer clic fuera del modal
    if (welcomeClasificadosModal) {
        welcomeClasificadosModal.addEventListener('click', (e) => {
            if (e.target === welcomeClasificadosModal) {
                welcomeClasificadosModal.classList.add('hidden');
            }
        });
    }

    // --- LAZY LOAD WINDGURU WIDGET ---
    // Cargar el widget solo cuando el usuario abre el desplegable
    const windguruContainer = document.getElementById('windguru-container');
    const windguruDetails = windguruContainer ? windguruContainer.closest('details') : null;
    let windguruLoaded = false;
    
    if (windguruDetails && windguruContainer) {
        windguruDetails.addEventListener('toggle', () => {
            if (windguruDetails.open && !windguruLoaded) {
                windguruLoaded = true;
                // Crear el widget con un ID único basado en timestamp
                const uid = 'wg_fwdg_1312667_29_' + Date.now();
                const arg = [
                    "s=1312667",
                    "m=29",
                    "uid=" + uid,
                    "wj=knots",
                    "tj=c",
                    "waj=m",
                    "tij=cm",
                    "odh=0",
                    "doh=24",
                    "fhours=240",
                    "hrsm=2",
                    "vt=forecasts",
                    "lng=es",
                    "ts=1",
                    "idbs=1",
                    "p=WINDSPD,GUST,MWINDSPD,SMER,TMPE,FLHGT,CDC,APCP1s,RATING"
                ];
                
                // Limpiar contenedor y agregar wrapper con scroll optimizado
                windguruContainer.innerHTML = '<div class="windguru-scroll-wrapper" style="overflow-x:auto;-webkit-overflow-scrolling:touch;touch-action:pan-x pan-y;"><script id="' + uid + '"></script></div>';
                
                // Cargar el widget
                const script = document.createElement('script');
                script.async = true;
                script.src = 'https://www.windguru.cz/js/widget.php?' + arg.join('&');
                document.head.appendChild(script);
                
                // Aplicar estilos al contenido generado después de cargar
                script.onload = () => {
                    setTimeout(() => {
                        const tables = windguruContainer.querySelectorAll('table');
                        tables.forEach(t => {
                            t.style.touchAction = 'pan-x pan-y';
                        });
                    }, 500);
                };
            }
        });
    }

    // --- CLASIFICADOS KITE ---
    const classifiedsList = document.getElementById('classifieds-list');
    const classifiedsLoading = document.getElementById('classifieds-loading');
    const classifiedFormModal = document.getElementById('classified-form-modal');
    const classifiedForm = document.getElementById('classified-form');
    const btnNewClassified = document.getElementById('btn-new-classified');
    const btnCloseClassifiedForm = document.getElementById('btn-close-classified-form');
    const filterBtns = document.querySelectorAll('.filter-btn');
    let currentFilter = 'todos';
    let allClassifieds = [];

    // Abrir modal
    if (btnNewClassified) {
        btnNewClassified.addEventListener('click', () => {
            if (classifiedFormModal) classifiedFormModal.classList.remove('hidden');
        });
    }

    // Cerrar modal
    if (btnCloseClassifiedForm) {
        btnCloseClassifiedForm.addEventListener('click', () => {
            if (classifiedFormModal) classifiedFormModal.classList.add('hidden');
        });
    }

    // Cerrar modal al hacer clic fuera
    if (classifiedFormModal) {
        classifiedFormModal.addEventListener('click', (e) => {
            if (e.target === classifiedFormModal) {
                classifiedFormModal.classList.add('hidden');
            }
        });
    }

    // Toggle campos según categoría (perdido/encontrado vs venta)
    const categorySelect = document.getElementById('classified-category');
    const priceContainer = document.getElementById('price-container');
    const locationContainer = document.getElementById('location-container');
    const priceInput = document.getElementById('classified-price');
    const locationInput = document.getElementById('classified-location');

    if (categorySelect) {
        categorySelect.addEventListener('change', () => {
            const isLostFound = categorySelect.value === 'perdido' || categorySelect.value === 'encontrado';
            if (isLostFound) {
                priceContainer.classList.add('hidden');
                locationContainer.classList.remove('hidden');
                priceInput.removeAttribute('required');
                locationInput.setAttribute('required', 'required');
            } else {
                priceContainer.classList.remove('hidden');
                locationContainer.classList.add('hidden');
                priceInput.setAttribute('required', 'required');
                locationInput.removeAttribute('required');
            }
        });
    }

    // Filtros
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            currentFilter = btn.dataset.filter;
            filterBtns.forEach(b => {
                b.classList.remove('bg-orange-500', 'text-white');
                b.classList.add('bg-gray-200', 'text-gray-700');
            });
            btn.classList.remove('bg-gray-200', 'text-gray-700');
            btn.classList.add('bg-orange-500', 'text-white');
            renderClassifieds();
        });
    });

    // Renderizar clasificados
    function renderClassifieds() {
        if (!classifiedsList) return;
        
        const filtered = currentFilter === 'todos' 
            ? allClassifieds 
            : allClassifieds.filter(c => c.category === currentFilter);

        if (filtered.length === 0) {
            classifiedsList.innerHTML = '<p class="text-center text-gray-400 text-sm py-4">No hay anuncios en esta categoria</p>';
            return;
        }

        const currentUserId = currentUser?.uid || null;
        
        classifiedsList.innerHTML = filtered.map(c => {
            const createdDate = c.createdAt?.toDate ? c.createdAt.toDate() : new Date();
            const isOwner = currentUserId && c.userId === currentUserId;
            const status = c.status || 'disponible';
            const isPerdido = c.category === 'perdido';
            const isEncontrado = c.category === 'encontrado';
            const isLostFound = isPerdido || isEncontrado;
            
            const statusColors = {
                'disponible': 'bg-green-100 text-green-700',
                'reservado': 'bg-yellow-100 text-yellow-700',
                'vendido': 'bg-gray-300 text-gray-600'
            };
            const statusLabels = {
                'disponible': isLostFound ? 'Activo' : 'Disponible',
                'reservado': 'Reservado',
                'vendido': isLostFound ? 'Recuperado' : 'Vendido'
            };
            
            const categoryColors = {
                'perdido': 'bg-red-500 text-white',
                'encontrado': 'bg-green-600 text-white',
                'kites': 'bg-orange-100 text-orange-700',
                'tablas': 'bg-orange-100 text-orange-700',
                'barras': 'bg-orange-100 text-orange-700',
                'arneses': 'bg-orange-100 text-orange-700',
                'otros': 'bg-orange-100 text-orange-700'
            };
            const categoryLabels = {
                'perdido': 'PERDIDO',
                'encontrado': 'ENCONTRADO',
                'kites': 'Kites',
                'tablas': 'Tablas',
                'barras': 'Barras',
                'arneses': 'Arneses',
                'otros': 'Otros'
            };
            
            const isVendido = status === 'vendido';
            const whatsappMsg = isLostFound 
                ? encodeURIComponent('Hola! Vi tu anuncio de "' + c.title + '" (' + (isPerdido ? 'perdido' : 'encontrado') + ') en La Bajada App')
                : encodeURIComponent('Hola! Vi tu anuncio de "' + c.title + '" en La Bajada App');
            
            return `
            <div class="bg-gray-50 rounded-lg p-3 border ${isPerdido ? 'border-red-300 bg-red-50' : isEncontrado ? 'border-green-300 bg-green-50' : 'border-gray-200'} flex gap-3 ${isVendido ? 'opacity-60' : ''}" data-category="${c.category}" data-id="${c.id}">
                ${c.photoURL ? `<img src="${c.photoURL}" alt="${c.title}" class="w-20 h-20 object-cover rounded-lg flex-shrink-0 cursor-pointer ${isVendido ? 'grayscale' : ''}" onclick="document.getElementById('modal-img').src='${c.photoURL}';document.getElementById('image-modal').classList.remove('hidden');">` : '<div class="w-20 h-20 bg-gray-200 rounded-lg flex items-center justify-center text-gray-300 flex-shrink-0"><svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>'}
                <div class="flex-grow min-w-0">
                    <div class="flex items-start justify-between gap-2">
                        <h4 class="font-bold text-gray-800 text-sm truncate ${isVendido ? 'line-through' : ''}">${c.title}</h4>
                        <div class="flex gap-1 flex-shrink-0">
                            <span class="text-xs px-2 py-0.5 rounded-full ${statusColors[status]} font-medium">${statusLabels[status]}</span>
                            <span class="text-xs px-2 py-0.5 rounded-full ${categoryColors[c.category] || 'bg-orange-100 text-orange-700'} font-medium">${categoryLabels[c.category] || c.category}</span>
                        </div>
                    </div>
                    ${isLostFound 
                        ? `<p class="text-gray-600 text-sm mt-1 flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>${c.location || 'Sin ubicacion'}</p>`
                        : `<p class="text-green-600 font-bold text-lg ${isVendido ? 'line-through text-gray-400' : ''}">${c.currency === 'USD' ? 'U$D' : '$'} ${c.price?.toLocaleString('es-AR') || '0'}</p>`
                    }
                    ${c.description ? `<p class="text-gray-600 text-xs mt-1 line-clamp-2">${c.description}</p>` : ''}
                    <div class="flex items-center gap-2 mt-1 text-xs text-gray-400">
                        <span>${c.userName || 'Usuario'}</span>
                        <span>-</span>
                        <span>${timeAgo(createdDate)}</span>
                    </div>
                    <div class="flex items-center justify-between mt-2 flex-wrap gap-2">
                        ${!isVendido ? `<a href="https://wa.me/${c.whatsapp}?text=${whatsappMsg}" target="_blank" class="bg-green-500 text-white px-3 py-1 rounded-full text-xs font-bold hover:bg-green-600 transition-colors flex items-center gap-1">
                            <svg class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                            WhatsApp
                        </a>` : '<span class="text-xs text-gray-400 italic">' + (isLostFound ? 'Objeto recuperado' : 'Anuncio finalizado') + '</span>'}
                        ${isOwner ? `<div class="flex items-center gap-2">
                            <button onclick="openEditClassified('${c.id}')" class="text-blue-500 hover:text-blue-700 text-xs font-medium flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                Editar
                            </button>
                            <button onclick="toggleClassifiedStatus('${c.id}')" class="text-yellow-600 hover:text-yellow-700 text-xs font-medium flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Estado
                            </button>
                            <button onclick="deleteClassified('${c.id}')" class="text-red-500 hover:text-red-700 text-xs font-medium flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                Eliminar
                            </button>
                        </div>` : ''}
                    </div>
                </div>
            </div>
        `}).join('');
    }

    // Cargar clasificados desde Firebase
    function loadClassifieds() {
        if (!classifiedsCollection) return;
        
        const q = query(classifiedsCollection, orderBy('createdAt', 'desc'), limit(50));
        
        onSnapshot(q, (snapshot) => {
            allClassifieds = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            }));
            
            if (classifiedsLoading) classifiedsLoading.classList.add('hidden');
            renderClassifieds();
            
            // Verificar si hay nuevos clasificados
            checkNewClassifieds();
        }, (error) => {
            console.error('Error cargando clasificados:', error);
            if (classifiedsLoading) {
                classifiedsLoading.textContent = 'Error al cargar clasificados';
                classifiedsLoading.classList.add('text-red-500');
            }
        });
    }
    
    // Verificar nuevos clasificados y mostrar notificacion
    function checkNewClassifieds() {
        if (allClassifieds.length === 0) return;
        
        const lastReadTime = parseInt(localStorage.getItem('lastClassifiedReadTime') || '0');
        const newestClassified = allClassifieds[0];
        const newestTime = newestClassified?.createdAt?.toDate?.()?.getTime() || 0;
        
        if (newestTime > lastReadTime && lastReadTime > 0) {
            // Hay nuevos clasificados y no estamos en la vista de clasificados
            if (viewClassifieds && viewClassifieds.classList.contains('hidden')) {
                if (newClassifiedToast) newClassifiedToast.classList.remove('hidden');
                if (clasificadosBadge) clasificadosBadge.classList.remove('hidden');
                if (clasificadosMenuBadge) clasificadosMenuBadge.classList.remove('hidden');
            } else {
                markClassifiedsAsRead();
            }
        } else if (lastReadTime === 0 && newestTime > 0) {
            // Primera vez - marcar como leido
            localStorage.setItem('lastClassifiedReadTime', newestTime);
        }
    }

    // Eliminar clasificado (solo el dueño)
    async function deleteClassified(classifiedId) {
        if (!currentUser) {
            alert('Debes iniciar sesion');
            return;
        }
        
        const classified = allClassifieds.find(c => c.id === classifiedId);
        if (!classified || classified.userId !== currentUser.uid) {
            alert('No tienes permiso para eliminar este anuncio');
            return;
        }
        
        if (!confirm('Eliminar este anuncio?')) return;
        
        try {
            await deleteDoc(doc(db, 'classifieds', classifiedId));
            console.log('Clasificado eliminado:', classifiedId);
        } catch (error) {
            console.error('Error eliminando clasificado:', error);
            alert('Error al eliminar. Intenta de nuevo.');
        }
    }
    
    // Exponer funcion globalmente para onclick
    window.deleteClassified = deleteClassified;
    
    // Cambiar estado del clasificado (ciclo: disponible -> reservado -> vendido -> disponible)
    async function toggleClassifiedStatus(classifiedId) {
        if (!currentUser) {
            alert('Debes iniciar sesion');
            return;
        }
        
        const classified = allClassifieds.find(c => c.id === classifiedId);
        if (!classified || classified.userId !== currentUser.uid) {
            alert('No tienes permiso para modificar este anuncio');
            return;
        }
        
        const currentStatus = classified.status || 'disponible';
        const statusOrder = ['disponible', 'reservado', 'vendido'];
        const currentIndex = statusOrder.indexOf(currentStatus);
        const nextStatus = statusOrder[(currentIndex + 1) % 3];
        
        const statusLabels = { 'disponible': 'Disponible', 'reservado': 'Reservado', 'vendido': 'Vendido' };
        if (!confirm(`Cambiar estado a "${statusLabels[nextStatus]}"?`)) return;
        
        try {
            await updateDoc(doc(db, 'classifieds', classifiedId), { status: nextStatus });
            console.log('Estado actualizado:', nextStatus);
        } catch (error) {
            console.error('Error actualizando estado:', error);
            alert('Error al actualizar. Intenta de nuevo.');
        }
    }
    window.toggleClassifiedStatus = toggleClassifiedStatus;
    
    // Abrir modal de edicion
    let editingClassifiedId = null;
    
    function openEditClassified(classifiedId) {
        const classified = allClassifieds.find(c => c.id === classifiedId);
        if (!classified) return;
        
        editingClassifiedId = classifiedId;
        
        const modal = document.getElementById('edit-classified-modal');
        const titleInput = document.getElementById('edit-classified-title');
        const priceInput = document.getElementById('edit-classified-price');
        const currencyInput = document.getElementById('edit-classified-currency');
        const descInput = document.getElementById('edit-classified-description');
        
        if (titleInput) titleInput.value = classified.title || '';
        if (priceInput) priceInput.value = classified.price || '';
        if (currencyInput) currencyInput.value = classified.currency || 'ARS';
        if (descInput) descInput.value = classified.description || '';
        
        if (modal) modal.classList.remove('hidden');
    }
    window.openEditClassified = openEditClassified;
    
    // Guardar edicion
    async function saveEditClassified() {
        if (!currentUser || !editingClassifiedId) return;
        
        const classified = allClassifieds.find(c => c.id === editingClassifiedId);
        if (!classified || classified.userId !== currentUser.uid) {
            alert('No tienes permiso para editar este anuncio');
            return;
        }
        
        const titleInput = document.getElementById('edit-classified-title');
        const priceInput = document.getElementById('edit-classified-price');
        const currencyInput = document.getElementById('edit-classified-currency');
        const descInput = document.getElementById('edit-classified-description');
        
        const newTitle = titleInput?.value?.trim();
        const newPrice = parseInt(priceInput?.value) || 0;
        const newCurrency = currencyInput?.value || 'ARS';
        const newDesc = descInput?.value?.trim();
        
        if (!newTitle || newPrice <= 0) {
            alert('Titulo y precio son obligatorios');
            return;
        }
        
        try {
            await updateDoc(doc(db, 'classifieds', editingClassifiedId), {
                title: newTitle,
                price: newPrice,
                currency: newCurrency,
                description: newDesc
            });
            console.log('Clasificado actualizado');
            document.getElementById('edit-classified-modal')?.classList.add('hidden');
            editingClassifiedId = null;
        } catch (error) {
            console.error('Error actualizando clasificado:', error);
            alert('Error al guardar. Intenta de nuevo.');
        }
    }
    window.saveEditClassified = saveEditClassified;
    
    // Cerrar modal de edicion
    function closeEditClassified() {
        document.getElementById('edit-classified-modal')?.classList.add('hidden');
        editingClassifiedId = null;
    }
    window.closeEditClassified = closeEditClassified;

    // Comprimir imagen para clasificados (usa la misma funcion que galeria)
    async function compressImageForClassified(file) {
        const MAX_WIDTH = 800;
        const QUALITY = 0.7;
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    let width = img.width;
                    let height = img.height;
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
                    resolve(dataUrl);
                };
                img.onerror = (err) => reject(err);
            };
            reader.onerror = (err) => reject(err);
        });
    }

    // Enviar clasificado
    if (classifiedForm) {
        classifiedForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!currentUser) {
                alert('Debes iniciar sesion para publicar');
                return;
            }

            const submitBtn = document.getElementById('btn-submit-classified');
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Publicando...';

            try {
                const title = document.getElementById('classified-title').value.trim();
                const category = document.getElementById('classified-category').value;
                const isLostFound = category === 'perdido' || category === 'encontrado';
                const price = isLostFound ? 0 : parseInt(document.getElementById('classified-price').value);
                const location = document.getElementById('classified-location').value.trim();
                const description = document.getElementById('classified-description').value.trim();
                const whatsapp = document.getElementById('classified-whatsapp').value.trim();
                const photoInput = document.getElementById('classified-photo');
                
                let photoURL = null;
                if (photoInput && photoInput.files && photoInput.files.length > 0) {
                    try {
                        photoURL = await compressImageForClassified(photoInput.files[0]);
                        console.log('Imagen comprimida correctamente');
                    } catch (err) {
                        console.error('Error comprimiendo imagen:', err);
                        alert('Error procesando la imagen. Intenta con otra.');
                    }
                }

                const currency = document.getElementById('classified-currency').value || 'ARS';
                
                await addDoc(classifiedsCollection, {
                    title,
                    category,
                    price,
                    currency,
                    location: location || null,
                    description,
                    whatsapp,
                    photoURL,
                    userId: currentUser.uid,
                    userName: currentUser.displayName || 'Usuario',
                    userPhoto: currentUser.photoURL || null,
                    status: 'disponible',
                    createdAt: serverTimestamp()
                });

                classifiedForm.reset();
                classifiedFormModal.classList.add('hidden');
                console.log('✅ Clasificado publicado');
            } catch (error) {
                console.error('Error publicando clasificado:', error);
                alert('Error al publicar. Intenta de nuevo.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    }

    // Iniciar carga de clasificados
    loadClassifieds();

    // ============================================
    // SCROLL AUTOMÁTICO AL VENIR DE NOTIFICACIÓN
    // ============================================
    
    // Detectar si viene de una notificación
    const urlParams = new URLSearchParams(window.location.search);
    const fromNotification = urlParams.get('from_notification');
    
    if (fromNotification === 'true') {
        console.log('🔔 Usuario viene de notificación - Haciendo scroll al panel de viento');
        
        // Esperar a que la página cargue completamente
        setTimeout(() => {
            const windPanel = document.getElementById('wind-highlight-card');
            
            if (windPanel) {
                // Hacer scroll suave al panel de viento
                windPanel.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center' 
                });
                
                // Agregar highlight temporal (animación de atención)
                windPanel.classList.add('ring-4', 'ring-blue-500', 'ring-opacity-75');
                
                // Quitar highlight después de 3 segundos
                setTimeout(() => {
                    windPanel.classList.remove('ring-4', 'ring-blue-500', 'ring-opacity-75');
                }, 3000);
                
                console.log('✅ Scroll completado y panel resaltado');
            }
            
            // Limpiar URL (quitar parámetro)
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 1000); // 1 segundo para que todo cargue
    }
});
} catch (e) {
    console.error("❌ Error inicializando Firebase:", e);
}