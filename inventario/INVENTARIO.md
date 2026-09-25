# Inventario de activos del template

> Generado por `npm run inventario:vista` desde `inventario/activos.json`. No se edita a mano:
> el gate `npm run verifica:inventario` falla si esta vista no coincide con el indice.
> Costo y clasificacion (D+I, defensibilidad) no viven aqui: se calculan con
> `npm run inventario:exporta` y viajan al ERP (spec 014, repo publico).

**25 activos** cubren **182 unidades** del repo.

| ID | Activo | Clase | Tipo | Estado | Unidades | Ubicacion |
| --- | --- | --- | --- | --- | ---: | --- |
| TPL-doctrina | Doctrina de la fabrica: instrucciones del agente, reglas y memoria de proyecto | CONOCIMIENTO | config_agentica | produccion | 17 | `AGENTS.md` |
| TPL-especificaciones | Especificaciones y disenos: specs, PRPs, goals, SDD e investigaciones | CONOCIMIENTO | documento | produccion | 50 | `.claude/specs` |
| TPL-design-systems | Design systems de referencia (bento, glass, neobrutalismo...) | DISEÑO | documento | produccion | 5 | `.claude/design-systems` |
| TPL-clis-impresos | CLIs impresos del manifiesto (externo: lo cataloga su fuente) | FABRICA | software | produccion | 5 | `cli:*` |
| TPL-ejemplo-herramienta | Andamio de herramienta empaquetable (el ejemplo a copiar) | FABRICA | software | produccion | 1 | `tools/ejemplo-herramienta` |
| TPL-empaquetador | Empaquetador de herramientas y su contrato | FABRICA | software | produccion | 3 | `scripts/empaqueta-herramienta.mjs` |
| TPL-feature-laboratorio-voz | Laboratorio de voz: capturas y mediciones del motor | FABRICA | software | beta | 2 | `src/features/laboratorio-voz` |
| TPL-gobernanza | Capa de gobernanza (controles C1-C8) y gates de validate | FABRICA | software | produccion | 17 | `.claude/gobernanza` |
| TPL-imprenta | Imprenta de CLIs: manifiesto servicio a CLI y su auditoria | FABRICA | software | produccion | 4 | `.claude/imprenta` |
| TPL-inventario | Inventario de activos: indice, detector, costeo y export al ERP | FABRICA | software | beta | 3 | `inventario` |
| TPL-motor-ia | Motor de IA: routing por nivel, contabilidad de tokens y trayectorias de la app | FABRICA | software | produccion | 4 | `src/lib/ai` |
| TPL-skills | Catalogo de skills de la fabrica | FABRICA | config_agentica | produccion | 27 | `.claude/skills` |
| TPL-trayectorias | Trayectorias: trazas de ejecucion, evaluador, informe y propuestas | FABRICA | software | produccion | 4 | `scripts/trayectorias` |
| TPL-despliegue | Blueprint de despliegue self-hosted (Docker, Caddy, Hetzner, Hermes) | INFRA | infraestructura | produccion | 10 | `docker-compose.yml` |
| TPL-app-base | App SaaS base (Next.js + Supabase, PWA) | PRODUCTO | software | produccion | 6 | `src/app` |
| TPL-asesor-ventas | Asesor de ventas: insights con evidencia desde una reunion diarizada | PRODUCTO | software | blueprint | 1 | `tools/asesor-ventas` |
| TPL-dictado | Dictado local: hablar y que el texto aparezca donde esta el cursor | PRODUCTO | software | beta | 2 | `tools/dictado` |
| TPL-erp | ERP agentico: maestro, reglas, migraciones y modulo act (externo: lo cataloga su fuente) | PRODUCTO | software | beta | 9 | `erp` |
| TPL-extractor-documental | Extractor documental (PDF, imagen, CFDI XML) con revision humana | PRODUCTO | software | beta | 2 | `tools/extractor-documental` |
| TPL-feature-a2a | Puente A2A del extractor (Agent Card + JSON-RPC + Tasks) | PRODUCTO | software | beta | 2 | `src/features/a2a` |
| TPL-feature-auth | Autenticacion Supabase (login, registro, perfiles) | PRODUCTO | software | produccion | 1 | `src/features/auth` |
| TPL-feature-dashboard | Dashboard de la app base | PRODUCTO | software | beta | 1 | `src/features/dashboard` |
| TPL-feature-dictado | Interfaz web del dictado (pildora, ajustes e historial) | PRODUCTO | software | beta | 3 | `src/features/dictado` |
| TPL-feature-project-settings | Parametrizacion por tipo de proyecto (Supabase) | PRODUCTO | software | beta | 2 | `src/features/project-settings` |
| TPL-voz | Voz: deteccion de voz (VAD) y diarizacion local | PRODUCTO | software | beta | 1 | `tools/voz` |

## Fuentes que se escanean

- `tools/*/`
- `src/features/*/`
- `src/lib/*/`
- `src/app/`
- `src/shared/`
- `src/types/`
- `public/`
- `.claude/skills/*/`
- `.claude/specs/*/`
- `.claude/goals/*/`
- `.claude/PRPs/*.md`
- `.claude/design-systems/*/`
- `.claude/hooks/*`
- `.claude/rules/*.md`
- `.claude/gobernanza/`
- `.claude/imprenta/`
- `.claude/memory/`
- `.claude/*.json`
- `docs/*.md`
- `docs/*/`
- `scripts/*.mjs`
- `scripts/*.ts`
- `scripts/*/`
- `supabase/migrations/*.sql`
- `hermes/*`
- `trayectorias/`
- `inventario/`
- `erp/*/`
- `erp/*.md`
- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
- `Dockerfile`
- `docker-compose.yml`
- `Caddyfile`
- `.hermes-baseline.json`
- `opencode.json`
- `cli-impreso`

Una unidad que ninguna fila cubre pone el gate en rojo: el asiento nace con la pieza.
