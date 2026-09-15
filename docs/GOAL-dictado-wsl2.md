# Dictado en WSL2 alineado con `tools/voz` — Spec para `/goal`

> Compilado con `/goal-compiler` el 2026-09-14. Forma: **LOOP**. Decisiones del dueño: el resultado es
> **análisis + prototipo medido en esta WSL2**, y vive **dentro del template como herramienta reutilizable**
> (`tools/<nombre>/`, contrato de `docs/EMPAQUETAR-HERRAMIENTA.md`), no como repo aparte: «este template es
> para herramientas que posteriormente se puedan usar en otros proyectos». Y el motor de STT puede ser
> **local en CPU o un servicio propio con GPU en un VPS**: el perfil GPU se diseña ahora y se **mide cuando
> exista** el VPS (hoy no hay ninguno configurado); hasta entonces se declara «sin medir», no se estima.

## MISION

Que exista **`tools/dictado/`** (`@tu-scope/dictado`; el nombre es sugerencia, el sitio no): la herramienta
de dictado de la fábrica, que toma lo que `sflow` (github.com/daniel-carreon/sflow, MIT) resolvió bien para
macOS —hablar y que el texto aparezca donde está el cursor, con historial, diccionario, snippets y
comandos de voz— y lo vuelve **reutilizable, local y medido**, sobre `tools/voz` como detector de voz y
con un motor de transcripción en CPU elegido por datos. Y que quede escrito, con cifras, **si sflow se
alinea con `tools/voz` y hasta dónde**: es la pregunta original y no se contesta con opinión.

La realidad que debe existir al terminar:

1. **Dictado en esta WSL2, de verdad.** El humano habla al micrófono (WSLg → PulseAudio, ya medido:
   captura), `tools/voz` corta los turnos (VAD), un motor local transcribe en CPU y el texto aparece
   donde está el cursor en Windows (Windows Terminal con Claude Code, VS Code, el navegador). El
   disparo (mantener tecla, doble toque, manos libres por VAD, toggle) es tuyo: los hechos que lo
   condicionan están abajo.
2. **Precisión y velocidad medidas, no citadas.** WER en **español** sobre un corpus con referencia
   (dices cuál y de dónde salió), latencia fin-de-habla → texto (p50/p95), RTF y RAM, para **al menos
   dos motores** de CPU en esta máquina (Ryzen 7 5700G, 16 hilos, 15 GB, sin CUDA). El motor y los
   umbrales por defecto salen de esa tabla, con fecha, corpus y hardware escritos al lado. Es la regla
   de `tools/voz`: *lo que no se ha medido contra pesos reales no está aprobado, está sin medir.*
   El mismo `mide` tiene que poder correr **en el VPS con GPU sin cambios**, y hasta que corra allí el
   README dice «GPU: sin medir» — igual que RPO/RTO no se declaran sin GATE 3.
3. **Lo que sflow ya sabía, portado con criterio.** Diccionario personal y su aprendizaje, snippets,
   comandos de voz, limpieza opcional por LLM (apagada por defecto, como en sflow), historial local
   consultable. Lo macOS-only (píldora Cocoa, menú de barra, MLX, Accessibility, `pyobjc`) **no se
   porta: se sustituye o se descarta**, y el documento dice cuál y por qué.
4. **La alineación demostrada en los dos sentidos.** `tools/voz` da VAD y diarización y define el
   enchufe `Transcriptor` sin transcribir; el dictado le pone el transcriptor. Y al revés: un wav de
   reunión con dos o más personas sale con **turnos etiquetados por `voz` y texto por `dictado`**. Si
   a `voz` le falta algo para esto, se le añade como cambio versionado con pruebas y `npm run mide`.
5. **El documento de alineación** (`docs/SDD-dictado.md` o el nombre que decidas): mapa módulo a
   módulo de sflow → *portado / sustituido / macOS-only descartado*, qué aporta `tools/voz`, qué le
   faltó, las restricciones de WSL2 medidas (micrófono, teclas globales, pegado), la tabla de motores,
   los casos de uso y el **veredicto**: ¿se puede alinear? con qué coste y qué queda fuera.
6. **Herramienta de la casa, no app suelta**: `npm run empaqueta dictado` en verde con su línea
   `integracion` (tarball instalado en un proyecto limpio e importado), README con los cinco usos y
   los números, `pruebas/` sin modelos ni red, `medicion/` con pesos reales.

7. **Perfil GPU en VPS propio, como en el extractor.** Un `servicio/` de transcripción que se levanta con
   `docker compose` en dos configuraciones —solo CPU, y CPU más GPU—, detecta la GPU y hace el resto
   (`configura:deploy` ya la mide como un recurso más; `docs/DEPLOY-HETZNER.md` es el runbook). El
   `Transcriptor` remoto es **la misma interfaz** que el local: el dictado elige por caso de uso
   (latencia con red incluida para dictar, precisión y lotes largos para reuniones) y **sigue
   funcionando entero sin el VPS**. Es una superficie de red por la que viaja audio: lleva modelo de
   amenazas (C3: autenticación obligatoria, TLS, sin endpoint público sin gate humano) y decisión de
   flujo de datos escrita (C4: sale de la máquina, pero a infraestructura del dueño, no a un tercero).

Casos de uso WSL2 que tienen que funcionar: **(a)** dictar prompts a Claude Code en la terminal de
WSL; **(b)** dictar en cualquier app de Windows; **(c)** transcribir un archivo o reunión por lotes,
con hablantes; **(d)** modo archivo para medir; **(e)** el mismo dictado y los mismos lotes contra el
servicio remoto con GPU cuando exista, sin cambiar de herramienta.

## LIBERTAD TECNICA

Tú eliges motor(es) de STT, runtime (Node/ONNX vía `onnxruntime-node` como hace `voz`, `sherpa-onnx`,
`whisper.cpp`, CTranslate2 en un venv 3.12 con `uv`, u otro), forma del disparador, cómo se pega en
Windows, si hay TUI/daemon/servicio, cómo se guarda el historial, y cómo partes núcleo y entry points.
Todo lo que aquí suena a tecnología es **hecho descubierto o sugerencia descartable**, salvo
RESTRICCIONES. Optimiza por el mejor dictado posible en esta máquina, no por el camino corto.

## HECHOS MEDIDOS EL 2026-09-14 (para que no los redescubras)

- **sflow** (v1/v2, Python 3.12, 4 278 líneas): PyQt6 píldora, `sounddevice` 16 kHz mono int16,
  `pynput` (Ctrl+Shift mantener; doble toque Ctrl manos libres), transcriptores Groq
  (`whisper-large-v3-turbo`), MLX whisper-turbo local (M4: ~950 ms, WER 2,9 % en voz real es) y
  Parakeet v3 MLX (~280 ms), `llm_cleanup` (llama-3.3-70b, apagado), `dictionary(_learner)`,
  `snippets`, `command_mode`, `smart_commands`, `focus_mode`, `paste` (Quartz), SQLite, Flask :5678.
  **13 de ~20 módulos tocan AppKit/Quartz/MLX/pyobjc.** `sflow-next` (v3, Swift) es **404** en GitHub.
  Sus 20 wavs de `audio/` son tomas de ~2,4 s, 16 kHz, **sin transcripción de referencia**.
  El clon de lectura del 2026-09-14 vivía en el scratchpad de aquella sesión y **ya no existe**: clónalo
  de nuevo en el tuyo (`git clone --depth 1 https://github.com/daniel-carreon/sflow`) antes del mapa.
- **`tools/voz`** v0.4.0: núcleo TS sin deps; `ModeloVoz` (Silero ONNX o `modeloEnergia`),
  diarización por lotes y en vivo, `Transcriptor { transcribe(audio, hz) → { texto } }` y
  `transcribeTurnos` en serie; entry points `./browser` y `./node` (`leeWav`, `preparaParaModelo`,
  Silero por `onnxruntime-node`); **91 pruebas en verde en 0,2 s** (`npm run prueba`); `npm run mide`
  contra pesos reales sobre LibriSpeech **inglés** (VAD, embeddings, segmentación; no WER).
- **Esta WSL2**: kernel 6.6.87.2-WSL2; WSLg con `PULSE_SERVER=unix:/mnt/wslg/PulseServer`;
  `ffmpeg -f pulse -i default` **captura** (2 s: media −51,9 dB, pico −37,1 dB en silencio: micrófono
  bajo → el VAD por energía puede fallar, Silero no). Sin `pactl`, sin `arecord`, sin `/dev/input` del
  teclado de Windows: **una tecla global solo se puede oír del lado Windows** (`powershell.exe` está;
  AutoHotkey no). Pegar en Windows: `clip.exe` + enviar ^v desde `powershell.exe`. `/dev/dxg` existe
  pero **no hay CUDA** (iGPU Radeon). Node 22, `uv` con Python 3.12 y 3.11 instalados, sistema 3.14.
  No hay whisper/onnxruntime/sherpa instalados.
- **VPS**: hoy **no hay ninguno configurado** (sin `.env.production`). El patrón de la casa ya existe:
  `tools/extractor-documental/servicio/` (Dockerfile, `servidor.mjs`, `configuracion.mjs`), la GPU
  como perfil del VPS en `docs/GOAL-extractor-en-infra-del-cliente.md`, `npm run configura:deploy`
  que mide CPU/RAM/GPU en el servidor, y `docs/DEPLOY-HETZNER.md` (SSH por clave, sin password).

## INVESTIGA ANTES DE CONSTRUIR

- `docs/CREAR-UNA-HERRAMIENTA.md` (puerta y quién decide qué) y `docs/EMPAQUETAR-HERRAMIENTA.md` (el
  contrato); `tools/ejemplo-herramienta/` (andamio), `tools/voz/` entero (README, `src/types.ts`,
  `src/asr/adaptador.ts`, `medicion/mide.mjs`, `pruebas/`), `tools/extractor-documental/` (una
  herramienta con `servicio/`, `medicion/` y `banco/`: el patrón de la casa para medir).
- El código de sflow, módulo a módulo, para el mapa de alineación. Es MIT: lo que portes literal lleva
  atribución en el documento.
- 2-3 referencias world-class de dictado local en CPU (motores, latencias publicadas, cómo miden WER en
  español) y de dictado sistema-completo en Linux/Windows sin permisos de accesibilidad de macOS.
- 2-3 servidores de inferencia de STT para GPU (los que sirven Whisper/Parakeet por HTTP con lotes y
  streaming) y cómo se autentican: el servicio se elige por eso, no por moda.
- Corpus en español con transcripción de referencia, libre y pequeño (unas decenas de minutos bastan):
  di cuál, de dónde, y cómo lo preparaste.

Reafirma el objetivo en una línea antes de cada edición grande para no driftar.

## DEFINICION DE HECHO (evidencia visible en la conversación)

1. `tools/dictado/` con la forma de la casa; `npm run prueba` en verde sin modelos ni red; salida de
   `npm run empaqueta dictado` pegada, con la línea `integracion` en verde.
2. Tabla de medición pegada (salida de `npm run mide` en `tools/dictado`): ≥ 2 motores × corpus español
   con referencia: WER, latencia p50/p95, RTF, RAM; nombre y origen del corpus; el motor y los umbrales
   por defecto elegidos por esa tabla, escritos en el README con fecha y hardware.
3. Prueba en vivo con el humano: le pides que diga una frase al micrófono; pegas el texto que salió y
   la latencia; el humano confirma en la conversación que apareció donde tenía el cursor (Windows
   Terminal con Claude Code y una app de Windows cualquiera). Además `powershell.exe Get-Clipboard`
   pegado como evidencia de máquina.
4. Lote con hablantes: un wav de ≥ 2 personas → turnos etiquetados por `tools/voz` con texto por
   `dictado`, salida pegada.
5. El documento de alineación existe, y su mapa de módulos, tabla de motores y veredicto están
   resumidos en la conversación.
6. Si tocaste `tools/voz`: versión subida, `npm run prueba` y `npm run mide` de voz pegados en verde.
7. Perfil GPU: `servicio/` con `compose` en dos configuraciones (CPU / CPU+GPU); el `Transcriptor`
   remoto demostrado **contra el servicio levantado en esta máquina en CPU** (mismo camino HTTP, misma
   autenticación) con su salida pegada; `mide` documentado para correr en el VPS; README con «GPU: sin
   medir»; el documento de alineación con el modelo de amenazas (C3) y la decisión de datos (C4) del
   servicio remoto. Nada expuesto a internet.
8. `npm run validate` del repo en verde (si un rojo es preexistente y ajeno, demostrado como tal con
   la salida). `git status` sin archivos fuera de `tools/dictado/`, `docs/` y, si aplica, `tools/voz/`.
9. Reporte de decisiones (motor, runtime, disparador, pegado, servicio remoto, qué de sflow se portó/sustituyó/descartó
   y por qué) y lista de las formas en que podría estar mal o incompleto, resueltas.

## COMANDO DE VALIDACION

Hasta que exista el paquete: `cd /home/gsore/code/template/tools/voz && npm run prueba`.
Desde que exista: `cd /home/gsore/code/template/tools/dictado && npm run prueba`. Córrelo tras cada
cambio grande y pega su salida. `npm run empaqueta dictado` en cada hito y al final (es la prueba de
integración real; tarda, no es el latido).

## RESTRICCIONES REALES

- Vive en `tools/dictado/` bajo el contrato de la casa: **núcleo TS puro sin dependencias** (máquina de
  estados del dictado, pipeline turnos → transcriptor → posproceso, diccionario, snippets, comandos);
  lo pesado (captura, motores, pegado en Windows, modelos) en entry points aparte con peers
  **opcionales**; consume `@tu-scope/voz` por **tarball con versión exacta**, nunca `npm link`.
- No rompe el principio de `tools/voz` («no transcribe, no trae pesos»): lo que le falte se añade
  como cambio versionado con pruebas y medición, y se enseña; nunca se parchea por fuera.
- **Flujo de datos (C4): por defecto nada sale de la máquina.** El servicio remoto es **infraestructura
  del dueño** (su VPS), nunca una API de terceros por defecto; Groq u otra nube solo como opción
  explícita, apagada y documentada. Con el VPS ausente, la herramienta funciona entera en local.
- **Superficie de red (C3)**: el servicio exige autenticación y TLS; no se expone a internet ni a un
  partner sin gate humano (misma clase que A2A y los canales de chat). Las cifras de GPU no se declaran
  sin medirlas en GPU: «sin medir» es una respuesta válida; una estimación no. Secretos jamás en pantalla.
- Todo valor por defecto (motor, umbrales del VAD, tiempos de cierre) sale de una medición con fecha,
  corpus y hardware al lado. Sin medir, no se declara.
- Español primero. Sin publicar en npm (gate humano). Sin tocar `AGENTS.md`, skills ni `.claude/`
  (CDC). Archivos ≤ 500 líneas, funciones ≤ 50, `kebab-case`, sin `any`, entradas validadas.
- Nada del núcleo importa React/Next/Supabase. No se instala nada en Windows sin decírselo al humano
  antes (un ayudante del lado Windows para la tecla global, si lo eliges, es un archivo que él ve).

## RED DE SEGURIDAD

Si tras 40 turnos no converge, o si ningún motor en CPU baja de una latencia usable para dictado
(declara tu umbral antes de medir) o el micrófono de WSLg no captura habla, **detente y reporta con
las cifras**: un «no se alinea por X» medido vale más que un prototipo que finge.
