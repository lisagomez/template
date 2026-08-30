# Tareas 002 — Eficiencia de tokens y frescura de versiones

> **Reconstruidas a posteriori.** Los cinco incrementos se construyeron entre el
> 2026-08-23 y el 2026-08-26. Cada casilla marcada apunta a un artefacto que existe hoy
> en el repo, verificado el 2026-08-30.

## Cerradas

- [x] **TAR-1 · Sensor de contexto con presupuesto.**
      Hecho cuando: mide tokens por archivo contra un tope y se pone rojo al pasarse.
      → `scripts/mide-contexto.mjs` · verde el 2026-08-30

- [x] **TAR-2 · Calibrar el contador y declarar su error.**
      Hecho cuando: la aproximación se demuestra contra un conteo real y publica su margen.
      → chars / 3.644, calibrado sobre 762.817 chars, ±8 % por archivo · cubre la
      advertencia de LIBERTAD TECNICA

- [x] **TAR-3 · Mapa de routing por clase de tarea.**
      Hecho cuando: ninguna clase hereda el default por descuido y todo modelo va pineado.
      → `.claude/routing-modelos.json` + `scripts/verifica-routing.mjs` · verde 2026-08-30

- [x] **TAR-4 · Contabilidad de runtime con aviso al 80 %.**
      Hecho cuando: registra uso por llamada y guarda coste `null` si falta el dato.
      → `src/lib/ai/contabilidad.ts` · ⚠️ su prueba no corre sin `node_modules`

- [x] **TAR-5 · Vigilante de frescura que avisa y no actualiza.**
      Hecho cuando: reporta desfase de lo pineado y devuelve exit `2` si no puede verificar.
      → `scripts/vigila-versiones.mjs` · fuera de `validate` por usar red

- [x] **TAR-6 · `AGENTS.md` como fuente única.**
      Hecho cuando: `GEMINI.md` se genera y el verificador rechaza editarlo a mano.
      → `scripts/sincroniza-gemini.mjs` · comprobado en cada `verify:gobernanza`

- [x] **TAR-7 · Bajar lo informativo a `.claude/rules/`.**
      Hecho cuando: `AGENTS.md` solo contiene lo que obliga y las reglas cargan por `paths:`.
      → `.claude/rules/*.md` + `opencode.json` · el ahorro es de Claude Code, declarado

- [x] **TAR-8 · Portabilidad medida, no afirmada.**
      Hecho cuando: existe informe medido de qué corre desde otro arnés.
      → `docs/PORTABILIDAD-ARNESES.md`

## Abiertas

- [ ] **TAR-9 · Repetir la comprobación de portabilidad.**
      Hecho cuando: `opencode debug skill` y `npm run validate` se corren desde opencode
      en esta máquina. Bloqueado: opencode no está instalado aquí.

- [ ] **TAR-10 · Cerrar el punto 7 de la Definición de Hecho.**
      Hecho cuando: TAR-9 cierra y su salida queda pegada en la bitácora.
