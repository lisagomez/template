# Memoria del Proyecto — Indice

> Archivos organizados por carpeta (tipo). Max 200 lineas.
> Gestionado por skill memory-manager. Auto-memory de Claude Code DESACTIVADO.

## user/ — Sobre el usuario/equipo
(vacio)

## project/ — Proyectos y decisiones activas
- [Capa de gobernanza agentica](project/gobernanza-agentica.md) — adoptada y firmada 2026-08-23; capa B con 5 mediciones validas en frio, todas verdes; verificador 115/115. Distingue deuda del template vs del entorno.
- [Infraestructura de agentes y respaldos](project/infraestructura-agentes.md) — Fase 0 en `docs/FASE0-INFRAESTRUCTURA.md` (2 verticales, sin canales de chat) + vigilante del pineo con capas A y B corridas y la imagen pineada **por digest**; la capa B destapo 4 afirmaciones falsas del runbook. Falta instalar el cron (entorno). Incluye la regla del corpus: cero identificadores fuera de `golden-sets`, ya con gate.

- [Eficiencia de tokens y frescura de versiones](project/eficiencia-tokens.md) — los cuatro sensores (contexto, routing, contabilidad, frescura) construidos y en el gate; falta `.claude/rules/`. Punto 7 cerrado: opencode carga las reglas y corre el gate; medir si las OBEDECE es de un proyecto derivado, no del template.
- [La imprenta de CLIs](project/imprenta-de-clis.md) — **medido 2026-08-25**: los servidores MCP cuestan 20363 tokens/sesion, casi el DOBLE que todas las instrucciones juntas, y ningun gate lo veia. El "~100x" heredado esta REFUTADO (real: 2.8x-55.8x). La decision de retirar un MCP es por servidor y por frecuencia de uso, nunca global.
  **Alineado 2026-08-25**: esta maquina SI imprime (Go instalado, 4 CLIs medidos y declarados);
  el auditor ya no sale verde sobre el conjunto vacio.
- [El template sirve para dos cosas](project/herramientas-empaquetadas.md) — ademas de apps, **herramientas empaquetadas** (`tools/`, `npm run empaqueta`): lo que falla es el contrato del paquete, y por eso la prueba final instala el tarball en un proyecto limpio.

## feedback/ — Correcciones y preferencias
(vacio)

## reference/ — Donde encontrar cosas
- [Material de origen de la gobernanza](reference/material-origen-gobernanza.md) — los 9 docs de Hermes OS en a2aboths: que se conservo, que se descarto y por que.
- [Entorno: que se puede y que no](reference/entorno-git-y-red.md) — `gh` **v2.46.0 en `/usr/bin`** y **autenticado** (`lisagomez`, HTTPS): abre y fusiona PRs desde la sesión. El indice decia "sin autenticar" y el v2.98.0 de `~/.local/bin`; ambos falsos, corregidos el 2026-08-25. Hay red, no hay Docker.
