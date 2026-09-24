# Tareas 014 — Inventario de activos

> Orden por fases del plan. Cada tarea cierra con evidencia pegada en la sesión (2026-09-24).

## Fase 1 — Spec y diseño
- [ ] **TAR-1 · Spec, plan, tareas y SDD.** `npm run verifica:specs` en verde.

## Fase 2 — Índice y detector
- [ ] **TAR-2 · Índice** `inventario/activos.json`: fuentes declaradas y un asiento por activo.
- [ ] **TAR-3 · Núcleo y detector** (`scripts/inventario/`): NUEVO, HUÉRFANO, AMBIGUO, CAMBIADO;
      campos prohibidos; salida `--json`. `npm run verifica:inventario` en verde.

## Fase 3 — Pruebas y dientes
- [ ] **TAR-4 · Pruebas** `scripts/prueba-inventario.ts` sobre repos de juguete.
- [ ] **TAR-5 · Dientes**: herramienta ficticia en rojo → verde; asiento huérfano en rojo → verde.

## Fase 4 — Costeo, export y validación
- [ ] **TAR-6 · Costeo** desde trayectorias + git, con cobertura; `no_medido` nunca como cero.
- [ ] **TAR-7 · Export** a `inventario/salida/` (ignorado): ledger jsonl + SQL de `act_*`.
- [ ] **TAR-8 · Validador** contra `005_activos.sql` en Postgres desechable (Docker).

## Fase 5 — Vista, empaquetador y cableado
- [ ] **TAR-9 · Vista** `inventario/INVENTARIO.md` generada; el gate falla si está vieja.
- [ ] **TAR-10 · Empaquetador** rechaza herramientas sin asiento.
- [ ] **TAR-11 · Cableado**: `verifica:inventario` y `prueba:inventario` en `validate` y declarados
      en el README.

## Fase 6 — Arista
- [ ] **TAR-12 · `swm-act`** lee el índice del template; PR sin merge en `hermes-os-a2a`.

## Fase 7 — Cierre
- [ ] **TAR-13 · `npm run validate`** completo en verde + autocrítica.
