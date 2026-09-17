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
```

`@tu-scope/voz` es peer **exacto** (0.4.0) y `onnxruntime-node` / `sherpa-onnx-node` son peers
**opcionales**: los instala quien use `./node`. El núcleo (`.`) y el cliente remoto (`./remoto`)
no necesitan ninguno.

## Los seis usos

### 1. Dictar (WSL2 → Windows)

```bash
dictado dictar                      # ESPACIO en la terminal: empieza/termina; q: salir
dictado dictar --tecla              # mantén Ctrl DERECHO para hablar; dos toques = manos libres
dictado dictar --modo manos-libres  # el VAD corta las frases y cada una se pega sola
```

`--tecla` lanza **a la vista** `powershell.exe` con `windows/tecla-global.ps1` (30 líneas:
sondea una tecla y avisa por `127.0.0.1`; no lee otras teclas ni escribe nada). Sin `--tecla`,
el texto se pega en la ventana de Windows que tenga el foco: cambia de ventana después de pulsar
espacio. `--pegar teclear` escribe letra a letra sin tocar el portapapeles; `--pegar ninguno`
solo imprime.

Comandos de voz: «punto y aparte», «nueva línea», «coma», «dos puntos», «signo de
interrogación»… y «dale enter» al final pulsa Enter después de pegar. Snippets: «mi correo» →
lo que hayas definido. Diccionario: nombres y jerga que el motor no conoce.

```bash
dictado diccionario agrega Levy "SaaS Factory"
dictado snippets agrega "mi correo" "l@ejemplo.mx"
dictado historial --busca hermes
```

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

### 6. Medir

```bash
npm run mide                                   # todo: modelos, runtimes, corpus, 5 motores, VAD, hilos
npm run mide -- --motores parakeet --tomas 30  # rápido
```

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
Pendiente: la misma prueba con el cursor en otra app de Windows.

## Variables de entorno

| Variable | Qué | Por defecto |
|---|---|---|
| `DICTADO_DATOS` | historial, diccionario, snippets | `~/.dictado` |
| `DICTADO_MODELOS` | carpeta de modelos (los deja `npm run mide` en `medicion/banco/modelos`) | `~/.dictado/modelos` |
| `DICTADO_RUNTIME` | carpeta cuyo `node_modules` trae `sherpa-onnx-node` y `onnxruntime-node` | el del paquete |
| `DICTADO_PYTHON` | Python con `faster-whisper` (para `--motor faster-whisper:…`) | `python3` |
| `DICTADO_HILOS` | hilos del motor | 8 |
| `DICTADO_REMOTO_URL`, `DICTADO_REMOTO_TOKEN` | el servicio | — |

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
