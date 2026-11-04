# Memoria del Proyecto — Indice

> Archivos organizados por carpeta (tipo). Max 200 lineas y 800 tokens: **una linea por memoria**,
> el detalle vive en el archivo. Gestionado por skill memory-manager. Auto-memory DESACTIVADO.

## user/ — Sobre el usuario/equipo
(vacio)

## project/ — Proyectos y decisiones activas
- [Capa de gobernanza agentica](project/gobernanza-agentica.md) — 7 controles firmados 2026-08-23; capa B medida en frio; deuda del template vs del entorno, no se mezclan.
- [Infraestructura de agentes y respaldos](project/infraestructura-agentes.md) — Fase 0 (2 verticales, sin chat), imagen pineada por digest; nada provisionado: lo cierra un derivado.
- [Hermes local y /hermes-update](project/hermes-local-y-hermes-update.md) — el Hermes de ESTA máquina no es el de producción.
- [Eficiencia de tokens y frescura](project/eficiencia-tokens.md) — 4 sensores en el gate; `AGENTS.md` solo obliga y lo informativo vive en `.claude/rules/`.
- [La imprenta de CLIs](project/imprenta-de-clis.md) — MCP cuestan 20363 tok/sesion (medido); la libreria publica no publica grados.
- [El template sirve para dos cosas](project/herramientas-empaquetadas.md) — apps y herramientas; puerta `docs/CREAR-UNA-HERRAMIENTA.md`; PRP-002 en codigo, BD sin aplicar.
- [El ERP vive en erp/](project/erp-en-el-monorepo.md) — excepcion a `tools/`; marca blanca: `erp/instalacion/`.
- [Extractor documental: en qué quedamos](project/extractor-documental.md) — spec 010: Tesseract + cola por regla, sin umbral; A2A montado y SIN publicar; falta corpus real y GPU.
- [Trayectorias: en qué quedamos](project/trayectorias.md) — spec 011; dos CDC promovidos por capa B; el sujeto va sin `git log` porque el historial alcanza el corpus; una tanda cuesta ~20 USD.
- [Protocolo de specs (SDD)](project/protocolo-de-specs.md) — `/spec-generator` + `.claude/specs/NNN/` + gate `verifica:specs`; C4 en la spec, C3 en el plan; spec o PRP segun se sepa el QUE.
- [Soporte SAP y el concepto «producto»](project/soporte-sap-y-concepto-producto.md) — en main; CDC A y B firmados; B-3 abierta.
- [Analista de producto](project/analista-de-producto.md) — en main (#214); PRP-009.
- [Turno 25 y el banco de motores](project/turno25-marca-y-banco.md) — en main (#293-#297); abierto: marca v1.1.

## feedback/ — Correcciones y preferencias
- [Firmar un CDC](feedback/firmar-un-cdc.md) — el agente no corre la capa B; simular la firma antes de pedirla.

## reference/ — Donde encontrar cosas
- [Reloj de pruebas en PGlite](reference/reloj-de-pruebas-en-pglite.md) — desplazar `Date.now` mueve la base y el código.
- [Material de origen de la gobernanza](reference/material-origen-gobernanza.md) — los 9 docs de Hermes OS: que se conservo y que no.
- [Entorno: que se puede y que no](reference/entorno-git-y-red.md) — ESTA maquina: `gh` como lisagomez, la imprenta SI imprime, sin sudo ni Supabase; validate con `taskset` si falta memoria.
