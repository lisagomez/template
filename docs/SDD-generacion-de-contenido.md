# SDD — Generación de contenido para pymes: piezas, carruseles, video por código y aprobación

**Estado:** **construido y medido en esta WSL2** (2026-09-27): `@tu-scope/pymes-marketing` 0.2.0 empaquetado
(11 subpaths), laboratorio con 65 casos (64 pasan, 1 no medido declarado), app `/estudio` + `/estudio/aprobar`.
Lo bloqueado sigue bloqueado (§8). Cifras en §10.
**Ámbito:** extiende `tools/pymes-marketing` (0.1.0 → 0.2.0) bajo el contrato de
[`EMPAQUETAR-HERRAMIENTA.md`](./EMPAQUETAR-HERRAMIENTA.md), la app `/estudio` y el laboratorio
`/laboratorio-pymes`. No toca skills, reglas ni `AGENTS.md`.
**Pedido por:** `.claude/goals/contenido-pymes/spec.md` (grafo y plan en la misma carpeta).
**Plan de construcción:** [`PRP-006`](../.claude/PRPs/PRP-006-generacion-de-contenido.md).

---

## 0. El veredicto, primero

La línea pymes ya sabe **qué** publicar (brief de 30 días desde las ventas reales) y **cuándo**
(calendario vivo). Lo que le faltaba para que el dueño termine su mes sin otra herramienta es el
**entregable**: la pieza en el formato exacto de cada canal, el carrusel que cuenta algo, el video
corto vertical, y una forma de **aprobar desde el celular** que deje constancia de qué aprobó.

Todo eso se puede hacer **local, por código y sin costo**, y **sin personas en pantalla**. Lo que
no se puede hacer así —el reel con la voz y la cara del dueño o de sus clientes, y la redacción con un
modelo de lenguaje— queda **diseñado y bloqueado**: necesita una firma que todavía no existe (§8).

## 1. Qué existe hoy (medido, rama `pymes-marketing-build`)

| Pieza | Estado | Evidencia |
|---|---|---|
| Brief de 30 días desde CFDI y CSV | construido | laboratorio `contenido-1`: pan de muerto a empujar, 388 palabras |
| Calendario vivo, 2/semana, reuso por canal | construido | `contenido-2`: 9 piezas de origen × 3 canales |
| Pieza SVG por código con la marca | construido | `contenido-5`: determinista, escapa el texto |
| App `/estudio` y laboratorio `/laboratorio-pymes` | construidos | 45 casos, 44 pasan, 1 no medido (LLM) |
| PNG, carrusel, video, aprobación con huella | **faltan** | `resultados.md` de pymes: «exportar PNG queda para después» |

## 2. Qué se construye

| Capacidad | Subpath | Entra | Sale |
|---|---|---|---|
| Formatos y zonas seguras por canal | `./contenido` | canal + formato | medidas, zona segura, límites de texto |
| Revisión visual («ver con ojos») | `./contenido` | una pieza | problemas: texto que desborda, contraste bajo, texto de plantilla visible, fuera de zona segura, formato equivocado |
| Carruseles | `./contenido` | brief + marca + precios confirmados | 3 a 6 láminas SVG 1080×1350 con la lámina 1 autocontenida |
| Video por código sin personas | `./video` (nuevo) | pieza del calendario + marca | escena declarativa → cuadro SVG en cualquier instante, efectos de sonido sintetizados (WAV), plan de render |
| Rasterizar en el navegador | `./rasterizar` (nuevo) | SVG | PNG (canvas del propio navegador; sin dependencias) |
| Aprobación con huella | `./aprobacion` (nuevo) | los bytes exactos de la pieza | aprobación con SHA-256, versión y fecha; se **revoca** si el contenido cambia |
| Render de video a MP4 | fuera del núcleo | escena | MP4 H.264 + AAC 48 kHz, 1080×1920, 30 fps; hoja de cuadros |

El núcleo sigue sin dependencias. El render a MP4 necesita un navegador sin ventana y ffmpeg: vive
**fuera** del paquete, en el servidor de la app (`/api/contenido/video`) y en los scripts del
laboratorio, igual que el motor de OCR se inyecta en `extractor-documental`.

## 3. Arquitectura

```
brief 30 días ─► calendario vivo ─┬─► pieza SVG ──► rasterizar (navegador) ──► PNG
                                  ├─► carrusel (3-6 láminas SVG) ──► PNG por lámina
                                  └─► escena de video ──► cuadro SVG(t) ─┐
                                               └─► sonido WAV ──────────┤
                                                                        ▼
                                  servidor: Chromium sin red → cuadros → ffmpeg → MP4 + hoja
                                                                        ▼
                         aprobación en el celular: huella SHA-256 de los bytes aprobados
                         (editar revoca; aprobar NO publica) ──► CSV del mes para que el dueño suba
```

### 3.1 La escena de video (contrato propio, sin GSAP ni código de terceros)
Una **escena** es un dato: tamaño, fps, duración y una lista de **capas** (fondo, forma, texto,
etiqueta, precio, marca), cada una con claves de animación (entrada, salida, desplazamiento, escala,
opacidad) y una curva de aceleración. `cuadroSvg(escena, t)` devuelve el SVG exacto del instante `t`:
**función pura**, sin reloj ni azar (las formas del fondo salen de una semilla), así que el mismo
borrador se reproduce idéntico para corregirlo. El render es mecánico: pedir el cuadro de cada
instante, fotografiarlo y codificar.

**Sin personas por construcción:** el tipo de capa no admite fotos ni video de cámara en esta
versión. Una foto de producto puede traer personas de fondo (C4): entra en una fase posterior con
revisión propia (§8).

**Sonido:** solo efectos sintetizados por código (un barrido suave en cada entrada y un golpe corto
cuando aparece el precio), sin música: la música la elige el dueño en la app de la red al publicar,
con su licencia. El WAV es determinista.

### 3.2 Zonas seguras
En 9:16 la interfaz de Reels, Historias y el estado de WhatsApp tapa arriba y abajo. Se usa la
recomendación que resumen guías de terceros sobre las especificaciones de Meta: **14 % arriba
(~270 px), 35 % abajo (~672 px), 6 % a los lados (~65 px)** — *a verificar en la guía oficial de
Meta*. Todo texto y todo precio de una pieza vertical cae en la franja central; la revisión visual lo
comprueba.

### 3.3 Formatos por canal (unificados; la fuente los tenía dispersos)
| Canal / uso | Medida | Relación |
|---|---|---|
| Instagram publicación | 1080×1350 | 4:5 |
| Instagram / Facebook cuadrado | 1080×1080 | 1:1 |
| Facebook horizontal | 1200×630 | 1.91:1 |
| Historia, Reel, estado de WhatsApp, TikTok | 1080×1920 | 9:16 |
| Carrusel (cada lámina) | 1080×1350 | 4:5 |

### 3.4 Carruseles
Tres tipos, todos con datos que ya existen (nada inventado):
- **Temporada** (Día de Muertos, Buen Fin…): portada con la fecha · producto con su precio confirmado ·
  «cómo pedir» (el WhatsApp del negocio) · cierre de marca.
- **Paquete** (del brief): los productos del paquete, una lámina cada uno · cierre.
- **Tip del dueño**: solo si el dueño escribió los puntos; si no, el carrusel nace «falta algo».
Regla de la fuente que se conserva: **la lámina 1 se entiende sola** (es la que se reusa como
publicación suelta) y **un hueco por producto**, sin repetir.

### 3.5 Aprobación en el celular
Inspirada en lo que la propuesta de video rescató de la sala de revisión, sin su código ni sus fallas
medidas:
- se aprueba **el archivo exacto**: huella SHA-256 de sus bytes (SVG, PNG o MP4), versión y fecha;
- **editar revoca**: si la pieza cambia, su huella cambia y la aprobación vieja deja de valer;
- **pedir cambio** con una nota (y en video, el segundo exacto);
- **aprobar no es publicar**: lo aprobado sale en un CSV del mes (fecha, hora sugerida en el futuro,
  canal, texto, archivo, huella) para que el dueño lo suba él;
- todo corre en el navegador: aprobar no hace ninguna petición de red.

**Límite declarado:** sin cuentas, la aprobación vive en esa sesión del navegador. Aprobar desde
otro teléfono, o que aprueben dos personas, necesita sesión autenticada (`/add-login`) y guardar las
decisiones: fase bloqueada (§8).

## 4. Contratos que se prueban

| Contrato | Cómo se prueba |
|---|---|
| Determinismo: misma entrada, mismo SVG, mismo WAV, mismo MP4 | huellas en el laboratorio; MP4 renderizado dos veces con la misma huella |
| Formato correcto por canal | revisión visual + `ffprobe` (1080×1920, 30 fps, H.264, AAC 48 kHz) |
| Texto dentro de la zona segura y sin desbordar | revisión visual, casos-trampa |
| Contraste legible | revisión visual (AA) |
| Precio solo confirmado | casos-trampa |
| Nada de código ni texto ajeno se vuelve marcado | casos-trampa (nombre con `<script>`) |
| Aprobación que se revoca al editar | laboratorio `aprobacion-*` |
| Cero peticiones de red al aprobar | captura con Playwright |

## 5. Laboratorio visual

Extiende `/laboratorio-pymes` con tres herramientas (piezas y carruseles, video, aprobación), cada una
con al menos 5 casos y trampas. Lo visual se compara de dos maneras:
1. **Referencia exacta** (en la suite de Node): la huella de cada SVG, cuadro y WAV contra
   `referencias.json`. Un cambio visual rompe la huella y **obliga a aprobarlo** regenerando las
   referencias a propósito (`npm run contenido:referencias`), con el diff a la vista.
2. **Referencia visual** (en la página): la imagen de referencia junto a la actual, rasterizada en el
   navegador, con el porcentaje de píxeles distintos. El video enseña su hoja de cuadros y su `ffprobe`.

## 6. Seguridad (C3) y personas (C4)

- **C3**: todo texto que entra a una pieza (nombres de producto, notas) se escapa; la página que
  renderiza el video corre **con la red bloqueada**; la ruta de render valida su entrada con Zod y no
  acepta más que una escena (sin URL, sin archivos).
- **C4**: sin personas en pantalla; sin datos personales en las piezas (el WhatsApp es el del negocio).
  El reel con voz y cara es la parte con riesgo sobre terceros: el laboratorio firmó el 2026-09-27 las 14
  preguntas de `propuesta-video.md` (consentimiento escrito, menores nunca, desenfoque por defecto); se
  construye en su propio goal.

## 7. Costo

$0 por pieza: todo local. Un video de 6 s son 180 cuadros; el tiempo de render se mide en §10.
El render de MP4 depende de Chromium y ffmpeg en el servidor: en esta máquina están; **en producción
no** (Playwright es dependencia de desarrollo y la imagen no trae ffmpeg). Llevarlo a producción es una
decisión de infraestructura (§8).

## 8. Lo que queda bloqueado (y quién lo desbloquea)

| Fase | Por qué se bloquea | Quién firma |
|---|---|---|
| Reel del celular (voz y cara) | **firmado el 2026-09-27** (14 preguntas de `propuesta-video.md`); falta construirlo en su goal, que empieza por las cuentas (respuesta 8) | el laboratorio (lisagomez) |
| Foto de producto dentro del video | puede traer personas de fondo: revisión C4 propia | el laboratorio |
| Redacción con LLM | sin llave medida; activar el LLM es otro CDC (los prompts del redactor se firmaron el 2026-09-27 en `BITACORA-CDC.md`) | el laboratorio |
| Aprobación con cuentas o multiusuario | necesita `/add-login` y guardar decisiones (C4, C7) | el laboratorio |
| Render de video en producción | Chromium + ffmpeg en la imagen: cambio de infraestructura | el laboratorio |
| Publicar o programar | nunca automático | el dueño de cada pyme |

## 9. Lo que se reusa y lo que no
- Se reusa: marca y voz, brief, calendario, pieza SVG, contabilidad (sin costo), molde del laboratorio.
- Se toma como idea, **no como código**: determinismo, hoja de cuadros, «editar revoca la aprobación»,
  efectos sintetizados (god-animation, edicion-de-video, sfstudio: sin licencia o sin declarar).
- No se usa: GSAP, sfstudio, fotos generadas, música incrustada, servicios de pago.

## 10. Medido al cerrar (2026-09-27, esta WSL2)

| Qué | Medido |
|---|---|
| Paquete | `npm run empaqueta pymes-marketing`: 0.2.0, 11 subpaths instalados e importados en un proyecto limpio, 52 `.d.ts` |
| Pruebas del paquete | 49/49 |
| Laboratorio | 65 casos: 64 pasan, 1 no medido (LLM sin llave), 0 fallan; 35 con trampa; ≥ 5 por herramienta |
| Video | `ffprobe`: H.264 1080×1920 a 30/1, AAC 48 kHz mono, 6.000 s, 180 cuadros; **misma huella SHA-256 en dos renders**; render ~17.5–19.5 s por video en CPU |
| Comparación visual | 0.27–0.36 % de píxeles distintos contra la referencia (umbral 1 %: suavizado de fuentes) |
| PNG | descargado desde el navegador: ~100 KB por pieza 4:5 |
| Aprobación | 0 salidas de red causadas por aprobar (Playwright); editar revoca (casos `aprobacion-2`, `-6`) |
| Costo | $0: todo local; sin llamadas a modelos |

**Lo que el recorrido encontró y se corrigió en el camino**: el precio de la historia 9:16 caía en la
franja que tapan los botones (se rehízo la disposición sobre la zona segura); el carrusel decía «pan de
muerto desde el 1 nov» (falso) y usaba la nota interna del brief (se cambió por las fechas de la
celebración); la promo quedaba congelada 3.7 s (movimiento continuo sobrio); la comparación visual
contaba el suavizado como cambio (mismo camino de raster para las dos imágenes); el video del celular
enseñaba un cuadro vacío (póster = cuadro final).
