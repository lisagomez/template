# Memoria del Proyecto — Indice

> Archivos organizados por carpeta (tipo). Max 200 lineas y 800 tokens: **una linea por memoria**,
> el detalle vive en el archivo. Gestionado por skill memory-manager. Auto-memory DESACTIVADO.

## user/ — Sobre el usuario/equipo
(vacio)

## project/ — Proyectos y decisiones activas
- [Capa de gobernanza agentica](project/gobernanza-agentica.md) — 7 controles firmados 2026-08-23; capa B medida en frio (ultima tanda 2026-08-26: 5 corridas, 4 verde-plus); deuda del template vs del entorno, no se mezclan.
- [Infraestructura de agentes y respaldos](project/infraestructura-agentes.md) — Fase 0 (2 verticales, sin chat), imagen pineada por digest y vigilada; nada provisionado: lo cierra un derivado.
- [Eficiencia de tokens y frescura](project/eficiencia-tokens.md) — 4 sensores en el gate; 2026-08-26: `AGENTS.md` solo obliga, lo informativo en `.claude/rules/`, `GEMINI.md` generado, contabilidad medida en frio.
- [La imprenta de CLIs](project/imprenta-de-clis.md) — MCP cuestan 20363 tok/sesion (medido); "100x" refutado; la libreria publica no publica grados; esta maquina SI imprime (Go 1.26.7, 5 CLIs en libreria).
- [El template sirve para dos cosas](project/herramientas-empaquetadas.md) — apps y herramientas (`tools/`, `npm run empaqueta`, `--en <ruta>` contra tu proyecto real); PRP-002 en codigo, BD sin aplicar.

## feedback/ — Correcciones y preferencias
(vacio)

## reference/ — Donde encontrar cosas
- [Material de origen de la gobernanza](reference/material-origen-gobernanza.md) — los 9 docs de Hermes OS: que se conservo y que no. Ruta legible en esta maquina (medido 2026-08-27).
- [Entorno: que se puede y que no](reference/entorno-git-y-red.md) — ESTA maquina, medido 2026-08-27: `gh` como lisagomez (cuenta propia), Node 22 sin nvm, Go 1.26.7 y la imprenta SI imprime; Docker sin `compose`; sin sudo ni Supabase.
