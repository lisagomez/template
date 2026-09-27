# Resultados — generación de contenido para pymes (2026-09-27)

Rama `contenido-pymes`. Diseño: `docs/SDD-generacion-de-contenido.md` (§10 con lo medido).
Plan con candado: `.claude/PRPs/PRP-006-generacion-de-contenido.md`. Se escribió como PRP-005 y se
renumeró al cerrar: `main` ya tenía un PRP-005 (grafo de conocimiento). `goal.txt` conserva el texto
con el que se lanzó el goal, tal cual.

## Lo construido (fases autorizadas)

| Fase | Qué quedó | Cómo se prueba |
|---|---|---|
| 3 · Piezas | formatos por canal con zona segura, revisión visual automática, carruseles (temporada, paquete, tip), PNG desde el navegador | `piezas-1..7`; descarga de PNG con Playwright |
| 4 · Video | escena declarativa → cuadro SVG(t) → MP4 1080×1920 a 30 fps con efectos sintetizados; render local (Chromium sin red + ffmpeg) | `video-1..7`; `ffprobe`; misma huella en dos renders |
| 5 · Aprobación | huella SHA-256, pedir cambio con nota, editar revoca, CSV del mes | `aprobacion-1..6`; 0 salidas de red al aprobar |
| 6 · Laboratorio y app | galería visual con referencias y comparación por píxeles; `/estudio` con carruseles y video; `/estudio/aprobar` para el celular | suite en `validate`; 9 capturas en `capturas/` |
| 12 · Documentación | guía del dueño, READMEs del paquete, del laboratorio y del estudio | índice en el reporte final |

## Decisiones

- **El video es SVG por cuadro, no una librería de animación.** Una función pura `cuadroSvg(escena, t)`
  hace que el mismo cuadro sirva para la vista previa en el navegador, para la hoja de cuadros y para el
  MP4. Con eso el render es determinista y se puede comparar contra una referencia. No se usa GSAP ni
  código de god-animation, edicion-de-video o sfstudio: de ellos solo se tomaron ideas (curvas de
  salida, franjas seguras, escalonar la entrada).
- **Sin personas por construcción, no por revisión.** Los tipos de capa están cerrados (etiqueta,
  titular, apoyo, precio, marca). Una capa de foto no pasa `revisaEscena` (`video-4`).
- **MP4 determinista**: `libx264` con un solo hilo, `bitexact` y sin metadatos. Sin eso, dos renders
  daban bytes distintos y no se podía aprobar por huella.
- **El PNG se hace en el navegador del dueño**: el servidor no necesita librerías de imagen, y la pieza
  no sale de su equipo.
- **El render de video vive en el servidor solo para uso local.** Playwright es dependencia de
  desarrollo y la imagen de producción no trae ffmpeg: si faltan, la ruta responde 501. Llevarlo a
  producción es la fase 10 (bloqueada).
- **La aprobación vive en la sesión del navegador.** Guardarla con cuentas pide `/add-login` (fase 9,
  bloqueada).
- **Las referencias visuales se aprueban a propósito** (`npm run contenido:referencias`): el laboratorio
  compara contra huellas versionadas, no contra lo que salga hoy.

## Formas de estar mal, y cómo se resolvieron

| Riesgo | Qué pasaba | Resuelto |
|---|---|---|
| El precio tapado por los botones en 9:16 | la historia ponía el precio en el 35 % de abajo | disposición calculada dentro de la caja segura; `piezas-2` y `video-1` lo vigilan |
| Copia falsa en el carrusel | «pan de muerto desde el 1 nov» no era un dato; la nota interna del brief salía como texto | portada con las fechas de la celebración y «Para Día de Muertos»; `piezas-3` |
| Video congelado | después de ~2.3 s ya no se movía nada | fondo con deriva continua y acercamiento de 3 %; `video-2` exige cuadros distintos |
| La comparación visual contaba el suavizado de fuentes | 1.9–2.4 % de diferencia entre dos imágenes iguales | los dos lados siguen el mismo camino de raster: 0.27–0.36 % |
| El video en el celular se veía vacío | el póster era el primer cuadro, antes de que entre el texto | póster = cuadro final |
| «Aprobar hace peticiones» | Playwright contaba una petición | era el `blob:` del video y el sondeo del botón de dictado del layout; salidas por aprobar: ninguna |

Además, trampas previstas desde el diseño (no fueron fallas encontradas): aprobar un carrusel a medias
(la huella cubre todas las láminas, `aprobacion-6`), precio sin confirmar (`piezas-6`), texto con código
en el nombre (`video-6`), nota vacía al pedir cambio (`aprobacion-3`).

## Lo que sigue bloqueado (y quién firma)

| Fase | Por qué no se construyó | Firma |
|---|---|---|
| 7 · Reel con voz o cara | **firmado el 2026-09-27** (las 14 preguntas de `pymes-marketing/propuesta-video.md`, con la respuesta recomendada); se construye en su propio goal, que empieza por las cuentas | firmado por el laboratorio |
| 8 · Foto de producto en el video | la foto puede traer personas; pide su propia revisión C4 | el laboratorio |
| 9 · Redacción con LLM y aprobación con cuentas | activar el LLM es otro CDC (llave y corrida real medida; los prompts del redactor ya se firmaron el 2026-09-27) y `/add-login` (C4, C7) | el laboratorio |
| 10 · Render en producción | Chromium y ffmpeg en la imagen: cambio de infraestructura | el laboratorio |
| 11 · Publicar o programar | fuera siempre | el dueño de cada pyme, a mano |

## `validate` después del commit

- **En un clon limpio** (esta rama, `main`, `origin/main` y el corpus `golden-sets`): `npm run validate`
  en verde completo, salida 0 — 152/152 gobernanza, 127/127 specs, 123/123 regresión, auditoría de
  credenciales limpia, inventario al día.
- **En el repo de trabajo** lo detiene `audita:secretos`, que lee **todas las ramas**: 3 hallazgos en
  `tools/grafo-conocimiento/` de la rama `grafo-fase1-contrato` (otro worktree, ya en `origin`). No son
  credenciales: son huellas de procedencia (`seed_sha256`, `motor_sha256`) sin el prefijo `sha256:`. Se
  arreglan en esa rama poniéndoles el prefijo; esta rama no la toca. Los demás gates, corridos uno por
  uno en el repo de trabajo, en verde.
- Lo que el gate cazó de esta rama: la guía del dueño sin asiento en el inventario (arreglado en el
  segundo commit). Y antes del commit, las huellas de las referencias sin prefijo y el PRP con un
  número ya usado en `main` (renumerado a PRP-006).

## Lo que no se midió

- El estreno con un cliente real: todo corrió con datos sintéticos.
- La zona segura de 9:16 (14 % arriba, 35 % abajo, 6 % a los lados) sale de guías publicadas por
  terceros; queda **a verificar en la guía oficial de Meta** antes de prometerla.
- Las fuentes dependen de lo instalado en quien rasteriza; no se empaquetó ninguna fuente.
