# Resultados — referencias a `add-payments` (goal ejecutado el 2026-09-27)

Rama `pagos-add-payments`, apilada sobre `pymes-marketing-build` (esa rama no estaba en `main`, así que sus
documentos también contaban). PR #166; el CDC lo firmó el laboratorio el 2026-09-27 («capa A basta») y su
entrada vive en `BITACORA-CDC.md`. Detalle: `inventario.md`.

## Qué quedó
- 9 lugares ganaron la referencia en el punto donde se decide o se usa el cobro, 1 comparación falsa se
  corrigió, y el cobro de la pyme quedó como **hueco nombrado** (no aplica).
- `add-payments` dice ahora lo que NO resuelve, con citas de Polar fechadas.
- +7 contratos en la regresión (123 → 131): las referencias fallan en el build si se borran.
- Costo en contexto: +28 tokens en descripciones de skills (51 % de su presupuesto) y +10 en reglas (97 %).

## Verificado en fuente oficial (2026-09-27)
- Polar prohíbe «Physical products» y marketplaces, y dice «If your company's primary offering is human
  services or the sale of physical goods, the Services are not designed for and should not be used by
  you» — https://polar.sh/docs/merchant-of-record/acceptable-use
- México está entre los países con pagos al vendedor (Stripe Connect Express) —
  https://polar.sh/docs/merchant-of-record/supported-countries
- **A verificar**: moneda de liquidación (la página no menciona MXN) y si el comprador recibe CFDI (Polar
  emite sus propios recibos electrónicos como revendedor — https://polar.sh/legal/checkout-buyer-terms —;
  el CFDI no está documentado).

## Decisiones
1. **El límite vive en la fuente** (`add-payments`): toda referencia lleva ahí; así hay una sola verdad.
2. **`AGENTS.md` no se tocó**: ya enruta pagos a ADD-PAYMENTS; cambiarlo invalida el caché de prefijo.
3. **Contratos por skill, no uno condicional**: el esquema de `contratos.json` no expresa «si menciona X
   debe citar Y»; hacerlo cambia el código del gate (otro CDC). Queda propuesto.
4. **Specs cerradas no se reescriben** (spec 005): la corrección va en la skill viva.

## Formas en que esto podía estar mal — y qué se hizo
| Riesgo | Estado |
|---|---|
| Mandar a Polar a quien vende productos físicos | **Resuelto**: límite citado en el skill, en `website-3d`, `new-app`, `prp-base`, `flujos` y en el hueco de la pyme |
| Referencias que dicen algo falso del skill (`add-a2a`) | **Resuelto** + contrato `prohibido` |
| Afirmar MXN o CFDI sin fuente | **Resuelto**: marcados «a verificar» |
| Menciones que la búsqueda no atrapó (otros sinónimos) | **Mitigado**: dos pasadas (inglés y español) y lista de ruido explícita; el contrato condicional cubriría las futuras |
| La política de Polar cambia | **Declarado**: la cita va fechada; revisar al cambiar de versión de Polar |
| Rama apilada: si `pymes-marketing-build` no se aprueba, arrastra este trabajo | **Declarado**: los cambios de pagos no dependen de pymes salvo `resultados.md` de pymes; se pueden llevar solos |
| **El commit del goal anterior (`c3da680`) rompía `verify:gobernanza`** | **Resuelto** en `b3e7656`: las horas ISO armadas en plantillas (la fecha, la letra T pegada y la hora) caían en el patrón de identificador de caso (la letra T seguida de dígitos). No se vio porque `validate` corrió antes del commit y el escaneo solo mira archivos versionados |

## Aprendizaje propuesto (para firma: las reglas son CDC)
Para `.claude/rules/aprendizajes-gobernanza.md` (~70 tokens; el presupuesto de reglas queda en ~98 %):
> **2026-09-27: `validate` antes del commit no ve lo que aún no está versionado.** Los escaneos de fugas
> e identificadores leen `git ls-files`: un archivo nuevo pasa el gate sin ser leído. Correr `validate`
> **después** de commitear (el sello es del árbol y no cambia con el commit).
