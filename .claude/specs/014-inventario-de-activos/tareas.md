# Tareas 014 — Inventario de activos

> Orden por fases del plan. Cada tarea cierra con evidencia pegada en la sesión (2026-09-24).

## Fase 1 — Spec y diseño
- [x] **TAR-1 · Spec, plan, tareas y SDD.** `npm run verifica:specs`: 127/127.

## Fase 2 — Índice y detector
- [x] **TAR-2 · Índice** `inventario/activos.json`: 36 fuentes, 24 activos (uno externo: los CLIs
      impresos). La primera corrida cazó 3 unidades reales sin asiento (`example.mcp.json`,
      `hermes/.env.ejemplo`, `src/features/.template`), asignadas.
- [x] **TAR-3 · Núcleo y detector** (`scripts/inventario/`): NUEVO, HUÉRFANO, AMBIGUO, CAMBIADO;
      campos prohibidos; salida `--json`. `npm run verifica:inventario`: 168 unidades, 0 hallazgos.

## Fase 3 — Pruebas y dientes
- [x] **TAR-4 · Pruebas** `scripts/prueba-inventario.ts`: 14/14. Cazaron un defecto: una unidad
      AMBIGUA marcaba además HUÉRFANOS a sus dos dueños (ruido); corregido.
- [x] **TAR-5 · Dientes** (rama `prueba-dientes-inventario`, borrada): `tools/fantasma` → NUEVO y
      exit 1, el empaquetador la rechaza; quitada → verde. Asiento `TPL-borrada` + costo en el
      índice → HUÉRFANO + campo prohibido, exit 1; restaurado → verde.

## Fase 4 — Costeo, export y validación
- [x] **TAR-6 · Costeo** desde trayectorias + git, con cobertura: construcción en USD en 21 de 23
      (casi todas PARCIALES y declaradas); réplica/reposición `no_estimado`; horas `no_medido`.
- [x] **TAR-7 · Export** a `inventario/salida/` (ignorado): ledger jsonl + SQL de `act_*` +
      `costeo.md` + `detector.json`.
- [x] **TAR-8 · Validador** sobre 001–005 reales en `postgres:16-alpine`, cargado como
      `rol_exe_fin` con RLS: 23 altas, 0 en la segunda carga, 7/7 comprobaciones.

## Fase 5 — Vista, empaquetador y cableado
- [x] **TAR-9 · Vista** `inventario/INVENTARIO.md` generada; el gate falla si está vieja.
- [x] **TAR-10 · Empaquetador** rechaza herramientas sin asiento (probado en TAR-5).
- [x] **TAR-11 · Cableado**: `verifica:inventario` y `prueba:inventario` en `validate` (20 pasos) y
      declarados en el README; gobernanza 152/152.

## Fase 6 — Arista
- [x] **TAR-12 · `swm-act`** lee el índice del template: dry-run con `--catalogo-json` (21 NUEVO,
      1 CAMBIADO, 1 HUÉRFANO). PR hermes-os-a2a#316, sin merge.

## Fase 7 — Cierre
- [ ] **TAR-13 · `npm run validate`** completo en verde + autocrítica.
