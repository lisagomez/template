# PRP-008: Soporte SAP (corrida A: el producto en laboratorio)

> **Estado**: EN EJECUCIÓN por `/goal` (corrida A, 2026-10-04, rama `soporte/sap`).
> **Spec del goal**: [`docs/goals/soporte-sap.md`](../../docs/goals/soporte-sap.md) · **Diseño**: [`docs/SDD-soporte-sap.md`](../../docs/SDD-soporte-sap.md)
> · **Grafo**: [`docs/grafos/soporte-sap.json`](../../docs/grafos/soporte-sap.json)
> **CDC aplicable**: SÍ para lo que toque el inventario (campo de producto y fuente de CLIs) y
> cualquier gate nuevo; va como propuesta fuera de la bitácora, con la firma del laboratorio
> pendiente. Ningún skill, prompt, modelo ni `routing-modelos.json` cambia en este PRP.
> **Aprobación del plan**: en esta corrida el PRP se escribe y se ejecuta en el mismo `/goal`; la
> aprobación humana llega con la firma del CDC y nada se mergea sin ella.

---

## Objetivo

Soporte SAP construido y probado en laboratorio: una consultora de soporte SAP (N2) atiende las
incidencias de sus clientes (N3) con triage, base de conocimiento con fuente citada, evidencia
leída de sus documentos y control de SLA y horas; el laboratorio (N1) aprende cada incidencia
nueva en su sandbox y aprueba en la sala A2A lo que el agente prepara. Todo contra un SAP
simulado, con corpus sintético y LLM simulado.

## Por Qué

| Problema | Solución |
|---|---|
| Una mesa AMS resuelve una y otra vez lo mismo, y el conocimiento vive en la cabeza de quien lo resolvió | matriz problema-solución sobre el motor determinista del grafo, alimentada por el sandbox (KCS) |
| El triage depende de capturas y documentos que alguien tiene que leer | ingesta con el extractor documental, evidencia por campo y revisión humana |
| El SLA se discute con hojas de cálculo | contratos versionados y un reloj que mide desde los eventos con traza |
| Un agente que «arregla» en el SAP del cliente es un riesgo que nadie firma | el agente propone; un humano aprueba en una fila que ningún modelo puede escribir; la aplicación real no está cableada (D6) |

**Valor de negocio**: es el primer producto vendible del laboratorio y el primero que compone
activos existentes (extractor, grafo, A2A, contabilidad, despliegue) para un modelo de negocio.
Su % de reuso es la línea base del siguiente (ERP-MAESTRO §1.9).

## Qué

### Criterios de éxito

Los puntos 1–21, 23 y 24 de la definición de hecho del spec del goal, con su evidencia pegada en
la conversación. En resumen: `validate` en verde; sabotajes de la sala; aislamiento de tres
niveles; 0 fugas del anonimizador; documentos; cadena; recorrido con Playwright; pricing sin
cifras inventadas; inventario; deploy para cualquier VPS; entregables escritos; arquitectura;
almacenamiento; respaldo y restauración por tenant; estimado S/M/L; FDE; chat; SLA; mapeo y
limpieza; capa semántica; impactos en MXN; informe A; CDC propuesto.

## Contexto

- Reusa: `TPL-extractor-documental`, `TPL-grafo-conocimiento`, `TPL-conocimiento`,
  `TPL-feature-a2a`, `TPL-motor-ia`, `TPL-trayectorias`, `TPL-app-base`, `TPL-feature-auth`,
  `TPL-despliegue`. La matriz de reuso está en la §2 del SDD.
- La sala sigue `SPEC-sala-a2a` r2 y `prp-sala-a2a-fase-a` r2 (hermes-os-a2a@e122f54).
- Precedentes: `docs/goals/ventas-ia-waba.md` (simulador, LLM simulado, «no medido») y la
  migración validada en efímero de `tools/etiquetas-gs1`.

## Blueprint

Las fases las deriva `grafo2plan.py` del grafo (la tabla está en el spec del goal). Corrida A:

1. Arquitectura por dominio y por capas — ✅ matriz sin celdas vacías, reuso contado.
2. SDD — ✅.
3. Esquema de almacenamiento · este PRP · C3/C4 en borrador · playbook FDE.
4. `tools/sala-a2a` · dominio SAP (matriz, corpus, simulador) · cadena de eventos.
5. Respaldo y restauración · ingesta de documentos · CLIs · mapeo contextual.
6. Estimado por tamaño · BUSINESS_LOGIC · anonimizador · limpieza y enriquecimiento.
7. Capa semántica en dbt.
8. Contratos SLA · chat del HIL.
9. Modelo de pricing.
10. Impactos en MXN y accionables.
11. App Soporte SAP.
12. Configuración Docker para cualquier VPS · inventario · README comercial.
13. Evidencia de punta a punta e informe A.

## Gobernanza

### Modelo de amenazas (C3)

> v2, tras la revisión independiente del 2026-10-04: un agente distinto del que lo escribió
> encontró cuatro afirmaciones que el SQL no sostenía. Se corrigieron en el esquema y cada una tiene
> su prueba negativa en `tools/soporte-sap/pruebas/_aislamiento.ts` (las marcadas «revisión»).

**Activos que toca**, por daño:

1. datos personales de empleados y usuarios de los N3 en tickets y adjuntos (RR. HH., nómina,
   RFC/CURP/NSS), y de las contrapartes de un CFDI;
2. la integridad de las decisiones humanas: aprobaciones en la sala, mapeos, campos confirmados y
   propuestas (una fila «decidida» que no decidió nadie);
3. los originales de los clientes y los exportes por tenant;
4. el SLA y las horas: dinero entre consultora y cliente;
5. la cadena de eventos (la evidencia del servicio);
6. la matriz común y el grafo (el foso, ERP §1.7), envenenables por la siembra;
7. credenciales: el secreto que firma los tokens de tarea y las llaves de cada rol de servicio;
8. el presupuesto de modelo y de OCR, y la disponibilidad del VPS compartido.

**Fronteras que cruza**:

- el texto y los adjuntos del N3, falsificables y maliciosos contra los parsers (XML del CFDI, PDF);
- la sala, que es superficie **externa** porque las consultoras son terceros;
- el chat del HIL;
- los exportes de tickets de cada consultora;
- la salida del modelo, simulado hoy;
- el paso del sandbox al núcleo (siembra);
- el puente A2A del extractor;
- el destino de los respaldos (D12).

**Atacantes relevantes**:

- **O1**: instrucciones en un ticket, un adjunto o un mensaje.
- **O2**: datos falsos en un exporte o un documento, o un consultor que carga horas a otro cliente.
- **O3**: el experto que aprueba en verde tras cuarenta planes buenos.
- **O4**: abuso de la ingesta para quemar OCR o tumbar el VPS. Un motor autohospedado sin GPU va a
  unos 110 s por página.
- **O5**: dbt, MetricFlow, la imagen de Postgres y las dependencias npm.
- **O6**: el agente (o un rol de servicio) comprometido o manipulado, usado como palanca.

**Controles y brechas**:

- **Alcance de los roles de servicio (O6).** La consultora de la tarea sale del claim de un token
  **firmado por el orquestador**, que no corre el modelo, y que verifica la pasarela. El agente
  presenta su token; nunca fija su alcance. Ninguno de los tres roles tiene `bypassrls`.
  - *Pruebas*: token falsificado rechazado; con tarea de A, 0 filas de B.
  - *Brecha*: con una conexión SQL directa, cualquier rol fija sus GUC. Por eso el agente **no
    tiene** conexión directa, solo la API; si la tuviera, este control desaparece.
- **Decisiones humanas (doble cierre en todas).** Un rol de servicio solo inserta en estado inicial
  (`propuesto`, `por_revisar`, `propuesta`) y no tiene `update`. Una persona decide **a su nombre**
  por política restrictiva: `aprobado_por`, `revisado_por` y `decidida_por` deben ser
  `auth.uid()`. Lo que va al núcleo lo decide el superadministrador (D2).
  - En la sala, la fila de aprobación con política `as restrictive` y sin `insert` para servicios
    se prueba con los sabotajes S1–S6 y S2b de la fase 4.
  - *Brecha*: la fatiga del aprobador (O3) no la cierra una política. La mitigan el veredicto del
    supervisor y el antes y el después del simulador en el mismo mensaje.
- **Tenencia atada (O2).** Un disparador ata la tenencia de cada tabla hija a su incidencia (o, sin
  incidencia, el cliente a su consultora). El bucket exige que la carpeta 2 sea cliente de la
  carpeta 1, y el adjunto, que su ruta sea la de su tenant. La fecha y el actor de un evento los da
  la base, no quien escribe.
  - *Prueba*: horas a otro cliente y subidas cruzadas, rechazadas.
- **Datos personales.**
  - El laboratorio lee solo lo **escalado** por la consultora, y los originales con un acceso que
    **otorga la consultora** a un miembro del laboratorio, por 72 h como máximo, nunca a sí mismo.
  - Los exportes son de la consultora y el laboratorio no los lee.
  - Hay anonimizador fail-closed antes del sandbox, cuarentena sin copia del dato y OCR local.
  - *Brecha*: un dato sensible con una forma que ningún detector conoce; por eso la cuarentena y no
    un «probablemente limpio».
- **Inyección (O1).** El contenido de tickets, adjuntos y mensajes es dato delimitado. Categoría,
  veredicto y tier son deterministas y no leen instrucciones.
  - *Brecha*: el día que el modelo sea real, el corpus de inyecciones se corre contra él antes de
    encenderlo.
- **Archivos maliciosos y abuso (O1, O4).** Se valida por bytes y por tamaño, y el lector de XML
  del extractor rechaza `<!DOCTYPE` y toda declaración `<!`, así que no resuelve entidades
  externas (`tools/extractor-documental/src/xml/lexico.ts`). Hay un tope de páginas OCR por consultora
  (`ss_presupuesto`) y un límite de adjuntos por incidencia.
  - *Brecha*: un PDF que agote memoria en el parser; el servicio de OCR corre con memoria acotada
    en su contenedor.
- **Cadena de suministro (O5).** dbt, MetricFlow y Postgres van pineados por versión y la imagen
  por digest; las dependencias npm ya pasan por el lockfile.
  - *Brecha*: hasta que un CDC adopte `vigila:versiones` para estas piezas, nadie avisa de un
    parche de seguridad.
- **Jobs de plataforma (C7, declarados).** `soporte_sap_ingesta` lee originales y deja campos por
  revisar; `soporte_sap_plataforma` exporta, restaura y borra por retención; ambos acotados por
  token a una consultora. Ninguno es `service_role`. **v3 (fase 7):** `soporte_sap_metricas`, el
  job de la capa semántica, lee a **todas** las consultoras para dar totales; su acotamiento es por
  columna (sin títulos, descripciones, nombres, contenido, motivos ni consultores) y solo inserta en
  `ss_metrica`, que nadie cambia ni borra (`pruebas/metricas-rls.ts`).
  - *Brecha*: un agregado sobre un grupo muy chico (un cliente S solo en su tamaño) puede delatar a
    ese cliente ante el laboratorio; el corte no aplica todavía un tamaño mínimo de grupo (D9).
- **Siembra (frontera sandbox → núcleo).** Lo que cambia un veredicto lo firma el laboratorio en
  `tools/conocimiento`; el agente solo deja propuestas.
- **Superficie.** Nada expuesto. Exponer la sala o el canal N1–N2 es gate humano con este C3 y la
  AISIA firmados. Realtime y el JWT de Supabase no se prueban sin un Supabase real.

### Evaluación de impacto (C4)

Borrador fuera del registro: [`docs/goals/soporte-sap-AISIA.md`](../../docs/goals/soporte-sap-AISIA.md).
Se firma junto con el BUSINESS_LOGIC del producto.

## Aprendizajes

- **2026-10-04 · el C3 afirmaba controles que el SQL no tenía.** Un agente revisor distinto del
  que escribió encontró que el alcance del agente era una variable que el agente mismo fijaba, que
  mapeos, campos y propuestas se podían insertar ya «decididos», que el laboratorio leía toda la
  operación y que las tablas hijas no ataban su tenencia. Las cuatro se corrigieron en el esquema
  (v2) con su prueba negativa. **Lección**: un control escrito en el C3 sin una comprobación que se
  ponga roja es una intención; la revisión cruzada lo encuentra antes que un atacante.

- **2026-10-04 · un banco de pruebas hecho a la medida del detector mide al detector, no la fuga.**
  La v1 del anonimizador daba 0 fugas sobre variantes que el mismo autor había escrito; un revisor
  adversarial independiente construyó 63 entradas (RFC partido, «arroba», nombres fuera de lista,
  minúsculas) y fugaron 54. La v2 reconoce nombres por **exclusión** del vocabulario y datos por su
  forma, y las 63 entradas quedan como fixture permanente. **Lección**: la referencia de un lazo de
  privacidad la pone alguien que no escribió el detector; el banco propio solo cuida regresiones.

- **2026-10-04 · un impacto que mezcla denominadores multiplica el error.** El primer accionable
  para el N3 hacía «incidencias × (1 − cumplimiento de SLA)»: el volumen cuenta todas las
  prioridades y el cumplimiento solo las P1/P2 con meta, así que 1 respuesta tardía salía como 6.4.
  La corrección fue llevar a la capa semántica la cantidad que la fórmula necesita (respuestas
  tardías P1 y P2) en vez de reconstruirla con dos métricas de bases distintas, y probarla contra
  el reloj sobre los eventos.

- **2026-10-04 · una huella sha256 suelta en un archivo versionado tumba `audita:secretos`.** La
  versión del corte (64 hex sin prefijo) tiene la forma de un token sin prefijo y la auditoría la
  marcó en la historia. No era un secreto, pero la regla es buena: toda huella que se commitea va
  como `sha256:<hex>`, el ancla pública que la auditoría excluye. Se corrigió el commit local antes
  de empujar, para que el blob dejara de ser alcanzable.

- **2026-10-04 · un acumulado de MetricFlow rellena la espina de tiempo entera.** Con `backlog`
  (derivada de dos acumulados) en la consulta, `mf query` devolvía filas hasta el final de la espina
  (2027-12), todas vacías: 3 474 valores, dos tercios sin dato. Toda consulta del corte va con
  `--start-time` y `--end-time` del periodo medido. Y `uv venv` no trae `pip`: las versiones se leen
  con `uv pip freeze --python`.

- **2026-10-04 · la regla de identificadores de caso muerde nombres de prueba.** `verify:gobernanza`
  rechaza cualquier «T» seguida de uno o dos dígitos como palabra suelta: tenants de prueba con ese
  nombre y una plantilla de fecha con la hora pegada a una llave lo dispararon. Antes de cada
  commit, el mismo patrón se pasa sobre lo nuevo; los tenants de prueba se llaman `TEN_A`/`ten-a`.
- **2026-10-04 · un cuerpo SQL se valida al crearse.** `ss_priv.baja_original` nombraba
  `ss_acceso_motivado` antes de que existiera y la propuesta no se aplicaba. Las funciones que leen
  una tabla van después de ella.
