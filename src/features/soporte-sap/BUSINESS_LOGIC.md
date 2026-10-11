# BUSINESS_LOGIC.md — Soporte SAP

> **Hipótesis del 2026-10-04, construida y probada en laboratorio, sin consultora real todavía.**
> La firma va al pie y se vuelve a firmar con la primera consultora real. Redactado por el agente a
> partir del brief del laboratorio (copiado en [`docs/goals/soporte-sap.md`](../../../docs/goals/soporte-sap.md)),
> del diseño ([`docs/SDD-soporte-sap.md`](../../../docs/SDD-soporte-sap.md)) y de lo que se midió al
> construirlo. Lo que ninguna fuente dice va marcado **[supuesto]** o **pendiente**. Todo lo medido es
> con datos **sintéticos**: un SAP simulado, un corpus inventado y un LLM simulado.
> Cubre `tools/soporte-sap`, `tools/sala-a2a` y `src/features/soporte-sap` (`/soporte-sap/*`).

---

## 1. Problema de Negocio

**Dolor:** una consultora de soporte o AMS de SAP resuelve una y otra vez las mismas incidencias, y
lo que sabe vive en la cabeza de quien las resolvió. El triage depende de leer capturas, spools y
CFDI a mano. El SLA se discute con hojas de cálculo. Y un agente que «arregla» directamente en el SAP
del cliente es un riesgo que nadie firma.
**Costo actual:** **pendiente, no medido** en una consultora real. Lo único medido es el costo de
operar el producto (§5 y [`docs/SDD-soporte-sap.md`](../../../docs/SDD-soporte-sap.md) §14): la
infraestructura por consultora es pequeña; lo que pesa son las horas de consultor y, cuando haya un
modelo real, los tokens.

## 2. Solución

**Propuesta de valor:** la consultora atiende más incidencias, más rápido y con evidencia, sin
perder el control humano. Cada incidencia llega categorizada con su prioridad ITIL, con lo que se
leyó de sus adjuntos y con la solución conocida y su fuente, o entra al sandbox del laboratorio para
aprenderla. Ninguna solución se aplica sin que una persona la apruebe en la sala.

**Flujo principal (Happy Path):**
1. **Alta:** el cliente (N3) levanta la incidencia con sus adjuntos. La ingesta los valida por bytes y
   los lee con el extractor documental (XML sin motor, PDF por capa 0, imágenes con OCR **local**).
   Cada campo queda por revisar.
2. **Triage:** el agente la categoriza de forma determinista (transacción, mensaje, módulo e impacto
   × urgencia), la etiqueta y abre su cadena de eventos sha256.
3. **Matriz:** el motor del grafo da la solución conocida con su fuente y su grado, o `sin_regla`.
4. **Con solución:** el ejecutor prepara el plan y lo simula; el supervisor, otro agente, emite su
   veredicto; el plan llega a la **sala A2A**. Una persona aprueba, y eso es una fila que ningún
   modelo puede escribir. Se aplica al **simulador**, con el antes y el después en la cadena; llevarlo al
   SAP del cliente lo hace una persona con su propio acceso, fuera del producto (D6). **A
   revisión:** el agente corrige y vuelve a proponer.
5. **Sin solución:** el caso se **anonimiza** (lo que deja forma de dato, y todo caso de RR. HH. o nómina, va a
   cuarentena y no entra) y entra al sandbox; el experto enseña y
   el agente propone la regla y el CLI, que firma el laboratorio.
6. **Medición:** la capa semántica (dbt + MetricFlow) da las métricas del ciclo de vida, el SLA se
   mide desde los eventos, y el tablero del cliente muestra accionables con impacto en MXN y su
   fórmula.

## 3. Usuario Objetivo

**Quién paga:** la **consultora de soporte o AMS de SAP** (N2). **Quién opera arriba:** el
laboratorio (N1): superadministrador, experto (el HIL) y el agente con su Agent Card como Forward
Deployed Engineer de cada consultora. **Quién recibe el servicio:** la empresa atendida (N3), que
levanta incidencias y ve su tablero.

**Cómo se cobra:** **pendiente** (D5, ERP-7: sin plan comercial no hay precios). El modelo de pricing
asigna un tier desde el tipo de empresa del cliente, la mezcla de prioridades, la complejidad y el
tiempo de respuesta contratado; el costo por tier sale del estimado medido; **el precio es un
parámetro por decidir**.

## 4. Arquitectura de Datos

Propuesta de esquema con RLS forzada en las 23 tablas, tenencia en árbol (laboratorio → consultora →
cliente) y tres buckets privados, en [`tools/soporte-sap/migraciones/propuesta-soporte-sap.sql`](../../../tools/soporte-sap/migraciones/propuesta-soporte-sap.sql)
(SDD §12). **Validada en efímero, no aplicada a ninguna base.** El aislamiento se prueba con 63
comprobaciones con el rol real (`tools/soporte-sap/pruebas/aislamiento.ts`).

### Respaldo — qué pierde ESTE producto si arde el servidor

> No hay respaldo implícito. **Lo que no esté en esta tabla ni en la del servidor (§4 del
> [índice de la raíz](../../../BUSINESS_LOGIC.md)), no se respalda.** El inventario completo, la
> regla para decidir criticidad y los gates están en
> **[`docs/FASE0-INFRAESTRUCTURA.md`](../../../docs/FASE0-INFRAESTRUCTURA.md) §9**. Qué aplica en cada
> capa (snapshot, respaldo del proveedor, PITR, físico + WAL, export por tenant), en el SDD §13.

Regla de criticidad, en una pregunta: **¿se puede reconstruir?**
Sin pérdida → no se respalda · Con trabajo → respaldo normal · **No** → respaldo inmutable.

| Activo del producto | ¿Reconstruible? | Criticidad | Destino |
|---|---|---|---|
| Tablas `ss_*` (incidencias, cadena de eventos, contratos, mapeos, crudo) | **No**: la cadena y el crudo son la evidencia del servicio | Crítica | Respaldo del proveedor de la BD (D10; en Supabase Free **no hay ninguno**) **más** export lógico por tenant (`ss-exportes`): lo único que restaura a **una** consultora sin regresar a las demás |
| **Originales del bucket `ss-originales`** (capturas, spools y CFDI de los clientes) | **No**: son la evidencia de cada incidencia | Crítica | **Línea propia**: el respaldo de la BD guarda solo los metadatos de `storage.objects`, no los bytes. Sincronización a un destino append-only o inmutable (proveedor por D12). Retención (D8, contrato §14): N días después de la última resolución; al salir, tras la gracia; en las copias, 12 meses como máximo (bloqueo de 365 días o menos) |
| Bucket `ss-sandbox` (casos anonimizados) | Con trabajo: se re-anonimiza desde la incidencia si sigue vigente | Normal | Junto con la línea de Storage |
| Bucket `ss-exportes` (export por tenant) | Sí: se regenera desde la BD | Baja | No se respalda aparte |
| **Lista de bajas** (`ss_baja`: quién se fue y qué originales se borraron, sin datos personales) | **No**: es lo único que impide que una restauración resucite a quien se fue | Crítica | **Aparte de la base**, a todos los niveles de respaldo; tras restaurar se aplica la más reciente (`listaDeBajas`, `trasRestaurar`). La lleva el job de respaldo del servidor, que todavía no existe (D10, D12, GATE 3) |
| Sala A2A (`sala_*`, aprobaciones) | **No**: la fila de aprobación es la prueba de quién decidió | Crítica | Con la BD y en el export por tenant de la consultora |
| Secreto que firma los tokens de tarea | No: es un secreto | Crítica | En `.env.production`, ya cubierto por la fila del servidor |
| Conocimiento sintético de la matriz | Sí: se genera desde `tools/soporte-sap` | Baja | git |

**RPO / RTO:** **desconocidos hasta GATE 3.** El simulacro de restauración por tenant da tiempos de
laboratorio (SDD §13): no son el RTO de producción.

## 5. KPI de Éxito

**Métrica principal: pendiente.** Sale de la primera consultora real y la decide el laboratorio.
Lo que el producto **ya puede medir** (capa semántica, una definición por métrica): MTTR, primera
respuesta, cumplimiento de SLA, resolución al primer contacto, reuso del conocimiento, backlog, horas
por cliente, costo por ticket y tiempo al primer valor de cada cliente. Ya medido, en laboratorio:
0 fugas del anonimizador sobre 277 casos sintéticos (155 con datos sembrados); los 11 sabotajes de la suite de la
sala cazados; 63 comprobaciones de aislamiento en verde; restauración por tenant S, M y L sin tocar a la vecina.

## 6. Gobernanza (controles C4 y C7)

> La evaluación completa está en la AISIA firmada,
> [`.claude/gobernanza/AISIA-soporte-sap.md`](../../../.claude/gobernanza/AISIA-soporte-sap.md), y el modelo de
> amenazas (C3 v4) en [`.claude/PRPs/PRP-008-soporte-sap.md`](../../../.claude/PRPs/PRP-008-soporte-sap.md).
> Los dos los revisaron, contra el código, tres agentes que no los escribieron (PRP-010), y cada frase tiene su
> fila en la [matriz](../../../docs/goals/soporte-sap-firmas-matriz.md): probada con su sabotaje, brecha declarada o
> pendiente de una decisión.

| Punto | Respuesta |
|---|---|
| **Datos personales que toca** | Los de empleados de los clientes que llegan en tickets y adjuntos (RR. HH., nómina, RFC, CURP, NSS, CLABE, correos), los de las contrapartes de un CFDI, y los de los consultores (sus horas, como seudónimo). |
| **Partes afectadas** | Los clientes (N3) y sus empleados, que no firmaron nada; las contrapartes de sus CFDI; las consultoras (N2) y sus consultores; el laboratorio. |
| **Daño con el sistema operando bien** | Un dato personal que entra al sandbox; un secreto del cliente que llega al núcleo; una prioridad mal asignada (una nómina tratada como P3); una solución equivocada aprobada por fatiga; el conocimiento de una consultora usado para otra (D1); un FODA o una proyección en MXN leídos como promesa; un SLA mal medido (una primera respuesta automática, una pausa o una resolución unilateral, un incumplimiento borrado al bajar la prioridad); el triage cortado por presupuesto o sin su evidencia leída; el texto de un cliente en un proveedor de modelo (D7). **Los daños sobre terceros no son firmables** (límite de C5): se cierran con un control o no se ofrecen. |
| **Acciones irreversibles** | **Ninguna automática.** Aplicar una solución en el SAP de un cliente no lo hace el producto (D6, decidida): no se conecta a ningún SAP ni guarda sus credenciales, y la aplica una persona de la consultora o del cliente, con su propio acceso y bajo el control de cambios del cliente (contrato §13). El producto la aplica al simulador, y eso exige la fila de aprobación humana de la sala. Exponer la sala o el canal N1–N2 es gate humano con C3 y la AISIA firmados. Un motor externo de OCR no entra. |
| **Modelos de IA (D7)** | Hoy ninguno: el triage, el chat y el supervisor son deterministas. Decidida el 2026-10-10: lo crudo (tickets, chat, documentos y adjuntos) solo va a un modelo autohospedado; a un proveedor externo, solo lo anonimizado o generalizado, con su decisión C4 (`tools/soporte-sap/src/politica-modelo.ts`). El contrato lo dice (§11). |
| **Vía de apelación humana** | El cliente **impugna** una prioridad, una categoría, una complejidad, una pausa del reloj o que se dé por resuelta (`ss_impugnacion`), y su consultora la resuelve a su nombre; la queja no se reescribe ni se borra. Un plan va a revisión con su motivo. Un campo leído se confirma o se corrige a nombre de quien lo revisa. La cuarentena es definitiva y nadie la revisa hasta D14 (DP-7), y no frena la atención. La pausa del reloj dice qué se le pide al cliente, y él mismo la reanuda al responder. |
| **Aislamiento de datos** | RLS forzada en toda tabla; ninguna superficie usa `service_role` (C7). El agente, la ingesta y los jobs de plataforma entran con un token de tarea firmado por el orquestador y solo ven la consultora del token. El laboratorio lee solo lo que **la consultora le escala** (también en la app: el plan va primero a ella), y los originales, y lo leído de ellos, con un acceso que otorga la consultora (72 h). |

## 7. Especificación Técnica (Para el Agente)

### Tipo de proyecto

Producto compuesto: dos herramientas en `tools/` (`soporte-sap`, `sala-a2a`) y una feature en
`src/features/soporte-sap`. Reusa `TPL-extractor-documental`, `TPL-grafo-conocimiento`,
`TPL-feature-a2a`, `TPL-motor-ia`, `TPL-trayectorias`, `TPL-app-base`, `TPL-feature-auth` y
`TPL-despliegue` (matriz de reuso en el SDD §2).

### Próximos pasos

- Decisiones abiertas D2 y D4–D15 (spec del goal), con la recomendación de cada una en el informe de la
  corrida A (`docs/goals/soporte-sap-informe-a.md`). Decididas el 2026-10-10: D1, con el consentimiento de la
  consultora y de su cliente (PRP-011); D3, mixto (la consultora opera su N2 y el laboratorio solo el N1, sin
  comprometer disponibilidad antes de GATE 3); D6, fuera del producto (la solución en el SAP del cliente la aplica
  una persona con su propio acceso; el producto no se conecta a ningún SAP); D7, externo solo anonimizado (lo crudo
  solo va a un modelo autohospedado).
- Primera consultora real: medir el anonimizador sobre su corpus con consentimiento (D9), fijar los
  umbrales del extractor, conectar un modelo real tras el CDC del routing (por D7, lo crudo solo a uno
  autohospedado).
- Salir del laboratorio exige lo que lista la AISIA §5: entre otras, D8, D10, D12, D13 y D14, el
  aviso de privacidad, los veredictos desde `tools/conocimiento` (H-20), el tope del lector de PDF (H-22) y GATE 3.

---

**Firma:** lisagomez (responsable del proyecto) · Fecha: 2026-10-10 · firma el contrato con su C3 v4 y su AISIA v3. 
