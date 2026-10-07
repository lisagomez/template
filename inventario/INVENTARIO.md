# Inventario de activos del template

> Generado por `npm run inventario:vista` desde `inventario/activos.json`. No se edita a mano:
> el gate `npm run verifica:inventario` falla si esta vista no coincide con el indice.
> Costo y clasificacion (D+I, defensibilidad) no viven aqui: se calculan con
> `npm run inventario:exporta` y viajan al ERP (spec 014, repo publico).

**51 activos** cubren **252 unidades** del repo.

| ID | Activo | Clase | Tipo | Estado | Unidades | Ubicacion |
| --- | --- | --- | --- | --- | ---: | --- |
| TPL-conocimiento | Conocimiento del grafo: fuente unica de reglas con fuente citada, por dominio y versionada (migrado de Hermes) | CONOCIMIENTO | datos | beta | 1 | `tools/conocimiento` |
| TPL-doctrina | Doctrina de la fabrica: instrucciones del agente, reglas y memoria de proyecto | CONOCIMIENTO | config_agentica | produccion | 17 | `AGENTS.md` |
| TPL-especificaciones | Especificaciones y disenos: specs, PRPs, goals, SDD e investigaciones | CONOCIMIENTO | documento | produccion | 72 | `.claude/specs` |
| TPL-design-systems | Design systems de referencia (bento, glass, neobrutalismo...) | DISEÑO | documento | produccion | 5 | `.claude/design-systems` |
| TPL-analista-producto | Analista de producto: dolores con evidencia citada, verificador, contrato A2A no servido y corridas | FABRICA | software | beta | 2 | `scripts/analista-producto` |
| TPL-clis-impresos | CLIs impresos del manifiesto (externo: lo cataloga su fuente) | FABRICA | software | produccion | 5 | `cli:*` |
| TPL-ejemplo-herramienta | Andamio de herramienta empaquetable (el ejemplo a copiar) | FABRICA | software | produccion | 1 | `tools/ejemplo-herramienta` |
| TPL-empaquetador | Empaquetador de herramientas y su contrato | FABRICA | software | produccion | 3 | `scripts/empaqueta-herramienta.mjs` |
| TPL-feature-laboratorio-etiquetas | Laboratorio de la herramienta de etiquetas GS1: casos, estado real, veredictos y referencias visuales; decide que usa /etiquetas | FABRICA | software | beta | 2 | `src/features/laboratorio-etiquetas` |
| TPL-feature-laboratorio-pymes | Laboratorio de las herramientas pymes: casos, estado real y veredictos | FABRICA | software | beta | 2 | `src/features/laboratorio-pymes` |
| TPL-feature-laboratorio-voz | Laboratorio de voz: capturas y mediciones del motor | FABRICA | software | beta | 2 | `src/features/laboratorio-voz` |
| TPL-gobernanza | Capa de gobernanza (controles C1-C8) y gates de validate | FABRICA | software | produccion | 17 | `.claude/gobernanza` |
| TPL-imprenta | Imprenta de CLIs: manifiesto servicio a CLI y su auditoria | FABRICA | software | produccion | 4 | `.claude/imprenta` |
| TPL-inventario | Inventario de activos: indice, detector, costeo y export al ERP | FABRICA | software | beta | 3 | `inventario` |
| TPL-manifiesto-gates | Manifiesto de gates: el padron de lo que el gate corre | FABRICA | software | produccion | 6 | `.claude/gates.json` |
| TPL-motor-ia | Motor de IA: routing por nivel, contabilidad de tokens y trayectorias de la app | FABRICA | software | produccion | 4 | `src/lib/ai` |
| TPL-productos | El concepto de producto, su plantilla y sus manifiestos (productos/), con el gate que los cruza con el indice del portafolio y el inventario (verifica:productos) | FABRICA | software | blueprint | 2 | `productos` |
| TPL-skills | Catalogo de skills de la fabrica | FABRICA | config_agentica | produccion | 31 | `.claude/skills` |
| TPL-trayectorias | Trayectorias: trazas de ejecucion, evaluador, informe y propuestas | FABRICA | software | produccion | 4 | `scripts/trayectorias` |
| TPL-despliegue | Blueprint de despliegue self-hosted (Docker, Caddy, Hetzner, Hermes) | INFRA | infraestructura | produccion | 10 | `docker-compose.yml` |
| TPL-app-base | App SaaS base (Next.js + Supabase, PWA) | PRODUCTO | software | produccion | 6 | `src/app` |
| TPL-asesor-ventas | Asesor de ventas: insights con evidencia desde una reunion diarizada | PRODUCTO | software | blueprint | 1 | `tools/asesor-ventas` |
| TPL-cli-ss-cadena | CLI ss-cadena de Soporte SAP: verifica la cadena sha256 de eventos de una incidencia (solo lectura) | PRODUCTO | software | blueprint | 1 | `tools/soporte-sap/clis/ss-cadena.mjs` |
| TPL-cli-ss-ingesta | CLI ss-ingesta de Soporte SAP: lee un documento por su vía y muestra sus campos con evidencia (solo lectura) | PRODUCTO | software | blueprint | 1 | `tools/soporte-sap/clis/ss-ingesta.mjs` |
| TPL-cli-ss-mapea | CLI ss-mapea de Soporte SAP: propone el mapeo de un exporte de tickets y muestra la cuenta (solo lectura) | PRODUCTO | software | blueprint | 1 | `tools/soporte-sap/clis/ss-mapea.mjs` |
| TPL-cli-ss-respaldo | CLI ss-respaldo de Soporte SAP: simulacro de restauración por tenant en efímero, cronometrado S/M/L (solo lectura) | PRODUCTO | software | blueprint | 1 | `tools/soporte-sap/clis/ss-respaldo.mjs` |
| TPL-cli-ss-reuso | CLI ss-reuso de Soporte SAP: cuenta el reuso desde la matriz dominio × capa del SDD; --escribe reescribe el bloque del SDD (cambia estado, dry-run por defecto) | PRODUCTO | software | blueprint | 1 | `tools/soporte-sap/clis/ss-reuso.mjs` |
| TPL-cli-ss-simulador | CLI ss-simulador de Soporte SAP: estado, simulación y ejecución contra el SAP simulado; ejecutar exige la aprobación de la sala (cambia estado, dry-run por defecto) | PRODUCTO | software | blueprint | 1 | `tools/soporte-sap/clis/ss-simulador.mjs` |
| TPL-cli-ss-triage | CLI ss-triage de Soporte SAP: categoriza una incidencia y consulta la matriz sobre el grafo (solo lectura) | PRODUCTO | software | blueprint | 1 | `tools/soporte-sap/clis/ss-triage.mjs` |
| TPL-dictado | Dictado local: hablar y que el texto aparezca donde esta el cursor | PRODUCTO | software | beta | 2 | `tools/dictado` |
| TPL-erp | ERP agentico: maestro, reglas, migraciones y modulo act (externo: lo cataloga su fuente) | PRODUCTO | software | beta | 10 | `erp` |
| TPL-etiquetas-gs1 | Etiquetas GS1-128 y expediente de lote: caducidades, cadena de hashes, anclaje, agente de riesgo, inventario fisico, recepcion con foto, escaneo por zona y codigos anteriores (0.2.0) | PRODUCTO | software | beta | 1 | `tools/etiquetas-gs1` |
| TPL-extractor-documental | Extractor documental (PDF, imagen, CFDI XML) con revision humana | PRODUCTO | software | beta | 2 | `tools/extractor-documental` |
| TPL-feature-a2a | Puente A2A del extractor (Agent Card + JSON-RPC + Tasks) | PRODUCTO | software | beta | 2 | `src/features/a2a` |
| TPL-feature-auth | Autenticacion Supabase (login, registro, perfiles) | PRODUCTO | software | produccion | 1 | `src/features/auth` |
| TPL-feature-dashboard | Dashboard de la app base | PRODUCTO | software | beta | 1 | `src/features/dashboard` |
| TPL-feature-dictado | Interfaz web del dictado (pildora, ajustes e historial) | PRODUCTO | software | beta | 3 | `src/features/dictado` |
| TPL-feature-estudio-pymes | Estudio de marketing para el cliente pyme (usa solo lo que el laboratorio aprobo) | PRODUCTO | software | blueprint | 2 | `src/features/estudio-pymes` |
| TPL-feature-etiquetas | Interfaz web de etiquetas y expediente (/etiquetas: etiqueta, leer, recibir, escanear, dia, mover, caducidades, conteo, expediente, riesgo, integridad); usa solo lo que aprueba su laboratorio | PRODUCTO | software | beta | 1 | `src/features/etiquetas` |
| TPL-feature-project-settings | Parametrizacion por tipo de proyecto (Supabase) | PRODUCTO | software | beta | 2 | `src/features/project-settings` |
| TPL-feature-reel | App del reel: cuentas, subida del clip y sala de aprobacion en el celular | PRODUCTO | software | blueprint | 6 | `src/features/reel` |
| TPL-feature-soporte-sap | App de Soporte SAP (/soporte-sap: laboratorio, experto, sala y chat del HIL, workspace del consultor y tablero del cliente) y su contrato de negocio | PRODUCTO | software | blueprint | 1 | `src/features/soporte-sap` |
| TPL-feature-ventas-whatsapp | Panel del dueno (/ventas-whatsapp: bandeja con traspaso y tablero de ROAS), laboratorio del agente (/laboratorio-ventas-whatsapp) y rutas /api/ventas-whatsapp (webhook, flows, pagos, panel, a2a) | PRODUCTO | software | blueprint | 1 | `src/features/ventas-whatsapp` |
| TPL-grafo-conocimiento | Grafo de conocimiento: motor de reglas con veredicto acotado y fail-safe tipado, en paridad con el de Hermes | PRODUCTO | software | beta | 1 | `tools/grafo-conocimiento` |
| TPL-piloto-buzon-cfdi | Piloto del buzón de CFDI en la máquina del despacho: perímetro sin salida, Supabase autohospedado y su gate | PRODUCTO | software | blueprint | 2 | `scripts/buzon` |
| TPL-pymes-marketing | Herramientas de marketing para pymes: marca y voz, ventas, contenido, resenas, visibilidad y pulso | PRODUCTO | software | blueprint | 1 | `tools/pymes-marketing` |
| TPL-reel | Reel del celular para pymes: cortes, subtitulos, privacidad (caras, pantalla, voces), master determinista y sala | PRODUCTO | software | blueprint | 2 | `tools/reel` |
| TPL-sala-a2a | Sala A2A: canales, hilos de un nivel y aprobaciones como fila que ningun componente que ejecuta un modelo puede fabricar; esquema propuesto con su suite de sabotajes S1-S7 (0.1.0) | PRODUCTO | software | blueprint | 1 | `tools/sala-a2a` |
| TPL-soporte-sap | Soporte SAP en laboratorio: dominio de tres niveles (laboratorio, consultora, cliente), matriz problema-solucion sobre el grafo, simulador SAP y de tickets, anonimizador, cadena de eventos, mapeo y limpieza, SLA, pricing, impactos en MXN, respaldo por tenant y el agente FDE (0.1.0) | PRODUCTO | software | blueprint | 1 | `tools/soporte-sap` |
| TPL-ventas-whatsapp | Vendedor con IA en WhatsApp para pymes, fases 0-3 en laboratorio: canal Cloud API, agente acotado con barreras y traspaso, comercio con Flows cifrados y liga de pago, atribucion con Conversions API y ROAS, A2A multi-inquilino, venta y renta de numeros (N-01), BSP propio con Embedded Signup y cobro (N-02), y el simulador de Meta (0.1.0) | PRODUCTO | software | blueprint | 1 | `tools/ventas-whatsapp` |
| TPL-voz | Voz: deteccion de voz (VAD) y diarizacion local | PRODUCTO | software | beta | 1 | `tools/voz` |

## Por producto

El dueño de cada pieza (`producto`), con su estado y, si es un CLI, su grado. Lo que un producto compone sin ser su dueño está en su manifiesto (`productos/`).

| Producto | ID | Activo | Estado | Grado |
| --- | --- | --- | --- | --- |
| soporte-sap | TPL-cli-ss-cadena | CLI ss-cadena de Soporte SAP: verifica la cadena sha256 de eventos de una incidencia (solo lectura) | blueprint | no medido |
| soporte-sap | TPL-cli-ss-ingesta | CLI ss-ingesta de Soporte SAP: lee un documento por su vía y muestra sus campos con evidencia (solo lectura) | blueprint | no medido |
| soporte-sap | TPL-cli-ss-mapea | CLI ss-mapea de Soporte SAP: propone el mapeo de un exporte de tickets y muestra la cuenta (solo lectura) | blueprint | no medido |
| soporte-sap | TPL-cli-ss-respaldo | CLI ss-respaldo de Soporte SAP: simulacro de restauración por tenant en efímero, cronometrado S/M/L (solo lectura) | blueprint | no medido |
| soporte-sap | TPL-cli-ss-reuso | CLI ss-reuso de Soporte SAP: cuenta el reuso desde la matriz dominio × capa del SDD; --escribe reescribe el bloque del SDD (cambia estado, dry-run por defecto) | blueprint | no medido |
| soporte-sap | TPL-cli-ss-simulador | CLI ss-simulador de Soporte SAP: estado, simulación y ejecución contra el SAP simulado; ejecutar exige la aprobación de la sala (cambia estado, dry-run por defecto) | blueprint | no medido |
| soporte-sap | TPL-cli-ss-triage | CLI ss-triage de Soporte SAP: categoriza una incidencia y consulta la matriz sobre el grafo (solo lectura) | blueprint | no medido |
| soporte-sap | TPL-feature-soporte-sap | App de Soporte SAP (/soporte-sap: laboratorio, experto, sala y chat del HIL, workspace del consultor y tablero del cliente) y su contrato de negocio | blueprint | — |
| soporte-sap | TPL-sala-a2a | Sala A2A: canales, hilos de un nivel y aprobaciones como fila que ningun componente que ejecuta un modelo puede fabricar; esquema propuesto con su suite de sabotajes S1-S7 (0.1.0) | blueprint | — |
| soporte-sap | TPL-soporte-sap | Soporte SAP en laboratorio: dominio de tres niveles (laboratorio, consultora, cliente), matriz problema-solucion sobre el grafo, simulador SAP y de tickets, anonimizador, cadena de eventos, mapeo y limpieza, SLA, pricing, impactos en MXN, respaldo por tenant y el agente FDE (0.1.0) | blueprint | — |
| ventas-whatsapp | TPL-feature-ventas-whatsapp | Panel del dueno (/ventas-whatsapp: bandeja con traspaso y tablero de ROAS), laboratorio del agente (/laboratorio-ventas-whatsapp) y rutas /api/ventas-whatsapp (webhook, flows, pagos, panel, a2a) | blueprint | — |
| ventas-whatsapp | TPL-ventas-whatsapp | Vendedor con IA en WhatsApp para pymes, fases 0-3 en laboratorio: canal Cloud API, agente acotado con barreras y traspaso, comercio con Flows cifrados y liga de pago, atribucion con Conversions API y ROAS, A2A multi-inquilino, venta y renta de numeros (N-01), BSP propio con Embedded Signup y cobro (N-02), y el simulador de Meta (0.1.0) | blueprint | — |

## Fuentes que se escanean

- `tools/*/`
- `tools/*/clis/*.mjs`
- `productos/`
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
