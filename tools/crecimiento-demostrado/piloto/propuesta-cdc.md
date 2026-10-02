# Propuestas de CDC (C1) — crecimiento demostrado

> **PROPUESTAS, NINGUNA APLICADA.** El goal prohíbe tocar `.claude/gates.json`,
> `.claude/routing-modelos.json`, skills y `AGENTS.md`. Cada una se aplica con diff,
> `npm run regresion` y una entrada **firmada por el laboratorio** en
> `.claude/gobernanza/BITACORA-CDC.md`. Redactadas el 2026-10-02.

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

## CDC-2 · Un gate para las demostraciones de Lean

`lean/comprueba.sh` comprueba `Puente.lean` con Lean 4.34.1 pineado; sin el binario dice «no
medido» y sale con 2. Propuesta en `.claude/gates.json`:

```json
{ "id": "prueba:lean-crecimiento", "comando": "bash tools/crecimiento-demostrado/lean/comprueba.sh",
  "perfiles": [], "activo": false,
  "motivo": "el toolchain de Lean (900 MB) no está en todas las máquinas ni en CI",
  "falta": "instalar Lean 4.34.1 donde corra el gate, con su sha-256 de lean/toolchain.sha256" }
```

Inactivo **con motivo y falta**: un inactivo nunca cuenta como uno que pasó. Si el teorema y el
kernel divergen, lo detecta antes la prueba de estructura de la herramienta. Lo que este gate
aporta es la demostración de que el enunciado vale.

## Fuera de C1, pero del mismo paquete

- **Extractor documental** (otro producto, firma pendiente): leer `CfdiRelacionados`
  (TipoRelacion + UUID) e `InformacionGlobal` (Periodicidad, Meses, Año) en `leeCfdi40`. Hoy van a
  `noLeido`, y su skill A2A no los devuelve. Aquí se leen con su mismo analizador XML.
- **ERP:** la cola `sis_propuesta` (migración 008, D-42) no existe. La propuesta sale con su forma
  y nadie la encola.
