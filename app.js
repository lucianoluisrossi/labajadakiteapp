// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInAnonymously, signInWithPopup, signOut, onAuthStateChanged, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, limit, serverTimestamp, doc, deleteDoc, updateDoc, getDoc, setDoc, where, Timestamp, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ⭐ MEJORAS UX/UI
import './ux-improvements.js';

// ⭐ DETECCIÓN iOS (solo para analytics)
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// ========================================
// ANALYTICS: Detectar tipo de dispositivo
// ========================================
const deviceType = isIOS ? 'iOS' : 
                  /Android/.test(navigator.userAgent) ? 'Android' : 
                  'Desktop';

const browserName = /Chrome/.test(navigator.userAgent) && !/Edge/.test(navigator.userAgent) ? 'Chrome' :
                   /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent) ? 'Safari' :
                   /Firefox/.test(navigator.userAgent) ? 'Firefox' :
                   /Edge/.test(navigator.userAgent) ? 'Edge' :
                   'Other';

console.log('📊 ========== DEVICE INFO ==========');
console.log('📱 Dispositivo:', deviceType);
console.log('🌐 Navegador:', browserName);
console.log('📏 Viewport:', window.innerWidth + 'x' + window.innerHeight);
console.log('📊 ==================================');

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
const googleProvider = new GoogleAuthProvider();

try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    
    messagesCollection = collection(db, "kiter_board");
    galleryCollection = collection(db, "daily_gallery_meta");
    classifiedsCollection = collection(db, "classifieds");

    console.log("✅ Firebase inicializado.");

    // ========================================
    // ANALYTICS: ID único por dispositivo + Datos de usuario
    // ========================================
    // Generar o recuperar ID único del dispositivo
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
        deviceId = 'device_' + 
                   Date.now() + '_' + 
                   Math.random().toString(36).substring(2, 15);
        localStorage.setItem('device_id', deviceId);
        console.log('📱 Nuevo dispositivo detectado, ID:', deviceId);
    } else {
        console.log('📱 Dispositivo conocido, ID:', deviceId);
    }

    // Función para actualizar analytics (se llama en login y al cargar)
    async function updateDeviceAnalytics(user) {
        const deviceData = {
            deviceType: deviceType,
            browser: browserName,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            userAgent: navigator.userAgent,
            language: navigator.language,
            lastSeen: serverTimestamp(),
            online: navigator.onLine
        };

        // Si el usuario está logueado, agregar sus datos
        if (user) {
            deviceData.userId = user.uid;
            deviceData.email = user.email;
            deviceData.displayName = user.displayName || 'Anónimo';
            deviceData.photoURL = user.photoURL || null;
            deviceData.lastLogin = serverTimestamp();
            console.log('👤 Usuario logueado:', user.email);
        } else {
            // Si no está logueado, marcar como null
            deviceData.userId = null;
            deviceData.email = null;
            deviceData.displayName = null;
            deviceData.photoURL = null;
        }

        const deviceRef = doc(db, "app_devices", deviceId);
        
        try {
            const deviceDoc = await getDoc(deviceRef);
            
            if (deviceDoc.exists()) {
                // Actualizar dispositivo existente
                const updates = {
                    ...deviceData,
                    sessionCount: deviceDoc.data().sessionCount + 1
                };
                
                await updateDoc(deviceRef, updates);
                console.log('📊 Analytics actualizado. Sesión #' + updates.sessionCount);
            } else {
                // Nuevo dispositivo
                deviceData.firstSeen = serverTimestamp();
                deviceData.sessionCount = 1;
                
                await setDoc(deviceRef, deviceData);
                console.log('📊 Nuevo dispositivo registrado');
            }
        } catch (err) {
            console.log('📊 Analytics error (no crítico):', err.message);
        }
    }

    // Actualizar analytics al inicio (sin usuario todavía)
    updateDeviceAnalytics(null);

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
        
        const topbarLoginBtn = document.getElementById('topbar-login-btn');
        const topbarUserBtn = document.getElementById('topbar-user-btn');
        const topbarUserPhoto = document.getElementById('topbar-user-photo');
        const topbarUserName = document.getElementById('topbar-user-name');

        if (topbarLoginBtn) {
            topbarLoginBtn.onclick = () => {
                window._openVipAfterLogin = true;
                window.loginWithGoogle && window.loginWithGoogle();
            };
        }
        if (topbarUserBtn) {
            topbarUserBtn.onclick = () => switchView('community');
        }

        if (user) {
            // Usuario logueado
            if (authLogin) authLogin.classList.add('hidden');
            if (authUser) authUser.classList.remove('hidden');
            if (userPhoto) userPhoto.src = user.photoURL || 'https://via.placeholder.com/40';
            if (userName) userName.textContent = user.displayName || 'Kiter';
            if (topbarLoginBtn) { topbarLoginBtn.classList.add('hidden'); topbarLoginBtn.classList.remove('flex'); }
            if (topbarUserBtn) { topbarUserBtn.classList.remove('hidden'); topbarUserBtn.classList.add('flex'); }
            if (topbarUserPhoto) topbarUserPhoto.src = user.photoURL || '';
            if (topbarUserName) topbarUserName.textContent = (user.displayName || 'Kiter').split(' ')[0];
            if (messageForm) messageForm.classList.remove('hidden');
            if (loginPromptMessages) loginPromptMessages.classList.add('hidden');
            if (galleryUploadContainer) galleryUploadContainer.classList.remove('hidden');
            if (loginPromptGallery) loginPromptGallery.classList.add('hidden');
            if (classifiedsPublishContainer) classifiedsPublishContainer.classList.remove('hidden');
            if (loginPromptClassifieds) loginPromptClassifieds.classList.add('hidden');
            
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
            
            if (topbarLoginBtn) { topbarLoginBtn.classList.remove('hidden'); topbarLoginBtn.classList.add('flex'); }
            if (topbarUserBtn) { topbarUserBtn.classList.add('hidden'); topbarUserBtn.classList.remove('flex'); }
            console.log("ℹ️ Usuario no logueado");
        }
    }

    // --- LISTENER DE ESTADO DE AUTENTICACIÓN (dentro de DOMContentLoaded) ---
    let currentUserIsVip = false;
    let vipUnsubscribe = null;
    onAuthStateChanged(auth, (user) => {
        currentUser = user;
		updateDeviceAnalytics(user);
        updateAuthUI(user);
        updateVipUI(user);
        updateNovedadesAdminUI(user);

        // Escuchar cambios en tiempo real del doc VIP del usuario
        if (vipUnsubscribe) { vipUnsubscribe(); vipUnsubscribe = null; }
        if (!user) { currentUserIsVip = false; return; }
        if (user?.email) {
            const docId = user.email.replace(/[.#$[\]@]/g, '_');
            vipUnsubscribe = onSnapshot(doc(db, 'kiter_vip', docId), (snap) => {
                currentUserIsVip = snap.exists() && snap.data()?.active === true;
                if (vipBadge) {
                    vipBadge.classList.toggle('hidden', !currentUserIsVip);
                    vipBadge.classList.toggle('flex', currentUserIsVip);
                }
                // Si es VIP, ocultar sección de email alternativo y cerrar modal
                const mpSection = document.getElementById('mp-email-section');
                if (currentUserIsVip) {
                    if (mpSection) mpSection.classList.add('hidden');
                    if (vipModal) vipModal.classList.add('hidden');
                } else {
                    if (mpSection) mpSection.classList.remove('hidden');
                }
                // Decidir si mostrar modal VIP aquí, con estado VIP ya confirmado
                if (window._openVipAfterLogin) {
                    window._openVipAfterLogin = false;
                    if (!currentUserIsVip) {
                        setTimeout(() => { if (vipModal) vipModal.classList.remove('hidden'); }, 400);
                    }
                }
            });
        }
    });

    // --- VIP SUBSCRIPTION ---
    const vipBadge = document.getElementById('vip-badge');
    const btnSubscribe = document.getElementById('btn-subscribe');
    const vipModal = document.getElementById('vip-modal');
    const vipModalClose = document.getElementById('vip-modal-close');

    async function updateVipUI(user) {
        if (!user) {
            if (vipBadge) { vipBadge.classList.add('hidden'); vipBadge.classList.remove('flex'); }
            initSupportBanner(false);
            return;
        }
        try {
            const res = await fetch(`/api/vip-status?email=${encodeURIComponent(user.email)}&uid=${encodeURIComponent(user.uid)}`);
            const data = await res.json();
            if (data.active) {
                currentUserIsVip = true;
                if (vipBadge) { vipBadge.classList.remove('hidden'); vipBadge.classList.add('flex'); }
                initSupportBanner(true);
                const mpSection = document.getElementById('mp-email-section');
                if (mpSection) mpSection.classList.add('hidden');
            } else {
                if (vipBadge) { vipBadge.classList.add('hidden'); vipBadge.classList.remove('flex'); }
                initSupportBanner(false);
            }
        } catch(e) {
            console.warn('VIP check error', e);
            initSupportBanner(false);
        }
    }

    // Al volver del checkout de MP, destacar el campo de email alternativo
    if (localStorage.getItem('mpCheckoutStarted') === 'true') {
        localStorage.removeItem('mpCheckoutStarted');
        // Esperar a que se resuelva el estado VIP antes de decidir
        setTimeout(() => {
            if (!currentUserIsVip) {
                const mpSection = document.getElementById('mp-email-section');
                const mpTitle = document.getElementById('mp-email-title');
                const mpInput = document.getElementById('mp-email-input');
                if (mpSection) mpSection.classList.add('ring-2', 'ring-sky-400', 'rounded-xl', 'p-2');
                if (mpTitle) mpTitle.innerHTML = '¿Ya pagaste? Si usaste <strong>otro email en MercadoPago</strong>, vinculalo acá para activar tu VIP.';
                if (mpInput) mpInput.focus();
                if (vipModal) vipModal.classList.remove('hidden');
            }
        }, 2000);
    }

    // Guardar email de MP alternativo
    const mpEmailSave = document.getElementById('mp-email-save');
    const mpEmailInput = document.getElementById('mp-email-input');
    const mpEmailFeedback = document.getElementById('mp-email-feedback');
    if (mpEmailSave) mpEmailSave.addEventListener('click', async () => {
        const mpEmail = mpEmailInput?.value.trim();
        if (!mpEmail || !mpEmail.includes('@')) {
            showMpFeedback('Ingresá un email válido', 'error'); return;
        }
        if (!currentUser) { showMpFeedback('Tenés que estar logueado', 'error'); return; }
        mpEmailSave.disabled = true;
        try {
            await setDoc(doc(db, 'usuarios', currentUser.uid), { mp_email: mpEmail }, { merge: true });
            showMpFeedback('Email vinculado. Verificando...', 'ok');
            setTimeout(() => updateVipUI(currentUser), 1000);
        } catch(e) {
            showMpFeedback('Error al guardar. Intentá de nuevo.', 'error');
        }
        mpEmailSave.disabled = false;
    });

    function showMpFeedback(msg, type) {
        if (!mpEmailFeedback) return;
        mpEmailFeedback.textContent = msg;
        mpEmailFeedback.className = `text-[10px] text-center mt-1.5 ${type === 'error' ? 'text-red-500' : 'text-green-600'}`;
        mpEmailFeedback.classList.remove('hidden');
    }

    // --- MODAL VIP: mostrar 1 vez por día si no es VIP ---
    let supportBannerInitialized = false;
    function initSupportBanner(isVip) {
        if (isVip || supportBannerInitialized) return;
        supportBannerInitialized = true;
        const today = new Date().toISOString().slice(0, 10);
        const lastShown = localStorage.getItem('vipModalLastShown');
        if (lastShown === today) return;
        setTimeout(async () => {
            // Doble chequeo: verificar Firestore antes de mostrar el modal
            if (currentUser?.email) {
                const docId = currentUser.email.replace(/[.#$[\]@]/g, '_');
                try {
                    const snap = await getDoc(doc(db, 'kiter_vip', docId));
                    if (snap.exists() && snap.data()?.active === true) return;
                } catch(e) { /* si falla el chequeo, no mostrar el modal */ return; }
            }
            if (vipModal) {
                vipModal.classList.remove('hidden');
                localStorage.setItem('vipModalLastShown', today);
            }
        }, 3000);
    }
    function closeVipModalAndOpenLink() {
        if (vipModal) vipModal.classList.add('hidden');
        if (window._pendingAlertLink) {
            window.open(window._pendingAlertLink, '_blank', 'noopener');
            window._pendingAlertLink = null;
        }
    }
    if (vipModalClose) vipModalClose.addEventListener('click', closeVipModalAndOpenLink);
    if (vipModal) vipModal.addEventListener('click', (e) => {
        if (e.target === vipModal) closeVipModalAndOpenLink();
    });

    // --- BOTONES DE ALERTA (WhatsApp / Telegram) — requieren login + modal apoyo ---
    function handleAlertBtnClick(e, url) {
        e.preventDefault();
        if (!currentUser) {
            window._pendingAlertLink = url;
            window._openVipAfterLogin = true;
            window.loginWithGoogle && window.loginWithGoogle();
        } else if (currentUserIsVip) {
            window.open(url, '_blank', 'noopener');
        } else {
            window._pendingAlertLink = url;
            if (vipModal) vipModal.classList.remove('hidden');
        }
    }
    const alertTelegramBtn = document.getElementById('alert-telegram-btn');
    const alertWhatsappBtn = document.getElementById('alert-whatsapp-btn');
    if (alertTelegramBtn) alertTelegramBtn.addEventListener('click', (e) => handleAlertBtnClick(e, alertTelegramBtn.href));
    if (alertWhatsappBtn) alertWhatsappBtn.addEventListener('click', (e) => handleAlertBtnClick(e, alertWhatsappBtn.href));

    // --- NOVEDADES DEL SPOT ---
    let canEditNovedades = false;  // rol "admin" o "editor" → puede crear/editar/borrar novedades
    let lastNovedadesDocs = [];
    const novedadesSection  = document.getElementById('novedades-section');
    const novedadesList     = document.getElementById('novedades-list');
    const novedadAddBtn     = document.getElementById('novedad-add-btn');
    const novedadModal      = document.getElementById('novedad-modal');
    const novedadModalClose = document.getElementById('novedad-modal-close');
    const novedadModalTitle = document.getElementById('novedad-modal-title');
    const novedadTitulo     = document.getElementById('novedad-titulo');
    const novedadTexto      = document.getElementById('novedad-texto');
    const novedadEditId     = document.getElementById('novedad-edit-id');
    const novedadSaveBtn    = document.getElementById('novedad-save-btn');

    async function updateNovedadesAdminUI(user) {
        canEditNovedades = false;
        if (novedadAddBtn) { novedadAddBtn.classList.add('hidden'); novedadAddBtn.classList.remove('flex'); }
        if (topbarAdminBtn) topbarAdminBtn.classList.add('hidden');
        if (!user) return;
        try {
            const snap = await getDoc(doc(db, 'usuarios', user.uid));
            const role = snap.exists() ? snap.data().role : null;
            if (role === 'admin') {
                canEditNovedades = true;
                if (topbarAdminBtn) topbarAdminBtn.classList.remove('hidden');
            } else if (role === 'editor') {
                canEditNovedades = true;
            }
            if (canEditNovedades) {
                if (novedadesSection) novedadesSection.classList.remove('hidden');
                if (novedadAddBtn) { novedadAddBtn.classList.remove('hidden'); novedadAddBtn.classList.add('flex'); }
                if (lastNovedadesDocs.length > 0) renderNovedades(lastNovedadesDocs);
            }
        } catch(e) { console.warn('Error leyendo rol usuario:', e); }
    }

    function updateNovedadBadge(docs) {
        const badge = document.getElementById('novedad-badge');
        if (!badge || docs.length === 0) return;
        const lastSeen = localStorage.getItem('novedadLastSeen');
        const latest = docs[0].data().fecha?.toDate?.()?.getTime?.() || 0;
        if (!lastSeen || Number(lastSeen) < latest) {
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    function renderNovedades(docs) {
        lastNovedadesDocs = docs;
        if (!novedadesList) return;
        if (docs.length === 0) {
            if (!canEditNovedades && novedadesSection) novedadesSection.classList.add('hidden');
            novedadesList.innerHTML = '';
            return;
        }
        if (novedadesSection) novedadesSection.classList.remove('hidden');
        updateNovedadBadge(docs);
        const MAX_CHARS = 120;
        novedadesList.innerHTML = docs.map(d => {
            const data = d.data();
            const fecha = data.fecha?.toDate ? data.fecha.toDate().toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '';
            const texto = data.texto || '';
            const truncado = texto.length > MAX_CHARS;
            const textoVisible = truncado ? texto.slice(0, MAX_CHARS).trimEnd() + '…' : texto;
            const adminBtns = canEditNovedades ? `
                <div class="flex gap-2 mt-2">
                    <button onclick="editNovedad('${d.id}')" class="text-[10px] text-blue-500 hover:text-blue-700 font-semibold">✏️ Editar</button>
                    <button onclick="deleteNovedad('${d.id}')" class="text-[10px] text-red-400 hover:text-red-600 font-semibold">🗑 Eliminar</button>
                </div>` : '';
            const verMasBtn = truncado ? `<button onclick="verNovedadCompleta('${d.id}')" class="text-[10px] text-blue-500 hover:text-blue-700 font-semibold mt-1 block">Ver más →</button>` : '';
            return `
            <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-4">
                <div class="flex items-start justify-between gap-2 mb-1">
                    <p class="text-sm font-extrabold text-gray-800 leading-tight">${data.titulo || ''}</p>
                    <span class="text-[10px] text-gray-400 flex-shrink-0 mt-0.5">${fecha}</span>
                </div>
                <p class="text-xs text-gray-600 leading-relaxed">${textoVisible.replace(/\n/g, '<br>')}</p>
                ${verMasBtn}
                ${adminBtns}
            </div>`;
        }).join('');
    }

    // Listener en tiempo real
    onSnapshot(
        query(collection(db, 'novedades'), orderBy('fecha', 'desc'), limit(10)),
        (snap) => renderNovedades(snap.docs),
        (e) => console.warn('Error novedades:', e)
    );

    const novedadNotifyWa = document.getElementById('novedad-notify-wa');
    const novedadWaLabel  = document.getElementById('novedad-wa-label');

    // Abrir modal nueva novedad
    if (novedadAddBtn) novedadAddBtn.addEventListener('click', () => {
        novedadEditId.value = '';
        novedadTitulo.value = '';
        novedadTexto.value = '';
        if (novedadModalTitle) novedadModalTitle.textContent = 'Nueva novedad';
        if (novedadSaveBtn) novedadSaveBtn.textContent = 'Publicar';
        if (novedadWaLabel) novedadWaLabel.classList.remove('hidden');
        if (novedadNotifyWa) novedadNotifyWa.checked = false;
        novedadModal.classList.remove('hidden');
    });

    function closeNovedadModal() { if (novedadModal) novedadModal.classList.add('hidden'); }
    if (novedadModalClose) novedadModalClose.addEventListener('click', closeNovedadModal);
    if (novedadModal) novedadModal.addEventListener('click', (e) => { if (e.target === novedadModal) closeNovedadModal(); });

    // Guardar (crear o editar)
    if (novedadSaveBtn) novedadSaveBtn.addEventListener('click', async () => {
        const titulo = novedadTitulo.value.trim();
        const texto  = novedadTexto.value.trim();
        if (!titulo || !texto) return;
        novedadSaveBtn.disabled = true;
        try {
            const editId = novedadEditId.value;
            if (editId) {
                await updateDoc(doc(db, 'novedades', editId), { titulo, texto });
            } else {
                await addDoc(collection(db, 'novedades'), {
                    titulo, texto,
                    fecha: serverTimestamp(),
                    creadoPor: currentUser?.displayName || 'Admin'
                });
                // Notificar suscriptores WA si el checkbox está marcado
                if (novedadNotifyWa?.checked) {
                    novedadSaveBtn.textContent = 'Enviando WA...';
                    try {
                        const r = await fetch('/api/notify-novedades', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ titulo, texto })
                        });
                        const j = await r.json();
                        console.log(`[novedades] WA enviado a ${j.sent}/${j.total} suscriptores`);
                    } catch(e) { console.error('Error notificando WA:', e); }
                }
            }
            closeNovedadModal();
        } catch(e) { console.error('Error guardando novedad:', e); }
        novedadSaveBtn.disabled = false;
    });

    // Editar — expuesto globalmente para los botones inline
    window.editNovedad = async (id) => {
        try {
            const snap = await getDoc(doc(db, 'novedades', id));
            if (!snap.exists()) return;
            const data = snap.data();
            novedadEditId.value = id;
            novedadTitulo.value = data.titulo || '';
            novedadTexto.value  = data.texto  || '';
            if (novedadModalTitle) novedadModalTitle.textContent = 'Editar novedad';
            if (novedadSaveBtn) novedadSaveBtn.textContent = 'Guardar cambios';
            if (novedadWaLabel) novedadWaLabel.classList.add('hidden');
            novedadModal.classList.remove('hidden');
        } catch(e) { console.error('Error cargando novedad:', e); }
    };

    // Eliminar
    window.deleteNovedad = async (id) => {
        if (!confirm('¿Eliminar esta novedad?')) return;
        try { await deleteDoc(doc(db, 'novedades', id)); }
        catch(e) { console.error('Error eliminando novedad:', e); }
    };

    // Ver novedad completa
    window.verNovedadCompleta = (id) => {
        const d = lastNovedadesDocs.find(d => d.id === id);
        if (!d) return;
        const data = d.data();
        // Marcar como leída (usar la novedad más reciente como referencia)
        const latest = lastNovedadesDocs[0]?.data().fecha?.toDate?.()?.getTime?.() || 0;
        localStorage.setItem('novedadLastSeen', String(latest));
        updateNovedadBadge(lastNovedadesDocs);
        const fecha = data.fecha?.toDate ? data.fecha.toDate().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

        // Crear modal dinámico
        const existing = document.getElementById('novedad-read-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'novedad-read-modal';
        modal.className = 'fixed inset-0 z-[200] bg-black/60 flex items-end sm:items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-5 relative max-h-[80vh] flex flex-col">
                <button id="novedad-read-close" class="absolute top-3 right-4 text-gray-400 hover:text-gray-700 text-2xl font-bold leading-none">&times;</button>
                <p class="text-[10px] text-gray-400 mb-1">${fecha}</p>
                <h3 class="text-base font-extrabold text-gray-800 mb-3 pr-6">${data.titulo || ''}</h3>
                <p class="text-sm text-gray-600 leading-relaxed overflow-y-auto">${(data.texto || '').replace(/\n/g, '<br>')}</p>
            </div>`;
        document.body.appendChild(modal);

        const close = () => modal.remove();
        modal.querySelector('#novedad-read-close').addEventListener('click', close);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    };


    // Quitar VIP
    window.adminQuitarVip = async (docId) => {
        if (!confirm('¿Quitar VIP a este usuario?')) return;
        try {
            await setDoc(doc(db, 'kiter_vip', docId), { active: false }, { merge: true });
        } catch(e) { console.error('Error quitando VIP:', e); }
    };

    console.log("🚀 App iniciada.");

    // --- ELEMENTOS DE NAVEGACIÓN ---
    const viewDashboard = document.getElementById('view-dashboard');
    const viewCommunity = document.getElementById('view-community');
    const viewClassifieds = document.getElementById('view-classifieds');
    const viewAdmin = document.getElementById('view-admin');
    const topbarAdminBtn = document.getElementById('topbar-admin-btn');
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
        if(viewAdmin) viewAdmin.classList.add('hidden');

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
        } else if (viewName === 'admin') {
            if(viewAdmin) viewAdmin.classList.remove('hidden');
            if(fabContainer) fabContainer.classList.add('hidden');
            if(fabBackWeather) fabBackWeather.classList.add('hidden');
            initAdminPanel();
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
    if (topbarAdminBtn) topbarAdminBtn.addEventListener('click', () => switchView('admin'));
    const adminBackBtn = document.getElementById('admin-back-btn');
    if (adminBackBtn) adminBackBtn.addEventListener('click', () => switchView('dashboard'));
    if (fabCommunity) fabCommunity.addEventListener('click', () => switchView('community'));
    const notifBadge = document.getElementById('notification-badge');
    if (notifBadge) notifBadge.addEventListener('click', () => switchView('community'));
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
            if (!hasMessages) {
                messagesContainer.innerHTML = '<p class="text-center text-gray-400 text-xs py-2">No hay mensajes recientes.</p>';
                const badge = document.getElementById('notification-badge');
                if (badge) badge.classList.add('hidden');
                if (newMessageToast) newMessageToast.classList.add('hidden');
            }
            else {
                if (newestMessageTime > lastReadTime && lastReadTime > 0) {
                    if (viewCommunity.classList.contains('hidden')) {
                        if(newMessageToast) newMessageToast.classList.remove('hidden');
                        const badge = document.getElementById('notification-badge');
                        if(badge) badge.classList.remove('hidden');
                    } else { markMessagesAsRead(); }
                } else if (lastReadTime === 0 && newestMessageTime > 0) {
                    localStorage.setItem('lastReadTime', now);
                } else {
                    // Mensajes leídos — ocultar badge por si quedó visible
                    const badge = document.getElementById('notification-badge');
                    if (badge) badge.classList.add('hidden');
                    if (newMessageToast) newMessageToast.classList.add('hidden');
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
    
    async function fetchWeatherData(silent = false) {
        if (!silent) showSkeletons(true);
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

                // Historial de viento
                if (windSpeedValue !== null) updateWindHistory(windSpeedValue);
                
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
    
    // --- HISTORIAL DE VIENTO (Firebase) ---
    const windHistoryCollection = db ? collection(db, 'wind_history') : null;
    let lastHistoryWrite = 0;

    function windColor(spd) {
        if (spd <= 14) return '#93c5fd';
        if (spd <= 16) return '#67e8f9';
        if (spd <= 19) return '#86efac';
        if (spd <= 22) return '#fde047';
        if (spd <= 27) return '#fb923c';
        return '#f87171';
    }

    function renderWindChart(docs) {
        const container = document.getElementById('wind-history-chart');
        const minEl = document.getElementById('history-min');
        const maxEl = document.getElementById('history-max');
        const trendEl = document.getElementById('history-trend');
        if (!container || docs.length < 2) return;

        const W = container.clientWidth || 300;
        const H = 64;
        const pad = 4;
        const values = docs.map(d => d.v);
        const minV = Math.max(0, Math.min(...values) - 2);
        const maxV = Math.max(...values) + 2;
        const range = maxV - minV || 1;

        if (minEl) minEl.textContent = Math.min(...values).toFixed(1);
        if (maxEl) maxEl.textContent = Math.max(...values).toFixed(1);

        if (trendEl && values.length >= 10) {
            const recent = values.slice(-5).reduce((a,b) => a+b,0) / 5;
            const before = values.slice(-10,-5).reduce((a,b) => a+b,0) / 5;
            const diff = recent - before;
            if (diff > 0.5)       { trendEl.textContent = '↑ Subiendo'; trendEl.className = 'text-[10px] font-black text-orange-500'; }
            else if (diff < -0.5) { trendEl.textContent = '↓ Bajando'; trendEl.className = 'text-[10px] font-black text-blue-400'; }
            else                  { trendEl.textContent = '→ Estable'; trendEl.className = 'text-[10px] font-black text-green-500'; }
        }

        const toX = (i) => pad + (i / (docs.length - 1)) * (W - pad * 2);
        const toY = (v) => H - pad - ((v - minV) / range) * (H - pad * 2);
        const points = docs.map((d, i) => `${toX(i)},${toY(d.v)}`).join(' ');
        const areaPath = `M${toX(0)},${H} ` + docs.map((d,i) => `L${toX(i)},${toY(d.v)}`).join(' ') + ` L${toX(docs.length-1)},${H} Z`;
        const lastColor = windColor(values[values.length - 1]);

        // Etiquetas de hora reales en el eje X — siempre 6 horas atrás
        const labelsEl = document.getElementById('history-time-labels');
        if (labelsEl) {
            const fmt = (ms) => {
                const d = new Date(ms);
                return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
            };
            const now = Date.now();
            const sixH = 6 * 60 * 60 * 1000;
            labelsEl.innerHTML =
                `<span>${fmt(now - sixH)}</span>` +
                `<span>${fmt(now - sixH * 2/3)}</span>` +
                `<span>${fmt(now - sixH * 1/3)}</span>` +
                `<span>ahora</span>`;
        }

        container.innerHTML = `
            <svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="wh-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="${lastColor}" stop-opacity="0.35"/>
                        <stop offset="100%" stop-color="${lastColor}" stop-opacity="0.03"/>
                    </linearGradient>
                </defs>
                <path d="${areaPath}" fill="url(#wh-grad)"/>
                <polyline points="${points}" fill="none" stroke="${lastColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
                <circle cx="${toX(docs.length-1)}" cy="${toY(values[values.length-1])}" r="3" fill="${lastColor}" stroke="white" stroke-width="1.5"/>
            </svg>`;
    }

    async function updateWindHistory(speed) {
        if (!windHistoryCollection) return;
        const now = Date.now();
        // Escribir máximo una vez cada 25 segundos
        if (now - lastHistoryWrite < 25000) return;
        lastHistoryWrite = now;
        try {
            await addDoc(windHistoryCollection, { v: speed, t: serverTimestamp() });
        } catch(e) { console.warn('wind_history write error', e); }
    }

    // Suscripción en tiempo real a las últimas 6 horas
    if (windHistoryCollection) {
        const sixHoursAgo = Timestamp.fromMillis(Date.now() - 6 * 3600000);
        const historyQuery = query(
            windHistoryCollection,
            where('t', '>', sixHoursAgo),
            orderBy('t', 'asc'),
            limit(720)
        );
        onSnapshot(historyQuery, (snapshot) => {
            const docs = snapshot.docs.map(d => ({ ...d.data() }));
            if (docs.length >= 2) renderWindChart(docs);
        });
    }

    fetchWeatherData();
    setInterval(() => fetchWeatherData(true), 30000);
    setInterval(updateTimeAgo, 5000);

    // Refrescar datos al volver al foco (unlock, cambio de app, etc.)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            fetchWeatherData(true); // silencioso — sin skeletons
        }
    });

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
                        <h4 class="font-bold text-gray-800 text-sm ${isVendido ? 'line-through' : ''}">${c.title}</h4>
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
    // PANEL DE ADMINISTRADOR
    // ============================================

    // Acordeones del panel admin — carga lazy al abrir
    document.querySelectorAll('.admin-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const body = document.getElementById(targetId);
            if (!body) return;
            const wasHidden = body.classList.contains('hidden');
            body.classList.toggle('hidden');
            if (wasHidden) {
                if (targetId === 'admin-body-vip') initAdminVip2();
                else if (targetId === 'admin-body-pagos') loadAdminPaymentLog();
                else if (targetId === 'admin-body-chat') loadAdminMessages();
                else if (targetId === 'admin-body-galeria') loadAdminGallery();
                else if (targetId === 'admin-body-clasificados') loadAdminClassifieds();
                else if (targetId === 'admin-body-suscriptores') loadAdminSubscribers();
            }
        });
    });

    async function loadAdminStats() {
        const sets = [
            { id: 'stat-vip',          col: 'kiter_vip',              filter: where('active', '==', true) },
            { id: 'stat-telegram',     col: 'telegram_subscribers',   filter: null },
            { id: 'stat-whatsapp',     col: 'greenapi_subscribers',   filter: null },
            { id: 'stat-mensajes',     col: 'kiter_board',            filter: null },
            { id: 'stat-fotos',        col: 'daily_gallery_meta',     filter: null },
            { id: 'stat-clasificados', col: 'classifieds',            filter: null },
        ];
        for (const s of sets) {
            const el = document.getElementById(s.id);
            if (!el) continue;
            try {
                const q = s.filter ? query(collection(db, s.col), s.filter) : collection(db, s.col);
                const snap = await getDocs(q);
                el.textContent = snap.size;
            } catch(e) { el.textContent = '?'; }
        }
        // Visitantes únicos y con cuenta
        try {
            const snapVisitantes = await getDocs(collection(db, 'app_devices'));
            const elV = document.getElementById('stat-visitantes');
            const elR = document.getElementById('stat-registrados');
            if (elV) elV.textContent = snapVisitantes.size;
            if (elR) elR.textContent = snapVisitantes.docs.filter(d => d.data().userId).length;
        } catch(e) {
            const elV = document.getElementById('stat-visitantes');
            const elR = document.getElementById('stat-registrados');
            if (elV) elV.textContent = '?';
            if (elR) elR.textContent = '?';
        }
    }


    let adminVip2Unsubscribe = null;

    function initAdminVip2() {
        const list = document.getElementById('admin-vip-list2');
        if (!list || adminVip2Unsubscribe) return;
        adminVip2Unsubscribe = onSnapshot(
            query(collection(db, 'kiter_vip'), where('active', '==', true)),
            snap => {
                if (snap.empty) { list.innerHTML = '<p class="text-xs text-gray-400">Sin VIPs activos.</p>'; return; }
                list.innerHTML = snap.docs.map(d => {
                    const email = d.data().email || d.id;
                    return `<div class="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-3 py-2 gap-2">
                        <p class="text-xs text-gray-700 truncate">${email}</p>
                        <button onclick="adminQuitarVip('${d.id}')" class="text-red-500 text-xs font-bold hover:underline shrink-0">Quitar</button>
                    </div>`;
                }).join('');
            },
            e => console.warn('Error admin VIP2:', e)
        );
    }

    const adminVipAdd2 = document.getElementById('admin-vip-add2');
    const adminVipEmail2 = document.getElementById('admin-vip-email2');
    const adminVipFeedback2 = document.getElementById('admin-vip-feedback2');

    function showAdminFeedback2(msg, type) {
        if (!adminVipFeedback2) return;
        adminVipFeedback2.textContent = msg;
        adminVipFeedback2.className = `text-[10px] text-center mb-3 ${type === 'ok' ? 'text-green-600' : 'text-red-500'}`;
        adminVipFeedback2.classList.remove('hidden');
        setTimeout(() => adminVipFeedback2.classList.add('hidden'), 3000);
    }

    if (adminVipAdd2) adminVipAdd2.addEventListener('click', async () => {
        const email = adminVipEmail2?.value.trim().toLowerCase();
        if (!email || !email.includes('@')) { showAdminFeedback2('Email inválido', 'error'); return; }
        adminVipAdd2.disabled = true;
        try {
            const docId = email.replace(/[.#$[\]@]/g, '_');
            await setDoc(doc(db, 'kiter_vip', docId), { email, active: true, status: 'authorized', manual: true }, { merge: true });
            showAdminFeedback2(`VIP activado: ${email}`, 'ok');
            if (adminVipEmail2) adminVipEmail2.value = '';
        } catch(e) { showAdminFeedback2('Error al dar VIP', 'error'); }
        finally { adminVipAdd2.disabled = false; }
    });

    async function loadAdminPaymentLog() {
        const list = document.getElementById('admin-pagos-list');
        if (!list) return;
        list.innerHTML = '<p class="text-xs text-gray-400">Cargando...</p>';
        try {
            const snap = await getDocs(query(collection(db, 'mp_webhook_log'), orderBy('timestamp', 'desc'), limit(20)));
            if (snap.empty) { list.innerHTML = '<p class="text-xs text-gray-400">Sin registros.</p>'; return; }
            list.innerHTML = snap.docs.map(d => {
                const data = d.data();
                const fecha = data.timestamp?.toDate ? data.timestamp.toDate().toLocaleString('es-AR') : '';
                const color = data.result === 'ok' ? 'text-green-600' : 'text-red-500';
                return `<div class="bg-white border border-gray-200 rounded-xl px-3 py-2">
                    <div class="flex justify-between items-center gap-2">
                        <p class="text-xs font-bold ${color}">${(data.result || '?').toUpperCase()} — ${data.status || ''}</p>
                        <p class="text-[10px] text-gray-400 shrink-0">${fecha}</p>
                    </div>
                    <p class="text-[11px] text-gray-600 truncate">${data.payer_email || data.preapproval_id || ''}</p>
                    ${data.reason ? `<p class="text-[10px] text-orange-500">${data.reason}</p>` : ''}
                </div>`;
            }).join('');
        } catch(e) { list.innerHTML = '<p class="text-xs text-red-400">Error al cargar.</p>'; }
    }

    async function loadAdminMessages() {
        const list = document.getElementById('admin-chat-list');
        if (!list) return;
        list.innerHTML = '<p class="text-xs text-gray-400">Cargando...</p>';
        try {
            const snap = await getDocs(query(collection(db, 'kiter_board'), orderBy('timestamp', 'desc'), limit(30)));
            if (snap.empty) { list.innerHTML = '<p class="text-xs text-gray-400">Sin mensajes.</p>'; return; }
            list.innerHTML = snap.docs.map(d => {
                const data = d.data();
                const texto = (data.text || data.message || '').substring(0, 80);
                const autor = data.displayName || data.userName || 'anon';
                return `<div class="flex items-start justify-between bg-white border border-gray-200 rounded-xl px-3 py-2 gap-2">
                    <div class="min-w-0">
                        <p class="text-[10px] font-bold text-gray-500">${autor}</p>
                        <p class="text-xs text-gray-700 break-words">${texto}</p>
                    </div>
                    <button onclick="adminDeleteMessage('${d.id}')" class="text-red-500 text-xs hover:text-red-700 shrink-0">✕</button>
                </div>`;
            }).join('');
        } catch(e) { list.innerHTML = '<p class="text-xs text-red-400">Error al cargar.</p>'; }
    }

    window.adminDeleteMessage = async (id) => {
        if (!confirm('¿Eliminar este mensaje?')) return;
        try { await deleteDoc(doc(db, 'kiter_board', id)); loadAdminMessages(); }
        catch(e) { console.error('Error eliminando mensaje:', e); }
    };

    const adminChatClear = document.getElementById('admin-chat-clear');
    if (adminChatClear) adminChatClear.addEventListener('click', async () => {
        if (!confirm('¿Limpiar TODOS los mensajes del chat?')) return;
        try {
            const snap = await getDocs(collection(db, 'kiter_board'));
            await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
            loadAdminMessages();
        } catch(e) { console.error('Error limpiando chat:', e); }
    });

    async function loadAdminGallery() {
        const list = document.getElementById('admin-galeria-list');
        if (!list) return;
        list.innerHTML = '<p class="text-xs text-gray-400 col-span-3">Cargando...</p>';
        try {
            const snap = await getDocs(query(collection(db, 'daily_gallery_meta'), orderBy('uploadedAt', 'desc'), limit(30)));
            if (snap.empty) { list.innerHTML = '<p class="text-xs text-gray-400 col-span-3">Sin fotos.</p>'; return; }
            list.innerHTML = snap.docs.map(d => {
                const url = d.data().url || '';
                return `<div class="relative group">
                    <img src="${url}" class="w-full aspect-square object-cover rounded-xl" loading="lazy">
                    <button onclick="adminDeletePhoto('${d.id}')" class="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                </div>`;
            }).join('');
        } catch(e) { list.innerHTML = '<p class="text-xs text-red-400 col-span-3">Error al cargar.</p>'; }
    }

    window.adminDeletePhoto = async (id) => {
        if (!confirm('¿Eliminar esta foto?')) return;
        try { await deleteDoc(doc(db, 'daily_gallery_meta', id)); loadAdminGallery(); }
        catch(e) { console.error('Error eliminando foto:', e); }
    };

    const adminGaleriaClear = document.getElementById('admin-galeria-clear');
    if (adminGaleriaClear) adminGaleriaClear.addEventListener('click', async () => {
        if (!confirm('¿Limpiar TODA la galería?')) return;
        try {
            const snap = await getDocs(collection(db, 'daily_gallery_meta'));
            await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
            loadAdminGallery();
        } catch(e) { console.error('Error limpiando galería:', e); }
    });

    async function loadAdminClassifieds() {
        const list = document.getElementById('admin-clasificados-list');
        if (!list) return;
        list.innerHTML = '<p class="text-xs text-gray-400">Cargando...</p>';
        try {
            const snap = await getDocs(query(collection(db, 'classifieds'), orderBy('createdAt', 'desc'), limit(30)));
            if (snap.empty) { list.innerHTML = '<p class="text-xs text-gray-400">Sin clasificados.</p>'; return; }
            list.innerHTML = snap.docs.map(d => {
                const data = d.data();
                const titulo = (data.title || data.titulo || '(sin título)').substring(0, 50);
                const autor = data.sellerName || data.userName || 'anon';
                return `<div class="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-3 py-2 gap-2">
                    <div class="min-w-0">
                        <p class="text-xs font-bold text-gray-800 truncate">${titulo}</p>
                        <p class="text-[10px] text-gray-400">${autor}</p>
                    </div>
                    <button onclick="adminDeleteClassified('${d.id}')" class="text-red-500 text-xs font-bold hover:underline shrink-0">Borrar</button>
                </div>`;
            }).join('');
        } catch(e) { list.innerHTML = '<p class="text-xs text-red-400">Error al cargar.</p>'; }
    }

    window.adminDeleteClassified = async (id) => {
        if (!confirm('¿Eliminar este clasificado?')) return;
        try { await deleteDoc(doc(db, 'classifieds', id)); loadAdminClassifieds(); }
        catch(e) { console.error('Error eliminando clasificado:', e); }
    };

    async function loadAdminSubscribers() {
        const telegramList = document.getElementById('admin-telegram-list');
        const whatsappList = document.getElementById('admin-whatsapp-list');
        if (telegramList) {
            telegramList.innerHTML = '<p class="text-xs text-gray-400">Cargando...</p>';
            try {
                const snap = await getDocs(collection(db, 'telegram_subscribers'));
                if (snap.empty) { telegramList.innerHTML = '<p class="text-xs text-gray-400">Sin suscriptores.</p>'; }
                else {
                    telegramList.innerHTML = snap.docs.map(d => {
                        const data = d.data();
                        return `<div class="bg-white border border-gray-200 rounded-xl px-3 py-1.5">
                            <p class="text-xs text-gray-700">${data.chatId || d.id}</p>
                            ${data.firstName ? `<p class="text-[10px] text-gray-400">${data.firstName}</p>` : ''}
                        </div>`;
                    }).join('');
                }
            } catch(e) { telegramList.innerHTML = '<p class="text-xs text-red-400">Error.</p>'; }
        }
        if (whatsappList) {
            whatsappList.innerHTML = '<p class="text-xs text-gray-400">Cargando...</p>';
            try {
                const snap = await getDocs(collection(db, 'greenapi_subscribers'));
                if (snap.empty) { whatsappList.innerHTML = '<p class="text-xs text-gray-400">Sin suscriptores.</p>'; }
                else {
                    whatsappList.innerHTML = snap.docs.map(d => {
                        const data = d.data();
                        return `<div class="bg-white border border-gray-200 rounded-xl px-3 py-1.5">
                            <p class="text-xs text-gray-700">${data.chatId || d.id}</p>
                        </div>`;
                    }).join('');
                }
            } catch(e) { whatsappList.innerHTML = '<p class="text-xs text-red-400">Error.</p>'; }
        }
    }

    const adminTestAlertBtn = document.getElementById('admin-test-alert');
    const adminTestAlertResult = document.getElementById('admin-test-alert-result');
    if (adminTestAlertBtn) adminTestAlertBtn.addEventListener('click', async () => {
        adminTestAlertBtn.disabled = true;
        adminTestAlertBtn.textContent = 'Enviando...';
        if (adminTestAlertResult) adminTestAlertResult.classList.add('hidden');
        try {
            const res = await fetch('/api/telegram-alert?test=true');
            const json = await res.json();
            if (adminTestAlertResult) {
                adminTestAlertResult.textContent = json.ok ? '✅ Alerta enviada correctamente' : `⚠️ ${JSON.stringify(json)}`;
                adminTestAlertResult.className = `text-[10px] text-center mt-2 ${json.ok ? 'text-green-600' : 'text-orange-500'}`;
                adminTestAlertResult.classList.remove('hidden');
            }
        } catch(e) {
            if (adminTestAlertResult) {
                adminTestAlertResult.textContent = `❌ Error: ${e.message}`;
                adminTestAlertResult.className = 'text-[10px] text-center mt-2 text-red-500';
                adminTestAlertResult.classList.remove('hidden');
            }
        } finally {
            adminTestAlertBtn.disabled = false;
            adminTestAlertBtn.textContent = '⚡ Enviar alerta de prueba';
        }
    });


    let adminPanelInitialized = false;
    function initAdminPanel() {
        loadAdminStats();
        if (!adminPanelInitialized) {
            adminPanelInitialized = true;
        }
    }

    // ============================================
    // TABS GALERÍA: FOTOS / VIDEOS
    // ============================================
    const tabFotos = document.getElementById('tab-fotos');
    const tabVideos = document.getElementById('tab-videos');
    const contentFotos = document.getElementById('content-fotos');
    const contentVideos = document.getElementById('content-videos');

    if (tabFotos && tabVideos && contentFotos && contentVideos) {
        // Función para cambiar de tab
        function switchTab(tab) {
            // Resetear todos los tabs
            [tabFotos, tabVideos].forEach(t => {
                t.classList.remove('border-blue-600', 'text-blue-600');
                t.classList.add('border-transparent', 'text-gray-500');
            });
            
            // Ocultar todo el contenido
            [contentFotos, contentVideos].forEach(c => c.classList.add('hidden'));
            
            // Activar tab seleccionado
            if (tab === 'fotos') {
                tabFotos.classList.remove('border-transparent', 'text-gray-500');
                tabFotos.classList.add('border-blue-600', 'text-blue-600');
                contentFotos.classList.remove('hidden');
            } else if (tab === 'videos') {
                tabVideos.classList.remove('border-transparent', 'text-gray-500');
                tabVideos.classList.add('border-blue-600', 'text-blue-600');
                contentVideos.classList.remove('hidden');
            }
        }

        // Event listeners
        tabFotos.addEventListener('click', () => switchTab('fotos'));
        tabVideos.addEventListener('click', () => switchTab('videos'));
        
        // Por defecto mostrar fotos
        switchTab('fotos');
    }

});
} catch (e) {
    console.error("❌ Error inicializando Firebase:", e);
}