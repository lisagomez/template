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
- [El template sirve para dos cosas](project/herramientas-empaquetadas.md) — apps y herramientas (`tools/`, `npm run empaqueta`, `--en <ruta>` contra tu proyecto real); puerta `docs/CREAR-UNA-HERRAMIENTA.md` + skill en PR #31, CDC firmado; PRP-002 en codigo, BD sin aplicar.
- [Extractor documental: en qué quedamos](project/extractor-documental.md) — spec 010 mezclada (PR #98, 2026-09-13): Tesseract base + cola por regla, sin umbral (r=−0,11), servicio Node sobre dist/, A2A montado y SIN publicar (gate humano), Hermes por MCP→A2A, GPU como perfil; falta corpus real y GPU.
- [Trayectorias: en qué quedamos](project/trayectorias.md) — spec 011 en PR #100; dos CDC promovidos por capa B (21/21); el sujeto va sin `git log` porque el historial alcanza el corpus; una tanda cuesta ~20 USD.
- [Protocolo de specs (SDD)](project/protocolo-de-specs.md) — `/spec-generator` + `.claude/specs/NNN/{spec,plan,tareas}` + gate `verifica:specs` (64); C4 en la spec, C3 en el plan; spec o PRP segun se sepa el QUE; `prp-base.md` enlaza spec + BUSINESS_LOGIC (CDCs 2026-09-08, PRs #43/#44); capa B corrida en frio 2026-08-30.

## feedback/ — Correcciones y preferencias
(vacio)

## reference/ — Donde encontrar cosas
- [Material de origen de la gobernanza](reference/material-origen-gobernanza.md) — los 9 docs de Hermes OS: que se conservo y que no. Ruta legible en esta maquina (medido 2026-08-27).
- [Entorno: que se puede y que no](reference/entorno-git-y-red.md) — ESTA maquina, medido 2026-08-27: `gh` como lisagomez (cuenta propia), Node 22 sin nvm, Go 1.26.7 y la imprenta SI imprime; Docker sin `compose`; sin sudo ni Supabase.
