<!-- ALTO: ARTEFACTO AUTOGENERADO desde inventario/activos.json. No lo edites a mano: npm run inventario:vista -->
# Inventario de activos del template

> Generado por `npm run inventario:vista` desde `inventario/activos.json`. No se edita a mano:
> el gate `npm run verifica:inventario` falla si esta vista no coincide con el indice.
> Costo y clasificacion (D+I, defensibilidad) no viven aqui: se calculan con
> `npm run inventario:exporta` y viajan al ERP (spec 014, repo publico).

**75 activos** cubren **310 unidades** del repo.

| ID | Activo | Clase | Tipo | Estado | Unidades | Ubicacion |
| --- | --- | --- | --- | --- | ---: | --- |
| TPL-conocimiento | Conocimiento del grafo: fuente unica de reglas con fuente citada, por dominio y versionada (migrado de Hermes) | CONOCIMIENTO | datos | beta | 1 | `tools/conocimiento` |
| TPL-doctrina | Doctrina de la fabrica: instrucciones del agente, reglas y memoria de proyecto | CONOCIMIENTO | config_agentica | produccion | 17 | `AGENTS.md` |
| TPL-especificaciones | Especificaciones y disenos: specs, PRPs, goals, SDD e investigaciones | CONOCIMIENTO | documento | produccion | 78 | `.claude/specs` |
| TPL-design-systems | Design systems de referencia (bento, glass, neobrutalismo...) | DISEÑO | documento | produccion | 5 | `.claude/design-systems` |
| TPL-analista-producto | Analista de producto: dolores con evidencia citada, verificador, contrato A2A no servido y corridas | FABRICA | software | beta | 2 | `scripts/analista-producto` |
| TPL-clis-impresos | CLIs impresos del manifiesto (externo: lo cataloga su fuente) | FABRICA | software | produccion | 5 | `cli:*` |
| TPL-ejemplo-herramienta | Andamio de herramienta empaquetable (el ejemplo a copiar) | FABRICA | software | produccion | 1 | `tools/ejemplo-herramienta` |
| TPL-empaquetador | Empaquetador de herramientas y su contrato | FABRICA | software | produccion | 3 | `scripts/empaqueta-herramienta.mjs` |
| TPL-feature-laboratorio-calendario | Laboratorio de la herramienta de calendario: el paquete contra su simulador de Google (alcances, reservas, actividad, credencial caducada) y su recorrido | FABRICA | software | beta | 2 | `src/features/laboratorio-calendario` |
| TPL-feature-laboratorio-etiquetas | Laboratorio de la herramienta de etiquetas GS1: casos, estado real, veredictos y referencias visuales; decide que usa /etiquetas | FABRICA | software | beta | 2 | `src/features/laboratorio-etiquetas` |
| TPL-feature-laboratorio-pymes | Laboratorio de las herramientas pymes: casos, estado real y veredictos | FABRICA | software | beta | 2 | `src/features/laboratorio-pymes` |
| TPL-feature-laboratorio-sgi | Laboratorio del sistema integrado: casos deterministas, corridas reales de agentes y las 10 trampas | FABRICA | software | beta | 1 | `src/features/laboratorio-sgi` |
| TPL-feature-laboratorio-voz | Laboratorio de voz: capturas y mediciones del motor | FABRICA | software | beta | 2 | `src/features/laboratorio-voz` |
| TPL-gobernanza | Capa de gobernanza (controles C1-C8) y gates de validate | FABRICA | software | produccion | 17 | `.claude/gobernanza` |
| TPL-imprenta | Imprenta de CLIs: manifiesto servicio a CLI y su auditoria | FABRICA | software | produccion | 4 | `.claude/imprenta` |
| TPL-inventario | Inventario de activos: indice, detector, costeo y export al ERP | FABRICA | software | beta | 3 | `inventario` |
| TPL-manifiesto-gates | Manifiesto de gates: el padron de lo que el gate corre | FABRICA | software | produccion | 7 | `.claude/gates.json` |
| TPL-motor-ia | Motor de IA: routing por nivel, contabilidad de tokens y trayectorias de la app | FABRICA | software | produccion | 4 | `src/lib/ai` |
| TPL-productos | El concepto de producto, su plantilla y sus manifiestos (productos/), con el gate que los cruza con el indice del portafolio y el inventario (verifica:productos) | FABRICA | software | blueprint | 2 | `productos` |
| TPL-skills | Catalogo de skills de la fabrica | FABRICA | config_agentica | produccion | 31 | `.claude/skills` |
| TPL-trayectorias | Trayectorias: trazas de ejecucion, evaluador, informe y propuestas | FABRICA | software | produccion | 4 | `scripts/trayectorias` |
| TPL-cerebro-personal | Arbrain personal en dos lugares (demostracion en contenedores): Arbrain v0.2.10 de la etiqueta firmada, job que sincroniza solo el cerebro con union por registro y alto ante choque, red privada simulada, puerta de Cloudflare con Access validada sin conexion | INFRA | infraestructura | blueprint | 2 | `infra/cerebro-personal` |
| TPL-despliegue | Blueprint de despliegue self-hosted (Docker, Caddy, Hetzner, Hermes) | INFRA | infraestructura | produccion | 12 | `docker-compose.yml` |
| TPL-agora | Ágora: núcleo del espacio de trabajo (equipo, agentes internos y socios) con buzón, tablero, libro de costos por compromisos, aprobación de Finanzas, póliza propuesta para Contabilidad (contrato ERP-5B) y Puerta A2A cerrada; Postgres con RLS forzada, suites y sabotajes en PGlite y en Postgres real (0.1.0) | PRODUCTO | software | blueprint | 2 | `tools/agora` |
| TPL-app-base | App SaaS base (Next.js + Supabase, PWA) | PRODUCTO | software | produccion | 6 | `src/app` |
| TPL-asesor-ventas | Asesor de ventas: insights con evidencia desde una reunion diarizada | PRODUCTO | software | blueprint | 1 | `tools/asesor-ventas` |
| TPL-bucle-voz | Bucle de voz: turnos con identificador y cancelacion, interrupcion con puerta de eco, separador de frases, enrutador sin LLM, palabra de activacion por texto local, corte por sentido, telemetria desde el fin real del habla, cerebro en flujo y reproductor del navegador (0.1.0) | PRODUCTO | software | beta | 1 | `tools/bucle-voz` |
| TPL-calendario | Calendario: motor de agenda (un espejo, una pluma), recurrencias RFC 5545, disponibilidad y reserva sin doble reserva, actividad programada, UI React y CLI (0.1.0) | PRODUCTO | software | beta | 1 | `tools/calendario` |
| TPL-capa | Capa comun: una ventana (conversacion, lienzo, explorador y panel), operacion por intencion sin LLM, memoria del producto por inquilino, plan, voz con motores locales, el freno (cita textual y clic) y primer arranque; ranuras donde se enchufa cada modulo, con su verificador y la procedencia de lo adoptado de Arbrain (0.1.0) | PRODUCTO | software | beta | 2 | `tools/capa` |
| TPL-cli-ss-cadena | CLI ss-cadena de Soporte SAP: verifica la cadena sha256 de eventos de una incidencia (solo lectura) | PRODUCTO | software | blueprint | 1 | `tools/soporte-sap/clis/ss-cadena.mjs` |
| TPL-cli-ss-ingesta | CLI ss-ingesta de Soporte SAP: lee un documento por su vía y muestra sus campos con evidencia (solo lectura) | PRODUCTO | software | blueprint | 1 | `tools/soporte-sap/clis/ss-ingesta.mjs` |
| TPL-cli-ss-mapea | CLI ss-mapea de Soporte SAP: propone el mapeo de un exporte de tickets y muestra la cuenta (solo lectura) | PRODUCTO | software | blueprint | 1 | `tools/soporte-sap/clis/ss-mapea.mjs` |
| TPL-cli-ss-respaldo | CLI ss-respaldo de Soporte SAP: simulacro de restauración por tenant en efímero, cronometrado S/M/L (solo lectura) | PRODUCTO | software | blueprint | 1 | `tools/soporte-sap/clis/ss-respaldo.mjs` |
| TPL-cli-ss-reuso | CLI ss-reuso de Soporte SAP: cuenta el reuso desde la matriz dominio × capa del SDD; --escribe reescribe el bloque del SDD (cambia estado, dry-run por defecto) | PRODUCTO | software | blueprint | 1 | `tools/soporte-sap/clis/ss-reuso.mjs` |
| TPL-cli-ss-simulador | CLI ss-simulador de Soporte SAP: estado, simulación y ejecución contra el SAP simulado; ejecutar exige la aprobación de la sala (cambia estado, dry-run por defecto) | PRODUCTO | software | blueprint | 1 | `tools/soporte-sap/clis/ss-simulador.mjs` |
| TPL-cli-ss-triage | CLI ss-triage de Soporte SAP: categoriza una incidencia y consulta la matriz sobre el grafo (solo lectura) | PRODUCTO | software | blueprint | 1 | `tools/soporte-sap/clis/ss-triage.mjs` |
| TPL-clinica-dental | Clínica dental: núcleo del portal del paciente (cuestionario y consentimientos, agenda sin doble reserva sobre Reservas, avisos por correo y Telegram con simuladores y adaptadores reales con gate, asistente con urgencias por regla y guía de voz, contrato de eventos, libro sha256 con Merkle y sello, dataLayer con consent mode, capa semántica dbt + MetricFlow, unit economics y grafo de atención) (0.1.0) | PRODUCTO | software | beta | 1 | `tools/clinica-dental` |
| TPL-crecimiento-demostrado | Analitica de growth revenue con prueba para pymes: Gamma sellado con 12 invariantes, motor determinista (puente y clientes x frecuencia x ticket), kernel de derivaciones sin LLM (11 reglas, 2 teoremas demostrados en Lean), narracion con numeros verificados, agentes inyectables y pasarela A2A; laboratorio con dos pymes sinteticas y la verdad plantada (0.1.0) | PRODUCTO | software | blueprint | 1 | `tools/crecimiento-demostrado` |
| TPL-dictado | Dictado local: hablar y que el texto aparezca donde esta el cursor | PRODUCTO | software | beta | 2 | `tools/dictado` |
| TPL-erp | ERP agentico: maestro, reglas, migraciones y modulo act (externo: lo cataloga su fuente) | PRODUCTO | software | beta | 10 | `erp` |
| TPL-estudio-dashboards | Estudio de dashboards: un agente regenera tableros desde una frase editando una especificacion validada (esquema, parches con alcance, versiones) y toda cifra sale de una capa semantica MetricFlow con procedencia; motor de senales (detectar, diagnosticar, actuar, aprender), analisis de variacion, alertas y metricas propuestas sin enviar nada, y CLI con las mismas herramientas en seco; laboratorio Golfo Norte (datos ficticios, dbt + DuckDB) (0.1.0) | PRODUCTO | software | blueprint | 1 | `tools/estudio-dashboards` |
| TPL-etiquetas-gs1 | Etiquetas GS1-128 y expediente de lote: caducidades, cadena de hashes, anclaje, agente de riesgo, inventario fisico, recepcion con foto, escaneo por zona y codigos anteriores (0.2.0) | PRODUCTO | software | beta | 1 | `tools/etiquetas-gs1` |
| TPL-extractor-documental | Extractor documental (PDF, imagen, CFDI XML) con revision humana | PRODUCTO | software | beta | 2 | `tools/extractor-documental` |
| TPL-feature-a2a | Puente A2A del extractor (Agent Card + JSON-RPC + Tasks) | PRODUCTO | software | beta | 2 | `src/features/a2a` |
| TPL-feature-agora | Ágora en la capa: la ventana del producto (jerarquía en el explorador, «Espera tu clic» en el panel, «Ver como» del laboratorio), el inicio y el alta de la organización | PRODUCTO | software | blueprint | 1 | `src/features/agora` |
| TPL-feature-agora-agentes | Ágora: agentes (idCard, topes, suspender y revocar) y la Puerta A2A cerrada contra un socio simulado | PRODUCTO | software | blueprint | 1 | `src/features/agora-agentes` |
| TPL-feature-agora-buzon | Ágora: el buzón (canal interno único por categoría, hilos de un nivel, propuestas con su huella y aprobación por rol) y la ranura de conversación | PRODUCTO | software | blueprint | 1 | `src/features/agora-buzon` |
| TPL-feature-agora-contabilidad | Ágora: cierre de costos del periodo por el freno y póliza propuesta para Contabilidad | PRODUCTO | software | blueprint | 1 | `src/features/agora-contabilidad` |
| TPL-feature-agora-costos | Ágora: costos por centro (presupuesto, comprometido, ejercido y disponible; gasto de los agentes en MXN con tipo de cambio con fuente) | PRODUCTO | software | blueprint | 1 | `src/features/agora-costos` |
| TPL-feature-agora-metricas | Ágora: métricas desde la capa semántica y tablero regenerable, cada cifra cuadrada con el libro | PRODUCTO | software | blueprint | 1 | `src/features/agora-metricas` |
| TPL-feature-agora-tablero | Ágora: el tablero (tabla, kanban y Gantt con editores por tipo de campo; los agentes solo proponen) | PRODUCTO | software | blueprint | 1 | `src/features/agora-tablero` |
| TPL-feature-auth | Autenticacion Supabase (login, registro, perfiles) | PRODUCTO | software | produccion | 1 | `src/features/auth` |
| TPL-feature-centro-de-mando | Centro de mando por voz local (/centro-de-mando): HUD con orbe, onda, subtitulos karaoke, telemetria por etapa y conversacion; rutas /api/centro-de-mando (transcribir, cerebro, lee, estado) y la medicion de punta a punta con microfono falso | PRODUCTO | software | beta | 2 | `src/features/centro-de-mando` |
| TPL-feature-clinica-dental | Portal del paciente para clínicas dentales (/clinica/[clinica]): entrar, registro con cuestionario y guía de voz, agenda con selector de avisos, mis citas con el estado de cada aviso, chatbot por texto y voz; rutas /api/clinica-dental; laboratorio (buzón, Telegram, tablero, grafo) y los recorridos y mediciones de scripts/clinica-dental | PRODUCTO | software | beta | 2 | `src/features/clinica-dental` |
| TPL-feature-crecimiento-demostrado | Pantalla del dueno (/crecimiento: respuesta con estado, cascada del puente, arbol de la prueba, certificado y replay), laboratorio de trampas (/laboratorio-crecimiento) y agente A2A local (/api/crecimiento/a2a) | PRODUCTO | software | blueprint | 1 | `src/features/crecimiento-demostrado` |
| TPL-feature-dashboard | Dashboard de la app base | PRODUCTO | software | beta | 1 | `src/features/dashboard` |
| TPL-feature-dictado | Interfaz web del dictado (pildora, ajustes e historial) | PRODUCTO | software | beta | 3 | `src/features/dictado` |
| TPL-feature-estudio-dashboards | Lienzo de laboratorio del Estudio (/laboratorio-estudio-dashboards): barra de instrucciones con lo que entendio antes de aplicar, rejilla de componentes con procedencia a un clic, mapa de matriz de puntos con lazo y senales enlazadas, ciclo detectar-aprender, versiones y comparacion; ruta /api/estudio-dashboards (503 fuera del laboratorio) y el recorrido Playwright de scripts/estudio-dashboards | PRODUCTO | software | blueprint | 2 | `src/features/estudio-dashboards` |
| TPL-feature-estudio-pymes | Estudio de marketing para el cliente pyme (usa solo lo que el laboratorio aprobo) | PRODUCTO | software | blueprint | 2 | `src/features/estudio-pymes` |
| TPL-feature-etiquetas | Interfaz web de etiquetas y expediente (/etiquetas: etiqueta, leer, recibir, escanear, dia, mover, caducidades, conteo, expediente, riesgo, integridad); usa solo lo que aprueba su laboratorio | PRODUCTO | software | beta | 1 | `src/features/etiquetas` |
| TPL-feature-project-settings | Parametrizacion por tipo de proyecto (Supabase) | PRODUCTO | software | beta | 2 | `src/features/project-settings` |
| TPL-feature-recepcion | Recepcion: el mostrador de un negocio de servicios ficticio (/recepcion) compuesto en la capa con tools/calendario (agenda, reservas sin doble reserva y cancelar por el freno), sus datos sinteticos, sus intenciones (servicios, horario, horas libres) y la lectura de solo conteos (/api/recepcion/resumen) | PRODUCTO | software | blueprint | 2 | `src/features/recepcion` |
| TPL-feature-reel | App del reel: cuentas, subida del clip y sala de aprobacion en el celular | PRODUCTO | software | blueprint | 6 | `src/features/reel` |
| TPL-feature-sgi | App del sistema integrado ISO: roadmap con puertas, documentos con huella, evidencias, riesgos, SoA, auditoria y CAPA, panel del consultor con marca blanca | PRODUCTO | software | blueprint | 8 | `src/features/sgi` |
| TPL-feature-soporte-sap | App de Soporte SAP (/soporte-sap: laboratorio, experto, sala y chat del HIL, workspace del consultor y tablero del cliente), su contrato de negocio, su vitrina en Vercel (/vitrina/soporte-sap: los tres niveles, journey, deck, manual y la sección en vivo firmada) y la mesa del experto alojada en Cloudflare (/mesa/soporte-sap: casos propios, línea de tiempo, retro durable) | PRODUCTO | software | blueprint | 5 | `src/features/soporte-sap` |
| TPL-feature-ventas-whatsapp | Panel del dueno (/ventas-whatsapp: bandeja con traspaso y tablero de ROAS), laboratorio del agente (/laboratorio-ventas-whatsapp) y rutas /api/ventas-whatsapp (webhook, flows, pagos, panel, a2a) | PRODUCTO | software | blueprint | 1 | `src/features/ventas-whatsapp` |
| TPL-grafo-conocimiento | Grafo de conocimiento: motor de reglas con veredicto acotado y fail-safe tipado, en paridad con el de Hermes | PRODUCTO | software | beta | 1 | `tools/grafo-conocimiento` |
| TPL-piloto-buzon-cfdi | Piloto del buzón de CFDI en la máquina del despacho: perímetro sin salida, Supabase autohospedado y su gate | PRODUCTO | software | blueprint | 8 | `scripts/buzon` |
| TPL-pymes-marketing | Herramientas de marketing para pymes: marca y voz, ventas, contenido, resenas, visibilidad y pulso | PRODUCTO | software | blueprint | 1 | `tools/pymes-marketing` |
| TPL-reel | Reel del celular para pymes: cortes, subtitulos, privacidad (caras, pantalla, voces), master determinista y sala | PRODUCTO | software | blueprint | 2 | `tools/reel` |
| TPL-sala-a2a | Sala A2A: canales, hilos de un nivel y aprobaciones como fila que ningun componente que ejecuta un modelo puede fabricar; esquema propuesto con su suite de sabotajes S1-S7 (0.1.0) | PRODUCTO | software | blueprint | 1 | `tools/sala-a2a` |
| TPL-sistema-integrado | Sistema integrado ISO 9001 + ISO/IEC 42001: catalogo propio versionado, motor de avance y puertas, agentes que proponen y documentos | PRODUCTO | software | blueprint | 1 | `tools/sistema-integrado` |
| TPL-soporte-sap | Soporte SAP en laboratorio: dominio de tres niveles (laboratorio, consultora, cliente), matriz problema-solucion sobre el grafo, simulador SAP y de tickets, anonimizador, cadena de eventos, mapeo y limpieza, SLA, pricing, impactos en MXN, respaldo por tenant y el agente FDE (0.1.0) | PRODUCTO | software | blueprint | 1 | `tools/soporte-sap` |
| TPL-ventas-whatsapp | Vendedor con IA en WhatsApp para pymes, fases 0-3 en laboratorio: canal Cloud API, agente acotado con barreras y traspaso, comercio con Flows cifrados y liga de pago, atribucion con Conversions API y ROAS, A2A multi-inquilino, venta y renta de numeros (N-01), BSP propio con Embedded Signup y cobro (N-02), y el simulador de Meta (0.1.0) | PRODUCTO | software | blueprint | 1 | `tools/ventas-whatsapp` |
| TPL-voz | Voz: deteccion de voz (VAD) y diarizacion local | PRODUCTO | software | beta | 1 | `tools/voz` |

## Por producto

El dueño de cada pieza (`producto`), con su estado y, si es un CLI, su grado. Lo que un producto compone sin ser su dueño está en su manifiesto (`productos/`).

| Producto | ID | Activo | Estado | Grado |
| --- | --- | --- | --- | --- |
| recepcion | TPL-feature-recepcion | Recepcion: el mostrador de un negocio de servicios ficticio (/recepcion) compuesto en la capa con tools/calendario (agenda, reservas sin doble reserva y cancelar por el freno), sus datos sinteticos, sus intenciones (servicios, horario, horas libres) y la lectura de solo conteos (/api/recepcion/resumen) | blueprint | — |
| soporte-sap | TPL-cli-ss-cadena | CLI ss-cadena de Soporte SAP: verifica la cadena sha256 de eventos de una incidencia (solo lectura) | blueprint | no medido |
| soporte-sap | TPL-cli-ss-ingesta | CLI ss-ingesta de Soporte SAP: lee un documento por su vía y muestra sus campos con evidencia (solo lectura) | blueprint | no medido |
| soporte-sap | TPL-cli-ss-mapea | CLI ss-mapea de Soporte SAP: propone el mapeo de un exporte de tickets y muestra la cuenta (solo lectura) | blueprint | no medido |
| soporte-sap | TPL-cli-ss-respaldo | CLI ss-respaldo de Soporte SAP: simulacro de restauración por tenant en efímero, cronometrado S/M/L (solo lectura) | blueprint | no medido |
| soporte-sap | TPL-cli-ss-reuso | CLI ss-reuso de Soporte SAP: cuenta el reuso desde la matriz dominio × capa del SDD; --escribe reescribe el bloque del SDD (cambia estado, dry-run por defecto) | blueprint | no medido |
| soporte-sap | TPL-cli-ss-simulador | CLI ss-simulador de Soporte SAP: estado, simulación y ejecución contra el SAP simulado; ejecutar exige la aprobación de la sala (cambia estado, dry-run por defecto) | blueprint | no medido |
| soporte-sap | TPL-cli-ss-triage | CLI ss-triage de Soporte SAP: categoriza una incidencia y consulta la matriz sobre el grafo (solo lectura) | blueprint | no medido |
| soporte-sap | TPL-feature-soporte-sap | App de Soporte SAP (/soporte-sap: laboratorio, experto, sala y chat del HIL, workspace del consultor y tablero del cliente), su contrato de negocio, su vitrina en Vercel (/vitrina/soporte-sap: los tres niveles, journey, deck, manual y la sección en vivo firmada) y la mesa del experto alojada en Cloudflare (/mesa/soporte-sap: casos propios, línea de tiempo, retro durable) | blueprint | — |
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
- `infra/*/`
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
