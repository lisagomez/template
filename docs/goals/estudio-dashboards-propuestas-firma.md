# Estudio de dashboards: propuestas para firmar (el CDC ya firmado; el resto, SIN firmar)

> Fuera del registro, a propósito: nada de esto entra en `.claude/gobernanza/BITACORA-CDC.md` hasta que el
> laboratorio lo firme (aprendizaje del 2026-09-20: una entrada «pendiente» en la bitácora tumba el gate, y está bien
> que lo haga). La firma la escribe el laboratorio. Rama `estudio/dashboards`, worktree
> `.claude/worktrees/estudio-dashboards`, sin push, sin PR y sin merge.

## 1. CDC — FIRMADO el 2026-10-22

El laboratorio lo firmó el 2026-10-22 (capa A basta), tras ver el diff completo en la conversación. La entrada vive en
`.claude/gobernanza/BITACORA-CDC.md` («2026-10-22 — Estudio de dashboards: clase `agente-estudio-dashboards` en el
nivel `voz` (con su «para» ampliado)…») y la propuesta se borró de aquí al firmar.

## 2. README product first

`tools/estudio-dashboards/README.md`: conforme a `npm run revisa:readmes` (31/31 en alcance el 2026-10-20). La
feature `src/features/estudio-dashboards` queda sin README, listada como pendiente por el auditor (no se crean solos).

## 3. Filas del inventario

En `inventario/activos.json`, las dos en estado **`blueprint`**, como el crecimiento demostrado antes de firmarse; el
laboratorio decide estado y clase. Entraron en la rama porque `verifica:inventario` y `empaqueta` las exigen:

- `TPL-estudio-dashboards` → `tools/estudio-dashboards` (PRODUCTO).
- `TPL-feature-estudio-dashboards` → `src/features/estudio-dashboards` y `scripts/estudio-dashboards` (PRODUCTO).

## 4. Fila de rutas públicas

En `docs/REVISION-rutas-publicas.md` §3: `POST /api/estudio-dashboards`. Hoy responde 503 sin
`ESTUDIO_LABORATORIO=1`, y la acción que gasta OpenRouter también responde 503 sin `OPENROUTER_API_KEY` o al llegar al
tope del lienzo (US$0.25). Riesgo **bajo** hoy y **medio** si se enciende fuera del laboratorio: la ruta no tiene
cuenta, y antes de exponerla hace falta sesión y C3.

## 5. Lo que queda para otra firma (no se hizo)

- **Adoptar el CLI en el arnés** (skill, `settings.json` o manifiesto de la imprenta): CDC aparte.
- **El gate por tipo sobre el v1 se cerró con el fallo reportado** (decisión del laboratorio en la conversación,
  2026-10-21): analizar 14/16 en 7 de 8 corridas. No es una firma.
- **Adoptar el set v2** (`evaluacion/set-referencia-v2.json`, `ADJUDICACION.md`) como set de regresión del CDC: lo
  produjo un adjudicador independiente y ciego, y está congelado en `cdf43d6`. El v1 sigue siendo el oficial hasta
  que el laboratorio firme.
- **Los dos arreglos vistos en la retenida** (las dimensiones de la línea en «lo que entendí»; «¿por qué cayó el
  crecimiento?» por la métrica base): **aplicados y medidos el 2026-10-22** en la rama `estudio/set-ciego`, sobre un set
  v3 escrito a ciegas, adjudicado y congelado antes de medir (`docs/goals/estudio-dashboards-set-v3.md`). Resultado:
  no medibles como mejora (el de la métrica con desfase no tiene preguntas en el v3; el del eje de tiempo es neutro)
  y sin cambio de precisión (96/96 sin ellos, 95/95 con ellos). El umbral por tipo tampoco se cumple en el v3
  (`crear` y `filtrar`, con los dos núcleos). Adoptarlos es decisión del laboratorio. El adjudicador del v2 dejó además
  tres tensiones del contrato para resolver en el contrato (el del v3, dieciséis):
  - la tabla por tipo contra la regla general de la Puntuación;
  - `comparar` en analizar;
  - la unidad de un umbral de nivel sobre una métrica en %.
- **Reglas de auto-blindaje** del post-mortem (reporte §Post-mortem) en `.claude/rules/aprendizajes-stack.md`:
  propuestas, sin aplicar.
