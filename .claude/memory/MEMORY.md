# Memoria del Proyecto — Indice

> Archivos organizados por carpeta (tipo). Max 200 lineas.
> Gestionado por skill memory-manager. Auto-memory de Claude Code DESACTIVADO.

## user/ — Sobre el usuario/equipo
(vacio)

## project/ — Proyectos y decisiones activas
- [Capa de gobernanza agentica](project/gobernanza-agentica.md) — adoptada y firmada 2026-08-23; capa B con 5 mediciones validas en frio, todas verdes; verificador 115/115. Distingue deuda del template vs del entorno.
- [Infraestructura de agentes y respaldos](project/infraestructura-agentes.md) — Fase 0 en `docs/FASE0-INFRAESTRUCTURA.md` (2 verticales, sin canales de chat) + vigilante del pineo con capas A y B corridas y la imagen pineada **por digest**; la capa B destapo 4 afirmaciones falsas del runbook. Falta instalar el cron (entorno). Incluye la regla del corpus: cero identificadores fuera de `golden-sets`, ya con gate.

- [Eficiencia de tokens y frescura de versiones](project/eficiencia-tokens.md) — los cuatro sensores en el gate. **2026-08-26**: `AGENTS.md` recortado a lo que obliga (lo informativo en `.claude/rules/` con `paths:`; suelo 11313 → 8437), contabilidad medida en frío (verde-plus), `GEMINI.md` generado desde `AGENTS.md`. Medir si opencode OBEDECE sigue siendo de un proyecto derivado.
- [La imprenta de CLIs](project/imprenta-de-clis.md) — **medido 2026-08-25**: los servidores MCP cuestan 20363 tokens/sesion, casi el DOBLE que todas las instrucciones juntas, y ningun gate lo veia. El "~100x" heredado esta REFUTADO (real: 2.8x-55.8x). La decision de retirar un MCP es por servidor y por frecuencia de uso, nunca global. Y la libreria publica NO publica grados: instalar de ahi es adoptar un CLI no medido.
  **Alineado 2026-08-25**: esta maquina SI imprime (Go instalado, 4 CLIs medidos y declarados);
  el auditor ya no sale verde sobre el conjunto vacio.
- [El template sirve para dos cosas](project/herramientas-empaquetadas.md) — ademas de apps, **herramientas empaquetadas** (`tools/`, `npm run empaqueta`): la prueba final instala el tarball en un proyecto limpio y, con `--en <ruta>` (2026-08-26), en TU proyecto real, con los peers dictaminados por npm. PRP-002 (tipo de proyecto en Supabase) ejecutado en codigo, BD sin aplicar.

## feedback/ — Correcciones y preferencias
(vacio)

## reference/ — Donde encontrar cosas
- [Material de origen de la gobernanza](reference/material-origen-gobernanza.md) — los 9 docs de Hermes OS en a2aboths: que se conservo, que se descarto y por que.
- [Entorno: que se puede y que no](reference/entorno-git-y-red.md) — **reescrito 2026-08-26 para ESTA maquina**: `gh` 2.96 como HuertaVictor (repo de otra cuenta: sin push), Node 22 via nvm, **Docker si** (Playwright via imagen oficial), Go 1.24.6 (no imprime), sin sudo, sin Supabase. `/home/gsore` no existe.
