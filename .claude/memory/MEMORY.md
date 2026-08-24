# Memoria del Proyecto — Indice

> Archivos organizados por carpeta (tipo). Max 200 lineas.
> Gestionado por skill memory-manager. Auto-memory de Claude Code DESACTIVADO.

## user/ — Sobre el usuario/equipo
(vacio)

## project/ — Proyectos y decisiones activas
- [Capa de gobernanza agentica](project/gobernanza-agentica.md) — adoptada y firmada 2026-08-23; capa B con 5 mediciones validas en frio, todas verdes; verificador 115/115. Distingue deuda del template vs del entorno.
- [Infraestructura de agentes y respaldos](project/infraestructura-agentes.md) — Fase 0 en `docs/FASE0-INFRAESTRUCTURA.md` (2 verticales, sin canales de chat) + vigilante del pineo con capas A y B corridas y la imagen pineada **por digest**; la capa B destapo 4 afirmaciones falsas del runbook. Falta instalar el cron (entorno). Incluye la regla del corpus: cero identificadores fuera de `golden-sets`, ya con gate.

- [Eficiencia de tokens y frescura de versiones](project/eficiencia-tokens.md) — los cuatro sensores (contexto, routing, contabilidad, frescura) construidos y en el gate; falta `.claude/rules/`; opencode ya corre el gate aqui, falta una sesion conducida por un LLM (sin credencial en esta maquina).
- [El template sirve para dos cosas](project/herramientas-empaquetadas.md) — ademas de apps, **herramientas empaquetadas** (`tools/`, `npm run empaqueta`): lo que falla es el contrato del paquete, y por eso la prueba final instala el tarball en un proyecto limpio.

## feedback/ — Correcciones y preferencias
(vacio)

## reference/ — Donde encontrar cosas
- [Material de origen de la gobernanza](reference/material-origen-gobernanza.md) — los 9 docs de Hermes OS en a2aboths: que se conservo, que se descarto y por que.
- [Entorno: que se puede y que no](reference/entorno-git-y-red.md) — `gh` v2.98.0 instalado en `~/.local/bin` (2026-08-23) pero **sin autenticar**: `gh auth login` es interactivo. Hay red, no hay Docker.
