# SDD — Dictado en WSL2 sobre `tools/voz`: ¿se alinea sflow, y hasta dónde?

**Estado:** **construido y medido en esta WSL2** (2026-09-15). `tools/dictado/` existe: núcleo
TypeScript puro sin dependencias, tres entry points (`.`, `./node`, `./remoto`), 29 pruebas en
verde sin modelos ni red, `npm run empaqueta dictado` en verde, y una medición con pesos
reales sobre 30 minutos de español con referencia (§5). **Lo que falta es la voz de una
persona**: la prueba en vivo (§6, casos a y b) quedó pendiente al cerrar la rama; todo lo de
máquina alrededor está demostrado. El perfil GPU está **diseñado y sin medir**: no hay VPS.
**Ámbito:** una herramienta de `tools/` bajo el contrato de
[`EMPAQUETAR-HERRAMIENTA.md`](./EMPAQUETAR-HERRAMIENTA.md). Consume `@tu-scope/voz` 0.4.0 por
tarball, pineada; **no la modifica**.
**Spec que la pidió:** [`GOAL-dictado-wsl2.md`](./GOAL-dictado-wsl2.md).

---

## 0. El veredicto, primero

**Sí se alinea, y donde importa: en la arquitectura.** sflow y `voz` dividen el problema por la
misma costura —*audio → turnos → transcriptor enchufable → texto*— así que el dictado se
construyó **encima** de `voz` sin tocarle una línea: `voz` pone el VAD, el contrato `Turno` y el
enchufe `Transcriptor`; `dictado` pone el transcriptor, el posproceso y el destino del texto.

**No se alinea en la plataforma, y ahí sflow no se porta: se sustituye.** 13 de sus ~20 módulos
tocan AppKit, Quartz, MLX o pyobjc. Ninguno cruzó: el micrófono lo da ffmpeg por el PulseAudio
de WSLg, la tecla global y el pegado los hace PowerShell desde el único lado que ve el teclado y
el portapapeles (Windows), y los motores MLX se cambiaron por los **mismos modelos** en otros
runtimes (Parakeet TDT v3 por sherpa-onnx; Whisper por sherpa-onnx y por CTranslate2).

**El coste:** 2 434 líneas de TypeScript (más 564 de pruebas, 500 de servicio y medición, 144 de Python y 98 de PowerShell), un día de trabajo,
y ~2,5 GB de modelos, runtimes y corpus que no viajan en el paquete. **Lo que queda fuera** (§8):
el modo comando y las transformaciones por LLM (exigen un modelo de texto y leer la selección),
la interfaz gráfica (píldora, hub) y cualquier nube por defecto.

---

## 1. La pregunta original

`tools/voz` sabe *cuándo* habla alguien y *quién*, y se aparta a propósito del *qué*: define
`Transcriptor { transcribe(audio, hz) → { texto } }` y no lo implementa. sflow (macOS, MIT) es
lo contrario: sabe muy bien el *qué* —dictar y que el texto aparezca donde está el cursor, con
diccionario, snippets y comandos de voz— y lo hace con las piezas de una sola plataforma.

La pregunta era si el segundo cabe encima del primero en **esta** máquina (WSL2 sobre Windows,
Ryzen 7 5700G, 16 hilos, 15 GB, sin CUDA), con qué coste, y con cifras.

## 2. Mapa módulo a módulo: sflow → dictado

Tres destinos. **Portado**: la misma lógica, reescrita en TS. **Sustituido**: la misma función,
otra pieza (porque la de sflow era macOS-only o porque aquí hay algo mejor). **Descartado**: no
existe en `dictado` 0.1, y se dice por qué.

| sflow (líneas) | Qué hacía | Destino | En `dictado` |
|---|---|---|---|
| `core/smart_commands.py` (44) | «punto y aparte», «coma»… → signos | **portado** | `src/comandos.ts`, con fronteras Unicode (`\b` de JS ignora la ñ) |
| `core/dictation_actions.py` (56) | «… y dale enter» al final → acción tras pegar | **portado** | `extraeAcciones` en `src/comandos.ts` |
| `core/dictionary.py` (52) | vocabulario como *prompt* de Whisper | **portado + ampliado** | `src/diccionario.ts`: `comoPista()` igual; `corrige()` por similitud para motores sin prompt (Parakeet), **apagado** por defecto |
| `core/dictionary_learner.py` (96) | palabras nuevas al editar → candidatas | **portado** | `candidatos()` en `src/diccionario.ts`, mismas heurísticas |
| `core/snippets_matcher.py` (51) + `db/snippets.py` (74) | disparador → expansión, el más largo gana | **portado** | `src/snippets.ts`; JSON en vez de SQLite |
| `main.py` (554) | el flujo hotkey → grabar → transcribir → pegar | **portado** (la lógica) | `src/dictado.ts`: máquina de estados con tres modos y latencia medida; `cli-dictar.ts` la ata |
| `core/hotkey.py` (248) | mantener Ctrl+Shift; doble toque Ctrl | **portado** (gestos) / **sustituido** (sensor) | `creaGestosDeTecla` en `src/node/tecla.ts` reproduce los dos gestos; el sensor es `windows/tecla-global.ps1` (`GetAsyncKeyState`), porque en WSL no hay `/dev/input` del teclado de Windows |
| `core/recorder.py` (85) | `sounddevice` 16 kHz int16 | **sustituido** | `ffmpeg -f pulse -i default` sobre el PulseAudio de WSLg (`src/node/audio.ts`) |
| `core/transcriber.py` (102) | router Groq / MLX / Parakeet con caché | **sustituido** | interfaz `Motor` + `creaMotor` (`cli-motores.ts`): sherpa-onnx, faster-whisper por proceso, remoto |
| `core/transcriber_parakeet.py` (71) | Parakeet v3 por `parakeet-mlx` | **sustituido** (mismo modelo) | `src/node/motores/sherpa.ts`: Parakeet TDT 0.6B v3 **int8 ONNX** en CPU |
| `core/transcriber_local.py` (89) | Whisper turbo por `mlx-whisper` | **sustituido** (mismo modelo) | Whisper large-v3-turbo int8 por sherpa-onnx, y por faster-whisper (`motores-locales/motor-faster-whisper.py`) |
| `core/transcriber_groq.py` (71) | Whisper en la nube de Groq | **descartado por defecto (C4)** | «Remoto» aquí es **tu VPS** (`./remoto` + `servicio/`), no un tercero. Groq cabría como otro `Transcriptor`, explícito y apagado; no está escrito |
| `core/llm_cleanup.py` (88) | limpieza por Llama en Groq, con tono por app | **portado como enchufe** | interfaz `Limpiador` en `src/posproceso.ts`, **sin proveedor** y apagada: la fidelidad gana |
| `core/paste.py` (208) + `core/clipboard.py` (105) | CGEvent / NSPasteboard + Cmd+V, restaurando el portapapeles | **sustituido** | `src/node/pegado-windows.ts` + `windows/pegador.ps1`: los mismos dos métodos (`portapapeles` restaura lo previo; `teclear` no lo toca), en un PowerShell persistente |
| `db/database.py` (91) | SQLite con búsqueda y reintento por audio | **sustituido** | `Almacen` inyectable; JSONL en `src/node/almacen-jsonl.ts`. El audio **no** se guarda: nada toca el disco |
| `config.py` (195) | `settings.json` + catálogo de modelos con benchmark M4 | **sustituido** | entorno + argumentos (`cli-config.ts`); el catálogo sale de `medicion/mide.mjs` **en esta máquina** |
| `core/context.py` (106) | tono según la app frontal (NSWorkspace) | **sustituido** | `perfil` explícito en el posproceso; WSL no ve qué ventana de Windows tiene el foco |
| `core/command_mode.py` (121) | seleccionar → hablar una orden → LLM transforma | **descartado** en 0.1 | exige leer la selección (Ctrl+C desde PowerShell, posible) y un modelo de texto (no hay proveedor local). Se recupera cuando exista un `ModeloTexto` |
| `core/transform.py` (66) | Option+N: transformaciones fijas por LLM | **descartado** | misma razón |
| `core/focus_mode.py` (116) | bloquear apps que distraen (NSWorkspace) | **descartado** | macOS-only, y no es dictado |
| `core/relaunch.py` (54) | relanzar el `.app` | **descartado** | no hay app |
| `ui/*` (1 866: píldora, hub, visualizador, ajustes, punto rojo) | PyQt6 + Cocoa | **descartado** | sin GUI: la terminal pinta estado, nivel del micrófono en dBFS y cada texto con su latencia |
| `web/server.py` (190) | hub Flask en `:5678` | **descartado** | `dictado historial [--busca]` cubre buscar y copiar |

**Cuenta:** 8 portados, 8 sustituidos, 7 descartados (23 filas: `ui/` va junta). Lo portado literal (reglas de comandos,
heurísticas del diccionario, gestos de la tecla) viene de sflow, MIT, © Daniel Carreón; queda
atribuido aquí y en el README.

## 3. Qué aporta `voz` y qué le faltó

**Aporta, sin cambios:** el VAD Silero por `onnxruntime-node` con histéresis, relleno y cierre
por silencio (`creaDetectorVoz`); el contrato `Turno`/`EventoVoz`/`Transcriptor`; `leeWav`,
`pcm16aFloat`, `preparaParaModelo`; y para el lote, `creaDiarizador` + `creaModeloHablante`
(WeSpeaker) y `fusionaTurnos`. El dictado no redeclara nada de eso en su núcleo salvo los
**tipos**, estructuralmente idénticos, para que el núcleo no importe `voz` ni en tipos: un
detector de `voz` encaja sin adaptador.

**Le faltó: nada que bloqueara.** `voz` 0.4.0 queda **sin tocar**. Dos cosas se anotan para una
versión futura suya, porque se resolvieron del lado de `dictado`:

1. `Transcriptor.transcribe(audio, hz)` no lleva opciones: no hay por dónde pasar el idioma ni
   una pista de vocabulario. `dictado` define un superconjunto (`OpcionesTranscribe`) y sus
   motores siguen siendo `Transcriptor` válidos para `transcribeTurnos`, pero **ese** camino no
   puede usar la pista; `transcribeLote` de `dictado` sí.
2. Los valores por defecto del detector (500 ms de silencio) están pensados para barge-in. Para
   dictar, el mando que importa es cuánto silencio cierra una *frase* sin partirla, y eso se
   midió aquí (§5.2): `DEFECTOS_DICTADO` en `src/node/vad.ts` los fija a partir de la tabla.

## 4. Las restricciones de WSL2, medidas

| Pieza | Qué hay | Medido |
|---|---|---|
| Micrófono | WSLg expone PulseAudio (`PULSE_SERVER=unix:/mnt/wslg/PulseServer`); `ffmpeg -f pulse -i default` captura el micrófono que Windows tenga elegido | 2026-09-14: captura; en silencio −51,9 dB de media. El nivel se imprime al arrancar `dictar` (pico en dBFS de los primeros 2 s) para saber si el micrófono está vivo |
| Tecla global | Sin `/dev/input` del teclado de Windows: solo Windows la oye | `windows/tecla-global.ps1` sondea una tecla (Ctrl derecho por defecto) cada 15 ms y avisa por TCP a `127.0.0.1` (Windows llega a los puertos de WSL2 por localhost). Se lanza **a la vista** y se dice antes qué hace |
| Pegar en Windows | `clip.exe` + `^v` desde `powershell.exe` (interop) | Un PowerShell **persistente** (`windows/pegador.ps1`): arranque 1 312 ms **una vez**, luego 2 ms por orden (medido el 2026-09-15). Arrancar PowerShell por pegado habría costado 200-400 ms por frase |
| GPU | `/dev/dxg` existe, **no hay CUDA** (iGPU Radeon) | todo se mide en CPU; el perfil GPU es para el VPS |

## 5. Medición (2026-09-15, Ryzen 7 5700G, 16 hilos, 15 GB, CPU, Node 22.23)

Corpus: **FLEURS es_419, split test, 150 primeras tomas, 30,4 min** (Google, CC-BY-4.0; habla
leída, ~12 s por toma, con `transcription` normalizada como referencia). `npm run mide` lo
descarga, lo deja en WAV 16 kHz y mide; el JSON crudo queda en
`tools/dictado/medicion/ultima-medicion-cpu.json`.

### 5.1 Motores

<!-- TABLA_MOTORES -->
| motor | WER | CER | latencia p50 | p95 | p50 tomas ≤ 8 s | RTF | RAM | carga |
|---|---|---|---|---|---|---|---|---|
| `sherpa:nemo-parakeet-tdt-0.6b-v3-int8` | **3,3 %** | 3,2 % | **532 ms** | 926 ms | 327 ms (15) | 0,048 | 1531 MB | 0,1 s |
| `sherpa:whisper-turbo-int8` | **11,4 %** | 9,6 % | **4470 ms** | 7707 ms | 2788 ms (15) | 0,406 | 2723 MB | 1,6 s |
| `sherpa:whisper-base-int8` | **11,8 %** | 5,0 % | **1130 ms** | 2180 ms | 644 ms (15) | 0,102 | 956 MB | 0,1 s |
| `faster-whisper-small-int8-cpu` | **5,8 %** | 3,3 % | **1626 ms** | 1923 ms | 1463 ms (15) | 0,138 | 521 MB | 2,7 s |
| `faster-whisper-large-v3-turbo-int8-cpu` | **2,5 %** | 2,5 % | **6283 ms** | 6546 ms | 6133 ms (15) | 0,521 | 1089 MB | 9,7 s |
<!-- /TABLA_MOTORES -->

Lectura: <!-- LECTURA_MOTORES -->Parakeet TDT 0.6B v3 int8 (sherpa-onnx) es el motor: 3,3 % de WER a 614 ms por toma de ~12 s (362 ms en las de ≤ 8 s; una frase dictada dura 2-5 s), RTF 0,054, y carga en 0,3 s. faster-whisper large-v3-turbo tiene el mejor WER (2,5 %) a 6,4 s por frase: vale para `lote`, no para dictar. El **mismo** Whisper turbo por sherpa-onnx int8 sale a 11,4 %: mismo modelo, distinto runtime y cuantización — se deja medido y sin explicar, que es más honesto que una hipótesis. Whisper base (11,8 %) no vale para español. sflow eligió Whisper turbo local en un M4 con MLX (~950 ms, WER 2,9 % en su corpus); en esta CPU esa elección sería 5-10 veces más lenta que Parakeet por menos precisión que faster-whisper: la tabla de otra máquina no se hereda.<!-- /LECTURA_MOTORES -->

### 5.2 Cuánto silencio cierra una frase (VAD Silero)

Cada toma de FLEURS es **una** frase leída; un cierre demasiado corto la parte en dos turnos.

<!-- TABLA_VAD -->
| cierre por silencio | frases partidas | sin voz | habla / audio |
|---|---|---|---|
| 300 ms | 76/150 (50,7 %) | 0 | 77 % |
| 500 ms | 26/150 (17,3 %) | 0 | 79 % |
| 700 ms | 10/150 (6,7 %) | 0 | 80 % |
| 1000 ms | 1/150 (0,7 %) | 0 | 82 % |
| 1500 ms | 0/150 (0,0 %) | 0 | 84 % |
<!-- /TABLA_VAD -->

<!-- LECTURA_VAD -->Con 700 ms (el primer valor que se escribió, antes de medir) el VAD partía el 6,7 % de las frases; con 1000 ms, una de 150; con 1500, ninguna. El defecto es **1000 ms**: el mínimo bajo el 1 %. En `alternar`/`pulsar` los turnos se juntan al terminar y este mando no añade latencia; en manos libres cada corte sería un pegado a medias, y los 300 ms extra de espera son el precio de no partir frases. El VAD cuesta un 0,4 % del tiempo del audio: irrelevante.<!-- /LECTURA_VAD -->

### 5.3 Hilos

<!-- TABLA_HILOS -->
| hilos | latencia p50 (Parakeet, 20 tomas) |
|---|---|
| 4 | 541 ms |
| 8 | 506 ms |
| 16 | 604 ms |
<!-- /TABLA_HILOS -->

### 5.4 Los valores por defecto que salen de aquí

<!-- DEFECTOS -->
| Valor | Por defecto | Fuente |
|---|---|---|
| Motor | `parakeet` | §5.1: mejor latencia con el segundo mejor WER |
| Cierre por silencio | 1000 ms | §5.2: mínimo bajo el 1 % de frases partidas |
| Hilos | 8 | §5.3: 16 es peor (SMT) |
| Umbrales del VAD, relleno (250 ms), mínimo de habla (200 ms) | de `voz`, relleno subido | **sin medir aquí** |
| Corrección por similitud del diccionario | apagada | sin medir |
<!-- /DEFECTOS -->

## 6. Los casos de uso, uno a uno

| Caso | Cómo | Estado |
|---|---|---|
| (a) dictar a Claude Code en la terminal de WSL | `dictado dictar` (+ `--tecla` para mantener Ctrl derecho); el texto se pega con `^v` en la ventana con el foco | <!-- CASO_A -->**hecho el 2026-09-16** (18:5x, hora local): la dueña dictó «Puedes revisar si la herramienta de voz te puede funcionar también.» con el cursor en la caja de Claude Code (Windows Terminal), en manos libres con toque de Ctrl derecho; el texto apareció en la caja y llegó como mensaje a la conversación (esa es la confirmación). Audio 4,0 s · motor 231 ms · latencia fin-de-habla→pegado 1 299 ms, de los que 1 058 ms fueron el **primer** pegado (arranque del PowerShell persistente, una vez por sesión)<!-- /CASO_A --> |
| (b) dictar en cualquier app de Windows | lo mismo: el pegador no sabe qué ventana es | <!-- CASO_B -->**hecho el 2026-09-16**: con el cursor en el Bloc de notas, la dueña dictó y confirmó que el texto apareció ahí («Gracias. De notas. Estoy en el log de notas.», 4,5 s, motor 1,5 s con faster-whisper small, pegado 92 ms). El pegador escribe donde esté el foco de Windows, sea la app que sea<!-- /CASO_B --> |
| (c) reunión por lotes con hablantes | `dictado lote reunion.wav --hablantes 2`: VAD de `voz` → diarización de `voz` → texto de `dictado` → acta | <!-- CASO_C -->hecho: `reunion-2-hablantes.wav` (A-B-A, dos voces de FLEURS) → 3 turnos, 2 hablantes, texto correcto en los tres; VAD 271 ms, diarización 532 ms, transcripción 1,6 s<!-- /CASO_C --> |
| (d) modo archivo para medir | `dictado archivo toma.wav [--motor …]` imprime texto y tiempos; `npm run mide` para el corpus entero | hecho |
| (e) lo mismo contra el servicio remoto | `--motor remoto` con `DICTADO_REMOTO_URL/TOKEN`; el dictado no distingue | hecho contra el servicio en esta máquina, en CPU (§7); GPU sin medir |

## 7. El servicio remoto (perfil «GPU en el VPS propio»)

`servicio/` levanta el **mismo motor** por HTTP: `GET /health`, `POST /transcribir` con PCM16LE
o WAV en el cuerpo, `Bearer` obligatorio. Dos perfiles de `compose`: `dictado` (CPU, Parakeet
int8) y `dictado-gpu` (`Dockerfile.gpu`: CUDA 12.6 + cuDNN 9, faster-whisper large-v3-turbo
float16, `DICTADO_DISPOSITIVO=auto` cae a CPU si no ve la GPU). `npm run mide -- --dispositivo
cuda` corre igual en el VPS; hasta entonces el README dice **GPU: sin medir**.

### 7.1 Modelo de amenazas (C3)

Es una superficie de red por la que viaja **audio con la voz del dueño**.

| Amenaza | Control |
|---|---|
| Cualquiera transcribe con tu servicio (coste, y un micrófono abierto) | token `Bearer` de ≥ 32 caracteres, comparado en tiempo constante; **sin token no arranca**, no hay bandera que lo salte |
| Escucha en tránsito | TLS: propio (`DICTADO_TLS_CERT/CLAVE`) o terminado en Caddy delante; el servicio no publica puertos (`expose`, no `ports`); exponerlo a internet es gate humano |
| Fuga del token | vive en el entorno del compose y en `DICTADO_REMOTO_TOKEN` del cliente; ninguno lo imprime (`describe()` enmascara). Contención: rotar |
| Agotamiento (audio enorme, ráfagas) | `DICTADO_BYTES_MAXIMOS` (10 MB ≈ 5 min) rechazado por `content-length` antes de leer; `DICTADO_EN_VUELO` serializa (el motor ya usa todos los hilos); límites de CPU/RAM en el compose |
| Reconocimiento por `/health` | devuelve `{"status":"ok"}` y nada más |
| Texto o audio en logs | no se escribe ni texto ni audio; un error al log lleva solo la ruta y el tipo |
| Cadena de suministro del modelo | pesos pineados por URL, runtimes por versión, base de la imagen por digest; cambiar cualquiera es CDC (C1) |

### 7.2 Decisión de flujo de datos (C4)

Por defecto **nada sale de la máquina**: `--motor parakeet` es local y es el defecto. Con
`--motor remoto` el audio sale, **a infraestructura del dueño**, cifrado, autenticado, y no se
persiste en el servidor: el historial se escribe en el cliente, en `~/.dictado/`. Ninguna nube
de terceros es opción por defecto ni está escrita.

## 8. Lo que queda fuera, y por qué

- **Modo comando y transformaciones** (§2): piden un modelo de texto. El enchufe (`Limpiador`)
  existe; el proveedor no. Cuando haya uno local (o una decisión C4 escrita para uno remoto),
  es una tarde de trabajo.
- **GUI**: píldora flotante, hub, visualizador. Una TUI en la terminal basta para el caso de
  uso (dictar a Claude Code); una ventana de Windows sería otro ayudante PowerShell/WinForms.
- **Streaming parcial** (texto mientras hablas): Parakeet TDT en sherpa-onnx es *offline*; hay
  variantes streaming (Zipformer) sin español bueno. Con <!-- LAT_PARAKEET -->~350-600 ms<!-- /LAT_PARAKEET --> de latencia por frase
  no hizo falta.
- **Groq / nubes**: por decisión, no por dificultad (C4).
- **QR, calibración, E-R**: eran del extractor, no de esto.

## 9. Formas en que esto podría estar mal, y qué se hizo

| Riesgo | Qué se hizo |
|---|---|
| El VAD parte frases y el motor ve trozos sin contexto | en `alternar`/`pulsar` los turnos se **juntan** en una sola llamada (§dictado.ts); en manos libres el cierre por silencio sale de la tabla §5.2 |
| El pipe de ffmpeg se llena mientras un motor lento decodifica | `decodeAsync` de sherpa cuando existe; en manos libres el micrófono sigue abierto mientras se transcribe (estado `escuchando` separado del pipeline) |
| WER engañoso por normalización distinta entre motores | el mismo normalizador para todos (`normalizaParaComparar`), WER **acumulado**, y CER al lado |
| Se mide `src/` y se instala `dist/` | pruebas y medición contra `dist/`, como en `voz` |
| El pegado va a la ventana equivocada | el pegador no elige ventana: es el foco de Windows. Con `--tecla` no hace falta cambiar de ventana; sin ella se avisa |
| Un secreto en pantalla | el token nunca se imprime (cliente, servicio, CLI `config`); hay prueba |
| `latest` en algún sitio | modelos por URL, runtimes por versión exacta, base por digest, `voz` por tarball 0.4.0 exacto (`prepara-voz.mjs` rechaza otra cosa) |
| Un peer opcional ausente pasa por probado | el empaquetador lo dice («sin probar: falta el peer») y el README lo explica |
| El helper de Windows hace más de lo que dice | es un archivo de 30 líneas, se lanza a la vista, sondea una tecla y no escribe nada |
| El hijo Python muere y nadie se entera hasta el tope | el arranque falla al instante con las últimas líneas de stderr (prueba `node.ts`) |
