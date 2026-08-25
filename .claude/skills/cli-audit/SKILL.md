---
name: cli-audit
description: "Reporta el estado de la imprenta de CLIs: que CLI falta, cual conviene revisar, y cuanto cuestan los servidores MCP en contexto. Activar cuando el usuario dice: que CLIs faltan, estado de la imprenta, cuanto cuestan los MCP, que MCP quito, auditoria de herramientas, cuanto contexto gastan mis herramientas."
---

# Auditoria de la imprenta de CLIs

> Reporta y avisa. **NUNCA imprime.** Ver `docs/SDD-imprenta-de-clis.md`.

## De donde salen los datos

```bash
node scripts/audita-imprenta.mjs   # que falta segun el manifiesto
npm run mide:mcp                   # cuanto cuestan los MCP (necesita red)
npm run mide:contexto              # el presupuesto completo, MCP incluido
```

Fuentes: `.claude/imprenta/manifiesto.json` (contrato servicio -> CLI),
`.claude/imprenta/indice.json` (lo realmente impreso, `slug -> grade`) y
`.claude/imprenta/medicion-mcp.json` (artefacto de la medicion).

## Como presentarlo

1. **`fuente_impresos` primero.** Si dice `ninguna`, la respuesta es **"no se que hay
   impreso en esta maquina"**, jamas "0 faltantes". Son cosas distintas y confundirlas es el
   fallo que este auditor existe para no cometer.
2. **Faltantes**, con su fuente de verdad. Son lo accionable.
3. **Desactualizados** (grado por debajo del minimo) y **sin grado** en listas SEPARADAS.
   Sin grado **no es aprobado**: es no medido.
4. **Sin asignar**: servicios que nadie decidio si van por CLI o por MCP.
5. **El coste MCP**, si se pregunta por tokens: total medido, cuantos servidores quedaron
   sin medir, y que **el total real es mayor**.

Si `medicion-mcp.json` no existe o `generado` tiene mas de 30 dias, dilo con la fecha
delante y sugiere `npm run mide:mcp`. **Un dato viejo sigue siendo respondible**: se
advierte, no se oculta.

## Tu no imprimes ni mejoras CLIs

En este boilerplate **no hay Go ni libreria de binarios, y no debe haberlos**. Imprimir,
mejorar o regenerar el indice son acciones de un proyecto derivado en su maquina. **Nunca
afirmes que imprimiste algo.**

Y si alguien pide imprimir: imprimir cambia la superficie de herramientas del agente, asi
que es un **CDC (C1)** — diff, regresion, aprobacion y entrada firmada. La autonomia por
presupuesto que propone el material de origen **no aplica aqui**.

## Como se decide retirar un MCP

No por el ratio, sino por **frecuencia de uso**: el coste de un MCP es incondicional (se
paga cada sesion, se use o no) y el de un CLI es condicional. Un servidor usado en 1 de cada
20 sesiones cuesta ~20 veces mas que el CLI equivalente invocado una vez.

Antes de recomendar retirar uno, comprueba que el CLI **existe de verdad**: la fabrica ya
prefirio un CLI inventado sobre un MCP real y le costo una correccion (SDD §2.4).
