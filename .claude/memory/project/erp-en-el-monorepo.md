# El ERP vive en `erp/`, no en `tools/`

**Añadido:** 2026-09-25 (PRP-004, fase 3B) · **Estado:** vigente. La rama del ERP en el decision tree de
`AGENTS.md` espera el CDC de la Fase 7 (`.claude/PRPs/PRP-004-fase7-cdc-propuesta.md`)

La regla del template es que lo reutilizable nace en `tools/` y se empaqueta con
`npm run empaqueta`. **El ERP es la excepción**: es un sistema que opera la casa, no una
librería que otro proyecto importa. Meterlo en `tools/` le exigiría el contrato de empaquetado
y una versión npm que nadie consume (decisión del PRP-004).

| | Dónde |
|---|---|
| Esquema (fuente de verdad) | `erp/migrations/` — idéntico a producción (medido 2026-09-25) |
| Instalar en la base de un tenant | `erp/instalacion/` (`instalar.sh`, `pruebas.sh`, `npm run erp:prueba`) |
| Qué sale al cliente | `erp/entrega.json` + `erp/FRONTERA-DE-ENTREGA.md`, vigilado por `verifica:marca-blanca` |
| Lo de la casa (no sale) | `erp/casa/`, `erp/bin/` |
| Lo defendible (no sale) | `erp/ERP-MAESTRO.md`, `erp/reglas/`, `erp/integracion-arkham.md` |

La base de la casa es producción compartida: se lee con un login de solo lectura
(`rol_swm`); toda escritura es gate humano y entra por `set local role` + tenant, nunca con
`service_role`.

Pendientes con gate humano (PRP-004): Fase 4 (re-ubicar ACT-0012 en el catálogo,
`erp/casa/fase4-reubicacion.sql`), Fase 5 (corte de jobs, `erp/casa/RUNBOOK-FASE5.md`),
Fase 6 bloqueada por la duda 2, Fase 7 (CDC sin firmar).
