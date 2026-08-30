# Tareas 003 — La imprenta de CLIs

> **Reconstruidas a posteriori.** Construida el 2026-08-24 y ampliada después. Cada
> casilla marcada apunta a un artefacto que existe hoy, verificado el 2026-08-30.

## Cerradas

- [x] **TAR-1 · Manifiesto CLI ↔ servicio.**
      Hecho cuando: cada servicio del golden path con MCP o CLI aparece mapeado, con
      fuente de verdad, vertical, y marca de gateado.
      → `.claude/imprenta/manifiesto.json` · cubre DoF-2

- [x] **TAR-2 · Auditor que declara su fuente.**
      Hecho cuando: sin librería ni índice dice "no puedo saberlo", no "0 faltantes".
      → `scripts/audita-imprenta.mjs` · verde 2026-08-30 · cubre DoF-3

- [x] **TAR-3 · Control negativo del auditor.**
      Hecho cuando: índice falsificado → gate rojo; revertir → verde.
      → `scripts/prueba-imprenta.mjs` · verde 2026-08-30 · cubre DoF-4

- [x] **TAR-4 · Medir el coste real de los MCP.**
      Hecho cuando: hay tabla de tokens por servidor con método declarado y lo no medido
      dicho como tal.
      → `.claude/imprenta/medicion-mcp.json` · **20.363 tok/sesión**, 4 servidores sin
      medir declarados · cubre DoF-5

- [x] **TAR-5 · Veredicto sobre el "~100x".**
      Hecho cuando: se dice qué queda confirmado, qué refutado y qué sin medir.
      → refutado en su forma "100x"; registrado en `.claude/memory/project/imprenta-de-clis.md`

- [x] **TAR-6 · Las cuatro reglas inline.**
      Hecho cuando: dry-run por defecto, dinero = destructivo, anti-reimplementación y
      grade A están en `AGENTS.md`, y el verificador se pone rojo si se borran.
      → 4 comprobaciones en `verifica-gobernanza.mjs` · cubre DoF-7

- [x] **TAR-7 · Escalera CLI-first con la pregunta del modelo al final.**
      Hecho cuando: las instrucciones ordenan CLI existente → publicado → imprimir → modelo.
      → Reglas de Código de `AGENTS.md`

- [x] **TAR-8 · Skill de auditoría.**
      Hecho cuando: se puede preguntar por el estado de la imprenta en lenguaje natural.
      → `.claude/skills/cli-audit/SKILL.md`

- [x] **TAR-9 · Profundidad fuera de las instrucciones.**
      Hecho cuando: lo que no cabe en el presupuesto de contexto vive en `docs/`.
      → `docs/SDD-imprenta-de-clis.md`

## Abiertas

- [ ] **TAR-10 · Puntuar en local los CLIs instalados de la librería pública.**
      Hecho cuando: cada CLI adoptado tiene grado medido, o queda declarado no medido y
      fuera de producción. Hoy: la librería pública no publica grados.

- [ ] **TAR-11 · Medir los 4 servidores MCP que quedaron sin medir.**
      Hecho cuando: la cifra de 20.363 tok/sesión deja de ser un piso y pasa a ser el total.
