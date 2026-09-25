# Plan 014 — Inventario de activos

> Hace el papel del PRP para esta spec. Diagnóstico de forma: LOOP (un solo ejecutor; el cambio en
> `hermes-os-a2a` es la arista de salida). Las decisiones y lo descartado viven en
> `docs/SDD-inventario-de-activos.md`.

## Módulos y requisitos que cubren

| Módulo | Dónde | RF |
|---|---|---|
| Índice (identidad + fuentes) | `inventario/activos.json` | RF-1, RF-2 |
| Núcleo del inventario | `scripts/inventario/nucleo.mjs` (descubrir, cubrir, hashear, campos prohibidos) | RF-3 a RF-6 |
| Detector y gate | `scripts/inventario/detecta.mjs` → `npm run verifica:inventario` (`--json` para el ERP) | RF-4 a RF-7, RF-16 |
| Pruebas | `scripts/prueba-inventario.ts` → `npm run prueba:inventario` | RF-3 a RF-12 |
| Empaquetador | `scripts/empaqueta-herramienta.mjs` (rechaza sin asiento) | RF-8 |
| Costeo y clasificación | `scripts/inventario/costeo.mjs` | RF-9 a RF-12 |
| Export | `scripts/inventario/exporta.mjs` → `npm run inventario:exporta` → `inventario/salida/` (ignorado) | RF-13 |
| Validador contra el ERP | `scripts/inventario/valida-erp.mjs` → `npm run inventario:valida-erp` (Docker) | RF-14 |
| Vista | `scripts/inventario/vista.mjs` → `inventario/INVENTARIO.md` (el gate exige que esté al día) | RF-15 |
| Arista | `businessos/detector-swm-act.py` en `hermes-os-a2a`, PR sin merge | RF-16 |

## Fases con gate

1. **Spec y SDD.** Gate: `npm run verifica:specs`.
2. **Índice + núcleo + detector.** Gate: `npm run verifica:inventario` en verde sobre el repo real.
3. **Pruebas y dientes.** Gate: `npm run prueba:inventario`; herramienta ficticia en rojo y
   vuelta a verde; asiento huérfano en rojo.
4. **Costeo + export + validador.** Gate: `npm run inventario:exporta` y
   `npm run inventario:valida-erp` sobre `005_activos.sql` en Postgres desechable.
5. **Vista + empaquetador + cableado.** Gate: `npm run verify:gobernanza` (pasos declarados).
6. **Arista al ERP.** Gate: `detector-swm-act.py --dry-run` leyendo el índice del template, PR abierto.
7. **Cierre.** Gate: `npm run validate` completo.
