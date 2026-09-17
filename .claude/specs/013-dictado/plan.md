# Plan 013 — Dictado local en WSL2 sobre `voz`

> Cierra el **CÓMO** de [`spec.md`](./spec.md). El diseño largo —mapa módulo a módulo desde sflow,
> restricciones de WSL2 medidas, modelo de amenazas y decisión de datos del servicio, veredicto—
> vive en [`docs/SDD-dictado.md`](../../../docs/SDD-dictado.md). Plan **retroactivo** (2026-09-16).

## Módulos

`tools/dictado/` → `@tu-scope/dictado`.

| Subpath | Contenido | peerDependency | Cubre |
|---|---|---|---|
| `.` | Núcleo TS puro, **cero dependencias**: `dictado.ts` (máquina de estados, tres modos, latencia), `posproceso.ts`, `comandos.ts`, `snippets.ts`, `diccionario.ts`, `historial.ts` (con `almacenEnMemoria`), `lote.ts`, `texto/` (normalización Unicode, WER/CER, percentil). Redeclara los tipos de `voz` estructuralmente para no importarla | — | RF-1..RF-15, RF-21 (WER), RF-23 (acta) |
| `./node` | `audio.ts` (ffmpeg sobre PulseAudio de WSLg, `leeAudio`, PCM16, nivel en dBFS), `vad.ts` (Silero de `voz` con `DEFECTOS_DICTADO`), `motores/sherpa.ts` (Parakeet/Whisper por `sherpa-onnx-node`), `motores/proceso.ts` (JSON por líneas; `motores-locales/motor-faster-whisper.py`), `hijo-por-lineas.ts` (compartido con el pegador), `pegado-windows.ts` + `windows/pegador.ps1`, `tecla.ts` + `windows/tecla-global.ps1`, `almacen-jsonl.ts`, CLI `dictado` (`cli*.ts`) | `@tu-scope/voz` 0.4.0 exacto, `onnxruntime-node`, `sherpa-onnx-node` (todos opcionales para el empaquetador) | RF-16..RF-20, RF-22, RF-23, RF-31, RF-32 |
| `./node` (voz) | `habla.ts` (Piper/VITS por `sherpa-onnx-node`, frase a frase, `abreAltavozWindows` con `windows/altavoz.ps1` y `abreAltavozPulse` conservado para volver a medir), `cli-habla.ts` (`dictado di`, voces pineadas por URL) | `sherpa-onnx-node` (opcional) | RF-33..RF-35 |
| `./remoto` | `creaTranscriptorRemoto`: `Motor` por HTTP con `fetch`, `Bearer`, PCM16 crudo, pista en base64, `describe()` enmascarado | — | RF-24 |
| `servicio/` (no se empaqueta) | `servidor.mjs` (`/health`, `/transcribir`, auth en tiempo constante, 413 por `content-length`, cola por `DICTADO_EN_VUELO`), `configuracion.mjs` (token obligatorio ≥ 32, motor pineado, TLS opcional), `Dockerfile` (CPU, base por digest), `Dockerfile.gpu` (CUDA 12.6 + cuDNN 9, `DICTADO_DISPOSITIVO=auto`), `compose.yml` (perfiles `dictado` y `dictado-gpu`, `expose` sin `ports`) | — | RF-25..RF-30 |
| `medicion/` | `mide.mjs` (modelos y runtimes pineados, corpus FLEURS es_419 por parquet + `corpus.py`, un motor por proceso, VAD e hilos), `ultima-medicion-cpu.json` versionado | — | RF-21 |

### Puertos del núcleo

```
DetectorVoz   procesa(muestras) → EventoVoz[] · cierra() · reinicia()   (el de voz encaja tal cual)
Transcriptor  transcribe(muestras, hz, { idioma?, pista? }) → { texto, confianza?, ms? }
Motor         Transcriptor + id pineado + admitePista + calienta?() + cierra?()
Pegador       pega(texto) · ejecuta?(acciones)
Almacen       agrega · recientes · busca · actualiza · cuenta
Limpiador     limpia(texto, { perfil })   — enchufe sin proveedor, apagado
```

## Decisiones (y por qué)

| Decisión | Por qué |
|---|---|
| Parakeet TDT 0.6B v3 int8 por sherpa-onnx como motor por defecto | Medido: WER 3,3 % a 532 ms; large-v3-turbo es más preciso (2,5 %) pero 12× más lento |
| Juntar los turnos en una llamada en `alternar`/`pulsar` | Un contexto da mejor puntuación; la latencia se mide desde `termina()` |
| `escuchando` separado del estado del pipeline | En manos libres el micrófono sigue abierto mientras se transcribe; si no, se pierde el principio de la frase siguiente |
| ffmpeg `-f pulse` con marcas de reloj de pared | El micrófono de Windows llega por WSLg; sin `-use_wallclock_as_timestamps` una suspensión llena el log de protestas |
| Un PowerShell **persistente** para pegar | 1,1 s de arranque una vez, 2–6 ms por orden; arrancarlo por frase costaría 200–400 ms |
| Tecla global sondeada desde Windows por TCP a `127.0.0.1` | WSL no ve el teclado de Windows; el ayudante es un archivo legible que se lanza a la vista y solo dice «abajo»/«arriba» |
| `hijo-por-lineas.ts` compartido | El motor Python y el pegador tienen la misma contabilidad (arranque con tope, reparto por id, cierre); dos copias son dos sitios donde un mensaje partido se maneja distinto |
| Cierre del VAD a 1000 ms | 700 ms partía el 6,7 % de las frases leídas; 1000 el 0,7 % |
| Cada motor medido en su propio proceso | En el mismo proceso, el segundo reutiliza memoria del primero y la RAM sale como «2 MB» |
| Servicio sin token no arranca; sin `ports` | Un servicio de audio sin autenticación es un micrófono abierto; exponerlo es gate humano |

## Modelo de amenazas (C3) y decisión de datos (C4)

Están en el SDD §7.1 y §7.2, con la tabla amenaza → control (token en tiempo constante, TLS
propio o en Caddy, límites de tamaño y concurrencia, `/health` mudo, sin texto ni audio en logs,
cadena de suministro pineada) y la decisión de que el audio sale solo a infraestructura propia y
solo si se elige `--motor remoto`.

## Pruebas

`tools/dictado/pruebas/` (`nucleo`, `dictado`, `node`): 29 contra `dist/`, sin modelos ni red
(hijo falso que habla el protocolo, `fetch` falso, WAV generado, almacén en carpeta temporal,
gestos de tecla con reloj de mentira). `npm run mide` mide con pesos reales; no es una prueba.

## Empaquetado

`npm run empaqueta dictado`: contrato, build (`prebuild` instala `voz` desde su tarball, nunca
`npm link`), tarball, integración de los tres subpaths; `./node` queda «sin probar: falta el peer
opcional @tu-scope/voz» en el proyecto limpio, y se dice.
