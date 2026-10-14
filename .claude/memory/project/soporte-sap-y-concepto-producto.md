# Soporte SAP y el concepto «producto»: en qué quedamos

**Añadido:** 2026-10-04 · **Estado:** construido en laboratorio en la rama `soporte/sap`, mergeada en
`main` por el **PR #211** (2026-10-05). Los CDC de las corridas A y B están **firmados** (2026-10-04 y 2026-10-05, en la bitácora); la AISIA
  y el C3 del PRP-008 esperan al laboratorio.

Un solo goal en dos corridas (spec: `docs/goals/soporte-sap.md`):

- **A, el producto**: Soporte SAP de tres niveles (laboratorio → consultora → cliente), con datos sintéticos,
  un simulador en lugar de SAP y sin LLM. Informe: `docs/goals/soporte-sap-informe-a.md`.
- **B, el concepto** extraído de lo que se construyó: `productos/CONCEPTO.md`, la plantilla
  (`productos/PLANTILLA.md`, v2), dos manifiestos y el gate `verifica:productos`. Informe:
  `docs/goals/soporte-sap-informe-b.md`.

## Decisiones que no se deducen del código

- **Producto = fila del índice** (`BUSINESS_LOGIC.md` raíz). La clase `PRODUCTO` del inventario es una
  **pieza vendible** y **no se renombra**: el ERP la copia en un `check`. El campo `producto` del inventario
  es el **dueño**, uno por activo. Así el extractor es producto propio y componente de Soporte SAP a la vez.
- **El manifiesto es la fuente de la composición**, y el índice se verifica contra él. Se descartó ensanchar
  la fila con todos los activos: habría dos listas mantenidas a mano.
- **La regla de entrada a la plantilla**: entra lo que también tiene Soporte SAP o lo que la plantilla ya
  prometía. Lo que solo tiene otro producto va a su `noCupo`. Está **abierta** (B-3): la recomendación es
  «dos productos lo proponen, el tercero lo mete».
- **El reuso de composición no se compara entre productos**: depende de lo fino que esté partido el
  inventario. Soporte SAP da 50 % y el vendedor en WhatsApp 33.3 %, y eso no dice que uno reúse más.

## Lo que enseñó el segundo producto (el vendedor en WhatsApp)

- **La v1 de la plantilla le daba un verde hueco**: cuatro campos en null pasaban sin decir por qué, y no
  había dónde declarar que el texto de los clientes sale a Meta y al LLM. De ahí salieron en la v2 «un null
  no es un dato» y `terceros`.
- **Su agente manda la liga de pago bajo un umbral sin pasar por el dueño.** `aprueba: false` no lo
  distingue de un agente que solo propone. Se decide en su AISIA antes de beta (B-4).

## Lo que falta

- las firmas (arriba) y las D1–D15 de la spec;
- 6 de los 8 productos del índice sin manifiesto (sigue el extractor; el ERP al final);
- la v3 de la plantilla (`retencion` y `salida`: D8 y P-07);
- el post-mortem al grafo (`docs/grafos/soporte-sap.json`).
