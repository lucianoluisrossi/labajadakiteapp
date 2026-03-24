# CONTEXTO DEL PROYECTO — La Bajada Kitesurf App

## Descripción general

App PWA para kitesurfistas del spot **La Bajada (Claromecó, Argentina)**.
Combina datos meteorológicos en vivo, comunidad social y comercio.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | Vanilla JS (ES6), HTML5, Tailwind CSS v3.4 |
| Backend | Vercel Serverless Functions (Node.js 20.x) |
| Base de datos | Firebase Firestore (real-time) |
| Autenticación | Firebase Auth (Google OAuth) |
| Hosting | Vercel |
| Estilos | Tailwind compilado (`npm run build` → `style.css`) |
| PWA | Service Worker, manifest.json |

---

## APIs integradas

| API | Uso |
|---|---|
| Ecowitt | Estación meteorológica local (viento en vivo) |
| Windy | Pronóstico extendido |
| Google Gemini | Veredicto IA del estado del spot |
| Telegram Bot | Alertas push por Telegram |
| Web Push | Notificaciones nativas del navegador |
| YouTube Live | Cámara en vivo del spot |
| Firebase | Chat, galería, clasificados, analytics |

---

## Estructura de vistas (SPA)

| Vista | ID | Descripción |
|---|---|---|
| Dashboard | `#view-dashboard` | Datos de viento, cámara, pronóstico, sponsors, escuelas |
| Comunidad | `#view-community` | Chat en vivo (Pizarra Kitera), galería de fotos del día |
| Shop | `#view-shop` | Tienda KiteLook (ropa con identidad kitera) |
| Clasificados | `#view-classifieds` | Marketplace peer-to-peer de gear |

Navegación via **Bottom Navigation Bar** fijo (4 ítems).

---

## Archivos clave

```
index.html        — estructura completa de la SPA
app.js            — lógica principal (1700+ líneas)
shop.js           — catálogo y lógica del Shop KiteLook
style.css         — CSS compilado (Tailwind + custom)
tailwind.config.js — content: index.html, app.js, shop.js
src/input.css     — entrada de Tailwind (base/components/utilities)
api/              — serverless functions (Vercel)
vercel.json       — cron job: /api/push-alert cada 15 min
```

---

## Paleta de colores — Ocean Dark

Paleta activa desde marzo 2026:

| Rol | Valor |
|---|---|
| Fondo base | `#0f172a` (slate-950) |
| Cards | `bg-slate-800` |
| Bordes | `border-slate-700` |
| Acento principal | `#06b6d4` (cyan-500) — nav activo, botones CTA, shop |
| Acento clasificados | `orange-500` (semántico, se mantiene) |
| Texto primario | `text-slate-100` |
| Texto secundario | `text-slate-400` |
| Nav bottom | `bg-slate-900` |
| Skeleton loaders | `#334155` (slate-700) |

### Cards de viento (dinámicas)

Los fondos de las tarjetas de viento/status son **pasteles** y el texto se adapta automáticamente:

| Estado | Fondo | Texto |
|---|---|---|
| FLOJO | `bg-blue-200` | negro |
| ACEPTABLE | `bg-cyan-300` | negro |
| IDEAL | `bg-green-300` | negro |
| MUY BUENO | `bg-yellow-300` | negro |
| FUERTE | `bg-orange-300` | negro |
| MUY FUERTE | `bg-red-400` | negro |
| DEMASIADO FUERTE | `bg-purple-400` | negro |
| Cargando | `bg-slate-800` | blanco |

La función `updateCardColors()` en `app.js` detecta automáticamente si el fondo es claro u oscuro y ajusta el texto de los hijos con `text-slate-100` / `text-gray-900`.

---

## Shop KiteLook

- Sección de e-commerce de ropa con motivos kiteros
- Marca: **KiteLook**
- Productos: remeras y buzos (5 productos activos)
- Contacto vía WhatsApp: `+54 9 2983 595133`
- Renderizado dinámico por `shop.js`
- Filtros por categoría (remera / buzo)
- Filtro activo: `bg-cyan-500` (acento Ocean Dark)
- Filtro inactivo: `bg-slate-700 text-slate-300`

---

## Bottom Navigation Bar

Reemplazó a los FABs flotantes originales.
Logo de la app como **watermark discreto** (opacity-50) flotando sobre el nav.

```
[ Spot ] [ Comunidad ] [ Shop ] [ Clasificados ]
              🪁 (logo watermark)
```

Nav activo: color `#06b6d4` (cyan).

---

## Colores dinámicos — sistema de clases

En `app.js` existe un array `allColorClasses` que registra TODAS las clases de color dinámicas para que Tailwind las compile y `updateCardColors` las limpie correctamente antes de aplicar nuevas.

Si se agregan nuevas clases de color dinámicas, deben incluirse en ese array.

---

## Entorno de test

El proyecto está en modo test. Hay un banner visible en el home:

```html
<!-- ⚠️ TEST ENV BANNER — para quitar: borrar este bloque completo -->
<div class="... bg-yellow-400 ...">⚠️ Entorno de pruebas...</div>
<!-- FIN TEST ENV BANNER -->
```

Para pasar a producción: eliminar ese bloque en `index.html`.

---

## Compilar Tailwind localmente

```bash
npm install          # primera vez
npm run build        # genera style.css compilado
```

Vercel corre `npm run build` automáticamente en cada deploy.

---

## Colecciones Firebase

| Colección | Uso |
|---|---|
| `kiter_board` | Mensajes del chat (últimas 24hs) |
| `daily_gallery_meta` | Fotos del día |
| `classifieds` | Anuncios del marketplace |
| `app_devices` | Analytics por dispositivo |
| `push_subscriptions` | Suscripciones Web Push |
| `telegram_subscribers` | Suscriptores del bot de Telegram |
| `condition_tracker` | Seguimiento de condiciones épicas/peligrosas |
| `push_alert_log` | Historial de alertas enviadas |

---

## Decisiones de diseño relevantes

- **Logo removido del header** — vive como watermark en el bottom nav
- **Clasificados mantiene naranja** — es el color semántico de esa sección, no cambia con el tema
- **Wind arrow excluido del cambio de texto** — su color es semántico (rojo/verde/amarillo según dirección)
- **Fondos pastel en cards de viento** — preferencia del cliente, con texto dinámico negro/blanco según contraste
