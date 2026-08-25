# La imprenta de CLIs — tercera palanca de eficiencia

**Estado (2026-08-25):** medido y cableado. Manifiesto, auditor, medición, skill `cli-audit`
y reglas inline. Ver `docs/SDD-imprenta-de-clis.md`.

## Lo que hay que recordar

- **Los MCP cuestan 20 363 tokens/sesión** (5 medidos de 9; los otros 4 necesitan
  credenciales, así que el total real es MAYOR). Es casi el **doble** que todas las
  instrucciones de la fábrica juntas (~10 900). Nadie lo había medido nunca.
- **El "~100x" heredado está refutado.** Origen: `04-politica-cli-first.md` (Hermes OS),
  afirmación pelada sin medición. El rango real medido va de **2.8x** (releer el `--help`
  entero cada sesión) a **55.8x** (consultar un subcomando).
- **La aportación propia**: el coste del MCP es **incondicional**, el del CLI **condicional**.
  Quien use una herramienta en 1 de cada 20 sesiones ahorra ~49x. Por eso la decisión de
  retirar un MCP es **por servidor y por frecuencia de uso**, nunca global.
- **Aquí no se imprime.** No hay Go ni librería de binarios, y no debe haberlos: es un
  boilerplate. Imprimir es acción de un proyecto derivado, y es un **CDC (C1)**.

## Cómo se corre

```bash
npm run mide:mcp          # necesita red; deja artefacto fechado
node scripts/audita-imprenta.mjs
npm run mide:contexto     # lee el artefacto, no vuelve a medir
```

## El caso de estudio que lo motivó

La fábrica ya decía "CLI preferido" para Playwright y el skill entero montaba un flujo QA
sobre `npx playwright navigate|click|fill|snapshot` — **comandos que no existen**, deducidos
de los nombres del MCP. Nadie los ejecutó nunca. Corregido y probado; dos contratos
`prohibido` impiden la recaída.

**La lección**: preferir un CLI inexistente cuesta más tokens que el MCP que reemplaza.
Antes de recomendar retirar un MCP, comprobar que el CLI existe de verdad.
