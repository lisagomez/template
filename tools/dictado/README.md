# @tu-scope/dictado

Hablar y que el texto aparezca donde está el cursor. Local, en WSL2, sobre `@tu-scope/voz`.

**El núcleo es TypeScript puro y no tiene dependencias.** No importa ffmpeg, ONNX, Python ni
nada de Windows: habla con cuatro interfaces —`DetectorVoz` (la pone `voz`), `Transcriptor`
(un motor local, un proceso de Python o tu servicio remoto), `Pegador` (donde acaba el texto)
y `Almacen` (el historial)— y cada entry point le inyecta las suyas. Por eso el dictado entero
se prueba sin descargar un MB, y por eso el mismo núcleo sirve en WSL2, en un VPS o en una prueba.

Lo que sflow (macOS, MIT, © Daniel Carreón) resolvió bien —diccionario personal, snippets,
comandos de voz, historial— está portado; lo macOS-only está sustituido o fuera. El mapa
módulo a módulo y el veredicto están en [`docs/SDD-dictado.md`](../../docs/SDD-dictado.md).

## Qué hace y qué no

| Hace | No hace |
|---|---|
| Dictar a **Windows** desde WSL2: Claude Code en Windows Terminal, VS Code, el navegador | Detectar voz: eso es `voz` (VAD Silero), y se consume tal cual |
| Elegir el motor **por medición** (tabla abajo), no por fama | Traer los pesos: se descargan pineados por URL con `npm run mide` |
| Transcribir archivos y **reuniones con hablantes** (turnos por `voz`, texto por aquí) | Mandar audio a ninguna nube: «remoto» es **tu** VPS, con token, y es opcional |
| Servir el mismo motor por HTTP con autenticación (`servicio/`) | Interfaz gráfica: la terminal pinta estado, nivel y latencia |

## Instalar

```bash
npm install <ruta>/tools/voz/tu-scope-voz-0.4.0.tgz <ruta>/tools/dictado/tu-scope-dictado-0.1.0.tgz
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

`@tu-scope/voz` es peer **exacto** (0.4.0) y `onnxruntime-node` / `sherpa-onnx-node` son peers
**opcionales**: los instala quien use `./node`. El núcleo (`.`) y el cliente remoto (`./remoto`)
no necesitan ninguno.

## Los seis usos

### 1. Dictar (WSL2 → Windows)

```bash
dictado dictar                      # ESPACIO en la terminal: empieza/termina; q: salir
dictado dictar --tecla              # mantén Ctrl DERECHO para hablar; dos toques = manos libres
dictado dictar --tecla --tecla-alternar --icono --modo manos-libres --motor parakeet --respaldo faster-whisper:small
                                    # un toque (o un click al icono) enciende manos libres, otro lo apaga
npm run en-vivo                     # lo anterior, desatendido y durante toda la sesión (--parar, --estado);
                                    # sus flags por defecto son lo que funcionó en vivo el 2026-09-19 (ganancia 0, silencio 1000 ms)
dictado icono instala               # icono en la barra de Windows: la puerta de entrada sin terminal (abajo)
```

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
o vuelve desde el menú derecho; el menú trae además «Abrir historial» (la página de tus datos
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
dictado di --archivo nota.txt --velocidad 1.1
echo "texto" | dictado di --guarda voz.wav --sin-sonido
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
La misma prueba con el cursor en el **Bloc de notas** también apareció ahí (confirmado por la dueña ese día): el pegador escribe donde esté el foco de Windows.

## Variables de entorno

| Variable | Qué | Por defecto |
|---|---|---|
| `DICTADO_DATOS` | historial, diccionario, snippets | `~/.dictado` |
| `DICTADO_MODELOS` | carpeta de modelos (los deja `npm run mide` en `medicion/banco/modelos`) | `~/.dictado/modelos` |
| `DICTADO_RUNTIME` | carpeta cuyo `node_modules` trae `sherpa-onnx-node` y `onnxruntime-node` | el del paquete |
| `DICTADO_PYTHON` | Python con `faster-whisper` (para `--motor faster-whisper:…`) | `python3` |
| `DICTADO_HILOS` | hilos del motor | 8 |
| `DICTADO_REMOTO_URL`, `DICTADO_REMOTO_TOKEN` | el servicio | — |
| `DICTADO_VOCES` | voces Piper que carga el servicio/demonio para `/sintetizar` (separadas por comas) | todas las `vits-piper-*` de `DICTADO_MODELOS` |
| `DICTADO_RESPALDO` | segundo motor del servicio/demonio (`faster-whisper:<modelo>`), pedido con `x-motor: respaldo` | ninguno (`npm run demonio`: `faster-whisper:small` si hay venv) |
| `DICTADO_CARACTERES_MAXIMOS` | tope del texto de `/sintetizar` | 2000 |

El token nunca se imprime: `dictado config` dice `presente (largo N)`.

## Desarrollo

```bash
npm run build      # prebuild instala @tu-scope/voz 0.4.0 desde su tarball (nunca npm link)
npm run prueba     # 29 pruebas contra dist/, sin modelos ni red, ~1 s
npm run mide       # pesos reales; ~2,5 GB la primera vez
npm run empaqueta dictado   # desde la raíz del repo: contrato + build + tarball + integración
```

`./node` importa `@tu-scope/voz`: en un proyecto limpio sin ese peer el empaquetador lo marca
«sin probar: falta el peer opcional», que es lo esperado y se dice.

## Lo que no está (todavía)

Modo comando y transformaciones por LLM (piden un modelo de texto: el enchufe `Limpiador`
existe, el proveedor no), GUI, streaming parcial, y cualquier nube. El porqué de cada uno, en el
SDD §8.
