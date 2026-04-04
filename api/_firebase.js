// Módulo compartido de Firebase Admin para funciones serverless
// Inicializa Firebase Admin SDK una sola vez

import admin from 'firebase-admin';

let db = null;

let firebaseInitialized = false;
let firebaseError = null;

function initFirebase() {
    if (admin.apps.length === 0) {
        const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
        
        if (!serviceAccount) {
            firebaseError = 'FIREBASE_SERVICE_ACCOUNT no configurado';
            console.error(firebaseError);
            return null;
        }
        
        try {
            const credentials = JSON.parse(serviceAccount);
            admin.initializeApp({
                credential: admin.credential.cert(credentials)
            });
            firebaseInitialized = true;
        } catch (error) {
            firebaseError = 'Error parseando credenciales de Firebase: ' + error.message;
            console.error(firebaseError);
            return null;
        }
    }
    
    db = admin.firestore();
    return db;
}

// Colección de suscriptores de Telegram
const SUBSCRIBERS_COLLECTION = 'telegram_subscribers';

// Obtener todos los suscriptores activos
export async function getSubscribers() {
    const firestore = initFirebase();
    if (!firestore) return [];
    
    try {
        const snapshot = await firestore.collection(SUBSCRIBERS_COLLECTION)
            .where('active', '==', true)
            .get();
        
        return snapshot.docs.map(doc => ({
            chatId: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error obteniendo suscriptores:', error);
        return [];
    }
}

// Agregar o actualizar suscriptor
export async function addSubscriber(chatId, userData) {
    const firestore = initFirebase();
    if (!firestore) return false;
    
    try {
        await firestore.collection(SUBSCRIBERS_COLLECTION).doc(String(chatId)).set({
            chatId: chatId,
            firstName: userData.firstName || 'Kitero',
            username: userData.username || null,
            active: true,
            subscribedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastActivity: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        return true;
    } catch (error) {
        console.error('Error agregando suscriptor:', error);
        return false;
    }
}

// Desactivar suscriptor (idempotente - funciona aunque no exista)
export async function removeSubscriber(chatId) {
    const firestore = initFirebase();
    if (!firestore) return false;
    
    try {
        await firestore.collection(SUBSCRIBERS_COLLECTION).doc(String(chatId)).set({
            chatId: chatId,
            active: false,
            unsubscribedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return true;
    } catch (error) {
        console.error('Error removiendo suscriptor:', error);
        return false;
    }
}

// Actualizar última actividad
export async function updateSubscriberActivity(chatId) {
    const firestore = initFirebase();
    if (!firestore) return false;
    
    try {
        await firestore.collection(SUBSCRIBERS_COLLECTION).doc(String(chatId)).set({
            lastActivity: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return true;
    } catch (error) {
        return false;
    }
}

export { initFirebase };
