# Propuesta de CDC (C1) — la clase del agente de ventas en el routing, y su prompt

> Fecha: 2026-09-30 · Estado: **PROPUESTA, sin aplicar y sin firmar**. La redactó el agente del
> goal `docs/goals/ventas-ia-waba.md`. Por el aprendizaje del 2026-09-20 (una entrada de bitácora
> sin firma tumba el gate), la entrada de bitácora va AQUÍ como borrador y NO en
> `.claude/gobernanza/BITACORA-CDC.md`: al firmar se pega allá y se borra de aquí.
>
> Radio: **routing** (una clase nueva) + **prompt** (el del agente de ventas, `PROMPT_VENTAS_V1`).

## 1. Por qué hace falta

El agente de ventas de `tools/ventas-whatsapp` llama a un LLM por cada mensaje de texto libre de
un cliente (los botones, el carrito y los Flows NO pasan por el modelo). Hoy corre con el modelo
SIMULADO y el real responde «no medido»: no hay llave y, sobre todo, **no hay clase en
`.claude/routing-modelos.json`**. Una clase sin asignar hereda el default caro y el gate
`verifica:routing` la rechaza. Sin este CDC el modelo real no se enciende, a propósito.

## 2. El diff propuesto

```diff
--- a/.claude/routing-modelos.json
+++ b/.claude/routing-modelos.json
@@ "tareas": {
     "redaccion-de-marketing": "capaz",
     "respuesta-a-resenas": "capaz",
+    "agente-ventas-whatsapp": "capaz",
     "diseno-de-arquitectura": "razonamiento",
```

Y, en la app, el adaptador real se arma con el modelo **pineado** del nivel (`modeloPara('agente-ventas-whatsapp')`
de `src/lib/ai/routing.ts`), nunca con un alias. El uso se registra con `registraUso` de la
contabilidad de la casa (costo `null` si el proveedor no devuelve uso).

## 3. Nivel recomendado: `capaz`, y medir `ligero` en paralelo

- **Por qué no `ligero` de entrada**: la compuerta de la fase 1 es «cero respuestas fuera de
  dominio en 200 pruebas» y la política de AI Providers de WhatsApp castiga al agente que se
  vuelve asistente general. Las barreras son léxicas: un modelo que se sale con palabras nuevas
  pasa. El nivel se decide por la corrida, no por el precio (C8: eficiencia por reparto, no por
  recorte).
- **Por qué no `razonamiento`**: el agente no decide sobre dinero ni datos: pide herramientas y
  el precio, el cobro y el traspaso los deciden código determinista y el dueño.
- **Medición propuesta antes de aprobar**: el arnés de 200 conversaciones (`correAdversarial`
  del laboratorio) con el modelo de `capaz` y con el de `ligero`, más los 13 casos del
  laboratorio. Se aprueba el más barato que dé 0/200 y los 9 casos en `pasa`.
- **Alternativa de pesos abiertos**: la del nivel en el catálogo. Ojo (AGENTS.md): pesos abiertos
  en un proveedor ajeno NO es alojado por nosotros; el texto del cliente sale igual. Es decisión
  de flujo de datos (C4, ver la AISIA borrador), no de precio.

## 4. El prompt que entra con este CDC

`instrucciones()` en `src/agente/orquestador.ts`, versión `ventas-v1`:

> Eres el asistente de ventas de {negocio}, {giro} en {ciudad}. Solo hablas de {negocio}: su
> catálogo, pedidos, reservaciones, horarios y políticas. Cualquier otro tema lo declinas con
> amabilidad. Precios y existencias SOLO de las herramientas; nunca los inventes ni los estimes.
> Si el cliente se queja o pide una persona, usa escalar_a_humano: lo atiende {dueño}.
> Respuestas cortas, en español de México, tuteando. No pidas datos de tarjeta: el pago va por la liga.

Nota: el prompt NO es la barrera. Las barreras de entrada y salida y los disparadores del
traspaso son código y se prueban aparte; el prompt solo mejora la calidad.

## 5. Gate propuesto

diff visible ☐ · regresión capa A ☐ · **corrida real del arnés de 200 (0 fuera de dominio) y de
los 13 casos** ☐ · costo medido por conversación con uso real ☐ · aprobación humana ☐ · modelo
pineado ☐ · AISIA con el flujo de datos al proveedor firmada ☐.

## 6. Entrada de bitácora (BORRADOR: se pega en `BITACORA-CDC.md` al firmar)

```markdown
### AAAA-MM-DD — clase `agente-ventas-whatsapp` en el routing y prompt `ventas-v1` → CDC <PROMOVIDO|RECHAZADO> — radio: routing + prompt
- **Cambio**: `.claude/routing-modelos.json` gana `"agente-ventas-whatsapp": "<nivel>"`; el adaptador real de
  `tools/ventas-whatsapp` se arma con el modelo pineado del nivel; entra el prompt `ventas-v1`.
- **Motivo**: medir el agente de ventas con un modelo real (compuerta de la fase 1: 0/200 fuera de dominio).
- **Gate aplicado**: diff visible ☐ · regresión capa A ☐ · arnés de 200 con el modelo real: <resultado> ·
  13 casos: <resultado> · costo por conversación medido: <cifra> · aprobación humana ☐ · pineo ☐.
- **Aprobado por**: <quién> — <cómo y cuándo>.
```

Firmada por: ____________  Rol: ____________  Fecha: ____________
