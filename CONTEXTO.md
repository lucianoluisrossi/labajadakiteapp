# La Bajada Kitesurf App — Contexto del Proyecto

## Stack
- **Frontend**: Vanilla JS, Tailwind CSS v3.4 (CDN), HTML/CSS SPA
- **Backend**: Vercel Serverless Functions (`/api/*.js`, ES Modules)
- **Base de datos**: Firebase Firestore (tiempo real)
- **Auth**: Firebase Auth (Google Sign-In)
- **Hosting**: Vercel → dominio `labajadakite.app` (redirige a `www.labajadakite.app`)
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
| `MP_PLAN_ID` | `947a5399fa3c4350b9e1e48ea33714e2` — plan producción $5.000/mes. El webhook ignora suscripciones de otro plan |
| `MP_WEBHOOK_SECRET` | Clave secreta de Webhooks de MP (Tus integraciones → Webhooks). Valida `x-signature`; por ahora solo se registra |
| `RESEND_API_KEY` | Emails (Resend): invitación VIP y campañas. Plan gratis: 100/día, 3.000/mes |
| `EMAIL_UNSUB_SECRET` | Opcional. Firma de los links de baja de emails (si falta, se usa `RESEND_API_KEY`) |
| `CRON_SECRET` | Opcional. Si existe, `/api/vip-expire` la exige (Vercel la manda sola en los crons) |
| `WINDY_API_KEY` | Pronóstico Windy |

---

## Colecciones Firestore

| Colección | Descripción |
|---|---|
| `kiter_board` | Mensajes del chat comunitario |
| `daily_gallery_meta` | Fotos de la galería diaria |
| `classifieds` | Clasificados de equipos |
| `wind_history` | Lecturas de viento (`v`: velocidad, `t`: hora de la lectura). **ID del doc = hora de la estación (unix seg)**: sin duplicados entre usuarios |
| `telegram_alerts` | Control anti-spam alertas (`last_alert` doc) |
| `telegram_subscribers` | Suscriptores bot Telegram individual |
| `greenapi_subscribers` | Suscriptores WhatsApp on-demand (`chatId`, `name`, `active`, `subscribedAt`) |
| `kiter_vip` | Suscriptores VIP (`email`, `active`, `status`, `preapproval_id`, `next_payment_date`, `vip_until`, `manual`). ID = email en minúsculas con `.@#$[]` → `_` |
| `mpEvents` | Un doc por notificación de MP (id = `id` del body): deduplicación, body crudo, `request_id`, `signature`, `duplicates` |
| `usuarios` | Perfiles de usuario (`role: "admin" | "editor"`, `mp_email`) |
| `novedades` | Novedades del spot (`titulo`, `texto`, `fecha`, `creadoPor`) |
| `mp_webhook_log` | Log de cada evento MP (`type`, `payer_email`, `status`, `active`, `result`, `reason`, `timestamp`) |
| `app_devices` | Registro de visitas únicas por dispositivo/usuario |

---

## Archivos principales

### `/index.html`
- SPA principal con **barra de pestañas inferior** (`#tab-bar`, reemplaza los botones flotantes). Cada vista tiene su `#hash` y el botón "atrás" vuelve a la pestaña anterior (`switchView` + `history.pushState`/`popstate`):
  - 🌬️ **Viento** (`#view-dashboard`, sin hash): selector Cámara / Vista 3D en el mismo lugar (al abrir la app siempre arranca en Cámara; la escena 3D carga solo si se elige y el video se corta mientras no se ve). Escena: bandera argentina que flamea con el viento, kites según el estado del spot y luz según la hora, aviso de demora, estado del spot, tarjeta de viento, historial 6 h y acceso a la última novedad sin leer (`#novedad-home-hint`)
  - 📈 **Pronóstico** (`#pronostico`): Windguru (se abre y carga al entrar) y datos de la estación
  - 💬 **Comunidad** (`#comunidad`): novedades completas, chat y galería
  - 🏷️ **Clasificados** (`#clasificados`): con contador de nuevos en la pestaña
  - ☰ **Más** (`#mas`): emergencias, alertas Telegram/WhatsApp y escuelas
- El modal VIP y la campaña VIP solo se muestran en la pestaña Viento
- Modales: VIP, novedad (crear/editar con checkbox de notificación WA), novedad completa (leer)
- Botón MP tiene `onclick="localStorage.setItem('mpCheckoutStarted','true')"` para detectar retorno del checkout
- **No tiene** panel VIP colapsable en el home (fue eliminado) — gestión VIP solo en panel admin
- `app.js?v=4` como cache buster

### `/app.js`
- Toda la lógica del cliente
- `currentUser` — usuario Firebase Auth activo
- `currentUserIsVip` — booleano sincronizado en tiempo real con `onSnapshot` a `kiter_vip`
- `fetchWeatherData(silent)` — carga datos Ecowitt. `silent=true` no muestra skeletons
- `updateVipUI(user)` — chequea VIP pasando `email` + `uid` al endpoint
- `updateNovedadesAdminUI(user)` — lee `usuarios/{uid}.role`; activa controles según rol
  - `role: "admin"` → `canEditNovedades = true` + muestra botón ⚙️ del panel admin
  - `role: "editor"` → `canEditNovedades = true`, sin acceso al panel admin
- `canEditNovedades` — booleano; controla botones editar/borrar en cards y botón `+`
- `renderNovedades(docs)` — renderiza cards con truncado a 120 chars + botón "Ver más"
- `updateNovedadBadge(docs)` — muestra punto pulsante si hay novedad no leída (localStorage `novedadLastSeen`)
- `window.editNovedad(id)` / `window.deleteNovedad(id)` / `window.verNovedadCompleta(id)` — globales para botones inline
- `window.adminQuitarVip(docId)` — quita VIP desde panel admin
- Panel admin (`view-admin`) — visible solo para `role: "admin"`, accesible via botón ⚙️ en topbar
- Refresh silencioso en `visibilitychange` (volver de otra app o desbloqueo)
- Modal VIP: nunca se muestra a usuarios VIP. La decisión de mostrar usa `onSnapshot` (no el fetch HTTP) para evitar race conditions
- Al volver del checkout de MP (`localStorage.mpCheckoutStarted`), destaca el campo de email alternativo
- **Panel admin JS completo**: acordeones con carga lazy, stats (VIPs, suscriptores TG/WA, mensajes, fotos, clasificados, visitantes únicos, usuarios registrados), gestión VIP, historial pagos MP, moderación chat/galería/clasificados, suscriptores con nombre y fecha, botón recordatorio VIP individual por WA

### `/sw.js`
- Service Worker v6 (`labajada-cache-v6`)
- Cache-first solo para imágenes
- Network-first para todo lo demás (HTML, JS, CSS, APIs): los deploys se ven sin borrar datos de la app
- Caché de: `index.html`, `app.js`, `style.css`, `manifest.json`, `logo.png`, `logo-mariana.png`, `logo3.jpg`, `ux-improvements.js`
- **No tiene push notifications** — sistema web push fue eliminado

### `/api/notify-novedades.js`
- `POST /api/notify-novedades` — body: `{ titulo, texto }`
- Lee todos los docs de `greenapi_subscribers` con `active: true`
- Envía mensaje WhatsApp a cada suscriptor via Green API con delay de 1s entre envíos
- Responde `{ ok: true, sent: N, total: N }`

### `/api/send-whatsapp.js`
- `POST /api/send-whatsapp` — body: `{ chatId, nombre }`
- Envía mensaje de recordatorio VIP prearmado a un suscriptor específico
- Mensaje invita al usuario a suscribirse como Kiter VIP para apoyar la app y acceder a funciones de comunidad
- Responde `{ ok: true }` o error

### `/api/telegram-alert.js`
- Cron `*/15 * * * *` — verifica condiciones y envía alertas
- Condiciones: promedio ≥14 kts en últimas 30min, dirección on-shore, hora 9-19hs AR (UTC-3)
- Anti-spam: 1 alerta cada 3hs (doc `telegram_alerts/last_alert`)
- Envía a: canal Telegram + grupo/contactos WhatsApp via Green API + suscriptores `greenapi_subscribers`
- La alerta lleva un **gráfico PNG de las últimas 2 h** (QuickChart `/chart/create`): Telegram `sendPhoto`, WhatsApp `sendFileByUrl`, texto como epígrafe. Si el gráfico o el envío con imagen falla, sale texto
- En cada corrida escribe su lectura en `wind_history` (id = hora de la estación)
- `?test=true` bypasea todas las condiciones y **envía a todos** (canal, grupos, suscriptores). Sin `ALERT_API_KEY` es público
- Mensaje EPICOOO si dirección es E o ESE

### `/api/greenapi-webhook.js`
- Recibe mensajes entrantes de WhatsApp via Green API
- **Suscripción**: solo texto exacto `suscribirme a alertas` (case-insensitive)
- **Desuscripción**: solo texto exacto `stop` (case-insensitive)
- Soporta tipos `textMessage` y `extendedTextMessage`
- Soporta payload anidado (`messageData.*`) y plano (`body.*`)
- Ignora mensajes de grupos (`chatId.endsWith('@g.us')`)
- Guarda en colección `greenapi_subscribers` con `chatId`, `name`, `active`, `subscribedAt`

### `/api/vip-status.js`
- `GET /api/vip-status?email=X&uid=Y`
- Busca en `kiter_vip` por email de la app
- Si tiene `uid`, lee `usuarios/{uid}.mp_email` y chequea ese email también
- Consulta MP API si no encuentra en Firestore, y si encuentra crea el doc automáticamente
- Ojo: si se quita el VIP a mano a alguien con suscripción MP `authorized`, se reactiva en su próximo login

### `/api/mp-webhook.js`
- Recibe notificaciones de MercadoPago. **Fuente de verdad = estado de la suscripción** (`GET /preapproval/{id}`), nunca el pago suelto:
  - `subscription_preapproval` — `data.id` = suscripción
  - `subscription_authorized_payment` — `data.id` = factura → `GET /authorized_payments/{id}` → `preapproval_id`
  - `payment` — `GET /v1/payments/{id}` → `point_of_interaction.transaction_data.subscription_id`. Pago sin suscripción: ignorado
  - Si el id no existe con la API esperada, prueba las otras dos (MP a veces manda otro tipo de id)
  - Suscripción con `preapproval_plan_id` distinto de `MP_PLAN_ID`: ignorada
- `active`: `authorized` → true. `paused`/`cancelled` → true hasta `vip_until` (último cobro + período), si no hay cobros → false
- Errores transitorios de MP (5xx, 429, 401/403, red) → responde **500** para que MP reintente (cada 15 min). 4xx permanente → 200
- Deduplica por `id` de la notificación en `mpEvents` (si no viene `id`, procesa siempre)
- Valida `x-signature` (HMAC-SHA256 igual que el SDK oficial) en modo **solo registrar** (`mpEvents.signature`). Fase 2 pendiente: rechazar con 401
- Emails normalizados (trim + minúsculas) antes de armar el ID del doc
- Guarda log en `mp_webhook_log` con resultado de cada evento

### `/api/vip-expire.js`
- Cron diario `0 9 * * *` (06:00 AR): desactiva VIP `paused`/`cancelled` con `vip_until` vencido
- No toca docs sin `vip_until` (VIP manuales) ni `authorized`

### `/api/data.js`
- `GET /api/data` — público, datos Ecowitt cacheados **15 min** en el CDN de Vercel (`s-maxage=900`)
- `GET /api/data?live=1` + `Authorization: Bearer <Firebase ID token>` — dato en vivo para VIP (email de login o `mp_email`) o cuenta en **prueba de 7 días**. 401 sin token, 403 sin acceso (devuelve `access.trial_ends`)
- Prueba: desde la creación de la cuenta; cuentas previas desde el 2026-10-07. Cuentas anónimas no tienen vivo
- Acceso cacheado 5 min en memoria por uid
- Ojo: las claves Ecowitt están hardcodeadas en este archivo y el sitio sirve el código fuente de `api/*.js` (pendiente de seguridad)

---

## Features implementadas

### Datos de viento
- Estación Ecowitt, refresh cada 30s (silencioso)
- **VIP / prueba**: en vivo (`/api/data?live=1`). **Gratis**: hasta 15 min de demora (`/api/data` cacheado)
- Aviso sobre "Estado del Spot" (`#wind-tier-banner`): demora → "Verlo en vivo" (login o modal VIP); prueba → días restantes
- Historial 6hs con gráfico SVG; usuarios sin vivo lo ven sin los últimos 15 min
- **Escena 3D del spot** (`wind-scene.js`, Three.js r170 por CDN, carga diferida tras el primer dato): costa low-poly orientada (tierra N, mar S, vista desde la playa), estelas por dirección/velocidad con la escala de `windColor`, offshore en rojo. Debajo de la tarjeta de viento (`#wind-scene`). Con vivo se anima; con demora queda congelada con botón "Verlo en vivo". Loop solo visible en pantalla; respeta `prefers-reduced-motion`; sin WebGL se oculta
- Cámara en vivo: embed de YouTube de Radio Claromecó (contenido de terceros, gratis para todos). Cambiar el ID en `index.html` (`#live-camera`) cuando reinician el vivo
- Refresh silencioso al volver al foco (sin skeletons)

### Autenticación
- Google Sign-In via Firebase Auth
- Botón **ÚNITE** en topbar — obliga login, luego decide si mostrar modal VIP
- Botones de alertas (WhatsApp/Telegram): VIP o prueba abre el link; si no, modal VIP (cerrarlo ya **no** abre el link)

### Kiter VIP
- Suscripción $5.000/mes via MercadoPago (plan producción con crédito + débito + account_money)
- Beneficios: viento en vivo, alertas WA/TG, badge
- Badge `🪁 VIP` en topbar en tiempo real: escucha el doc del email de login **y** el de `usuarios/{uid}.mp_email`
- Kite 3D dorado en el encabezado del modal (`vip-kite.js`, se carga al abrir el modal; sin WebGL queda el emoji)
- Ojo 3D: los canvas llevan `width/height: 100%` en CSS; `renderer.setSize(w, h, false)` no lo setea y con DPR > 1 el canvas se agranda
- Modal VIP: en **cada apertura** para quien no tiene vivo (ni VIP ni prueba); muestra "Tu prueba VIP terminó" cuando corresponde
- Sección de email alternativo de MP siempre visible en el modal
- Al volver del checkout sin VIP activo: campo resaltado con mensaje específico
- Logs de webhooks en `mp_webhook_log` para diagnóstico

### Novedades del Spot
- Header degradado naranja/ámbar visible
- Punto blanco pulsante cuando hay novedad no leída
- Textos largos truncados a 120 chars con modal "Ver más"
- `role: "editor"` o `role: "admin"` pueden crear, editar y eliminar novedades
- Al publicar, opción de **notificar a suscriptores de WhatsApp** via `/api/notify-novedades`
  - Checkbox visible solo al crear (no al editar)
  - Envía a todos los `greenapi_subscribers` con `active: true`
  - Delay de 1s entre mensajes para respetar rate limit de Green API

### Alertas de viento
- **Telegram**: canal `@labajadaWindAlert` (usuario se une desde el botón)
- **WhatsApp**: via Green API, instancia `+34 637 499 277`
  - Botón en app abre WhatsApp con texto `Suscribirme a alertas`
  - Webhook procesa suscripción/desuscripción con texto **exacto**
- ~~Web Push~~ — eliminado (dead code, nunca completado)

### Panel de Administrador
- Accesible via botón ⚙️ en topbar (solo `role: "admin"`)
- **Stats**: VIPs activos, suscriptores Telegram, suscriptores WhatsApp, mensajes, fotos, clasificados, visitantes únicos (app_devices), usuarios registrados
- **Gestión VIP**: dar/quitar VIP por email con lista en tiempo real (`onSnapshot`)
- **Historial de pagos MP**: últimos 20 eventos del webhook con estado, email y razón
- **Moderación chat**: ver mensajes, borrar individual o limpiar todo
- **Moderación galería**: grid de fotos con borrar individual o limpiar todo
- **Moderación clasificados**: lista con borrado (sin restricción de userId)
- **Suscriptores WhatsApp**: lista con nombre, fecha de suscripción y botón para enviar recordatorio VIP individual
- **Suscriptores Telegram**: lista
- **Test alerta**: dispara `/api/telegram-alert?test=true` y muestra resultado
- Acordeones con carga lazy (datos solo al abrir cada sección)

### Comunidad
- Chat en tiempo real (Firestore `kiter_board`)
- Galería de fotos diaria
- Clasificados de equipos

---

## Endpoints protegidos y emails

- `api/_auth.js` → `requireRole(req, res, db, roles)`: exige `Authorization: Bearer <ID token de Firebase>` y `usuarios/{uid}.role` dentro de `roles`. El cliente usa `authFetch()` (app.js)
- Solo admin: `admin-mp-subscriptions`, `admin-nonvip-users`, `admin-resolve-payer-docs`, `admin-send-vip-email`, `admin-subscribe-wa`, `admin-send-campaign`, `send-whatsapp`. Admin o editor: `notify-novedades`
- `api/admin-send-campaign.js`: email "Nueva versión" (v2) a todos los usuarios registrados. `{ mode: 'test' }` se envía al admin; `{ mode: 'send' }` manda el siguiente lote de 90 (Resend `/emails/batch`). Registra envíos en `email_campaigns/v2-lanzamiento/sent` y saltea `email_unsubscribes`. Panel admin → "📣 Email Nueva versión"
- `api/email-unsubscribe.js`: link de baja firmado (HMAC) + one-click (`List-Unsubscribe`). La invitación VIP también respeta las bajas
- Pendiente: `/api/telegram-alert?test=true` sigue público

---

## Tests y scripts

- `npm test` — `node:test` con mocks de módulos (Node 24, sin dependencias extra). Cubre `mp-webhook`, `vip-expire`, `data`, `telegram-alert`, clasificados y permisos/emails de admin (`tests/`)
- `scripts/audit-vip-emails.mjs` — auditoría **solo lectura** de emails sin normalizar en `kiter_vip` y `usuarios.mp_email`:
```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\ruta\service-account.json"; node scripts/audit-vip-emails.mjs
```

---

## Diagnóstico de pagos MP

Si un usuario pagó y no se activó el VIP:

1. Revisar **Firestore → `mpEvents`** (body crudo y firma) y **`mp_webhook_log`**: ¿hay un doc reciente?
   - `result: "error"` → ver campo `reason`
   - Sin docs → el webhook nunca llegó
2. Si no llegó: buscar el `preapproval_id` del usuario vía MP API y ejecutar manualmente:
```powershell
$headers = @{ "Content-Type" = "application/json" }
$body = '{"type":"subscription_preapproval","data":{"id":"ID_REAL"}}'
Invoke-RestMethod -Uri "https://www.labajadakite.app/api/mp-webhook" -Method POST -Headers $headers -Body $body
```
3. Para buscar el ID por email:
```powershell
$headers = @{ "Authorization" = "Bearer MP_ACCESS_TOKEN" }
Invoke-RestMethod -Uri "https://api.mercadopago.com/preapproval/search?payer_email=EMAIL" -Method GET -Headers $headers | ConvertTo-Json -Depth 5
```
> **Importante**: usar siempre `www.labajadakite.app` en la URL del webhook de MP. El dominio sin www hace un redirect 307 y MP no sigue redirects.

---

## Roles de usuario en Firestore

| `role` | Novedades (crear/editar/borrar) | Panel Admin |
|--------|--------------------------------|-------------|
| `"admin"` | ✅ | ✅ |
| `"editor"` | ✅ | ❌ |
| _(sin rol)_ | ❌ | ❌ |

Para asignar un rol:
```
Colección: usuarios
Documento: {UID de Firebase Auth}
Campo: role → "admin" | "editor" (string)
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
| Green API webhook | ✅ | `https://www.labajadakite.app/api/greenapi-webhook` (con www: sin www hay redirect 307). Si el Status queda "Not Authorized", re-vincular con QR |
| MercadoPago webhooks | ✅ | URL: `https://www.labajadakite.app/api/mp-webhook` (con www) + eventos: Planes y suscripciones + Pagos |
| MercadoPago credenciales | ✅ | Token y plan de producción configurados en Vercel |
| Vercel dominio | ✅ | `labajadakite.app` activo |

---

## Dirección del viento — on-shore en La Bajada (Claromecó)

**Favorables (on-shore):**
`ENE, E, ESE, SE, SSE, S, SSO, SO, OSO, O, ONO`

**No favorables (off-shore):**
`N, NE, NO, NNE, NNO`

E y ESE → status **EPICOOO** en el mensaje de alerta
