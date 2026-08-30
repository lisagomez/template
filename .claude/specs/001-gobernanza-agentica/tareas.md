# Tareas 001 — Capa de gobernanza agéntica

> **Reconstruidas a posteriori.** Esta spec se ejecutó el 2026-08-23; estas tareas no
> existían entonces. Cada casilla marcada apunta a un artefacto **que existe hoy en el
> repo** (verificado el 2026-08-30), no a un recuerdo de haberlo hecho. Sirven como
> índice de lo entregado, no como registro de proceso.

## Cerradas

- [x] **TAR-1 · Documento núcleo con los 7 controles.**
      Hecho cuando: `GOBERNANZA.md` describe C1–C7 sin huecos.
      → `.claude/gobernanza/GOBERNANZA.md` · cubre DoF-2

- [x] **TAR-2 · Registros append-only.**
      Hecho cuando: existen bitácora de CDC, registro de riesgo e incidentes con formato fijo.
      → `BITACORA-CDC.md`, `REGISTRO-RIESGO.md`, `INCIDENTES.md` · cubre C1, C5, C6

- [x] **TAR-3 · Plantillas copiables.**
      Hecho cuando: AISIA, incidente y modelo de amenazas existen como archivos aparte.
      → `.claude/gobernanza/plantillas/` (3 archivos) · cubre C3, C4, C6

- [x] **TAR-4 · Cablear al flujo.**
      Hecho cuando: el decision tree y las Reglas de Código de `AGENTS.md` obligan a
      consultar la capa, y `prp-base.md` exige modelo de amenazas + AISIA.
      → `AGENTS.md`, `.claude/PRPs/prp-base.md` · cubre DoF-3

- [x] **TAR-5 · Verificador de cableado.**
      Hecho cuando: falla con exit ≠ 0 si el papel y el código divergen.
      → `scripts/verifica-gobernanza.mjs` · **136/136 verde el 2026-08-30**

- [x] **TAR-6 · Control negativo del verificador.**
      Hecho cuando: se rompe un cable, el gate se pone rojo, se restaura y vuelve a verde.
      → Ejecutado en la sesión del 2026-08-23 (evidencia en su entrada de CDC).
      ⚠️ No repetido en esta pasada.

- [x] **TAR-7 · Mover C1 y C5 a reglas inline.**
      Hecho cuando: los controles que no disparaban pasan a `AGENTS.md` y la capa B lo confirma.
      → Reglas de Código de `AGENTS.md` · registrado en `.claude/rules/aprendizajes-gobernanza.md`

- [x] **TAR-8 · Meter el gate en la ruta de deploy.**
      Hecho cuando: `predeploy` corre verificador + regresión sin intervención.
      → `package.json`, script `predeploy`

## Abiertas (deuda declarada en su CDC, no cerrada por esta spec)

- [ ] **TAR-9 · Ampliar cobertura de capa B.**
      Hecho cuando: cada control C1–C7 tiene al menos un caso-trampa en sesión fría.
      Hoy: 21 casos, cobertura parcial por diseño.

- [ ] **TAR-10 · Repetir el control negativo tras cada cambio del verificador.**
      Hecho cuando: existe un caso que rompe un cable automáticamente en vez de a mano.
