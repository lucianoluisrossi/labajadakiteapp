# La Bajada Kitesurf App — Contexto del Proyecto

## Stack
- **Frontend**: Vanilla JS, Tailwind CSS v3.4 (CDN), HTML/CSS SPA
- **Backend**: Vercel Serverless Functions (`/api/*.js`, ES Modules)
- **Base de datos**: Firebase Firestore (tiempo real)
- **Auth**: Firebase Auth (Google Sign-In)
- **Hosting**: Vercel → dominio `labajadakite.app`
- **Repositorio**: `github.com/lucianoluisrossi/labajadakiteapp`

---

## Variables de entorno (Vercel)

| Variable | Uso |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | JSON credenciales Firebase Admin SDK (debe pegarse sin comillas extras) |
| `ECOWITT_API_KEY` / `ECOWITT_APP_KEY` / `ECOWITT_MAC` | Estación meteorológica Ecowitt |
| `TELEGRAM_BOT_TOKEN` | Bot `@Labajadabot` |
| `TELEGRAM_CHAT_ID` | Canal `@labajadaWindAlert` |
| `GREENAPI_INSTANCE_ID` / `GREENAPI_TOKEN` | Green API (WhatsApp) |
| `GREENAPI_GROUP_ID` | ID del grupo WhatsApp destino |
| `MP_ACCESS_TOKEN` | MercadoPago — token de **producción** (`APP_USR-...`) |
| `MP_PLAN_ID` | `947a5399fa3c4350b9e1e48ea33714e2` — plan producción $5.000/mes |
| `WINDY_API_KEY` | Pronóstico Windy |

---

## Colecciones Firestore

| Colección | Descripción |
|---|---|
| `kiter_board` | Mensajes del chat comunitario |
| `daily_gallery_meta` | Fotos de la galería diaria |
| `classifieds` | Clasificados de equipos |
| `wind_history` | Lecturas de viento (campo `v`: velocidad, `t`: timestamp) |
| `telegram_alerts` | Control anti-spam alertas (`last_alert` doc) |
| `telegram_subscribers` | Suscriptores bot Telegram individual |
| `greenapi_subscribers` | Suscriptores WhatsApp on-demand (Green API) |
| `kiter_vip` | Suscriptores VIP (`email`, `active`, `status`, `preapproval_id`) |
| `usuarios` | Perfiles de usuario (`role: "admin"`, `mp_email`) |
| `novedades` | Novedades del spot (`titulo`, `texto`, `fecha`, `creadoPor`) |
| `mp_webhook_log` | Log persistente de cada evento recibido del webhook de MP (`type`, `payer_email`, `status`, `active`, `result`, `reason`, `timestamp`) |

---

## Archivos principales

### `/index.html`
- SPA principal
- Secciones: viento hero, historial 6hs, novedades, alertas, escuelas kite, comunidad, galería, clasificados, windguru
- Modales: VIP, novedad (crear/editar), novedad completa (leer)
- Panel admin VIP (colapsable, solo visible para `role: "admin"`)
- Botón MP tiene `onclick="localStorage.setItem('mpCheckoutStarted','true')"` para detectar retorno del checkout

### `/app.js`
- Toda la lógica del cliente
- `currentUser` — usuario Firebase Auth activo
- `currentUserIsVip` — booleano sincronizado en tiempo real con `onSnapshot` a `kiter_vip`
- `fetchWeatherData(silent)` — carga datos Ecowitt. `silent=true` no muestra skeletons
- `updateVipUI(user)` — chequea VIP pasando `email` + `uid` al endpoint
- `updateNovedadesAdminUI(user)` — lee `usuarios/{uid}.role`, activa controles admin si es `"admin"`
- `renderNovedades(docs)` — renderiza cards con truncado a 120 chars + botón "Ver más"
- `updateNovedadBadge(docs)` — muestra punto pulsante si hay novedad no leída (localStorage `novedadLastSeen`)
- `window.editNovedad(id)` / `window.deleteNovedad(id)` / `window.verNovedadCompleta(id)` — globales para botones inline
- `window.adminQuitarVip(docId)` — quita VIP desde panel admin
- Panel admin VIP colapsable con `onSnapshot` a `kiter_vip` donde `active == true`
- Refresh silencioso en `visibilitychange` (volver de otra app o desbloqueo)
- Modal VIP: nunca se muestra a usuarios VIP. La decisión de mostrar usa `onSnapshot` (no el fetch HTTP) para evitar race conditions
- Al volver del checkout de MP (`localStorage.mpCheckoutStarted`), destaca el campo de email alternativo

### `/sw.js`
- Service Worker v3 (`labajada-cache-v3`)
- Cache-first para assets estáticos (HTML, JS, CSS, logos, imágenes)
- Network-first para `/api/*`
- Caché de: `index.html`, `app.js`, `style.css`, `manifest.json`, `logo.png`, `logo-mariana.png`, `logo3.jpg`, `ux-improvements.js`
- **No tiene push notifications** — sistema web push fue eliminado

### `/api/telegram-alert.js`
- Cron `*/15 * * * *` — verifica condiciones y envía alertas
- Condiciones: promedio ≥14 kts en últimas 30min, dirección on-shore, hora 9-19hs AR (UTC-3)
- Anti-spam: 1 alerta cada 3hs (doc `telegram_alerts/last_alert`)
- Envía a: canal Telegram + grupo/contactos WhatsApp via Green API + suscriptores `greenapi_subscribers`
- `?test=true` bypasea todas las condiciones
- Mensaje EPICOOO si dirección es E o ESE

### `/api/greenapi-webhook.js`
- Recibe mensajes entrantes de WhatsApp via Green API
- Palabras clave para suscribir: `hola`, `join`, `quiero`, `suscribir`, `alertas`, `start`, `si`, `sí`
- Palabras clave para desuscribir: `stop`, `chau`, `salir`, `basta`, `cancelar`, `no`
- Ignora mensajes de grupos (`chatId.endsWith('@g.us')`)
- Guarda en colección `greenapi_subscribers`

### `/api/vip-status.js`
- `GET /api/vip-status?email=X&uid=Y`
- Busca en `kiter_vip` por email de la app
- Si tiene `uid`, lee `usuarios/{uid}.mp_email` y chequea ese email también
- Consulta MP API si no encuentra en Firestore, y si encuentra crea el doc automáticamente

### `/api/mp-webhook.js`
- Recibe notificaciones de MercadoPago (`subscription_preapproval`)
- Guarda/actualiza doc en `kiter_vip` con `email`, `status`, `active`, `payer_id`
- Guarda log en `mp_webhook_log` con resultado de cada evento
- Si las credenciales de Firebase fallan: error visible en Vercel Logs y sin doc en `mp_webhook_log`

---

## Features implementadas

### Datos de viento
- Estación Ecowitt en tiempo real, refresh cada 30s (silencioso)
- Historial 6hs con gráfico SVG y etiquetas horarias reales
- Refresh silencioso al volver al foco (sin skeletons)

### Autenticación
- Google Sign-In via Firebase Auth
- Botón **ÚNITE** en topbar — obliga login, luego decide si mostrar modal VIP
- Botones de alertas (WhatsApp/Telegram): si es VIP abre el link directo, si no abre modal VIP

### Kiter VIP
- Suscripción $5.000/mes via MercadoPago (plan producción con crédito + débito + account_money)
- Badge `🪁 VIP` en topbar, actualizado en tiempo real vía `onSnapshot`
- Modal VIP: 1 vez/día para no-VIP, nunca para VIP (verificado en Firestore antes de mostrar)
- Sección de email alternativo de MP siempre visible en el modal
- Al volver del checkout sin VIP activo: campo resaltado con mensaje específico
- **Panel admin** (solo `role: "admin"`): dar/quitar VIP por email, lista en tiempo real
- Logs de webhooks en `mp_webhook_log` para diagnóstico

### Novedades del Spot
- Header degradado naranja/ámbar visible
- Punto blanco pulsante cuando hay novedad no leída
- Textos largos truncados a 120 chars con modal "Ver más"
- Admin puede crear, editar y eliminar novedades

### Alertas de viento
- **Telegram**: canal `@labajadaWindAlert` (usuario se une desde el botón)
- **WhatsApp**: via Green API, instancia `+34 637 499 277`
  - Botón en app abre WhatsApp con texto `Suscribirme a alertas`
  - Webhook maneja suscripciones on-demand
- ~~Web Push~~ — eliminado (dead code, nunca completado)

### Comunidad
- Chat en tiempo real (Firestore `kiter_board`)
- Galería de fotos diaria
- Clasificados de equipos

---

## Diagnóstico de pagos MP

Si un usuario pagó y no se activó el VIP:

1. Revisar **Firestore → `mp_webhook_log`**: ¿hay un doc reciente?
   - `result: "error"` → ver campo `reason`
   - Sin docs → el webhook nunca llegó
2. Si no llegó: buscar el `preapproval_id` del usuario vía MP API y ejecutar manualmente:
```powershell
$headers = @{ "Content-Type" = "application/json" }
$body = '{"type":"subscription_preapproval","data":{"id":"ID_REAL"}}'
Invoke-RestMethod -Uri "https://labajadakite.app/api/mp-webhook" -Method POST -Headers $headers -Body $body
```
3. Para buscar el ID por email:
```powershell
$headers = @{ "Authorization" = "Bearer MP_ACCESS_TOKEN" }
Invoke-RestMethod -Uri "https://api.mercadopago.com/preapproval/search?payer_email=EMAIL" -Method GET -Headers $headers | ConvertTo-Json -Depth 5
```

---

## Roles de usuario en Firestore

Para dar rol admin a un usuario:
```
Colección: usuarios
Documento: {UID de Firebase Auth}
Campo: role → "admin" (string)
```

Para dar VIP manualmente desde admin panel o directo en Firestore:
```
Colección: kiter_vip
Documento: email_reemplazando_puntos_y_arroba_por_guion_bajo
Campos: email, active: true, status: "authorized"
```

---

## Configuración externa

| Servicio | Estado | Detalle |
|---|---|---|
| Firebase Auth | ✅ | `labajadakite.app` en Authorized Domains |
| Green API webhook | ✅ | `https://labajadakite.app/api/greenapi-webhook` |
| MercadoPago webhooks | ✅ | URL producción + eventos: Planes y suscripciones + Pagos |
| MercadoPago credenciales | ✅ | Token y plan de producción configurados en Vercel |
| Vercel dominio | ✅ | `labajadakite.app` activo |

---

## Dirección del viento — on-shore en La Bajada (Claromecó)

**Favorables (on-shore):**
`ENE, E, ESE, SE, SSE, S, SSO, SO, OSO, O, ONO`

**No favorables (off-shore):**
`N, NE, NO, NNE, NNO`

E y ESE → status **EPICOOO** en el mensaje de alerta
