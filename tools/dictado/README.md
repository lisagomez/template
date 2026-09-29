# @tu-scope/dictado

Hablar y que el texto aparezca donde está el cursor. Local, en WSL2, sobre `@tu-scope/voz`.

## Qué hace y qué no

| Hace | No hace |
|---|---|
| Dictar a **Windows** desde WSL2: Claude Code en Windows Terminal, VS Code, el navegador | Detectar voz: eso es `voz` (VAD Silero), y se consume tal cual |
| Elegir el motor **por medición** (tabla abajo), no por fama | Traer los pesos: se descargan pineados por URL con `npm run mide` |
| Transcribir archivos y **reuniones con hablantes** (turnos por `voz`, texto por aquí) | Mandar audio a ninguna nube: «remoto» es **tu** VPS, con token, y es opcional |
| Servir el mismo motor por HTTP con autenticación (`servicio/`) | Interfaz gráfica: la terminal pinta estado, nivel y latencia |

## Casos de uso

- **Dictar a Windows desde WSL2**: a Claude Code en Windows Terminal, a VS Code o al navegador; se toca Ctrl derecho (o
  el icono de la barra) y el texto aparece donde está el cursor.
- **Conversar con el agente**: en manos libres, lo pegado se envía solo al callar y el agente contesta en voz (PRP-003).
- **Transcribir un archivo o una reunión con hablantes**: `dictado archivo` y `dictado lote` (turnos por `voz`).
- **Dictar desde el celular** o revisar lo dictado: la app del template (`/historial`, `/ajustes`), emparejada con el
  token que deja `dictado instala`.
- **Transcribir en tu propio VPS, con o sin GPU**: el mismo motor servido por HTTP con autenticación (`servicio/`).

## Requerimientos de infraestructura

- **Runtime**: Node `>=22.18` (`engines`; `dictado instala` lo comprueba).
- **Dependencias del sistema**: ffmpeg, el micrófono de WSLg y Windows al alcance (PowerShell pega, suena y pinta el
  icono); los runtimes pineados `sherpa-onnx-node@1.13.8` y `onnxruntime-node@1.30.0`; los pesos pineados (Parakeet
  int8, Silero, WeSpeaker, voz Piper es_MX: ~750 MB); `@tu-scope/voz` 0.5.0 como peer exacto. Opcionales: Python con
  `faster-whisper` para el respaldo, y Docker para el servicio remoto.
- **CPU, GPU y memoria**: medido el 2026-09-15 en un AMD Ryzen 7 5700G (16 hilos, 15 GB, sin CUDA): Parakeet int8 p50
  532 ms por toma con 1531 MB de RAM residente y 8 hilos (tabla en «Medición»). GPU: no medido (la imagen
  `Dockerfile.gpu` no ha corrido en ninguna GPU).
- **Servicios externos**: ninguno. «Remoto» es tu VPS, opcional y con token.
- **Variables de entorno**: `DICTADO_DATOS`, `DICTADO_MODELOS`, `DICTADO_RUNTIME`, `DICTADO_PYTHON`, `DICTADO_HILOS`,
  `DICTADO_RETENCION_DIAS`, `DICTADO_REMOTO_URL`, `DICTADO_REMOTO_TOKEN`, `DICTADO_MOVIL_TOKEN`, `DICTADO_VOCES`,
  `DICTADO_RESPALDO`, `DICTADO_CARACTERES_MAXIMOS`, `DICTADO_CONVERSACION_PUERTO` y `DICTADO_CONVERSACION_TRAZA`
  (qué es cada una, en «Variables de entorno»). El token nunca se imprime.
- **Almacenamiento**: `~/.dictado` (`DICTADO_DATOS`): historial con el texto dictado (365 días por defecto),
  diccionario, snippets, ajustes y token; modelos y runtimes aparte. `npm run mide` baja ~2,5 GB la primera vez. Qué
  se guarda, dónde y cómo se borra: §10.
- **Salida del perímetro (C4)**: nada sale de la máquina. El servicio remoto es opcional, propio y no escribe audio ni
  texto; su modelo de amenazas (C3) y su decisión de flujo de datos (C4) están en el SDD §7.

## Instalar

```bash
npm install <ruta>/tools/voz/tu-scope-voz-0.5.0.tgz <ruta>/tools/dictado/tu-scope-dictado-0.1.0.tgz
npx dictado instala [--app <ruta-de-la-app>] [--sin-icono]   # una máquina nueva, en un paso
npx dictado diagnostico                                       # lo que se pega en un issue: sin secretos ni texto dictado
```

`dictado instala` comprueba Node ≥ 22.18, ffmpeg, el micrófono de WSLg, Windows al alcance y
el espacio libre; instala los runtimes pineados (`sherpa-onnx-node@1.13.8`,
`onnxruntime-node@1.30.0`) en `~/.dictado/runtime`; descarga **solo** los pesos pineados que
hacen falta (Parakeet int8, Silero, WeSpeaker, voz Piper es_MX: ~750 MB, sin el corpus de
medición ni los Whisper de comparación) en `~/.dictado/modelos`; genera el token del celular
(y lo deja en `.env.local` de la app con `--app`, sin imprimirlo); deja el icono de Windows; y
termina con el diagnóstico. Imprime cada paso con quién lo hace y cuánto tardó, y la lista de lo
que queda a mano (permitir el micrófono, anclar el icono, abrir la dirección en el teléfono, y
solo por LAN el script de red como administrador). Medido en limpio: ver
`medicion/corpus-propio/instalacion-<fecha>.md`. No pide administrador.

`@tu-scope/voz` es peer **exacto y obligatorio** (0.5.0): el contrato de este paquete
(`Muestras`, `Turno`, `DetectorVoz`, `Transcriptor` con idioma y pista) **es** el de voz —desde
0.5.0 se importan sus tipos en vez de redeclararlos, y `pruebas/contrato.ts` lo demuestra en
tipos y en cifras—, el VAD usa su perfil `dictado`, y el nivel en dB, el pico por ventanas y el
PCM/WAV son los suyos. `onnxruntime-node` / `sherpa-onnx-node` son peers **opcionales**: los
instala quien use `./node`. El núcleo (`.`) no necesita ninguno en tiempo de ejecución (solo
tipos), ni el cliente remoto (`./remoto`).

## El núcleo y de dónde viene

**El núcleo es TypeScript puro y no tiene dependencias.** No importa ffmpeg, ONNX, Python ni
nada de Windows: habla con cuatro interfaces —`DetectorVoz` (la pone `voz`), `Transcriptor`
(un motor local, un proceso de Python o tu servicio remoto), `Pegador` (donde acaba el texto)
y `Almacen` (el historial)— y cada entry point le inyecta las suyas. Por eso el dictado entero
se prueba sin descargar un MB, y por eso el mismo núcleo sirve en WSL2, en un VPS o en una prueba.

Lo que sflow (macOS, MIT, © Daniel Carreón) resolvió bien —diccionario personal, snippets,
comandos de voz, historial— está portado; lo macOS-only está sustituido o fuera. El mapa
módulo a módulo y el veredicto están en [`docs/SDD-dictado.md`](../../docs/SDD-dictado.md).

## Los seis usos

### 1. Dictar (WSL2 → Windows)

```bash
dictado dictar                      # ESPACIO en la terminal: empieza/termina; q: salir
dictado dictar --tecla              # mantén Ctrl DERECHO para hablar; dos toques = manos libres
dictado dictar --tecla --tecla-alternar --icono --modo manos-libres
                                    # un toque (o un click al icono) enciende manos libres, otro lo apaga
npm run en-vivo                     # lo anterior, desatendido y durante toda la sesión (--parar, --estado);
                                    # motor, respaldo, ganancia, silencio y el resto salen de ajustes.json (§11)
dictado icono instala               # icono en la barra de Windows: la puerta de entrada sin terminal (abajo)
```

#### Comandos de voz y muletillas

- **«dale enter»** (también «dale a enter», «dale un enter», «presiona el enter», «press enter») en
  **cualquier punto** de la frase, y **tantas veces como se diga**: cada uno envía lo que va
  delante, y lo que queda tras el último se pega como arranque del mensaje siguiente. Solo «dale
  enter» pulsa Enter sin pegar nada. Hasta el 2026-09-22 valía solo al final, y en
  manos libres la frase no acaba hasta callar `silencioMs`: dicho en medio, se pegaba como texto.
- **Signos dichos**: «coma», «punto y aparte», «nueva línea», «dos puntos», «signo de
  interrogación»… (`ajustes.comandos`).
- **Muletillas** (`ajustes.muletillas`, encendido): «mm», «eh», «ah», «um» se van donde estén;
  «este», «o sea», «bueno», «pues», «digamos», «tipo», «vale», «básicamente», «como que» y
  «literal» solo cuando van aislados por puntuación a los dos lados («, este,», «Bueno, …»). Sin
  esa señal no se tocan: «este documento» y «vale la pena» son palabras, y «5 mm» es una unidad.
  Lo dicho tal cual queda en el historial como texto original. Medido el 2026-09-22 sobre las 24
  transcripciones del corpus de muletillas (`node medicion/mide-filtro-muletillas.mjs` →
  `corpus-propio/muletillas/filtro-2026-09-22.md`): WER contra el guion limpio 16,3 % → 9,6 %
  (Parakeet) y 18,3 % → 10,6 % (faster-whisper), **0 palabras buenas quitadas**; quita el 65–69 %
  de las muletillas que el motor conserva, y lo que queda son las léxicas que el motor escribe sin
  coma («Buenos días, este hoy vamos a ver»), a propósito.

#### El icono de la barra y la píldora (para no tocar una terminal nunca más)

`dictado icono instala` deja un icono en el **área de notificación** de Windows (junto al
reloj) **y la píldora flotante** siempre encima de las ventanas, abajo al centro, y ambos
arrancan solos en cada inicio de sesión. La píldora es la de sflow (mismas medidas: 34 × 34 en
reposo con el logo, 100 × 34 escuchando, 52 × 34 en los avisos; opacidad 0,90, radio 17, 14 px
sobre la barra de tareas): **en reposo** el logo del micrófono; **escuchando**, veinte barras
que siguen tu voz en tiempo real; **transcribiendo**, tres puntos que giran; **pegado**, una
palomita verde que se va sola a los 0,8 s; **sin voz o fallo**, una X roja que se va a los
1,2 s. Un click en cualquiera de los dos enciende o apaga el dictado; si el dictado no corre,
lo arranca. La píldora se **arrastra** a donde estorbe menos (recuerda su posición) y se oculta
o vuelve desde el menú derecho (oculta se recuerda entre arranques: `pildora-oculta.txt` junto
al script en `%LOCALAPPDATA%\dictado\`); el menú trae además «Abrir historial» (la página de tus datos
si la app responde, o `dictado historial` en una terminal), «Apagar el dictado» y «Quitar este
icono». `dictado icono quita` lo desinstala.

Cómo funciona, medido el 2026-09-20 (`medicion/mide-pildora.mjs`, sesión por archivo): las
barras las calcula el dictado en WSL (`src/node/barras.ts`: 20 bandas mel sobre ventanas de 32
ms, normalizadas contra un pico móvil, en dB con suelo −50, caída 0,85 por cuadro) y viajan por
el mismo socket local del icono (`barras 20 enteros`, ~2,3 KB/s); qué se pinta lo decide la
máquina de estados `src/node/pildora.ts` (`pildora <visual>`), probada sin Windows. PowerShell
solo pinta: **32 cuadros/s** en régimen (el reloj de WinForms va a saltos de 15,6 ms; 25 ms →
~31), **4,7 % de un núcleo** escuchando y 4,4 % en reposo (con el reloj relajado a 100 ms),
**21 ms** de estado a pintado (p50; máximo 36). Consciente del DPI (a 150 % se ve nítida y las
capturas salen de donde toca). Un icono de una versión anterior sigue funcionando con el
dictado nuevo (ignora las líneas que no entiende); al actualizar, el siguiente `dictar --icono`
refresca la copia por huella y reinicia el icono viejo.

### 2. Programático

```ts
import { creaDictado, creaPosproceso, creaSnippets } from '@tu-scope/dictado';
import { capturaMicrofono, creaDetectorSilero, creaMotorSherpa, creaPegadorWindows } from '@tu-scope/dictado/node';
import * as ort from 'onnxruntime-node';
import sherpa from 'sherpa-onnx-node';

const detector = await creaDetectorSilero({ ort, rutaModelo: 'modelos/silero_vad.onnx' });
const dictado = creaDictado({
  detector,
  transcriptor: creaMotorSherpa({ sherpa, carpeta: 'modelos/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8' }),
  frecuenciaHz: detector.frecuenciaHz,
  posproceso: creaPosproceso({ snippets: creaSnippets([{ disparador: 'mi correo', expansion: 'l@ejemplo.mx' }]) }),
  pegador: creaPegadorWindows(),
  alEvento: (e) => e.tipo === 'texto' && console.log(e.texto, e.latenciaMs),
});
capturaMicrofono({ alRecibir: (m) => dictado.alimenta(m) });
dictado.empieza(); /* … */ await dictado.termina();
```

Tres modos: `alternar` y `pulsar` acumulan los turnos entre `empieza()` y `termina()` y los
transcriben **juntos** (una llamada, mejor puntuación; la latencia se mide desde `termina()`);
`manosLibres` transcribe y pega cada turno que el VAD cierra, en serie, con el micrófono
abierto mientras tanto.

### 3. Archivo y reunión

```bash
dictado archivo toma.wav --motor parakeet         # texto + tiempos (RTF) por stderr
dictado lote reunion.wav --hablantes 2            # [00:00:01.2 → 00:00:13.9] Hablante 1: …
```

`lote` es donde las dos herramientas se encuentran: `voz` pone el VAD y la diarización
(WeSpeaker), este paquete pone el texto, y `fusionaTurnos` de `voz` junta los turnos contiguos
de la misma persona.

### 4. Remoto: tu VPS, con o sin GPU

```bash
DICTADO_REMOTO_URL=https://dictado.tudominio.mx DICTADO_REMOTO_TOKEN=… dictado dictar --motor remoto
```

```ts
import { creaTranscriptorRemoto } from '@tu-scope/dictado/remoto';
const remoto = creaTranscriptorRemoto({ url, token }); // es un Motor: sirve donde sirva uno local
```

El servicio está en `servicio/`: `GET /health`, `POST /transcribir` (PCM16LE o WAV en el
cuerpo, `x-frecuencia-hz`, `x-idioma`, `x-pista-base64`), `Bearer` **obligatorio** (≥ 32
caracteres, sin token no arranca), TLS propio o terminado en Caddy, sin puertos publicados.
Dos perfiles de `compose`:

```bash
docker compose -f servicio/compose.yml --profile dictado up -d       # CPU: Parakeet int8
docker compose -f servicio/compose.yml --profile dictado-gpu up -d   # CPU + GPU: faster-whisper fp16
```

**GPU: sin medir.** La imagen `Dockerfile.gpu` (CUDA 12.6 + cuDNN 9, `DICTADO_DISPOSITIVO=auto`)
se diseñó el 2026-09-15 y no ha corrido en ninguna GPU: no hay VPS. `npm run mide -- --dispositivo
cuda` corre igual allí; hasta que corra, aquí no hay cifras de GPU. El modelo de amenazas (C3) y
la decisión de flujo de datos (C4) del servicio están en el SDD §7.

### 5. El agente habla

```bash
dictado di "Ya tengo voz. ¿Me oyes?"            # Piper es_MX «claude» por sherpa-onnx, local, 79 MB pineados
dictado di --archivo nota.txt --velocidad 1.1   # por defecto 0,9: elegida de oído el 2026-09-22
echo "texto" | dictado di --guarda voz.wav --sin-sonido
dictado di "texto" --local                       # sintetiza aquí aunque haya un dictar en marcha (por defecto lo dice ÉL, con el micrófono callado)
```

Sintetiza frase a frase y **suena mientras sintetiza**: la primera frase se oye antes de que
exista la última. El altavoz es **Windows** (`windows/altavoz.ps1`: PowerShell persistente +
`SoundPlayer`, WAV por frase en el temporal de Windows, borrados al terminar), porque el camino
obvio —ffmpeg al PulseAudio de WSLg— reproduce a **un cuarto de la velocidad** (medido el
2026-09-16: 6,9 s de audio tardaron 25–31 s; `--altavoz pulse` lo conserva para volver a medir).

Medido el 2026-09-16 (voz es_MX-claude-high, 8 hilos): carga 635 ms · primera frase lista en
33 ms · síntesis 343 ms para 6,9 s de audio (RTF 0,050) · sonado completo 7,8 s.

Para una app (el laboratorio de voz del template), la misma voz sale **en flujo por HTTP** desde
el demonio (`POST /sintetizar`, §7): el navegador encadena cada frase según llega y la corta si
la persona habla encima.

### 5b. Conversar con el agente (PRP-003)

```bash
dictado ajustes pon conversacion true   # en manos libres: lo pegado se envía solo al callar, y el agente contesta en voz
dictado ajustes pon envioMs 2000        # si haces pausas de 3 s para pensar (por defecto 1500, medido)
```

Con el ajuste encendido y en manos libres, cada frase se pega como siempre y, si pasan
`envioMs` sin volver a hablar, `dictar` pulsa Enter por ti; si vuelves a hablar, el reloj se
cancela (y un pegado que llega con la voz ya en marcha no lo arma). Con la conversación apagada
nada cambia: «dale enter» sigue valiendo.

`dictar` es además **dueño del altavoz**: escucha en `127.0.0.1:47126` (`di <base64>`, `calla`,
`estado`; cualquier otra cosa cierra la conexión) y `dictado di` le delega el texto cuando hay un
`dictar` en marcha (`--local` lo sintetiza aparte). Mientras suena la voz, el audio del micrófono
**no entra al detector** (puerta lógica; la captura no se para) y la puerta se reabre 150 ms
después de la última frase, con el detector reiniciado. Si llega un texto a media frase tuya,
espera a que cierres el turno (tope 5 s).

**El agente habla solo** (hook `Stop` de Claude Code): `scripts/habla-respuesta.sh` lee por stdin
el JSON del arnés, saca con `paraVoz` el primer párrafo de prosa de la respuesta (≤ 350 caracteres
cortando en fin de frase, más la pregunta final si es corta; nunca código, tablas ni listas) y se lo
manda al `dictar` en marcha **sin esperar a que suene**. Sin dictado, con la conversación apagada
o con el dictado inactivo, bash lee el saludo del socket y sale sin arrancar node ni escribir nada
(medido el 2026-09-23, bloque C: p50 3 ms, máximo 5; la prueba exige < 100 ms); encendida, el texto
llega y el hook sale a los 51 ms mientras la voz sigue sonando; a media frase tuya también llega, y
`dictar` espera al cierre de tu turno. Cablearlo en `.claude/settings.json` es un CDC (C1) del
template; el paquete solo trae el script.

**Medido el 2026-09-23** (`medicion/corpus-propio/conversacion-2026-09-23.md`):
- Envío por silencio: sesión sintética de 10 turnos con una pausa de pensamiento de 1 a 3 s dentro
  de cada frase. El hueco entre pegar una mitad y la voz de la siguiente llega a 994 ms con pausas
  de 2 s; `envioMs` = **1500** (hueco + 400 ms de margen del motor) da 0 falsos envíos hasta 2 s y
  10/10 turnos enviados; fin de habla → Enter p50 1670 ms (los 1000 ms del VAD van antes).
- Half-duplex: 70 respuestas por el socket con micrófono y altavoz reales, **0 fugas** de la voz
  del agente al texto (el control sin puerta demuestra que la sala oye el altavoz); primer audio
  p50 **60 ms** desde que el hablante arranca; puerta reabierta a los 150 ms. Parar la captura de
  ffmpeg mientras sonaba no añadía seguridad y costaba 267 ms de primer audio y 249 de reapertura:
  por eso solo se cierra la puerta lógica. En una sala con otra fuente sonando (un vídeo), el VAD
  se abre con ella y el agente espera hasta 5 s a ese «turno» antes de hablar: `umbralVozDb` es el
  mando.

### 6. Medir

```bash
npm run mide                                   # todo: modelos, runtimes, corpus, 5 motores, VAD, hilos
npm run mide -- --motores parakeet --tomas 30  # rápido
```

### 7. El demonio local: el modelo cargado una vez

```bash
npm run demonio            # servicio/ en 127.0.0.1:47125, Bearer = DICTADO_MOVIL_TOKEN
npm run demonio -- --estado
npm run demonio -- --parar
```

`npm run en-vivo` lo levanta y lo para junto al dictado. Las rutas web del template
(`/api/dictado/movil`, `/api/laboratorio/*`) lo usan si responde y caen al CLI por proceso si
no. **Medido el 2026-09-20 con una frase de 3,9 s:** p50 de 2 940 ms por proceso → **319 ms**
con el demonio (motor 197 ms); sin demonio, 2 935 ms y la ruta lo dice (`via: cli`). Solo
loopback, sin token no arranca, no escribe audio ni texto.

**El demonio también habla (2026-09-20).** `GET /voces` lista las voces Piper cargadas y
`POST /sintetizar` (JSON `{texto, voz?, velocidad?}`, texto ≤ 2 000 caracteres) responde
PCM16LE mono **en flujo**: cada frase sale en cuanto sherpa la termina (`x-frecuencia-hz`,
`x-voz` en cabecera). Si el cliente corta la conexión, la síntesis que falta no se hace: es lo
que permite que la máquina se calle de verdad cuando alguien le habla. Voces: `DICTADO_VOCES`
(lista separada por comas) o, sin ella, toda carpeta `vits-piper-*` de `DICTADO_MODELOS`;
jamás descarga. Medido: primera frase a los 42 ms si es corta («Buenas tardes.») y ~175 ms si
dura 4 s; con 4 hilos (8 no mejora, 2 empeora); cada voz tarda ~0,7 s en cargar al arrancar.

**Y tiene respaldo por idioma, a petición.** `DICTADO_RESPALDO=faster-whisper:small` (con
`DICTADO_PYTHON`; `npm run demonio` lo pone solo si el banco tiene el venv) carga un segundo
motor que el cliente pide con `x-motor: respaldo` en `/transcribir`. No es automático a propósito:
el demonio no sabe cuándo un texto está mal; quien tiene la gramática (el picking, cuando no
encuentra una cantidad) sí. Medido el 2026-09-20: Parakeet oye «sí» y «seis» sueltos como «Sir»
o «Six»; el segundo pase (~1,3 s) baja los rechazos falsos de 22 % a 13 %, y las cantidades con
unidad («tres unidades») fallan 0 %.

### 8. Ganancia automática y micrófono cerrado en espera

```bash
dictado dictar --ganancia-db auto      # se ajusta por el pico de cada escucha (ganancia.ts)
dictado dictar --mic-en-espera abierto # como antes: capturar y descartar en espera (por defecto: cerrado)
```

Con `auto`, si una escucha con texto entra floja (< −30 dBFS) sube 6 dB; si satura (> −3 dBFS)
baja 6 dB; si el micrófono satura sin ganancia, avisa que es el nivel de Windows. Topes −12/+18.
Con el micrófono **cerrado en espera** no hay captura ninguna hasta escuchar: se abre en
**~70–260 ms** (medido el 2026-09-20 por PulseAudio de WSLg; 545 ms la primera apertura en
frío) y se cierra 1,5 s después de parar.

### 9. Pruebas sin micrófono, trayectorias y calibración

```bash
dictado dictar --entrada sesion.wav --pegar ninguno   # el archivo hace de micrófono, a tiempo real
dictado dictar --alterna-cada 5000                    # (prueba) alterna escuchar/parar cada 5 s
node medicion/calibra.mjs                             # WER, VAD y diccionario sobre corpus propio
node medicion/mide-conversacion.mjs --bloque a        # envío por silencio: fija envioMs (WAV sintético con pausas de 1-3 s)
node medicion/mide-conversacion.mjs --bloque b        # half-duplex con micrófono y altavoz REALES: fugas, primer audio, reapertura (suena)
node medicion/fabrica-corpus.mjs --campo              # calle, taller, almacén, reverb, snr20/10/05/00, flojo, fuerte
node medicion/fabrica-corpus.mjs --muletillas         # guiones con muletillas y pausas conocidas, dos voces
node medicion/calibra.mjs --corpus medicion/corpus-propio/campo --salida medicion/corpus-propio/campo
```

Las mediciones de la Etapa 3 viven en el template (`scripts/laboratorio-voz/mide-picking.mjs`,
`mide-competencias.mjs`, `mide-ganancia.mjs`, `mide-voz-en-flujo.mjs`, `spike-llamada.mjs`) y
sus tablas en `medicion/corpus-propio/{picking,ganancia}-<fecha>.md`, `muletillas/medicion-*.md`,
`campo/calibracion-*.md` y `reuniones/spike-llamada-*.md`.

Cada sesión de `dictar` deja `corpus/salida-dictar-<fecha>/trayectoria.json`: **forma, nunca
contenido** (turnos, sin voz, descartados, respaldo, latencia p50/p95, motor, pegado, pico del
micrófono, muertes de la captura). `npm run trayectorias:ingesta` del template la recoge y el
informe la compara por semana. `--sin-trayectoria` la apaga.

`medicion/corpus-propio/` trae 30 frases (`frases.txt`) y un corpus **sintético** (dos voces
Piper, en limpio, con ruido de oficina y como celular) para calibrar sin esperar grabaciones;
las tuyas van en la misma carpeta con el mismo nombre (`limpio-NN.wav`…) y se miden igual.
La tabla de calibración vive en `medicion/corpus-propio/calibracion-<fecha>.md`.

**Calibración del 2026-09-20 sobre el corpus sintético** (30 frases × limpio / ruido de oficina /
celular, dos voces Piper, Parakeet int8): WER 5,1 % · 4,5 % · 6,3 % con cifras igualadas (10,9 ·
9,8 · 11,2 % crudo: el motor escribe «3412» donde la referencia dice «tres mil cuatrocientos
doce»; el resto son nombres propios), p50 250 ms. El VAD no partió ninguna de 60 frases con cierres
de 500 a 1500 ms, no se comió palabras con relleno ≥ 250 ms, y el ruido rosa hasta −35 dBFS no
abrió ningún turno: los valores por defecto se quedan. La corrección del diccionario no sustituyó
nada: sigue apagada. **Con voz propia está por medir**: graba las 30 frases y corre `calibra.mjs`.

**Campo sintético (Etapa 3, 2026-09-20, `condiciones.mjs` con SNR declarado)**: WER con cifras
igualadas 4,5 % limpio · 3,6 % calle · 5,1 % taller · 4,2 % almacén (voces de fondo + eco) ·
6,1 % reverb · 5,5 / 6,1 / 7,9 / 12,4 % con ruido rosa a SNR 20 / 10 / 5 / 0 dB · 3,9 % flojo
(−24 dB) · 4,9 % fuerte (+12 dB). Fantasmas 0 sobre calle y taller sin voz; 0 frases partidas en
120. La ganancia automática no cambia el WER (Parakeet iguala el nivel solo): cuida la
saturación, no el error, y el defecto sigue en 0.

### 10. Qué se guarda y dónde (y cómo se borra)

| Qué | Dónde | Lleva contenido | Se borra con |
|---|---|---|---|
| Historial de dictados (texto, motor, duración, latencia; y el texto original del motor si se corrigió) | `DICTADO_DATOS/historial.jsonl` | **sí** | `dictado historial --borra [--antes YYYY-MM-DD] --si`; retención automática `DICTADO_RETENCION_DIAS` (365 por defecto, 0 = nunca); o desde la página `/historial` de la app (uno a uno, o «lo anterior a un día», con doble confirmación) |
| Diccionario y snippets | `DICTADO_DATOS/diccionario.txt`, `snippets.json` | sí (nombres, expansiones) | `dictado diccionario quita`, `snippets quita`, o borrar el archivo |
| Ajustes | `DICTADO_DATOS/ajustes.json` | no (preferencias; nunca el token) | `dictado ajustes restablece --si`, o desde `/ajustes` |
| Token del celular | `DICTADO_DATOS/movil.token` y `.env.local` de la app | secreto | borrar y volver a `instala` |
| Trayectorias de sesión | `corpus/salida-dictar-*/trayectoria.json` | **no** (forma) | borrar la carpeta |
| Audio | nunca, salvo `--graba <carpeta>` (diagnóstico) | sí | borrar la carpeta |
| Modelos y runtimes | `DICTADO_MODELOS`, `DICTADO_RUNTIME` | no | borrar; `instala` los vuelve a bajar |
| Logs de `en-vivo` y del demonio | `medicion/banco/*.log` | estado y latencias; las líneas `✓` llevan el texto | borrar; `diagnostico` solo enseña las de estado |

Nada de esto sale de la máquina. El servicio remoto (VPS propio) no escribe audio ni texto.

**La página `/historial` de la app** (2026-09-20) es la casa de todo lo dictado: busca sobre el
JSONL entero con o sin acentos (y en el texto original del motor), por día, motor, corregidos y
«lentos»; copia, corrige en línea (proponiendo palabras nuevas para el diccionario), pega en la
PC, borra con confirmación; «cómo me va» (dictados y palabras por día y semana, racha, latencia
p50/p95, y lo que saben las trayectorias: sin voz, respaldo, saturaciones); exporta a Markdown,
CSV y JSON; y se actualiza sola cuando llega un dictado. Se abre desde la píldora («Abrir
historial»), desde `/dictar` y desde el laboratorio. Exige el mismo emparejamiento que el
celular. Medido: buscar sobre 20 000 dictados (3,9 MB) tarda 181 ms por la ruta (sin índice: el
archivo se lee entero, y lo que manda es el arranque del proceso que lo lee, ~90 ms).

### 11. Ajustes: lo que decides una vez y el dictado recuerda

Toda bandera de `dictar` tiene su ajuste en **`DICTADO_DATOS/ajustes.json`**, con los defectos
declarados en un solo sitio (`src/ajustes.ts`) y una precedencia explícita y **visible**:
**argumento > entorno > ajustes > defecto**. `dictado config` y `dictado ajustes` dicen de dónde
sale cada valor (`pegar = teclear (ajustes)`, `silencioMs = 700 (argumento)`).

```bash
dictado ajustes                          # cada ajuste con su valor y su origen, por grupos
dictado ajustes pon pegar teclear        # valida y guarda (escritura atómica); un motor que no está instalado se rechaza con la lista
dictado ajustes pon gananciaDb auto
dictado ajustes quita pegar              # vuelve al defecto
dictado ajustes restablece --si          # todo por defecto
dictado ajustes catalogo                 # los motores instalados con WER y latencia medidos EN ESTA máquina
```

La **página `/ajustes`** de la app hace exactamente lo mismo por las mismas piezas (`maquina.mjs`
→ `cli-ajustes`), tras el emparejamiento: grupos Motor (con el catálogo medido), Tecla y modo,
Pegado, Audio, Texto, **Conversar con el agente**, Sonidos, Historial y «Sin proveedor» (limpieza y transformaciones por
modelo de lenguaje: en gris, no se pueden encender; no hay proveedor y lo dictado no sale de la
máquina). Se abre desde `/historial`, `/dictar` y el menú del icono («Ajustes»).

**En caliente.** Un `dictar` en marcha vigila el archivo (stat cada segundo) y toma sin reiniciar
lo que es seguro: `pegar`, `gananciaDb`, `umbralVozDb`, `comandos`, `muletillas`, `snippets`, `diccionario`,
`sonidoAlEmpezar`, `sonidoAlTerminar`, `retencionDias`, `conversacion`, `envioMs`, `velocidadVoz`,
`micDuranteVoz`. Lo que exige recargar (`motor`, `respaldo`, `idioma`, `hilos`, `modo`, `tecla`,
`silencioMs`, `micEnEspera`, `correccionPorSimilitud`, `vozAgente`) se anuncia para la siguiente sesión. Y lo que en esa sesión fija una
bandera o el entorno **no lo mueve el archivo**, y el log lo dice
(`silencioMs cambió en el archivo, pero en esta sesión lo fija --silencio-ms`). Medido el
2026-09-21 con `dictar --entrada` corriendo: sonidos y comandos aplicados en caliente; motor
avisado para la siguiente sesión.

**Reglas del archivo.** Roto o ajeno → defectos + aviso, y **no se pisa**; claves de una versión
más nueva se conservan al escribir; versión 0 (sin `version`) acepta los nombres de bandera
(`silencio-ms`) y los renombra. **Ningún secreto**: el token sigue en `movil.token` / entorno.
Las rutas (`DICTADO_DATOS`, `DICTADO_MODELOS`, `DICTADO_RUNTIME`, `DICTADO_PYTHON`) y el
servicio remoto no son ajustes: son de la máquina, y siguen por entorno.

**`respaldo: auto`** (el defecto) = `faster-whisper:small` si está en la carpeta de modelos, y
nada con el motor `remoto` (el demonio trae el suyo). Si no arranca (Python sin faster-whisper),
se sigue sin respaldo y se dice. `npm run en-vivo` ya solo fija su forma (manos libres, tecla que
alterna, icono); el resto lo lee de aquí. El demonio también (motor, respaldo, idioma, hilos),
y cambiar su motor exige reiniciarlo.

**Medido (2026-09-21):** leer y resolver los ajustes al arrancar cuesta 0,01 ms (p50 de 20);
`dictar --entrada` sin respaldo, antes/después: arranque → motor listo 2 597 / 2 522 ms (p50 de
5), latencia fin de habla → pegado 215 / 216 ms. `GET /api/ajustes` p50 98 ms (el arranque del
proceso que lee el disco); la página carga en ~800 ms sobre la build.

## Medición (2026-09-15)

**Máquina:** AMD Ryzen 7 5700G, 16 hilos, 15 GB, sin CUDA, WSL2 (kernel 6.6.87.2), Node 22.23,
8 hilos por motor. **Corpus:** FLEURS es_419, split *test*, 150 primeras tomas, **30,4 min** de
español leído con transcripción de referencia (Google, CC-BY-4.0). WER **acumulado** con el
mismo normalizador para todos (minúsculas, sin puntuación, acentos conservados); latencia por
toma; RTF = tiempo de cómputo / duración del audio; RAM residente tras cargar.

<!-- TABLA_MOTORES -->
| motor | WER | CER | latencia p50 | p95 | p50 tomas ≤ 8 s | RTF | RAM | carga |
|---|---|---|---|---|---|---|---|---|
| `sherpa:nemo-parakeet-tdt-0.6b-v3-int8` | **3,3 %** | 3,2 % | **532 ms** | 926 ms | 327 ms (15) | 0,048 | 1531 MB | 0,1 s |
| `sherpa:whisper-turbo-int8` | **11,4 %** | 9,6 % | **4470 ms** | 7707 ms | 2788 ms (15) | 0,406 | 2723 MB | 1,6 s |
| `sherpa:whisper-base-int8` | **11,8 %** | 5,0 % | **1130 ms** | 2180 ms | 644 ms (15) | 0,102 | 956 MB | 0,1 s |
| `faster-whisper-small-int8-cpu` | **5,8 %** | 3,3 % | **1626 ms** | 1923 ms | 1463 ms (15) | 0,138 | 521 MB | 2,7 s |
| `faster-whisper-large-v3-turbo-int8-cpu` | **2,5 %** | 2,5 % | **6283 ms** | 6546 ms | 6133 ms (15) | 0,521 | 1089 MB | 9,7 s |
<!-- /TABLA_MOTORES -->

<!-- LECTURA_MOTORES -->**Lectura.** Parakeet TDT 0.6B v3 (int8, sherpa-onnx) gana en lo que un dictado necesita: 3,3 % de WER a 614 ms por toma de ~12 s (362 ms en las de ≤ 8 s), RTF 0,054. faster-whisper large-v3-turbo es el más preciso (2,5 %) pero tarda 6,4 s por frase: sirve para lotes, no para dictar. El **mismo** Whisper turbo por sherpa-onnx int8 da 11,4 %: mismo modelo, otro runtime y otra cuantización; se mide, no se explica. Whisper base no vale para español (11,8 %). Parakeet y large-v3-turbo se equivocan en lo mismo: «riesgo **del** clima» por «riesgo **de** clima» está en los cinco motores — el corpus también tiene su ruido.<!-- /LECTURA_MOTORES -->

**Cuánto silencio cierra una frase** (VAD Silero sobre las mismas tomas; cada una es UNA frase):

<!-- TABLA_VAD -->
| cierre por silencio | frases partidas | sin voz | habla / audio |
|---|---|---|---|
| 300 ms | 76/150 (50,7 %) | 0 | 77 % |
| 500 ms | 26/150 (17,3 %) | 0 | 79 % |
| 700 ms | 10/150 (6,7 %) | 0 | 80 % |
| 1000 ms | 1/150 (0,7 %) | 0 | 82 % |
| 1500 ms | 0/150 (0,0 %) | 0 | 84 % |
<!-- /TABLA_VAD -->

**Hilos** (Parakeet, 20 tomas): <!-- HILOS -->4 hilos → p50 541 ms · 8 hilos → p50 506 ms · 16 hilos → p50 604 ms<!-- /HILOS -->

### Valores por defecto, y de dónde salen

<!-- DEFECTOS -->
| Valor | Por defecto | De dónde sale |
|---|---|---|
| Motor | `parakeet` (Parakeet TDT 0.6B v3 int8, sherpa-onnx) | tabla de motores: mejor latencia con el segundo mejor WER; `lote` también, y `--motor faster-whisper:large-v3-turbo` cuando la precisión mande y el tiempo no |
| Cierre por silencio del VAD | **1000 ms** | tabla del VAD: 700 ms parte el 6,7 % de las frases, 1000 ms el 0,7 %, 1500 ms ninguna; se toma el mínimo bajo el 1 %. En `alternar`/`pulsar` no añade latencia (los turnos se juntan al terminar); en manos libres es el precio de no partir frases |
| Hilos del motor | 8 | tabla de hilos: 16 es peor que 8 en esta CPU (SMT) |
| Umbrales del VAD (0,5 / 0,35), relleno 250 ms, mínimo de habla 200 ms | los de `voz` con más relleno | **sin medir aquí**: `voz` los midió para barge-in sobre LibriSpeech; el relleno se subió para no comerse la primera sílaba |
| Corrección por similitud del diccionario | apagada | sin medir en corpus: sustituir de más es peor que no sustituir |
| Silencio que envía el turno (`envioMs`, modo conversación) | **1500 ms** | `medicion/corpus-propio/conversacion-2026-09-23.md` bloque A: con pausas de pensamiento de 2 s el hueco entre pegar una mitad y la voz de la siguiente llega a 994 ms; 1500 = ese hueco + 400 ms (p95 − p50 del motor); 0 falsos envíos hasta 2 s. 2000 aguanta 3 s y tarda medio segundo más |
<!-- /DEFECTOS -->

Todo lo anterior vale para **esta** máquina y **este** corpus (habla leída, limpia). Un
micrófono de portátil en una sala con ruido dará más WER; lo honesto es volver a medir con
`dictado archivo` sobre tus propias grabaciones. sflow midió en un M4 con MLX (Parakeet ~280 ms,
Whisper turbo ~950 ms, WER 2,9 %): son otra máquina, otro runtime y otro corpus, y **no se
comparan** con esta tabla.

**Medido en vivo (2026-09-16, dictando a Claude Code en Windows Terminal, manos libres, +12 dB):**
frase de 4,0 s → motor 231 ms, latencia fin-de-habla → pegado 1 299 ms, de los que 1 058 ms
fueron el **primer** pegado de la sesión (arranque del PowerShell persistente; los siguientes
cuestan decenas de ms). Lo que se aprendió ese día y ya está en el código: el micrófono de WSLg
entra flojo (`--ganancia-db 12`), `termina()` debe esperar al audio en vuelo, y Parakeet a veces
oye inglés en frases cortas (`--respaldo faster-whisper:small` repite solo esas en español).
La misma prueba con el cursor en el **Bloc de notas** también apareció ahí (confirmado por el laboratorio ese día): el pegador escribe donde esté el foco de Windows.

## Los mandos que de verdad importan

| Ajuste (`dictado ajustes`) | Que pasa si te equivocas |
|---|---|
| `silencioMs` (1000) | Corto: el VAD parte la frase y en manos libres se pega a medias (700 ms parte el 6,7 %; 1000, el 0,7 %; medido sobre 150 frases). Largo: en manos libres cada frase espera ese silencio antes de pegarse; en `alternar`/`pulsar` no anade nada |
| `gananciaDb` (0) | De mas sobre un microfono fuerte SATURA (picos a −0,7 dBFS con +12 dB, 2026-09-19): palabras rotas en cualquier motor. De menos (pico < −45 dBFS) el motor no te oye y Parakeet toma el espanol por ingles. `auto` sigue el pico de cada escucha; medido: no cambia el WER, solo ayuda si el microfono entra flojo |
| `umbralVozDb` (−45) | Alto: frases flojas se descartan como «sin voz» antes del motor. Bajo: el motor alucina texto sobre la nada («All means» sobre un turno a −86,5 dBFS, 2026-09-19) |
| `respaldo` (auto) | Sin respaldo, Parakeet oye ingles en frases cortas o flojas («Probably.», «No you can only gorda»). Con faster-whisper:small, +1,4 s al arrancar y ~1,6 s por cada repeticion; solo se repite cuando el idioma no cuadra |
| `pegar` (portapapeles) | `portapapeles` restaura lo que habia, pero el primer pegado de la sesion cuesta ~1 s (arranca el PowerShell persistente; los siguientes, decenas de ms). `teclear` no toca el portapapeles. `ninguno` solo muestra |
| `micEnEspera` (cerrado) | `cerrado` abre el microfono al escuchar (70–260 ms medidos) y lo cierra 1,5 s despues de parar; `abierto` captura y descarta siempre. Con `--entrada` siempre abierto |
| `modo` (alternar) | `alternar`/`pulsar` juntan los turnos y transcriben una vez (mejor puntuacion); `manos-libres` pega cada turno que el VAD cierra y paga `silencioMs` en cada frase |
| `hilos` (8) | Medido con Parakeet: 4 hilos 541 ms, 8 hilos 506 ms, 16 hilos 604 ms (p50). Mas hilos que nucleos fisicos es peor (SMT) |
| `correccionPorSimilitud` (off) | Encendida corrige palabras parecidas a tus terminos: tambien las que no debia. Sustituir de mas es peor que no sustituir |
| `muletillas` (on) | Apagado, «Mm.» y «, este,» se pegan tal cual. Encendido quita solo lo aislado por puntuacion: medido con 0 palabras buenas quitadas en 24 transcripciones; una lexica sin coma («este hoy vamos») se queda, y eso es a proposito |
| `retencionDias` (365) | 0 no borra nunca; menos de lo firmado en la AISIA de Fase 0 (365) es una decision que se firma, no que se teclea |

## Avisos que ahorran una tarde

- **El WAV que ffmpeg escribe a una tuberia lleva tamanos «desconocidos»** (`0xFFFFFFFF` en la
  cabecera): el servicio lo rechazaba con 500 y la ruta caia al CLI en silencio. Entre procesos va
  PCM crudo (`-f s16le`) con la frecuencia en cabecera, y la respuesta dice por donde paso (`via`).
- **Un proceso de Node sin handles sale en silencio**, aunque espere una promesa. Con el microfono
  cerrado en espera y el unico intervalo con `.unref()`, `dictar` salio con codigo 0 sin decir nada:
  un latido con referencia hasta `salir()`.
- **`pkill -f '<patron>'` mata la shell que lo lanza** si su linea de comando contiene el patron
  (exit 144, y reincidio con la regla cargada). Matar por puerto (`ss -ltnp` → PID → `kill`) o con
  el patron anclado al inicio.
- **El microfono de WSLg satura solo** si Windows le pone «mejoras» o ganancia automatica: el
  pico de la escucha se vigila en las dos puntas (sano entre −20 y −6 dBFS) y el aviso dice cual.
- **Parakeet detecta el idioma solo, y con audio corto o flojo toma el espanol por ingles.** Los
  monosilabos sinteticos aislados («si», «tres») los oyen en ingles los DOS motores, y rellenar
  con silencio no ayuda: el panel pide cantidad + unidad. Las muletillas solo las conserva
  faster-whisper (Parakeet: recall 76 %, «no medible»).
- **PowerShell no siempre acepta `-File` en `\\wsl.localhost\…`**: los ayudantes viajan por
  `-EncodedCommand`; y `cmd.exe` corta a 8 191 caracteres, asi que el icono va por `-File` sobre
  una copia en `%LOCALAPPDATA%\dictado\`. Un icono viejo que ya corre no se entera del refresco
  (mutex de instancia unica): se cierra y arranca el nuevo.
- **Sin `DICTADO_RUNTIME`, el CLI busca `<datos>/runtime`**: es lo que deja `dictado instala` y en
  una maquina recien instalada no lo encontraba (medido en HOME limpio, 2026-09-20).
- **Matar `npx` no mata a `next-server`**: un guion de capturas dejo un servidor huerfano en su
  puerto y la siguiente corrida hablo con el equivocado. Lanzar en grupo propio y matar el grupo.
- **El motor del asesor cachea por id de transcripcion**; el laboratorio usa un id derivado del
  contenido para no recibir la respuesta de otra frase.
- **«Dale enter» en medio de la frase no hacia nada** (en vivo, 2026-09-22): en manos libres la
  frase no cierra hasta callar `silencioMs`, y el laboratorio lo decia y seguia hablando; el comando
  solo valia al final y quedo pegado como texto. Ahora vale en cualquier punto: lo de antes se
  envia y lo de despues empieza el mensaje siguiente. Y «dale enter» solo, sin texto, pulsa Enter
  (antes un texto vacio saltaba tambien la accion).

## Variables de entorno

| Variable | Qué | Por defecto |
|---|---|---|
| `DICTADO_DATOS` | historial, diccionario, snippets y `ajustes.json` (§11) | `~/.dictado` |
| `DICTADO_MODELOS` | carpeta de modelos (los deja `npm run mide` en `medicion/banco/modelos`) | `~/.dictado/modelos` |
| `DICTADO_RUNTIME` | carpeta cuyo `node_modules` trae `sherpa-onnx-node` y `onnxruntime-node` | el del paquete |
| `DICTADO_PYTHON` | Python con `faster-whisper` (para `--motor faster-whisper:…`) | `python3` |
| `DICTADO_HILOS` | hilos del motor (por encima de `ajustes.json`) | 8 |
| `DICTADO_RETENCION_DIAS` | retención del historial (por encima de `ajustes.json`) | 365 |
| `DICTADO_REMOTO_URL`, `DICTADO_REMOTO_TOKEN` | el servicio | — |
| `DICTADO_VOCES` | voces Piper que carga el servicio/demonio para `/sintetizar` (separadas por comas) | todas las `vits-piper-*` de `DICTADO_MODELOS` |
| `DICTADO_RESPALDO` | segundo motor del servicio/demonio (`faster-whisper:<modelo>`), pedido con `x-motor: respaldo` | ninguno (`npm run demonio`: `faster-whisper:small` si hay venv) |
| `DICTADO_CARACTERES_MAXIMOS` | tope del texto de `/sintetizar` | 2000 |
| `DICTADO_CONVERSACION_PUERTO` | puerto del socket por el que `dictado di` le pide al `dictar` en marcha que hable (`--conversacion-puerto` en `dictar`) | 47126 |
| `DICTADO_CONVERSACION_TRAZA` | `1`: trazas con instante del modo conversación en el log (las lee `mide-conversacion.mjs`) | — |

El token nunca se imprime: `dictado config` dice `presente (largo N)`.

## Desarrollo

```bash
npm run build      # prebuild instala @tu-scope/voz 0.5.0 desde su tarball (nunca npm link)
npm run prueba     # 121 pruebas contra dist/, sin modelos ni red, ~2 s
npm run mide       # pesos reales; ~2,5 GB la primera vez
npm run empaqueta dictado   # desde la raíz del repo: contrato + build + tarball + integración
```

`./node` importa `@tu-scope/voz`: en un proyecto limpio sin ese peer el empaquetador lo marca
«sin probar: falta el peer opcional», que es lo esperado y se dice.

## Lo que no está (todavía)

Modo comando y transformaciones por LLM (piden un modelo de texto: el enchufe `Limpiador`
existe, el proveedor no), GUI, streaming parcial, y cualquier nube. El porqué de cada uno, en el
SDD §8.
