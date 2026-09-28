# Licencias y huellas de lo que el reel usa (verificadas el 2026-09-27)

El paquete **no incluye** ningún modelo ni recurso: se inyectan. Esta tabla fija QUÉ se usa, de dónde, con qué
licencia y su huella SHA-256, para que el laboratorio y el despliegue usen exactamente lo medido (C1).

| Recurso | Para qué | Licencia (fuente) | Origen fijado | Huella |
|---|---|---|---|---|
| Parakeet TDT 0.6B v3 int8 (sherpa-onnx) | Transcripción local con marcas por palabra | CC-BY-4.0 (Hugging Face `nvidia/parakeet-tdt-0.6b-v3`) | `tools/dictado/src/node/pesos.ts` | tarball `sha256:5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf` |
| WeSpeaker ResNet34-LM | Contar voces (no identificar) | CC-BY-4.0 (Hugging Face `Wespeaker/wespeaker-voxceleb-resnet34-LM`) | `pesos.ts` | `sha256:7bb2f06e9df17cdf1ef14ee8a15ab08ed28e8d0ef5054ee135741560df2ec068` |
| Silero VAD v5 | (instalado con dictado; el reel no lo usa aún) | MIT (repositorio snakers4/silero-vad) | `pesos.ts` | `sha256:1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3` |
| Voz Piper es_MX «claude» high | Voz SINTÉTICA de los clips de prueba | Apache-2.0 (MODEL_CARD) | `pesos.ts` | tarball `sha256:ec33fb689c248fe64810aab564cba97babf0f506672cfd404928d46e751a4721` |
| Voz Piper es_MX «ald» medium | Segunda voz sintética (trampa de dos hablantes) | Unlicense (MODEL_CARD) | `tools/dictado/src/voces.ts` | tarball `sha256:c60cf7bc853eb01a875fba0756523fecf9d9f46c763b19785d223fc981fb4fb6` |
| YuNet 2022mar (OpenCV zoo) | Detección de caras (dónde, nunca quién) | MIT (LICENSE del modelo) | opencv_zoo `c97242ce7f2a554e288b50eabd9f5df957e78801` | `sha256:50ef07f702a31741ca46a4c0d947773b64143b9362780237bf0d427d6c79bab7` |
| Retrato 1 (Leonardo da Vinci, *Mona Lisa*) | El «dueño» a cámara en los clips sintéticos | Dominio público (Wikimedia Commons) | `Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg` (800 px) | `sha256:5f223c31ba0a477eb7cbe5e5f959d822cbfc46081b19b96498cbd5601d9ac81d` |
| Retrato 2 (Rembrandt, autorretrato) | El «cliente al fondo» | Dominio público (Wikimedia Commons) | `Rembrandt_van_Rijn_-_Self-Portrait_-_Google_Art_Project.jpg` (800 px) | `sha256:576c4daea509a98a0f9dcdd0d3952500f24f208b7ad96b6f35737d3be1d22aa5` |

Motores del sistema (paquetes de Ubuntu 24.04 con versión fijada, instalados por el laboratorio): ffmpeg 6.1.1,
Tesseract 5.3.4 + `spa` 4.1.0 (Apache-2.0), OpenCV 4.6.0 de Python (Apache-2.0). Runtimes Node: `sherpa-onnx-node@1.13.8`
(Apache-2.0) y `onnxruntime-node@1.30.0` (MIT), pineados en `pesos.ts`.

Nada de god-animation, edicion-de-video, sfstudio ni GSAP: de ellos solo se tomaron ideas (propuesta-video §3–§5).
Las fuentes de los subtítulos son DejaVu (licencia libre de Bitstream Vera + dominio público), las del sistema.
