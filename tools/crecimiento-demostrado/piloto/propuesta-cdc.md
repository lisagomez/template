# Propuestas de CDC (C1) — crecimiento demostrado

> Redactadas el 2026-10-02; puestas al día el 2026-10-14. **El CDC-0 está firmado** (2026-10-14).
> **El CDC-1 sigue siendo propuesta**: se aplica con diff, `npm run regresion`, la
> medición con un LLM real y su propia entrada firmada.

## CDC-0 · Los 3 prompts entran apagados y el gate de Lean, inactivo

**Firmado por el laboratorio el 2026-10-14** (capa A basta). La entrada está en
`.claude/gobernanza/BITACORA-CDC.md` y se borró de aquí al pegarla.

## CDC-1 · Dos clases de routing para activar el LLM real

Hoy los agentes son simulados (decisión del laboratorio) y el adaptador real dice «no medido».
Activarlo pide dos clases nuevas en `.claude/routing-modelos.json`.

| Clase | Nivel | Por qué ese nivel |
|---|---|---|
| `propuesta-de-derivacion` | `capaz` | Planea y arma derivaciones Γ ⊢ φ. **No decide**: el kernel sin LLM verifica cada paso y rechaza lo que no se deriva, así que un error se vuelve un reintento, no una cifra falsa. No entra a `no_se_abaratan`, porque el riesgo ya lo absorbe el kernel. |
| `narracion-verificada` | `ligero` | Redacta un texto cuyas cifras pasan la inclusión de números; una cifra mal puesta se bloquea. El acierto se verifica de un vistazo, que es la definición del nivel. |

**La medición que falta**, sin la cual el producto sigue «no medido»:
- la tasa de aceptación al primer intento;
- los intentos por respuesta;
- la tasa de narraciones bloqueadas, con el adversario apagado;
- el costo por respuesta, en la contabilidad (coste `null` si el proveedor no da el uso).

**Antes de una corrida real**, el aprendizaje del goal SGI: comprobar la llave **y** el saldo,
enmascarados, y poner un tope.

**Los prompts que se activan** (`src/agentes/llm.ts`): `PROMPT_PLAN`, `PROMPT_DERIVACION` y
`PROMPT_NARRACION`. Son parte de este CDC.

**C4:** con un LLM real, el plan y los hechos agregados (seudonimizados) salen al proveedor. Ver
la AISIA en `src/features/crecimiento-demostrado/BUSINESS_LOGIC.md` §6.

## CDC-2 · El gate de Lean

Aplicado dentro del CDC-0 (2026-10-14), como gate **inactivo** con su motivo y lo que le falta.

## Fuera de C1, pero del mismo paquete

- **Extractor documental** (otro producto, firma pendiente): leer `CfdiRelacionados`
  (TipoRelacion + UUID) e `InformacionGlobal` (Periodicidad, Meses, Año) en `leeCfdi40`. Hoy van a
  `noLeido` (comprobado el 2026-10-14), y su skill A2A no los devuelve. Aquí se leen con su mismo analizador XML.
- **ERP:** la cola `sis_propuesta` (migración 008, D-42) no existe. La propuesta sale con su forma
  y nadie la encola.
