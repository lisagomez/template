# Instalación medida en limpio — 2026-09-20

Entorno: HOME nuevo y vacío en un temporal, proyecto limpio con `npm install` de los tarballs de voz y dictado, red real. Sin icono (Windows se lista a mano).

| paso | quién | tiempo | nota |
|---|---|---|---|
| empaquetar dictado (npm pack) | script | 0.4 s |  |
| npm install del tarball en un proyecto limpio | script | 1.6 s |  |
| dictado instala --sin-icono (comprobar, runtimes, pesos, token, diagnostico) | script | 148.6 s | ok |
| primera transcripcion con lo instalado (dictado archivo) | script | 3.2 s | Recuerda me mandar la cotización a Luis el jueves por la mañ |

**Total del script: 2.6 min.** Acciones humanas del script: 0. Las que quedan a mano las lista el instalador (micrófono, anclar icono, abrir la dirección en el teléfono, y solo por LAN el script de red como administrador): 3 obligatorias, 1 opcional.

## Salida del instalador

```
dictado instala — modelos en /tmp/instala-limpio-kUWLlB/casa/.dictado/modelos · runtimes en /tmp/instala-limpio-kUWLlB/casa/.dictado/runtime · datos en /tmp/instala-limpio-kUWLlB/casa/.dictado

  ✓ Node 24.14.0 (hace falta >= 22.18)
  ✓ ffmpeg 
  ✓ microfono por PulseAudio de WSLg 
  ✓ Windows al alcance (interop) 
  ✓ espacio libre 940 GB (hacen falta ~1.4 GB)

listo. Pasos y tiempos:

  | paso | quien | tiempo | nota |
  |---|---|---|---|
  | comprobar Node, ffmpeg, microfono, Windows y disco | script | 0 ms |  |
  | runtimes pineados (sherpa-onnx-node@1.13.8, onnxruntime-node@1.30.0) | script | 40.7 s | instalados |
  | NVIDIA Parakeet TDT 0.6B v3 (25 idiomas, es incluido), int8, ONNX (~640 MB) | script | 86.6 s | bajado |
  | Silero VAD v5 (~2 MB) | script | 1.3 s | bajado |
  | WeSpeaker ResNet34-LM (quien habla, para `lote`) (~26 MB) | script | 4.9 s | bajado |
  | Voz Piper es_MX «claude», calidad high (la maquina habla) (~79 MB) | script | 12.7 s | bajado |
  | token del celular | script | 1 ms | token en /tmp/instala-limpio-kUWLlB/casa/.dictado/movil.token (presente, largo 32); pasalo a la app con --app <ruta> |
  | icono de la barra de Windows | script | 0 ms | omitido (--sin-icono) |
  total del script: 146.2 s · acciones humanas del script: 0

Lo que queda en manos de una persona (Windows no deja hacerlo desde aqui):
  1. Permitir el microfono al navegador y a Windows Terminal la primera vez que lo pidan.
  2. Arrastrar el icono del dictado desde la flecha ^ del area de notificacion a la barra (opcional).
  3. En el telefono, abrir: https://kyara.tail65d848.ts.net/dictar  (Tailscale: sin certificado propio ni puertos; recomendado)
     y emparejar una vez (QR desde un navegador ya emparejado, o teclear el token).
  4. Solo por LAN sin Tailscale: correr tools/dictado/windows/red-movil.ps1 como administrador.

Diagnostico (se puede pegar en un issue: no lleva secretos ni lo dictado):

dictado 0.1.0 · Node 24.14.0 · linux · WSL Ubuntu
piezas:
  ✓ NVIDIA Parakeet TDT 0.6B v3 (25 idiomas, es incluido), int8, ONNX
  ✓ Silero VAD v5
  ✓ WeSpeaker ResNet34-LM (quien habla, para `lote`)
  ✓ Voz Piper es_MX «claude», calidad high (la maquina habla)
  ✓ sherpa-onnx-node@1.13.8
  ✓ onnxruntime-node@1.30.0
  ✓ ffmpeg
  ✓ microfono por PulseAudio de WSLg
  ✓ Windows al alcance (icono, pegado, altavoz)
microfono: pico -7.6 dBFS en 2 s sin hablar (al hablar, sano entre -20 y -6)
demonio de transcripcion: vivo en 127.0.0.1:47125
datos en /tmp/instala-limpio-kUWLlB/casa/.dictado · modelos en /tmp/instala-limpio-kUWLlB/casa/.dictado/modelos
```
