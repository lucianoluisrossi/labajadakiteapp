// Módulo compartido: suscripciones de Google Play (app Android / TWA) vía Google Play Developer API.
// Credencial: cuenta de servicio con acceso a la app en Play Console (PLAY_SERVICE_ACCOUNT, o la de Firebase).

import crypto from 'node:crypto';

export const PLAY_PACKAGE = process.env.PLAY_PACKAGE_NAME || 'app.labajadakite.twa';
export const PLAY_PRODUCT_ID = process.env.PLAY_PRODUCT_ID || 'vip_mensual';
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PLAY_PACKAGE}/purchases`;

// Estados en los que el usuario tiene derecho al VIP (CANCELED = no renueva, pero el período pago sigue)
const ENTITLED_STATES = ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED'];

export const playTokenId = (purchaseToken) => crypto.createHash('sha256').update(purchaseToken).digest('hex');

let cachedToken = null;

// OAuth2 de cuenta de servicio (JWT firmado RS256) con el scope de androidpublisher
async function getAccessToken() {
    if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
    const sa = JSON.parse(process.env.PLAY_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT);
    const now = Math.floor(Date.now() / 1000);
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/androidpublisher',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    })}`;
    const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), sa.private_key).toString('base64url');
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
    });
    if (!res.ok) throw new Error(`Google OAuth ${res.status}`);
    const { access_token, expires_in } = await res.json();
    cachedToken = { token: access_token, exp: Date.now() + expires_in * 1000 };
    return access_token;
}

// null si Google no reconoce el token (4xx permanente); lanza error si la falla es transitoria
export async function getPlaySubscription(purchaseToken) {
    const res = await fetch(`${API}/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`, {
        headers: { Authorization: `Bearer ${await getAccessToken()}` },
    });
    if ([400, 404, 410].includes(res.status)) return null;
    if (!res.ok) throw new Error(`Play API ${res.status}`);
    return res.json();
}

// Sin acknowledge dentro de 3 días, Google reembolsa la compra
export async function acknowledgePlaySubscription(purchaseToken) {
    const res = await fetch(`${API}/subscriptions/${PLAY_PRODUCT_ID}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' },
        body: '{}',
    });
    if (!res.ok) throw new Error(`Play acknowledge ${res.status}`);
}

// { active, vip_until, needsAck } a partir de un SubscriptionPurchaseV2
export function readPlaySubscription(sub) {
    const item = sub?.lineItems?.find(i => i.productId === PLAY_PRODUCT_ID);
    const vip_until = item?.expiryTime ? new Date(item.expiryTime).toISOString() : null;
    const active = !!item && ENTITLED_STATES.includes(sub.subscriptionState) && !!vip_until && vip_until > new Date().toISOString();
    return { active, vip_until, needsAck: active && sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING' };
}
