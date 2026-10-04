# SDD — Soporte SAP

> **Estado:** diseño del producto Soporte SAP, corrida A del goal
> [`docs/goals/soporte-sap.md`](goals/soporte-sap.md) (2026-10-04, rama `soporte/sap`). Todo corre
> en laboratorio: SAP simulado, corpus sintético declarado como tal y LLM simulado. Nada de esto
> se ha estrenado con una consultora real.
>
> Se escribe por fases del grafo [`docs/grafos/soporte-sap.json`](grafos/soporte-sap.json). La
> matriz de la §2 la vigila una prueba (`tools/soporte-sap/pruebas/arquitectura.ts`): una celda
> vacía, un activo que no existe en el inventario o una cuenta de reuso que no cuadra ponen el gate
> en rojo.

## 1. Qué es y para quién

Soporte SAP equipa a una **consultora de soporte o AMS de SAP** (nivel 2, el cliente que paga)
para atender más incidencias de sus clientes (nivel 3), más rápido y con evidencia, sin perder el
control humano. Por encima está el laboratorio (nivel 1), que opera el sandbox donde se aprende
cada incidencia nueva y el espacio de producción donde el agente prepara soluciones que un humano
aprueba.

| Nivel | Quién | Qué ve | Qué hace |
|---|---|---|---|
| N1 · laboratorio | superadministrador, experto (HIL) y el agente A2A con su Agent Card | operación agregada, sandbox anonimizado, sala | aprueba, enseña, gobierna el núcleo |
| N2 · consultora | consultor, un workspace por cliente que atiende | sus tickets, su SLA, sus horas, su base de conocimiento | atiende, escala al laboratorio por la sala |
| N3 · empresa atendida | usuario del cliente final | sus incidencias y el tablero de su servicio | levanta incidencias con adjuntos |

**Lo que no es.** No se conecta a ningún SAP real: «implementar la solución» en el laboratorio
es aplicarla al simulador, y en el SAP de un N3 es una acción irreversible sobre un tercero que va
con gate humano por acción y no está cableada (D6). No usa un LLM real (D7). No fija precios ni
cifras de SLA (D5, D13).

## 2. Arquitectura por dominio y por capas

Las capas parten de las cuatro del ERP (`erp/ERP-MAESTRO.md` §1.3: datos, CLI-first, operación
A2A y enjambre acotado) y les suman presentación e infraestructura:

| Capa | Qué vive ahí |
|---|---|
| **Presentación** | pantallas bento-grid de la app (Next.js) |
| **Servicio y A2A** | rutas de la app, Agent Card, la superficie opaca de la sala |
| **Dominio y CLIs** | reglas deterministas en `tools/`, y los CLIs que las exponen |
| **Agentes** | quién propone: orquestador, ejecutor, supervisor, FDE, chat |
| **Datos** | tablas con RLS, buckets, crudo inmutable, capa semántica |
| **Infraestructura** | Docker, el VPS sin proveedor fijo, Supabase gestionado |

**Cómo se lee cada celda** (la prueba lo exige así):

- `R` **reusado**: un activo del inventario lo cubre tal cual. Nombra su `TPL-…`.
- `C` **compuesto**: un activo del inventario más pegamento nuevo. Nombra su `TPL-…` y qué se suma.
- `F` **a fabricar**: no hay activo; dice qué se fabrica.
- `N` **no aplica**: dice por qué. No cuenta en el denominador del reuso.

<!-- matriz:inicio -->
| Dominio | Presentación | Servicio y A2A | Dominio y CLIs | Agentes | Datos | Infraestructura |
|---|---|---|---|---|---|---|
| Identidad y tenencia | C TPL-feature-auth + selector de rol del laboratorio | C TPL-app-base + guardas por rol y nivel | F modelo de tres niveles y roles | C TPL-feature-a2a + identidad del agente por su Agent Card | C TPL-feature-auth + tablas de organización y membresía con RLS | R TPL-app-base |
| Sandbox | F vista del experto | F rutas del sandbox | C TPL-grafo-conocimiento + ciclo de aprendizaje | F aprendizaje con el HIL sobre el modelo simulado | F casos anonimizados y propuestas de siembra | R TPL-despliegue |
| Producción | F vista del superadministrador | F rutas de producción | C TPL-grafo-conocimiento + categorizador de incidencias | F orquestador, ejecutor y supervisor (patrón del trío, SDD de fases 6 y 7) | F incidencias y eventos por workspace | R TPL-despliegue |
| Consultora (N2) | F workspace del consultor | F rutas del workspace | F horas y control de SLA por cliente | F FDE de la consultora | F workspaces, clientes y horas | R TPL-despliegue |
| Cliente (N3) | F tablero del servicio y alta de incidencias | F rutas del cliente | F FODA desde la capa semántica | N el N3 no conversa con agentes: su canal es la incidencia (C3) | F incidencias y adjuntos del cliente | R TPL-despliegue |
| Sala A2A | F hilos y aprobación como fila | F herramienta sala-a2a: card opaca y RPC | F invariantes de la sala | C TPL-feature-a2a + el agente publica en el canal | F esquema de la sala con política restrictiva | R TPL-despliegue |
| Chat del HIL | F conversación 1:1 del superadministrador y el experto | F ruta del chat | F intenciones, alcance por rol y promoción a la sala | C TPL-motor-ia + modelo simulado hasta el CDC del routing | F conversaciones por rol | R TPL-despliegue |
| Documentos | C TPL-extractor-documental + cola de revisión en el ticket | C TPL-extractor-documental + puerto de lectura del producto | R TPL-extractor-documental | C TPL-feature-a2a + puente del extractor por A2A | R TPL-extractor-documental | R TPL-despliegue |
| Conocimiento y matriz | F base de conocimiento con fuente | F rutas de consulta | R TPL-grafo-conocimiento | N el veredicto nunca lo da un agente (RF-4 de la spec 004) | C TPL-conocimiento + dominio sintético de laboratorio | N corre en proceso, sin servicio propio |
| Enjambre y FDE | F registro de lo hecho a medida y lo que vuelve al núcleo | C TPL-feature-a2a + capacidades FDE en la Agent Card | F playbook FDE por consultora | F FDE, orquestador, ejecutor y supervisor | F propuestas y registro FDE | N corre en proceso en el laboratorio |
| Datos de la consultora | F revisión del mapeo | F rutas de onboarding | C TPL-extractor-documental + mapeo contextual, limpieza y enriquecimiento | F el FDE propone el mapeo | F crudo inmutable y procedencia por campo | N corre en proceso |
| Métricas | F tableros que leen el corte semántico | F accesor único de métricas | F proyecto dbt con MetricFlow | C TPL-trayectorias + autodiagnóstico como propuestas | C TPL-motor-ia + marts con la contabilidad como fuente de costo | F Postgres efímero y entorno dbt pineado |
| SLA | F reloj y contratos en pantalla | F rutas de contratos | F reloj, contratos versionados y créditos | N el SLA lo mide el reloj, no un agente | F contratos y resultados por ticket | N corre en proceso |
| Costos, pricing e impactos | F tablas de tier, accionables e impactos | F rutas de costos | F modelo de pricing e impactos en MXN | N el precio lo decide el laboratorio (ERP-7) | C TPL-motor-ia + presupuesto con aviso al 80 % | N corre en proceso |
| Respaldo y restauración | N sin pantalla: es operación | N sin superficie de servicio | F export y restauración por tenant | N ningún agente restaura | C TPL-extractor-documental + retención y supresión de originales | C TPL-despliegue + regla 3-2-1-1-0 de FASE0 §9, proveedor por decidir (D12) |
| Despliegue | N sin pantalla | C TPL-despliegue + rutas del producto detrás de Caddy | R TPL-despliegue | N sin agente | N sin datos propios | C TPL-despliegue + servicios del producto en el compose |
<!-- matriz:fin -->

<!-- reuso:inicio -->
**Cuenta de reuso** (la calcula `ss-reuso` desde la matriz; la prueba la vuelve a contar):

- reusadas (R): 12 · compuestas (C): 21 · a fabricar (F): 48 · no aplica (N): 15
- denominador = R + C + F = 12 + 21 + 48 = 81
- **reuso amplio** = (R + C) / denominador = 33 / 81 = **40.7 %**
- **reuso estricto** = R / denominador = 12 / 81 = **14.8 %**
- celdas por activo: TPL-despliegue (11), TPL-extractor-documental (6), TPL-feature-a2a (4), TPL-grafo-conocimiento (3), TPL-motor-ia (3), TPL-app-base (2), TPL-feature-auth (2), TPL-conocimiento (1), TPL-trayectorias (1)
<!-- reuso:fin -->

**Lectura de la cuenta.** Menos de la mitad del producto parte de activos que ya existen, y casi
todo lo reusado está en documentos, despliegue, conocimiento y A2A. Lo nuevo se concentra en el
dominio de soporte (niveles, SLA, pricing, FDE) y en la presentación. Es el primer producto: el
reuso del siguiente se mide contra este catálogo ampliado (ERP-MAESTRO §1.9).

## 3. Niveles, roles y tenencia

**Organizaciones en árbol.** `ss_organizacion(id, tipo, padre_id)`: el laboratorio es la raíz,
cada consultora cuelga del laboratorio y cada cliente (N3) cuelga de su consultora. La membresía
es `ss_miembro(organizacion_id, usuario_id, rol)` sobre `auth.users` (la identidad de
`TPL-feature-auth`; en la sala, `auth.uid()` firma, D4).

| Rol | Organización | Lee | Escribe |
|---|---|---|---|
| `superadmin` | laboratorio | operación de todas las consultoras, sandbox, métricas, sala | contratos, configuración, aprobaciones en la sala |
| `experto` | laboratorio | incidencias de producción, sandbox, sala | enseñanza en el sandbox, aprobaciones en la sala |
| `consultor` | consultora | sus clientes, sus tickets, su SLA y sus horas, su sala | atención, horas, aprobaciones de su lado |
| `usuario_cliente` | cliente | sus incidencias y su tablero | alta de incidencias y adjuntos |
| agente `soporte-sap-a2a` | — (Agent Card) | lo que su tarea necesita, por rol de Postgres sin `bypassrls` | eventos, propuestas, mensajes en la sala; **nunca** aprobaciones |

**Reglas de visibilidad** (RLS en cada tabla, ninguna superficie con `service_role`, C7):

- un cliente ve solo lo de su organización; una consultora ve lo de todos sus clientes y nada de
  otra consultora;
- el laboratorio ve la operación de producción, porque aprueba sobre ella (el modelo del brief,
  D3), pero **no** baja los originales de un cliente sin un acceso con motivo registrado y con
  vencimiento (D14);
- el sandbox solo guarda casos anonimizados: el laboratorio los ve todos; una consultora ve los
  que nacieron de sus incidencias; un cliente no ve ninguno;
- el agente escribe con su propio rol, sin `bypassrls`, y no tiene `insert` sobre aprobaciones.

## 4. Flujos

**Producción (subnivel 2).**

1. El cliente levanta la incidencia con sus adjuntos. Cada adjunto pasa por la ingesta (§6).
2. El orquestador la **categoriza**: workspace, cliente, módulo y componente SAP, transacción,
   mensaje de error, categoría de la matriz, prioridad (impacto × urgencia), complejidad y tiempo
   de respuesta promedio de su categoría. La etiqueta y abre su cadena de eventos (§8).
3. Consulta el **grafo**: el motor determinista da el veredicto con su fuente, o `sin_regla`.
4. **Con solución y grado suficiente**: el ejecutor prepara el plan contra el simulador y el
   supervisor —otro agente, que no sella su propio trabajo— emite el veredicto con sus
   comprobaciones. El plan llega a la sala como mensaje con bloques de acción.
5. Un humano aprueba (la fila en `sala_aprobaciones`) o manda a revisión. **Aprobado**: se aplica
   al simulador con el antes y el después en la cadena. **A revisión**: el agente analiza el
   motivo, corrige y vuelve a proponer; cada vuelta queda en la cadena.

**Sandbox (subnivel 1).** Sin regla en el grafo, el caso se **anonimiza** (§6, fail-closed) y entra
al sandbox normalizado. Cuando el experto entra, el agente le pregunta hasta entender **por qué**
funcionó la solución, lo documenta y propone:

- un caso nuevo para la matriz y una regla para el grafo, como **propuesta de siembra** que firma
  el laboratorio (`tools/conocimiento`, D2);
- un CLI cuando una operación se repite, como **propuesta** (imprimir o adoptar un CLI es CDC).

El autodiagnóstico sale de las métricas (§9) y produce **propuestas**, igual que
`scripts/trayectorias/propuestas.mjs`: el agente no se cambia solo.

## 5. La sala A2A y el chat del HIL

**La sala** es la herramienta `tools/sala-a2a`, alineada con `SPEC-sala-a2a` r2 de
hermes-os-a2a@e122f54 y llevada al stack de este monorepo:

- hay un canal por consultora (el tenant de la sala es la consultora): ahí están el
  superadministrador, los expertos, los consultores de esa consultora y el agente;
- **ningún componente que ejecuta un modelo puede fabricar una aprobación**: la política
  `aprobacion_solo_humana` es `as restrictive` (`decidida_por = auth.uid()`) y ningún rol de
  servicio tiene `insert` sobre la tabla. Hacen falta los dos cierres;
- hilos de un solo nivel por disparador; el cuerpo de un mensaje es dato; un mensaje de espejo
  nunca crea tareas; una mención a un departamento desde un origen externo se ignora con aviso;
- superficie opaca: `{card, rpc, /health}` más el REST autenticado de la app, sin `/docs`;
- presupuesto fail-closed: sin fila de presupuesto, el agente no llama al modelo.

**El chat** es una conversación 1:1 del superadministrador o del experto con el agente:

- sirve para preguntar, explorar y enseñar; cada rol ve solo lo suyo;
- lo que pide una aprobación o involucra a otros **se promueve** a un hilo de la sala, con su
  contexto, y espera la fila humana. **El chat no aprueba**: no tiene ninguna capacidad ni
  credencial para hacerlo;
- cada respuesta cita su fuente: la métrica del corte semántico (§9) o la regla del grafo. Sin
  fuente, contesta «no lo sé»;
- su contenido es dato: una instrucción escrita en un mensaje no cambia lo que el chat puede
  hacer.

## 6. Documentos y anonimización

**Ingesta** por el puerto `LectorDocumentos`, que en el producto implementa el extractor
documental (`TPL-extractor-documental`, sin parches: lo que falte se pide como versión nueva):

1. se valida por **bytes**, no por extensión, y por tamaño máximo; lo que miente se rechaza;
2. un PDF con texto se lee por capa 0; un XML (CFDI) por `./xml`, sin motor; una imagen va al
   motor **local** (Tesseract por zonas); un motor externo sin decisión C4 se rechaza;
3. de cada documento SAP salen, con su evidencia: transacción, ID del mensaje de error, módulo,
   notas SAP citadas, nombre del dump; del CFDI, sus campos;
4. **sin umbral medido, cada campo va a revisión humana** (D9);
5. un formato que el extractor no lee (Word, Excel) se guarda como adjunto, sin extracción, y la
   pantalla lo dice;
6. el texto extraído es dato: nunca instrucción para el agente.

**Anonimización** antes del sandbox, **fail-closed**: RFC, CURP y NSS (validados por dígito
verificador con los identificadores del extractor), correos, teléfonos, CLABE y cuentas, números de
personal de SAP HCM, usuarios SAP, montos de nómina y nombres. Si queda una señal que no se puede
resolver con certeza, el caso queda **en cuarentena** para el experto y no entra al sandbox. Los
datos de empleados del N3 son daño a terceros: no es firmable (límite de C5).

## 7. El agente como Forward Deployed Engineer

El FDE es el ingeniero que vive con la consultora. Su playbook, por consultora:

| Etapa | Qué hace el FDE | Qué aprueba el HIL | Qué queda registrado |
|---|---|---|---|
| 1. Onboarding | recibe el histórico de tickets | — | crudo inmutable, con su huella |
| 2. Mapeo y limpieza | propone el mapeo al esquema contextual y limpia | el mapeo, versionado | cuenta entrada = mapeadas + revisión + descartadas |
| 3. Configuración | arma el workspace: clientes, contratos, categorías | la configuración | versión del workspace |
| 4. Solución a medida | reglas, CLIs y flujos para lo recurrente de esa consultora | cada propuesta | **a medida** |
| 5. Impacto | mide con la capa semántica | — | impacto con fórmula |
| 6. Vuelta al núcleo | propone al sandbox lo que sirve a todas | la propuesta al núcleo | **al núcleo** |

Cada etapa es una capacidad declarada en su Agent Card. El FDE no toca los sistemas del cliente:
trabaja con lo que la consultora entrega y con el simulador. El registro de qué quedó a medida y
qué se propuso al núcleo es la frontera que la corrida B usa para el concepto «producto».

## 8. Datos de la consultora: de crudos a métricas

**Esquema contextual canónico** (la incidencia y su contexto):

| Campo | Qué guarda |
|---|---|
| origen | herramienta, id de origen, versión del mapeo |
| tenencia | consultora, cliente |
| contexto SAP | sistema (ECC o S/4HANA y release), módulo, componente, transacción (incluidas las Z) |
| problema | mensaje de error, descripción, categoría de la matriz |
| prioridad | impacto, urgencia y prioridad P1–P4 (matriz ITIL) |
| tiempos | creada, primera respuesta, resuelta y cerrada, en UTC con la zona de origen |
| personas | asignado como seudónimo, nunca un nombre |

**Mapeo.** Cada herramienta de origen tiene un mapeo versionado (columnas y valores) que propone
el FDE y aprueba el HIL. Toda fila de entrada termina **mapeada**, **en revisión** o **descartada
con motivo** (un duplicado es descartado con el id que lo absorbe). La cuenta cierra siempre.

**Limpieza y enriquecimiento.** Normaliza módulo, componente, transacción, prioridades, fechas y
zonas horarias; enriquece con lo leído de los documentos, la categoría de la matriz, las reglas del
grafo y el SLA aplicable. **El crudo es inmutable**: cada valor limpio o enriquecido apunta a su
original y a la regla o fuente que lo cambió, y el crudo se reconstruye igual.

**Cadena de eventos.** Cada incidencia tiene su cadena sha256: secuencia, enlace al anterior y hash
del **registro completo canonicalizado** (el diseño de la cadena de etiquetas GS1). Alterar, borrar
o reordenar un evento rompe la verificación.

## 9. Capa semántica (dbt + MetricFlow)

- **Capas de dbt**: `staging` (la limpieza, desde las tablas del producto) → `intermediate`
  (enriquecimiento y hechos por ticket, incluido el resultado de SLA) → `marts` → modelos
  semánticos y métricas de **MetricFlow**.
- **Local y pineado**: dbt Core y MetricFlow en un entorno Python 3.12 (`uv`), contra un Postgres
  efímero. Nada de dbt Cloud ni de una capa semántica alojada: los datos no salen.
- **Una definición por métrica.** El corte semántico (los valores que produce MetricFlow) es lo
  único que leen los tableros N1, N2 y N3, el SLA, el pricing, el FODA y el chat. Ninguna
  superficie agrega datos por su cuenta, y una prueba lo vigila.
- **Ciclo de vida** de la consultora y de cada cliente: alta → onboarding → adopción → operación →
  renovación, y riesgo de baja. El catálogo de métricas (volumen, MTTR, primera respuesta,
  resolución al primer contacto, cumplimiento de SLA, backlog, reuso del conocimiento, horas, costo
  por ticket, tiempo al primer valor y salud de la cuenta) vive en el proyecto dbt.

## 10. Contratos SLA

- **Datos versionados**: N1–N2 (laboratorio con la consultora) y N2–N3 (consultora con su
  cliente). Cada versión trae calendario (zona, días, horario y feriados), metas de respuesta y de
  resolución por prioridad, escalamiento, créditos y exclusiones.
- **Las cifras del laboratorio son de laboratorio**: salen de referencias públicas de AMS, con su
  fuente, y no son una oferta. La plantilla del contrato va con las cifras y el texto legal en
  blanco (D13). El laboratorio no compromete disponibilidad antes de GATE 3.
- **El reloj**: corre en horario hábil del calendario; se **pausa** en espera del cliente y se
  reanuda con su respuesta; una **reapertura** continúa el reloj de resolución donde quedó; un
  **cambio de prioridad** recalcula la meta con la nueva prioridad y conserva el tiempo
  transcurrido; al 80 % de la meta escala.
- **El cumplimiento se mide**: el reloj produce el hecho por ticket desde los eventos de la cadena
  y la capa semántica lo agrega.

## 11. Pricing, costos, impactos y accionables

- **Pricing.** Las variables del cliente (tipo de empresa y tamaño, mezcla de prioridades,
  complejidad por la categoría de la matriz, tiempo de respuesta contratado) asignan un **tier**
  con una regla determinista. El **costo por tier** sale del estimado de consumo (§14) por costos
  unitarios con fuente, o «no medido». **El precio es un parámetro por decidir** (ERP-7, D5): la
  pantalla nunca muestra un número inventado.
- **Control de costos.** Presupuesto por consultora con el aviso al 80 % de la contabilidad de la
  app (`TPL-motor-ia`). Cortar al 100 % lo decide la app y es una decisión con víctima (C4).
- **Impactos en MXN.** Cada proyección muestra su fórmula, sus supuestos y su rango (bajo, central
  y alto). Los supuestos son parámetros: costo hora del consultor, costo de un paro por prioridad,
  volumen esperado. Hasta que la consultora los capture (D15), dicen «supuesto del laboratorio».
  Una proyección no es una promesa al cliente, y la pantalla lo dice.
- **Accionables.** Reglas sobre el corte semántico: cada accionable trae su evidencia (métricas e
  incidencias), su impacto en MXN, su confianza (por el volumen de datos que lo sostiene) y su
  responsable. El FODA del cliente se arma con ellos: cada punto cita su dato.

## 17. Decisiones abiertas

Las quince de la spec (D1–D15), con su valor seguro por defecto, viven en
[`docs/goals/soporte-sap.md`](goals/soporte-sap.md#decisiones-abiertas-del-laboratorio). La
recomendación de cada una, después de construir, va en el informe de la corrida A.

## 18. Referencias consultadas (2026-10-04)

- Metas P1–P4 de AMS de referencia: [LeverX, SAP AMS](https://leverx.com/pl/blog/sap-ams-co-to-jest);
  descripción de servicio AMS de SAP: [SAP, Managed Services AMS](https://assets.cdn.sap.com/agreements/service-descriptions/hec/sap-service-description-for-managed-services-hec--ams-english-v04-2016.pdf).
- Modelos de cobro AMS (bolsa de horas o tickets, precio fijo, por demanda):
  [SAPinsider](https://sapinsider.org/blogs/the-config-team-gives-sap-customers-three-ways-to-structure-ams-support/).
- KCS (el conocimiento como subproducto de resolver):
  [BMC Helix, KCS](https://docs.helixops.ai/bin/Service-Management/IT-Service-Management/BMC-Helix-ITSM-Knowledge-Management/km254/Getting-started/Key-concepts/Knowledge-Centered-Service-overview/).
- El modelo FDE: [PostHog](https://posthog.com/blog/forward-deployed-engineer) y
  [Fourth Age](https://fourthage.substack.com/p/what-is-a-forward-deployed-engineer).
- dbt Core 1.10 con Postgres soporta Python hasta 3.13:
  [dbt, compatibilidad de Python](https://docs.getdbt.com/faqs/Core/install-python-compatibility);
  MetricFlow es Apache 2.0 desde octubre de 2025:
  [dbt Labs](https://www.getdbt.com/blog/open-source-metricflow-governed-metrics).
- Respaldos de Supabase: [Database Backups](https://supabase.com/docs/guides/platform/backups).
