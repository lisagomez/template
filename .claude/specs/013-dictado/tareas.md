# Tareas 013 — Dictado local en WSL2 sobre `voz`

> Una casilla marcada apunta a un artefacto que **existe y se verificó** (PR #109, 2026-09-15/16).
> Spec retroactiva: lo cerrado se cerró construyendo; lo abierto es lo que el GOAL pedía y no
> llegó, y lo que la spec deja como duda.

## Cerradas

- [x] **TAR-1 · Núcleo: máquina de estados.** → `src/dictado.ts` — tres modos, turnos juntos,
      manos libres con micrófono abierto, latencia desde el fin de habla, cola en serie.
      `pruebas/dictado.ts`. (RF-2..RF-7)
- [x] **TAR-2 · Posproceso.** → `src/posproceso.ts`, `src/comandos.ts`, `src/snippets.ts`,
      `src/diccionario.ts` — orden fijo, comandos ES/EN con fronteras Unicode, acciones al final,
      snippets por palabra completa, pista y corrección apagada. `pruebas/nucleo.ts`. (RF-8..RF-13)
- [x] **TAR-3 · Historial y lote.** → `src/historial.ts`, `src/lote.ts` — almacén inyectable,
      corrección con candidatos, acta con tiempos. (RF-14, RF-15, RF-23)
- [x] **TAR-4 · WER y normalización.** → `src/texto/` — WER acumulado, CER, percentil, fronteras
      Unicode. (RF-21)
- [x] **TAR-5 · Audio y VAD en Node.** → `src/node/audio.ts`, `src/node/vad.ts` — ffmpeg sobre WSLg,
      nivel en dBFS, Silero de `voz` con los defectos medidos. (RF-18)
- [x] **TAR-6 · Motores.** → `src/node/motores/sherpa.ts`, `src/node/motores/proceso.ts`,
      `src/node/hijo-por-lineas.ts`, `motores-locales/motor-faster-whisper.py` — en proceso y por
      proceso, fallo inmediato si el hijo muere. `pruebas/node.ts`. (RF-19, RF-20)
- [x] **TAR-7 · Pegador y tecla de Windows.** → `src/node/pegado-windows.ts`, `windows/pegador.ps1`,
      `src/node/tecla.ts`, `windows/tecla-global.ps1` — medido: 1,1 s de arranque, 2–6 ms por orden;
      gestos probados con reloj de mentira. (RF-16, RF-17)
- [x] **TAR-8 · CLI.** → `src/node/cli*.ts` — `dictar`, `archivo`, `lote`, `historial`,
      `diccionario`, `snippets`, `motores`, `config` (token enmascarado). (RF-22, RF-23, RF-31)
- [x] **TAR-9 · Remoto y servicio.** → `src/remoto/index.ts`, `servicio/` — demostrado en CPU:
      `/health`, 401 sin y con token malo, WAV por curl, PCM16 por el cliente con pista.
      (RF-24..RF-29)
- [x] **TAR-10 · Perfiles de despliegue.** → `servicio/Dockerfile`, `Dockerfile.gpu`, `compose.yml`
      — CPU y CPU+GPU, sin `ports`, GPU declarada sin medir. (RF-30)
- [x] **TAR-11 · Medición.** → `medicion/mide.mjs`, `medicion/corpus.py`,
      `medicion/ultima-medicion-cpu.json` — 5 motores, VAD, hilos; defectos en README y SDD. (RF-21)
- [x] **TAR-12 · Empaquetado y gate.** → `npm run empaqueta dictado` verde; `typecheck` y `lint`
      de la raíz en verde; `validate` con el rojo previo de `MEMORY.md` demostrado ajeno. (RF-1, RF-32)
- [x] **TAR-13 · Documento de alineación.** → `docs/SDD-dictado.md`, `tools/dictado/README.md`.

## Abiertas

- [ ] **TAR-14 · Prueba en vivo con una persona** (casos a y b del GOAL): frase dicha con
      `dictar --tecla`, texto donde estaba el cursor (Windows Terminal y otra app), latencia y
      `Get-Clipboard`. Luego rellenar §6 del SDD y el README.
- [ ] **TAR-15 · Medir en GPU** en el VPS cuando exista: `npm run mide -- --dispositivo cuda` y
      quitar el «sin medir».
- [ ] **TAR-16 · Medir la corrección por similitud del diccionario** sobre un corpus con nombres
      propios antes de encenderla por defecto.
