---
paths:
  - ".claude/**"
---
# Estructura de la Fabrica

Trasladado de `AGENTS.md` el 2026-08-26, texto original. Carga al tocar `.claude/` (Claude
Code) o siempre (opencode).

`.claude/` lleva `gobernanza/` (los 7 controles C1-C7, con sus registros append-only y
plantillas), `imprenta/` (contrato CLI + medicion MCP), `memory/`, `skills/`, `PRPs/`,
`design-systems/` y `rules/` (lo que carga por `paths:`, como este archivo). El arbol completo
lo da `ls .claude/`, que nunca se desincroniza; el enrutado esta en el decision tree de
`AGENTS.md`, y la lista de skills con su `description` la carga el arnes desde
`.claude/skills/*/SKILL.md`.
