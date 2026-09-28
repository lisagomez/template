# Triaje de las 12 fuentes — pymes, contenido y marketing

Checkpoint de la fase 1 (lazo L1). Detalle y citas línea por línea: `triaje-plugin.md` (9 skills del
plugin) y `triaje-video.md` (2 skills de video y sfstudio). Aquí, la tabla y dónde quedó cada una.

**Pineos verificados el 2026-09-26, antes de leer:**
- plugin `small-business` — `git rev-parse HEAD` = `da38ec1ee89d41e5380e652a97382695003396e7`, `autoUpdate: false`.
- skills de video — `sha256sum -c` sobre `fuentes-video.sha256`: **64/64 OK** (antes y después de correr sus scripts).
- sfstudio — clon fuera del repo, `HEAD` = `2a751fdfc921a1d7c292a541b3d6cada7a245350`.

| # | Fuente | Conserva | Reemplaza (entrada local, México) | Descarta | Riesgo | Veredicto → dónde quedó |
|---|---|---|---|---|---|---|
| 1 | brand-style (+ voice-profile) | Nunca pedir hex; vista previa sobre componentes reales; guardar solo con un «sí»; voz con saludo/despedida exactos y lo que nunca dice | WebFetch → HTML pegado o liga; memoria de Cowork → estado del proyecto | Entregas a Notion/Canva | C3 (HTML ajeno); C4 si las muestras vienen de chats | Adaptada → `./marca` + voz en el núcleo |
| 2 | content-strategy | Top/lentos, 30 contra 30 días, estructura del brief (empujar · mantener · reposicionar · temporada · ofertas), inventario no verificado, margen | QuickBooks/PayPal → **CFDI 4.0** (lector real del extractor) + CSV de caja; «benchmarks» inexistentes → calendario comercial MX | Escritura a QuickBooks | C4 (RFC del receptor: solo huella) | Adaptada → `./ventas` + `./contenido` |
| 3 | social-content-engine | Calendario que se extiende, cadencia por tamaño (2/sem), mezcla 40/30/20/10, reuso por canal apuntando al origen, precio solo confirmado | HubSpot/Notion → calendario en la app; Canva → **SVG por código** con la marca | Publicar o programar | C4 (fotos de clientes → «falta algo» con permiso) | Adaptada → `./contenido` |
| 4 | canva-creator | Columna ruta, correo solo texto, verificar cada imagen | Canva → SVG por código | Toda la plomería de Canva/HubSpot | IRR original (programar = publicar) | Fusionada en `./contenido` |
| 5 | review-reputation | Temas con citas textuales, sin promediar plataformas, <60 palabras, negativa en 4 partes, no inventar «qué cambió», una por una, callados por ritmo propio | Google/Yelp/HubSpot → reseñas exportadas o pegadas | Publicar respuestas, enviar recuperaciones | **C3 alto, C4 alto** | Adaptada con AISIA → `./resenas` |
| 6 | seo-ai-visibility | 7 rastreadores, desbloquear = decisión del dueño, sin calificación global, 5 hallazgos por impacto, arreglos como archivos «POR CONFIRMAR», texto para IA = hallazgo | WebFetch → HTML/robots pegados; Wix → archivos para copiar | Escribir en el sitio; prueba del asistente con el LLM propio | C3 (páginas ajenas) | Adaptada → `./visibilidad` (lectura por URL pendiente: SSRF) |
| 7 | ad-manager | Mínimos antes de concluir, semáforo contra promedio propio, «sin veredicto», monto mensual absoluto, +20 % máx., 3 variantes, brief creativo | TikTok/Zapier → **CSV exportado** (Meta/Google/TikTok); ejecutar → bloque «cómo hacerlo tú» | Ejecutar en la cuenta | IRR original (presupuesto, pausar, publicar) | Adaptada → `./pulso` |
| 8 | growth-pulse | Umbrales de `thresholds.md`, vista sin datos nombrada, máx. 3 acciones, «nada urgente» válido | HubSpot → n/a nombrado; ventas → CFDI/CSV | Post a Slack | C4 bajo | Adaptada → `./pulso` |
| 9 | marketing-monday | Fusión con frase que conecta, 5 partes, respuestas en cola aparte, fuente caída nombrada, no «programado» | Escaneo de competencia → notas del dueño (observado/inferido) | Slack, «set the schedule» | C3/C4 | Adaptada → `./pulso` (brief del lunes) |
| 10 | god-animation | Determinismo, hoja de cuadros, sincronía medida, lista de prohibidos, palancas de invocación | Imágenes generadas → foto del producto + SVG | Galería de X, estilos del canal | C4 solo en modo mixto con personas | **Oficio, no herramienta** → `propuesta-video.md` |
| 11 | edicion-de-video | Contrato tarjeta HTML→video, máster declarativo, keyscan, −14 LUFS | Scribe → dictado local; Seedance/Nano Banana → movimiento por código | Gusto del canal, publicación | **C4 alto** (voz a ElevenLabs, imágenes a terceros) · licencia no declarada · GSAP «all rights reserved» | No se instala → `propuesta-video.md` |
| 12 | sfstudio | Render determinista (mismo framemd5), webm con alfa, sala como modelo, «editar revoca la aprobación» | Reimplementar en limpio | Toda la etapa 2 (sfpublish), dominios del autor | **C3**: POST desde otro origen reescribió `fixes.json`; `UNLICENSED` | Referencia de arquitectura, no dependencia → `propuesta-video.md` |

**Pruebas de sfstudio** (clon aislado, sin red: `unshare -rn … npm test`): **7/9 verdes** en 10,4 s. Los 2
rojos, diagnosticados: el arnés espera TAP y Node 24 no lo da por defecto (directo: 69/69), y el humo de la
sala falla solo en el resaltado de ligas `/go/` del panel de publicación. Todo lo de edición pasó.
`sfpublish` no se corrió nunca.
