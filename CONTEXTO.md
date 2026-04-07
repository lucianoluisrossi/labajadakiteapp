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
| `FIREBASE_SERVICE_ACCOUNT` | JSON credenciales Firebase Admin SDK |
| `ECOWITT_API_KEY` / `ECOWITT_APP_KEY` / `ECOWITT_MAC` | Estación meteorológica Ecowitt |
| `TELEGRAM_BOT_TOKEN` | Bot `@Labajadabot` |
| `TELEGRAM_CHAT_ID` | Canal `@labajadaWindAlert` |
| `GREENAPI_INSTANCE_ID` / `GREENAPI_TOKEN` | Green API (WhatsApp) |
| `GREENAPI_GROUP_ID` | ID del grupo WhatsApp destino |
| `MP_ACCESS_TOKEN` / `MP_PLAN_ID` | MercadoPago suscripciones |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` | Push notifications |
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

---

## Archivos principales

### `/index.html`
- SPA principal
- Secciones: viento hero, historial 6hs, novedades, alertas, escuelas kite, comunidad, galería, clasificados, windguru
- Modales: VIP, novedad (crear/editar), novedad completa (leer)
- Panel admin VIP (colapsable, solo visible para `role: "admin"`)

### `/app.js`
- Toda la lógica del cliente
- `currentUser` — usuario Firebase Auth activo
- `fetchWeatherData(silent)` — carga datos Ecowitt. `silent=true` no muestra skeletons (usado en refresh por foco)
- `updateVipUI(user)` — chequea VIP pasando `email` + `uid` al endpoint
- `updateNovedadesAdminUI(user)` — lee `usuarios/{uid}.role`, activa controles admin si es `"admin"`
- `renderNovedades(docs)` — renderiza cards con truncado a 120 chars + botón "Ver más"
- `updateNovedadBadge(docs)` — muestra punto pulsante si hay novedad no leída (localStorage `novedadLastSeen`)
- `window.editNovedad(id)` / `window.deleteNovedad(id)` / `window.verNovedadCompleta(id)` — globales para botones inline
- `window.adminQuitarVip(docId)` — quita VIP desde panel admin
- Panel admin VIP colapsable con `onSnapshot` a `kiter_vip` donde `active == true`
- Refresh silencioso en `visibilitychange` (volver de otra app o desbloqueo)
- Modal VIP se abre automáticamente 1 vez por día (localStorage `vipModalLastShown`)

### `/sw.js`
- Service Worker v2 (`labajada-cache-v2`)
- Cache-first para assets estáticos (HTML, JS, CSS, logos, imágenes)
- Network-first para `/api/*`
- Caché de: `index.html`, `app.js`, `style.css`, `manifest.json`, `logo.png`, `logo-mariana.png`, `logo3.jpg`, `ux-improvements.js`

### `/api/telegram-alert.js`
- Cron `/*/15 * * * *` — verifica condiciones y envía alertas
- Condiciones: promedio ≥14 kts en últimas 30min, dirección on-shore, hora 9-19hs AR (UTC-3)
- Anti-spam: 1 alerta cada 3hs (doc `telegram_alerts/last_alert`)
- Envía a: canal Telegram + grupo/contactos WhatsApp via Green API + suscriptores `greenapi_subscribers`
- `?test=true` bypasea todas las condiciones
- Mensaje EPICOOO si dirección es E o ESE
- Link a `https://labajadakite.app`

### `/api/greenapi-webhook.js`
- Recibe mensajes entrantes de WhatsApp via Green API
- Palabras clave para suscribir: `hola`, `join`, `quiero`, `suscribir`, `alertas`, `start`, `si`, `sí`
- Palabras clave para desuscribir: `stop`, `chau`, `salir`, `basta`, `cancelar`, `no`
- Ignora mensajes de grupos (`chatId.endsWith('@g.us')`)
- Guarda en colección `greenapi_subscribers`

### `/api/vip-status.js`
- `GET /api/vip-status?email=X&uid=Y`
- Busca en `kiter_vip` por email de la app
- Si tiene `uid`, lee `usuarios/{uid}.mp_email` y chequea ese email también (para usuarios que pagaron con otro email de MP)
- Consulta MP API si no encuentra en Firestore

### `/api/mp-webhook.js`
- Recibe notificaciones de MercadoPago (`subscription_preapproval`)
- Guarda/actualiza doc en `kiter_vip` con `email`, `status`, `active`, `payer_id`

---

## Features implementadas

### Datos de viento
- Estación Ecowitt en tiempo real, refresh cada 30s (silencioso)
- Historial 6hs con gráfico SVG y etiquetas horarias reales
- Refresh silencioso al volver al foco (sin skeletons)

### Autenticación
- Google Sign-In via Firebase Auth
- Botón **ÚNITE** en topbar — obliga login, luego abre modal VIP
- Botones de alertas (WhatsApp/Telegram) requieren login + abre modal VIP antes

### Kiter VIP
- Suscripción $5.000/mes via MercadoPago
- Badge `🪁 VIP` en topbar
- Modal VIP se abre automáticamente 1 vez/día para no-VIP
- Vinculación de email alternativo de MP (campo en modal)
- **Panel admin** (solo `role: "admin"`): dar/quitar VIP por email, lista en tiempo real

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

### Comunidad
- Chat en tiempo real (Firestore `kiter_board`)
- Galería de fotos diaria
- Clasificados de equipos

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

## Configuración externa pendiente / ya hecha

| Servicio | Estado | Detalle |
|---|---|---|
| Firebase Auth | ✅ | Agregar `labajadakite.app` a Authorized Domains |
| Green API webhook | ⚠️ Pendiente | Cambiar a `https://labajadakite.app/api/greenapi-webhook` |
| MercadoPago back_url | ⚠️ Pendiente | Actualizar a `https://labajadakite.app` |
| Vercel dominio | ⚠️ Pendiente | Asociar `labajadakite.app` al proyecto `labajadakiteapp` |

---

## Dirección del viento — on-shore en La Bajada (Claromecó)

**Favorables (on-shore):**
`ENE, E, ESE, SE, SSE, S, SSO, SO, OSO, O, ONO`

**No favorables (off-shore):**
`N, NE, NO, NNE, NNO`

E y ESE → status **EPICOOO** en el mensaje de alerta
