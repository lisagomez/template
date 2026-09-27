# Propuesta: herramientas de video para pymes mexicanas

> Para firma de la dueña (**lisagomez**). Es análisis: en este goal **no se construye, no se
> instala y no se llama a ninguna API**. Construir es el siguiente goal, con esta propuesta
> firmada. La evidencia de cada afirmación está en `triaje-video.md` (misma carpeta).
> Fecha: 2026-09-26. Pesos MXN con un **tipo de cambio supuesto de 18.50 MXN por dólar** (no es
> un dato medido; se reemplaza por el del día de la firma).

## En cinco líneas

1. Dos herramientas y una pantalla: **reel del celular** (corta y subtitula lo que el dueño graba), **tarjetas animadas** (promos y producto hechos por código con la marca del cliente) y una **sala de aprobación** en la app, en el celular del dueño.
2. Todo local por defecto y a **$0 en servicios**: transcripción con los motores que la fábrica ya midió (`tools/dictado`), render por código y ffmpeg. Un reel de 30 s cuesta unos 2–3 minutos de cómputo.
3. De las fuentes se conserva el **oficio** (determinismo, hoja de cuadros, sincronía medida, máster declarativo, escaneo de pantalla), no el código: ni las skills ni sfstudio tienen licencia.
4. La sala de sfstudio sirve como **modelo** de la aprobación del dueño, no tal cual: en la sonda, una página de otro origen le aprobó un post y le reescribió los recortes, no registra quién aprueba y en el celular no se puede usar.
5. Lo que decide todo es C4 (impacto en terceros): clientes, empleados o menores identificables sin consentimiento, y datos de clientes en pantalla, **no se pueden firmar**. Obligan a rediseñar: desenfoque y bloqueo por defecto.

## 1. Qué herramientas serían y para qué

| # | Herramienta | Para qué casos | Entra | Sale |
|---|---|---|---|---|
| 1 | **`reel-del-celular`**: corte + subtítulos | **Video del dueño a cámara con subtítulos** («3 cosas antes de comprar tu colchón», 30–60 s). **Reel de producto** grabado en la tienda (la panadería enseña el pan de muerto recién salido, 15–30 s). **Testimonio de cliente**, solo con consentimiento firmado. | 1 a 3 clips verticales del celular | Borrador 9:16 con cortes propuestos (silencios, arranques en falso, retomas), subtítulos con la fuente y colores de la marca, nombres y precios corregidos con el diccionario del negocio, más un `.srt` aparte |
| 2 | **`tarjetas-animadas`**: animación por código | **Promo de temporada** desde el calendario del estudio: Día de las Madres (10 de mayo), regreso a clases (agosto), Día de Muertos, Buen Fin (noviembre), quincena (15 y fin de mes), Navidad y Reyes. **Precio u oferta** con cifras que salen del catálogo o del CFDI, nunca inventadas. **Animación de producto** con la foto que tomó el dueño: acercamiento lento, capas, texto que entra con peso. **Cierre** con logo, dirección y WhatsApp. | La pieza del calendario (texto + SVG de la marca) o la foto del producto | Clips 9:16 de 3–8 s que se pegan al inicio o al final del reel, o que van solos |
| 3 | **Sala de aprobación** (pantalla dentro de la app del cliente, no es paquete aparte) | El dueño ve el borrador **en su celular**, marca «aquí corta» o «cambia este texto» en el segundo exacto y aprueba o pide cambios | El borrador ya aplanado en MP4 | Una decisión registrada: quién aprobó, cuándo, qué archivo exacto (huella SHA-256) y qué versión. **Aprobar no es publicar** |

**Formato, 9:16 primero**: 1080×1920, 30 cuadros por segundo, H.264 + AAC a 48 kHz, volumen a −14 LUFS, de 15 a 60 s. Subtítulos grabados en la imagen (mucha gente ve sin sonido), dentro de una zona segura para no chocar con los botones de la red y **sin tapar ojos, nariz ni boca** (regla que se conserva de god-animation). Cuadrado y 4:5 después; 16:9 fuera de v1.

## 2. Arquitectura sugerida (sin código)

**Contrato de la fábrica.** Cada herramienta es un paquete en `tools/` con el núcleo en TypeScript puro, sin React, Next ni Supabase. Lo pesado **se inyecta**, igual que en `tools/extractor-documental`:

| Interfaz inyectada | Implementación por defecto | Dónde corre | Coste |
|---|---|---|---|
| `Transcriptor` (el contrato de `@tu-scope/voz` 0.5.0, que ya usa `tools/dictado`) | Parakeet por sherpa-onnx (WER 3,3 %, RTF 0,048) o faster-whisper large-v3-turbo (WER 2,5 %, RTF 0,52), medidos en `tools/dictado` el 2026-09-15 sobre FLEURS es-419. Falta pedirles **marcas de tiempo por palabra**, que no están medidas | Servidor de la fábrica | $0 |
| `ContadorDeHablantes` | Diarización local de `@tu-scope/voz`: sirve para saber si en un clip habla alguien más que el dueño (lo usa la AISIA, §7) | Servidor de la fábrica | $0 |
| `RenderizadorDeTarjetas` | Chromium sin ventana: HTML → *seek* por cuadro → captura → ffmpeg, **con la red bloqueada** en la página. Reimplementación propia; si se prefiere algo hecho, HyperFrames (Apache-2.0, por verificar) | Servidor de la fábrica | $0 |
| `Codificador` | ffmpeg con `libx264` | Servidor de la fábrica | $0 |
| `Almacen` | Archivos del proyecto (bruto, transcripción, línea de tiempo, decisiones, máster) con fecha de borrado | Servidor de la fábrica | $0 |
| `ModeloDeLenguaje` (opcional) | Solo por `routing-modelos.json`, clase `capaz` o `ligero`, modelo pineado, uso a `contabilidad.ts` (sin datos de uso se guarda `null`) | Proveedor del modelo (el texto sale) | Centavos por reel (§6) |
| `GeneradorDeVideo` (opcional, **apagado**) | Seedance o Wan por Replicate, solo con firma y con tope | Proveedor (la foto sale) | Por segundo (§6) |

**Flujo de un reel:**

1. **Ingesta**: normalizar a 1080×1920 y 30 fps, audio a 48 kHz, **borrar los metadatos del archivo** (el celular guarda ubicación GPS) y, si se firma, reducir ruido localmente (`afftdn` de ffmpeg o DeepFilterNet).
2. **Transcribir** local, con marcas por palabra.
3. **Proponer cortes** con el método de edicion-de-video: marcar lo que se tira en vez de recortar al ras, dejar respiro en las fronteras de frase y buscar retomas por n-gramas. v1 por reglas; el LLM es opcional.
4. **Subtítulos** con el estilo del perfil de marca, corrigiendo nombres con el diccionario del negocio. Los precios y cifras se cotejan contra el catálogo o el CFDI; si no coinciden, se bloquea.
5. **Tarjetas** a partir de la pieza del calendario y el perfil de marca.
6. **Máster declarativo**: una sola fuente (línea de tiempo + decisiones) de la que salen el máster y lo que ve la sala. El de la skill (`print_master.py`) pasó 21/21 y armó un reel sintético de 30 s en 10,5 s; aquí se escribe uno propio.
7. **QA automática**: hoja de cuadros, sincronía, volumen y 48 kHz, deriva entre labios y audio, y **escaneo OCR de la pantalla** buscando datos personales y secretos. Si encuentra algo, bloquea el borrador.
8. **Sala de aprobación** en el celular del dueño.
9. **Entrega**: el archivo aprobado queda para descargar. **Publicarlo lo hace el dueño**; queda fuera de la herramienta (§9).

**Cómo encaja con el estudio de contenido.** El estudio ya produce calendario, textos e imágenes SVG por código con la marca del cliente. El video se cuelga de ahí:

- El **perfil de marca y voz** es la «biblia antes del código» de god-animation: colores, fuentes, tono y **lista de lo prohibido** (cifras inventadas, logos redibujados, clichés).
- Cada pieza del calendario gana una **«versión video»** (herramienta 2) con el mismo texto, ya aprobado en su versión escrita.
- El **reel del celular** entra como pieza nueva del calendario, con su fecha sugerida.
- El coste de cada corrida va a la **contabilidad**, y los casos de prueba al **laboratorio** con el mismo molde de `/laboratorio-voz`.

**Cuándo haría falta pagar.** Solo en dos casos, y los dos con firma:

- **Animación generativa** de una foto de producto, cuando el dueño quiera movimiento real y el acercamiento por código no le alcance.
- **Transcripción remota**, únicamente si el laboratorio demuestra que la local falla con el ruido real de la tienda, y solo para clips en los que habla únicamente el dueño.

Nada de pago en v1.

## 3. Qué se conserva del oficio, y con qué evidencia

| Pieza | De dónde | Evidencia de hoy | Cómo entra |
|---|---|---|---|
| **Invocación** (vara para todo público, «no te quedes con tu primera idea», solo restricciones de entrega) | god-animation `invocacion.md` | No medida (no se llamó a ningún modelo) | Modo opcional «animación libre» para una pieza especial, con tope de gasto y firma. No es el camino por defecto: el método original premia sesiones de horas en el modelo más caro |
| **Sincronía medida** | `sincronia.py` | Clip sintético sincronizado: 5,28× en 0 ms; desfasado 300 ms: 0,01× en 0 ms. Distingue bien, pero **los ms traen un sesgo de −80 a −115 ms** | QA de tarjetas con sonido y de subtítulos contra la voz. Se calibra antes de usar los ms como candado |
| **Determinismo** (semilla fija, sin reloj) | `oficio.md` + `sfrender` | Dos renders de la misma tarjeta dieron el **mismo hash por cuadro** | Regla del renderizador: el mismo borrador se reproduce idéntico para corregirlo |
| **Hoja de cuadros** («ver con ojos») | `hoja.sh` | 20 s en 9:16 → hoja 6×5 en 0,35 s | Se adjunta a cada borrador, para el dueño y para el laboratorio |
| **Escaneo de pantalla (keyscan)** | `keyscan.py` | No corrido (no hay `tesseract`). El script **imprime 18 caracteres** de cada hallazgo; la regla de la fábrica permite 4 | Se amplía de secretos a **datos personales** (teléfonos, direcciones, RFC, nombres en tickets o WhatsApp, placas). Reporta enmascarado a 4 caracteres y bloquea hasta cubrir |
| **Contrato tarjeta HTML → video** | `componentes-html.md`, `sfrender` | Humo: 15 cuadros exactos, transparencia `alpha_mode=1`; tarjeta 9:16 de 4 s en 18,2 s (MP4) y 24,9 s (con transparencia) | Contrato propio equivalente, no copia: raíz con duración y tamaño, una sola línea de tiempo en pausa y recursos dentro de la carpeta |
| **Máster declarativo + decisiones como datos** | `print_master.py`, `fixes.json` | 21/21 verde; reel sintético de 30 s en 10,5 s | Una sola fuente para sala y máster |
| **Método de corte** (lo que se tira, respiro, retomas, candado de orden: cortar → respiro → retomas → revisión → componer) | `cuts.md`, `breathe_edl.py`, `dedup_ngrams.py`, `compose_gate.py` | Leído, no corrido (no hay transcripciones reales) | Núcleo de la herramienta 1, reescrito para clips cortos |
| **Acabado de audio y deriva labios-audio** | `audio_master.py`, gate 9 de `qa_gate.py` | Deriva medida en el sintético: +0,023 s | QA. El resto de `qa_gate.py` se reescribe, porque bloquea el 9:16 |
| **«Mostrar el corte antes de gastar en efectos»** y **«revisar nombres antes de ponerlos en pantalla»** | SKILL.md, `text-corrections.md` | — | Orden del flujo y diccionario del negocio |
| **Sala de revisión** | `sfreview` | Ver la respuesta abajo | Modelo de la pantalla 3 |

**¿La sala de revisión sirve como la aprobación del dueño?** Como **modelo**, sí. Como está, **no**.

*Por qué sí, como modelo*, en sus pruebas:

- recortes sin volver a renderizar;
- marcadores con nota;
- decisiones exportadas como datos;
- persistencia tras recargar;
- **editar el texto revoca la aprobación** («nadie aprueba a ciegas un texto que cambió»);
- confinamiento de rutas (traversal → 403);
- 0 errores de consola.

*Por qué no, tal cual*, cuatro motivos medidos o leídos:

1. **La aprobación se puede falsificar.** Un POST desde otro origen le aprobó un post y le reescribió los recortes, y el servidor no valida `Host` ni `Origin`.
2. **No registra quién aprueba.** `approved_at` es solo una hora: no guarda identidad ni la huella del archivo aprobado.
3. **No sirve en el celular.** Recortar y marcar es solo con teclado (no hay botones para S/A/D/M), y la composición en vivo usa WebM con transparencia, que según su propio CLAUDE.md Safari no decodifica (en iPhone todos los navegadores usan WebKit).
4. **No tiene licencia.**

*Lo que se propone*:

- mostrar el **MP4 ya aplanado**;
- botones grandes: aprobar, pedir cambio con nota en el segundo exacto, quitar un tramo;
- **sesión autenticada** (`add-login`);
- registro de quién, cuándo, huella SHA-256 del archivo y versión;
- validar `Origin` y token;
- cualquier cambio posterior revoca la aprobación;
- **aprobar ≠ publicar**.

## 4. Qué se sustituye y qué se descarta

**Se sustituye (por algo local o sin coste):**

| Original | Sustituto | Coste |
|---|---|---|
| ElevenLabs Scribe (voz completa a EE. UU.) | `tools/dictado`: Parakeet o faster-whisper, local | $0 |
| MLX Whisper (solo Mac) | faster-whisper en Linux/WSL | $0 |
| video-use (de terceros, no incluido; «primario, siempre») | Reglas locales + LLM opcional sobre el texto + recorte del dueño en la sala | $0 (LLM: centavos) |
| Nano Banana / GPT Image para el B-roll | Foto real del producto + SVG del estudio + movimiento por código | $0 |
| Seedance / Wan (imagen → video) | Acercamiento, paneo y capas por código | $0 (opcional de pago con firma) |
| `h264_videotoolbox` (solo Mac) | `libx264` | $0 |
| GSAP (licencia externa sin leer) | Animaciones CSS / Web Animations API con *seek* determinista | $0 |
| Música y banco de efectos del autor | Sin música incrustada (el dueño elige la de la app de la red al publicar) + efectos sintetizados propios, idea de `gen_sfx.py` | $0 |
| Tabla de nombres de marcas de IA | Diccionario del negocio (ya existe en `tools/dictado`) | $0 |
| `qa_gate.py` 16:9 | QA propia 9:16 | $0 |
| sfstudio (sin licencia) | Reimplementación en limpio o HyperFrames (Apache-2.0, por verificar) | $0 |

**Se descarta:**

- **Gusto de canal**: estructura de video de 20 min, CTA antes del minuto 5, estética de Iman, Benja o Santi, Luminorphism y Titaniumorphism, subtítulo #06 morado, logos 3D de marcas de IA, lower-third del autor, galería de posts de X.
- **Infraestructura del autor**: `sfpublish`, `channel-defaults.json`, `saasfactory.so`, links rastreados, su Supabase, la galería de lanzamientos, el adapter con rutas fijas.
- **Prácticas riesgosas**: bajar clips ajenos con `yt-dlp`, capturas con la sesión real del navegador, `studio_unmute.py` (parcha paquetes de otros), exportar llaves del `.env` al shell, sesiones autónomas sin tope.

## 5. Licencias por resolver

| Pieza | Licencia | Qué permite / qué no | Acción |
|---|---|---|---|
| Skill god-animation | **No declarada** | Leer y aprender ideas, sí. Copiar texto o scripts, no sin permiso | **Pedir permiso al autor** si se quiere citar o copiar algo. Mientras tanto, **reescribir desde las ideas** |
| Skill edicion-de-video | **No declarada** | Igual | **Pedir permiso al autor** / reescribir |
| sfstudio @ `2a751fd` | **`UNLICENSED` + `private`, sin LICENSE** | Leer y probar en un clon aislado, sí (hecho). Copiar código a `tools/` o `src/`, no | **Pedir permiso escrito al autor (Daniel Carreón)** y, sin esperar la respuesta, **sustituir**: reimplementación en limpio o HyperFrames |
| GSAP 3.15.0 (`assets/gsap.min.js`, también en `demo/` de sfstudio) | «Copyright 2026, GreenSock. All rights reserved. Subject to the terms at gsap.com/standard-license» | Los términos no vienen en el paquete y **no se leyeron**. Redistribuir el `.min.js` copiado: no sin leerlos | **Sustituir** por CSS / Web Animations API. Si se prefiere GSAP: leer y firmar su licencia e instalarlo pineado desde npm, nunca copiado |
| Cormorant Bold, Inter ExtraBold, Montserrat ExtraBold | **SIL OFL 1.1** (verificado en cada TTF) | Usar, incrustar en video y redistribuir con el aviso y el texto de la OFL, que no vienen en el paquete. No se venden solas | **OK**, pero bajarlas de su fuente oficial con su `OFL.txt`. El Cormorant del paquete es una conversión. Mejor aún: las fuentes del perfil de marca del cliente |
| Playwright 1.61.1 | Apache-2.0 (verificado en `package-lock.json`) | Uso y redistribución con aviso | **OK** |
| HyperFrames | Apache-2.0 según el SPEC de sfstudio | Uso con aviso de copyright y NOTICE | **Verificar** en su repo antes de adoptarlo |
| video-use (browser-use) | No verificada | — | **No usar** (se sustituye) |
| DeepFilterNet | No verificada | — | **Verificar** si se adopta; si no, `afftdn` de ffmpeg |
| Pesos de Wan 2.2 | Apache-2.0 según `models-i2v.md` | — | **Verificar** solo si algún día se firma video generativo autohospedado |
| Logo de Google en `demo/` de sfstudio | Marca registrada de un tercero | No se copia | **Descartar** |
| Música comercial | Derechos de terceros | No incrustarla | **Sustituir** por la biblioteca de la app de la red al publicar |

## 6. Coste estimado por pieza

**Supuestos:**

- Pieza = reel de 30 s en 9:16 a partir de 60–90 s de material bruto del celular, con 3 tarjetas de 4 s y una ronda de revisión.
- Máquina de referencia: Ryzen 7 5700G, 16 hilos, WSL2 (donde se midió todo).
- Precios de servicios: los que documenta la fuente (`references/models-i2v.md`, jun 2026, USD) y `routing-modelos.json`.
- 18.50 MXN/USD supuesto.

**A. Solo local**: $0 MXN en servicios.

| Paso | Tiempo | Origen del dato |
|---|---|---|
| Transcribir 90 s | ≈ 4 s (Parakeet) a ≈ 47 s (faster-whisper turbo) | RTF medido en `tools/dictado`; **las marcas por palabra no están medidas** |
| 3 tarjetas de 4 s | ≈ 55 s (MP4) a ≈ 75 s (con transparencia) | Medido hoy: 18,2 s y 24,9 s por tarjeta |
| Imprimir el máster de 30 s con overlays y cortes | 10,5 s | Medido hoy, material sintético |
| Aplicar recortes de la sala | ≈ 2–7 s | Medido hoy: 2,4 s para 10 s |
| QA (hoja, sincronía, volumen, deriva) | ≈ 20 s | Estimado: hoja 0,35 s + sincronía 2–4 s + volumen/deriva **no medido para 30 s** |
| Ingesta y reducción de ruido | — | **No medido** |
| **Total** | **≈ 2–3 min de cómputo, $0** | Electricidad y tiempo del dueño revisando: **no medidos** |

**B. Con servicios de pago** (opcionales, con firma):

| Qué | Cálculo | USD | MXN (supuesto) |
|---|---|---|---|
| Animar 2 fotos de producto, 5 s c/u, Seedance 2.0 Mini 720p | 2 × 5 s × $0.056 | $0.56 | ≈ $10.36 |
| Lo mismo con Seedance 2.0 a 1080p | 2 × 5 s × $0.68 | $6.80 | ≈ $125.80 |
| Lo mismo con Wan 2.2 | 2 × 5 s × $0.05–0.08 | $0.50–0.80 | ≈ $9.25–14.80 |
| 3 imágenes generadas de apoyo (Nano Banana, «5 por ~$0.15») | 3 × ~$0.03 | ≈ $0.09 | ≈ $1.67 |
| LLM para proponer cortes y frases de subtítulo (clase `capaz`, $2/$10 por millón de tokens) | ~3 mil tokens de entrada + ~1 mil de salida | ≈ $0.016 | ≈ $0.30 (**estimado, no medido**; se registra en contabilidad) |
| Transcripción remota (ElevenLabs Scribe) | — | **no documentado** | **no documentado** |
| Modo «animación libre» de god-animation (sesiones largas) | — | **no documentado** | **no documentado** (fuera del default) |
| Referencia de la fuente: «edición típica con B-roll» (5 imágenes + 5 clips Mini, contexto YouTube 16:9) | ~$1.6 | ~$1.6 | ≈ $29.60 |

Ejemplo mensual: 8 reels al mes solo locales = $0. Los mismos 8 con 2 animaciones Mini cada uno = 8 × $0.56 = $4.48 USD ≈ $82.88 MXN.

## 7. AISIA corta (C4): voz e imagen

**Quién sale en cámara, y qué implica:**

| Persona | Situación | Quién firma |
|---|---|---|
| **El dueño** | Titular | Puede firmar lo propio |
| **Empleados** | Terceros en relación de trabajo | Su consentimiento debe ser por escrito, libre (negarse no puede traer consecuencias) y revocable. El dueño **no firma por ellos** |
| **Clientes** | Terceros | Testimonio solo con formato firmado. Si salen al fondo sin consentimiento, no deben quedar identificables |
| **Menores** | Terceros | Nunca (recomendado) |
| **Transeúntes** | Terceros | Igual que clientes de fondo |
| **Lo que aparece en pantalla o papel** | Tickets, chats de WhatsApp, libretas con nombres y teléfonos, CFDI con RFC, placas | Datos de terceros |

Además: el audio con voces de otros, y la ubicación del negocio, en el fondo y en los metadatos del archivo.

**Qué sale del perímetro en cada variante:**

| Variante | Qué sale | A dónde |
|---|---|---|
| A. Solo local (recomendada) | **Nada** | Todo queda en el servidor de la fábrica hasta que el dueño publique, y eso queda fuera |
| B. + LLM sobre la transcripción | El **texto** de lo dicho | Al proveedor del modelo, por `routing-modelos.json` |
| C. + transcripción remota | La **voz completa** de todos los que hablan | ElevenLabs (EE. UU.) |
| D. + video generativo | Las **fotos**, y las caras si hay personas. El modelo puede deformarlas: es contenido alterado | Replicate (EE. UU.) |
| Publicar (fuera de la herramienta) | Todo | Redes. **Irreversible**: copias y descargas que no se pueden recuperar |

**Consentimiento.** Un formato por persona identificable: qué video, para qué redes, por cuánto tiempo y cómo retirarlo. Se guarda con el proyecto. La QA cuenta caras (detección local, **no** reconocimiento: no se hacen huellas biométricas) y hablantes (diarización local de `@tu-scope/voz`). Si hay más caras o voces que personas con consentimiento registrado, el borrador se bloquea.

**Retención.** Recomendado:

- el bruto y su transcripción se borran a los 30 días de aprobado el reel;
- se conservan el máster aprobado, el registro de aprobación y los consentimientos;
- los metadatos de ubicación se borran al entrar.

**Derecho a borrar.** Un «borrar proyecto» verificable borra bruto, transcripción, máster y registros de nuestro almacén. Si un empleado o cliente retira su consentimiento, se borra de nuestras copias y se avisa al dueño para que lo baje de sus redes. Lo ya publicado no se puede recuperar: por eso publicar siempre es decisión humana.

**Marco (por verificar con asesoría legal).** Imagen y voz son datos personales (LFPDPPP); usarlas para identificar a alguien las vuelve biométricas y sensibles. El retrato de una persona requiere su consentimiento (Ley Federal del Derecho de Autor, art. 87).

**Riesgos que no se pueden firmar** (el daño cae en terceros que no firmaron). Ninguna firma de la dueña o del cliente los autoriza; obligan a **rediseñar**:

1. **Clientes, transeúntes o menores identificables sin consentimiento.** Por defecto se desenfocan todas las caras menos la de la persona que el dueño marca como sujeto con consentimiento, o se descarta el clip. La sala no deja aprobar mientras haya caras sin cubrir.
2. **Datos de clientes en pantalla** (tickets, chats, RFC, teléfonos). El OCR local bloquea hasta cubrirlos, y reporta enmascarado a 4 caracteres.
3. **Voz de terceros hacia un servicio remoto.** Si la diarización local cuenta más de un hablante, la transcripción remota no se ofrece.
4. **Generar o alterar con IA a personas reales**: animar la foto de un empleado, clonar la voz del dueño, avatares. Prohibido; lo generativo solo toca producto sin personas.
5. **Cortes que cambian el sentido de lo que dijo un tercero** (testimonios). Un corte dentro del habla de otra persona se marca para revisión explícita, y la transcripción íntegra se guarda con el consentimiento.

## 8. Preguntas que la dueña tiene que firmar antes de construir

Cada una lleva la opción recomendada.

1. **Alcance de v1.** ¿Qué se construye? → *Recomendado: herramienta 1 (reel del celular) + herramienta 2 (tarjetas animadas) + la sala de aprobación en la app. Fuera: 16:9 y video generativo.*
2. **Dónde corre.** → *Recomendado: en el servidor propio de la fábrica, sin nubes de proveedores de video.*
3. **Transcripción.** → *Recomendado: solo local (`tools/dictado`). Remota, nunca por defecto; si algún día se firma, solo clips con un solo hablante (el dueño).*
4. **LLM sobre la transcripción** para proponer cortes y frases de subtítulo. → *Recomendado: v1 por reglas locales. El LLM queda como opción con firma C4, por `routing-modelos.json`, y su coste a la contabilidad. Implica entrada de CDC por los prompts nuevos.*
5. **Video generativo (Seedance / Wan).** → *Recomendado: no en v1. Si se firma: solo fotos de producto sin personas, tope de $1 USD (≈ $18.50 MXN) por pieza y tope mensual por cliente, y declarar «contenido alterado» al publicar.*
6. **Quién puede salir en cámara.** → *Recomendado: el dueño, y empleados con consentimiento escrito y revocable. Clientes solo en testimonios con formato firmado. Menores nunca. El fondo sin consentimiento se desenfoca o el clip se descarta.*
7. **Retención.** → *Recomendado: bruto y transcripción, 30 días tras la aprobación. Se conservan máster, registro y consentimientos. La ubicación se borra al entrar.*
8. **Forma de la aprobación.** → *Recomendado: en el celular del dueño, con sesión autenticada y registro (quién, cuándo, huella del archivo, versión). Cualquier cambio revoca. Aprobar ≠ publicar.*
9. **Licencias de las fuentes.** ¿Se pide permiso al autor de las skills y de sfstudio? → *Recomendado: sí, pedir permiso escrito a Daniel Carreón de todos modos, pero construir en limpio sin depender de su respuesta.*
10. **GSAP.** → *Recomendado: no usarlo (CSS / Web Animations API). Solo se usaría leyendo y firmando su licencia, instalado pineado desde npm.*
11. **Fuentes tipográficas.** → *Recomendado: las del perfil de marca del cliente. Las genéricas OFL, de su fuente oficial y con su `OFL.txt`.*
12. **Música.** → *Recomendado: sin música incrustada; el dueño la agrega en la app de la red al publicar. Efectos sintetizados propios, opcionales.*
13. **Temporadas de las plantillas.** → *Recomendado: Día de las Madres, regreso a clases, Día de Muertos, Buen Fin, quincena, Navidad y Reyes. Confirmar o ajustar.*
14. **Laboratorio del siguiente goal.** ¿Se exigen al menos 5 casos por herramienta, con casos trampa? → *Recomendado: sí. Mínimo: cliente al fondo sin consentimiento, ticket con teléfono en pantalla, precio que no coincide con el catálogo, clip horizontal, audio con música ajena, dos hablantes.*

## 9. Qué queda fuera, siempre con decisión humana

- Publicar en Instagram, Facebook, TikTok, YouTube o estados de WhatsApp.
- Programar publicaciones, subir a YouTube, posts de comunidad, links rastreados.
- Conectar cualquier cuenta o MCP de una red social. Conectar algo exige además modelo de amenazas (C3) y AISIA (C4).
- Todo `sfpublish`.
- Anuncios pagados.
- Bajar videos ajenos.
- Música comercial.
- Clonación de voz, avatares y reconocimiento facial.
- 16:9 largo.

La herramienta entrega un archivo aprobado; **quien publica es el dueño**.

## 10. Formas en que esta propuesta podría estar mal

1. **Marcas por palabra** de los motores locales: no están medidas. Si fallan en español mexicano con ruido de tienda, los subtítulos sincronizados se complican, y es el primer caso del laboratorio.
2. **Tiempos**: medidos en una máquina de 16 hilos. En un servidor más chico, las tarjetas con transparencia pueden tardar varias veces más.
3. **Sesgo de la sincronía**: se midió con pitidos sintéticos, no con voz real.
4. **Legibilidad** de los subtítulos grabados en pantallas chicas y tras la recompresión de cada red: no medida.
5. **Lectura legal** (LFPDPPP, art. 87, OFL, obras sin licencia) y **licencia de GSAP**: sin revisar por un abogado ni leída.
6. **Precios de los servicios**: son los que documenta la fuente (jun 2026); no se verificaron con los proveedores.
7. **La sonda de origen ajeno** se hizo con `curl`. Un navegador real podría pedir un permiso extra, pero el diseño propuesto no depende de eso.
