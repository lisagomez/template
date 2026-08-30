# Tareas 006 — Crear una herramienta con el boilerplate

> **Reconstruidas a posteriori.** Construida el 2026-08-27 (PR #31, CDC firmado por
> lisagomez el 2026-08-28). Cada casilla marcada apunta a un artefacto que existe hoy,
> verificado el 2026-08-30.

## Cerradas

- [x] **TAR-1 · Escribir la puerta de entrada.**
      Hecho cuando: existe el documento con la frontera de decisiones, el "cuándo NO", y
      los tres riesgos de contrato.
      → `docs/CREAR-UNA-HERRAMIENTA.md` · cubre DoF-1

- [x] **TAR-2 · Registro Agent-First.**
      Hecho cuando: la vía principal del lector es hablar; los comandos aparecen como lo
      que el agente ejecutará, nunca como instrucción al lector.
      → restricción innegociable de la spec, cumplida en el documento

- [x] **TAR-3 · No reescribir el contrato técnico.**
      Hecho cuando: `EMPAQUETAR-HERRAMIENTA.md` sigue siendo fuente única y el documento
      nuevo enlaza en vez de duplicar.
      → ambos documentos existen y se reparten el rol

- [x] **TAR-4 · La prueba de fuego.**
      Hecho cuando: se construye una herramienta real siguiendo SOLO el documento, y
      `npm run empaqueta` pasa en verde incluido el paso de integración real
      (proyecto limpio → `npm install <tarball>` → importar y ejecutar).
      → `scripts/empaqueta-herramienta.mjs` · ejecutado en su sesión · cubre DoF-2

- [x] **TAR-5 · Cerrar el cableado.**
      Hecho cuando: la rama del decision tree apunta al documento y el verificador falla
      si desaparece.
      → `AGENTS.md` + `scripts/verifica-gobernanza.mjs` · **136/136** el 2026-08-30

- [x] **TAR-6 · Control negativo del cableado.**
      Hecho cuando: se rompe el puntero, el verificador se pone rojo, se restaura y vuelve
      a verde.
      → ejecutado en su sesión · cubre DoF-5

- [x] **TAR-7 · Skill que delega.**
      Hecho cuando: `/crear-herramienta` arranca por el "todavía no" y remite a los dos
      documentos en vez de copiarlos.
      → `.claude/skills/crear-herramienta/SKILL.md` · CDC propio, firmado

- [x] **TAR-8 · Redactar el CDC sin auto-aprobarlo.**
      Hecho cuando: la entrada existe con la aprobación humana marcada pendiente.
      → `BITACORA-CDC.md` · firmado después por lisagomez (2026-08-28)

## Abiertas (deuda declarada en su CDC)

- [ ] **TAR-9 · Caso-trampa de capa B para el "todavía no".**
      Hecho cuando: existe un caso que mide si un agente frío **obedece** el "espera" ante
      un usuario decidido, en vez de empaquetar.
      Hoy: declarado como no medido en el CDC del 2026-08-28. Es la deuda que la firma
      **declaró, no cerró**.
