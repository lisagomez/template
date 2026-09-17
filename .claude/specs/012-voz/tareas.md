# Tareas 012 — Detección de voz y diarización local como herramienta enchufable

> Una casilla marcada apunta a un artefacto que **existe y se verificó**. Spec retroactiva: todo
> lo cerrado se cerró antes de escribirla (versiones 0.1.0 → 0.4.0 de `tools/voz/`, agosto y
> septiembre de 2026); lo abierto es lo que la spec deja como duda.

## Cerradas

- [x] **TAR-1 · Núcleo: audio y VAD.** → `src/audio/*`, `src/vad/detector.ts`, `src/vad/energia.ts`
      — histéresis, relleno, mínimo de habla, cierre por silencio; `modeloEnergia` sin pesos.
      Probado en `pruebas/nucleo.ts` con un modelo de guion. (RF-2..RF-7)
- [x] **TAR-2 · Reparto por canal.** → `src/canales/por-canal.ts` — un modelo por canal. (RF-8)
- [x] **TAR-3 · Diarización por lotes.** → `src/diar/agrupacion.ts`, `src/diar/diarizador.ts` —
      agrupamiento por coseno, mínimo para embeber, número de hablantes opcional, `calibraUmbral`.
      (RF-9..RF-11, RF-25)
- [x] **TAR-4 · Segmentación (PyanNet) y solape.** → `src/diar/por-segmentacion.ts`,
      `src/onnx/segmentacion.ts` — powerset/multietiqueta deducidos con inferencia de sonda;
      `tramosSolapados`. (RF-12)
- [x] **TAR-5 · Diarización en vivo.** → `src/diar/streaming.ts` — `turno`/`correccion`/`firme`,
      ventana de corrección, fusión con `fuera`, números no reciclados. `pruebas/streaming.ts`.
      (RF-13..RF-16)
- [x] **TAR-6 · Solape en vivo.** → `src/diar/segmentacion-streaming.ts` — la misma identidad con
      otra fuente de turnos. `pruebas/solape-vivo.ts`. (RF-12, RF-13)
- [x] **TAR-7 · Registro de voces.** → `src/diar/registro.ts` — umbral, margen, abstención, etiqueta
      de modelo, exportar/importar. `pruebas/registro.ts`. (RF-17..RF-20)
- [x] **TAR-8 · Enchufe de transcripción y fusión de turnos.** → `src/asr/adaptador.ts`,
      `fusionaTurnos` en `src/index.ts`. (RF-21, RF-22)
- [x] **TAR-9 · Entry points.** → `src/browser/index.ts`, `src/node/index.ts` — WAV por cabeceras,
      PCM16, remuestreo, Silero/WeSpeaker/PyanNet por `ort` inyectado. `pruebas/onnx.ts`.
      (RF-7, RF-23, RF-24, RF-26)
- [x] **TAR-10 · Medición con pesos reales.** → `medicion/mide.mjs` — 2026-09-01: el marco de 576
      de Silero v5, umbral 0,55, tabla del registro con impostor. README §medido.
- [x] **TAR-11 · Empaquetado.** → `npm run empaqueta voz` en verde; tarball 0.4.0 consumido por
      `tools/dictado`.

## Abiertas

- [ ] **TAR-12 · Medir el margen del registro** con dos voces parecidas registradas (LibriSpeech
      no las tiene). Hasta entonces el README lo dice: «sin respaldo».
- [ ] **TAR-13 · Decidir si los defectos del VAD cambian** a la luz de lo medido en `013-dictado`
      (cierre a 1000 ms para frases dictadas en español) o siguen siendo de barge-in y cada
      consumidor fija los suyos.
- [ ] **TAR-14 · `docs/SDD-voz.md`** si se decide que el README no basta como documento de diseño.
- [ ] **TAR-15 · Opciones en `Transcriptor`** (idioma, pista de vocabulario) para que
      `transcribeTurnos` pueda pasarlas: hoy lo cubre `transcribeLote` de `013-dictado`.
