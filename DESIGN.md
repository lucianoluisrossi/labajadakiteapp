# Sistema de diseño — La Bajada Kite App

## Contexto
- **Qué es:** PWA del spot de kitesurf La Bajada (Claromecó): viento en vivo de estación propia, cámara, Vista 3D, pronóstico, comunidad, clasificados y suscripción VIP.
- **Para quién:** kiteros del spot, que la abren en el celular, en la playa y a pleno sol.
- **Rubro:** apps de viento y surf (Windguru, Windy, iKitesurf). Todas muestran datos densos; ninguna da la respuesta.
- **Tipo:** web app mobile-first.
- **Lo que tiene que quedar grabado:** *sabés si hay viento en 1 segundo.* Cada decisión sirve a eso.

## Dirección estética
- **Dirección:** instrumento náutico táctil. La app como tablero de cockpit: piezas que se sienten físicas, con relieve y sombra real, sobre papel de carta náutica.
- **Decoración:** intencional. Profundidad con sombras en capas y un patrón muy sutil de líneas de carta náutica en el fondo. Sin adornos sueltos.
- **Ánimo:** preciso, confiable, local. Un instrumento, no un folleto.
- **Referencias analizadas:** windguru.cz, windy.com, wx.ikitesurf.com (surfline.com bloquea navegadores automatizados).
- **Vista previa aprobada:** variante A (instrumento elevado) con la variante C como modo noche. Archivo: `~/.gstack/projects/lucianoluisrossi-labajadakiteapp/designs/design-system-20261014/design-preview.html`.

## Tipografía
- **Display / números grandes:** Big Shoulders Display 800–900. Condensada, de cartel de playa: el número de viento se lee a distancia.
- **Texto e interfaz:** Instrument Sans 400–700.
- **Datos:** IBM Plex Mono 500–600 con `font-variant-numeric: tabular-nums`, para que las cifras no bailen al actualizarse.
- **Carga:** Google Fonts, `display=swap`:
  `https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;800;900&family=Instrument+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap`
- **Escala (px):** número de viento 92 · veredicto 30 · título de sección 24–30 · texto 15–16 · etiqueta 10–11 en mayúsculas con `letter-spacing: .08em`.

## Color
- **Enfoque:** balanceado. El amarillo señal es escaso a propósito: si aparece, es importante.

| Token | Día | Noche | Uso |
|---|---|---|---|
| `--paper` | `#F4F1E8` | `#07121D` | Fondo de la app |
| `--surface` | `#FFFDF7` | `#102335` | Tarjetas e instrumentos |
| `--ink` | `#0B1B2B` | `#EAF1F7` | Texto principal |
| `--ink-2` | `#4A5866` | `#9FB2C3` | Texto secundario, etiquetas |
| `--line` | `#D9D2BE` | `#1E3449` | Divisores |
| `--signal` | `#F5CF14` | `#F5CF14` | **Solo** veredicto del spot y acción principal |
| `--ocean` | `#0B3D5C` | `#5FB4E8` | Acción secundaria, gráficos |

- **Escala de viento (kts):** ≤14 `#4FA3E0` · 15–16 `#22B8CF` · 17–19 `#2FBF71` · 20–22 `#F2C200` · 23–27 `#F2811D` · 28+ `#E5484D`. Mismos rangos que `windColor()`, más saturados para el sol.
- **Semánticos:** éxito `#2FBF71`, aviso `#F2811D`, error `#E5484D`, info `#0B3D5C`.
- **Modo noche:** el tema "Oscuro" actual (`html.dark`). Superficies azul marino; el amarillo señal se mantiene y suma un brillo suave, como instrumento retroiluminado.

## Profundidad (el "3D" de la interfaz)
- **Hundido** (campos, datos secundarios): `inset 0 1px 2px rgba(11,27,43,.18)`.
- **Apoyado** (tarjetas): `inset 0 1px 0 rgba(255,255,255,.7), 0 1px 2px rgba(11,27,43,.10), 0 4px 10px rgba(11,27,43,.08)`.
- **Elevado** (instrumento principal, dock de pestañas): `inset 0 1px 0 rgba(255,255,255,.8), 0 2px 4px rgba(11,27,43,.12), 0 12px 28px rgba(11,27,43,.16)`.
- **Botones físicos:** sombra inferior sólida de 4 px (borde del botón) que se colapsa al tocar (`translateY(3px)`).
- **Brújula 3D:** cara con inclinación `rotateX(18deg)`, bisel con gradiente radial y aguja con sombra. Muestra la dirección real del viento.

## Espaciado y forma
- **Base:** 8 px, densidad cómoda. Escala: 2 · 4 · 8 · 12 · 16 · 24 · 32 · 48.
- **Radios escalonados** (nunca todo igual): sm 6 (hundido) · md 12 (apoyado) · lg 20 (elevado) · full para chips.
- **Ancho máximo de contenido:** 1152 px (`max-w-6xl` actual).

## Layout
- **Pantalla Viento (variante A):** cámara/3D a todo el ancho arriba, con el selector "📷 Cámara | 🌐 3D" encima de la imagen. La tarjeta-instrumento se monta 34 px sobre la cámara: placa amarilla con el veredicto, número gigante + barra de escala + brújula 3D, y tres datos hundidos (racha, estabilidad, antigüedad). Debajo, el historial de 6 h compacto.
- **Navegación:** dock de pestañas elevado, separado de los bordes, con indicador amarillo bajo la pestaña activa.
- El resto de las pestañas (Pronóstico, Comunidad, Clasificados, Más) reutiliza papel, superficies, tipografía y elevaciones; sin pantallas nuevas.

## Movimiento
- **Enfoque:** intencional. Solo lo que ayuda a entender o da sensación física.
- La aguja de la brújula gira hasta la nueva dirección con inercia (`cubic-bezier(.2,.8,.2,1)`, 600 ms).
- El número de viento cuenta hasta el valor nuevo (400 ms).
- Botones: se hunden en 80 ms.
- La tarjeta-instrumento se inclina hasta 4° según el movimiento del teléfono o el dedo.
- **Duraciones:** micro 80 · corta 200 · media 400 · larga 600 ms.
- Con `prefers-reduced-motion: reduce`, todo pasa a cambios instantáneos y sin inclinación.

## Anti-patrones (no usar)
Gradientes violetas, glassmorphism (baja el contraste al sol), botones con gradiente, todo centrado, el mismo radio en todo, grillas de 3 íconos en círculos de color, Inter/Roboto/system-ui como fuente principal.

## Registro de decisiones
| Fecha | Decisión | Motivo |
|---|---|---|
| 2026-10-14 | Sistema inicial: instrumento náutico táctil | /design-consultation. Investigación del rubro: todas las apps muestran datos, ninguna la respuesta. Objetivo: viento en 1 segundo. |
| 2026-10-14 | Variante A + C como modo noche | Conserva la cámara (lo más usado) y suma relieve 3D sin perder legibilidad al sol. |
| 2026-10-14 | Papel cálido `#F4F1E8` en lugar de blanco/celeste | Menos reflejo a pleno sol e identidad propia. |
| 2026-10-14 | Big Shoulders Display para números | Condensada de señalética: se lee a distancia, como los carteles de la playa. |
