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
| `superadmin` | laboratorio | lo escalado por las consultoras, sandbox, métricas agregadas, sala | presupuestos, decisiones que van al núcleo, aprobaciones en la sala |
| `experto` | laboratorio | lo escalado, sandbox, sala | enseñanza en el sandbox, decisiones a medida, aprobaciones en la sala |
| `consultor` | consultora | sus clientes, sus tickets, su SLA y sus horas, su sala | atención, horas, aprobaciones de su lado |
| `usuario_cliente` | cliente | sus incidencias y su tablero | alta de incidencias y adjuntos |
| agente `soporte-sap-a2a` | — (Agent Card) | lo que su tarea necesita, por rol de Postgres sin `bypassrls` | eventos, propuestas, mensajes en la sala; **nunca** aprobaciones |

**Reglas de visibilidad** (RLS en cada tabla, ninguna superficie con `service_role`, C7):

- un cliente ve solo lo de su organización; una consultora ve lo de todos sus clientes y nada de
  otra consultora;
- el laboratorio **no** lee la operación de una consultora por ser laboratorio: lee lo que la
  consultora (o el agente, al mandar un plan a la sala) le **escaló**; los originales de un cliente,
  solo con un acceso motivado que **otorga la consultora** a un miembro del laboratorio, por 72 h
  como máximo y nunca a sí mismo (D14). Corrección de la revisión independiente del C3;
- el agente, la ingesta y los jobs de plataforma entran con un **token de tarea firmado** por el
  orquestador (que no corre modelo): su alcance es la consultora del token, no una variable que
  ellos fijen;
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

**La app de laboratorio** (`/soporte-sap`, `src/features/soporte-sap/`): un bento por nivel (N3 cliente,
N2 consultor, N1 superadministrador y experto) sobre un runtime **en memoria** que compone las
herramientas tal cual (extractor con OCR local si la máquina lo tiene, categorizador, grafo, par
ejecutor → supervisor, sala, simulador, anonimizador, cadena sha256, reloj y chat). Solo corre con
`SOPORTE_SAP_LABORATORIO=1`; las identidades son de laboratorio (en producción, `auth.uid()` y la RLS
de §12). El laboratorio ve **solo lo escalado a la sala** (sin adjuntos originales) y, del sandbox, el
texto anonimizado. La interfaz no agrega: pinta lo que el servidor leyó del corte. El recorrido de
punta a punta lo corre `node src/features/soporte-sap/pruebas/recorrido.mjs <url> <carpeta>` con
Playwright: 17 capturas en `docs/goals/soporte-sap-capturas/`, cada una con su comprobación, y los
errores de consola contados (2026-10-04: 0 en rojo, 0 errores).

**El par ejecutor → supervisor** (`tools/soporte-sap/src/enjambre.ts`): el ejecutor prepara el plan
desde la matriz y lo simula; el supervisor —otro agente— lo re-verifica con seis comprobaciones
propias (huella, grado, parámetros, el error se reproduce antes, el plan aplica, el error ya no se
reproduce después). «A revisión» lee el motivo como dato y solo toma de él los parámetros que la regla
declara; la versión nueva tiene otra huella y va como hilo del plan anterior.

**Sandbox (subnivel 1).** Sin regla en el grafo, el caso se **anonimiza** (§6: lo que deja forma de dato va a cuarentena) y entra
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

Implementado en `tools/soporte-sap/src/chat.ts` (`respondeHil`), determinista y sin modelo:

| Lo que llega | Lo que hace | Quién |
|---|---|---|
| una pregunta por una métrica | el valor del corte, la cita de la capa semántica y la **definición** del catálogo | los dos; el experto no ve costo ni salud |
| una pregunta de soporte | la solución de la matriz con la cita de la regla del grafo (`consultaMatriz`), o «no lo sé» y al sandbox | los dos |
| «te enseño…» | una **propuesta** del sandbox (`estado = propuesta`), con el texto delimitado como dato | solo el experto |
| «aprueba…», «autoriza…», «ejecuta…» | **se promueve** al hilo del plan en la sala (`origen = chat_hil`, sin bloques de acción); ahí decide una persona con su sesión | los dos; ninguno aprueba en el chat |
| cualquier otra cosa | «no lo sé» | — |

`pruebas/chat.ts` lo demuestra: el chat no importa la sala ni conoce la tabla de aprobaciones; en
una base con los dos esquemas (sala + Soporte SAP) la suite de la sala vigila también al rol con el
que escribe el chat (`soporte_sap_agente`), el chat no puede insertar una aprobación y **el sabotaje
que se lo permite pone la suite en rojo** (`S2b·estr`); una instrucción sembrada viaja delimitada
como dato y no cambia el rol de la sesión.

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

**Anonimización** antes del sandbox (`tools/soporte-sap/src/anonimiza.ts`, v3). **Reduce el riesgo, no lo
garantiza**: un nombre en minúsculas, sin contexto y fuera de la lista de nombres comunes pasa (límite declarado).
Por eso hay dos cerrojos que no dependen de él: la cuarentena guarda solo tipos de señal, y la base rechaza en el
sandbox un identificador con forma (PRP-010 H-03):

1. **identificadores**: RFC, CURP y NSS se reconocen por su **forma**, también partidos en trozos,
   con guiones, con 0↔O y 1↔I↔L de OCR; el dígito verificador del extractor solo dice qué etiqueta
   lleva, no si se quita. Correos (también «arroba»/«punto»), teléfonos, CLABE, cuentas, números de
   personal, usuarios SAP, montos, fechas de nacimiento y domicilios;
2. **nombres por exclusión**: un nombre es la secuencia en mayúsculas que **no** es vocabulario
   (español de los tickets, SAP, nombres de empresa del laboratorio: `src/lexico.ts`), la que sigue
   a un tratamiento (Lic., Ing.) o a un disparador («de parte de», «según»), o la que precede a un
   verbo de reporte. Una lista de nombres deja pasar a quien no está en ella; esta regla no;
3. **cuarentena**: lo que queda con forma de dato (siete dígitos o más, un correo, un tratamiento,
   un posible usuario) no entra. Y **todo caso de RR. HH. o nómina va a cuarentena** aunque
   quede bien anonimizado (definitiva: nadie la revisa hasta D14, DP-7): un finiquito o una incapacidad identifican a una persona por contexto, y
   ahí el daño recae en un tercero que no firmó (límite de C5);
4. la cuarentena guarda **tipos** de señal, nunca el dato.

Medido sobre el corpus sintético (`node tools/soporte-sap/evidencia/anonimizacion.ts`): 277 casos
(corpus, variantes propias y las **63 entradas del revisor adversarial**, que la v1 dejaba fugar en
54), **0 fugas**. Las 63 quedan como fixture permanente (`pruebas/_adversariales.ts`). Medir sobre
un corpus real con consentimiento queda pendiente (D9). `generaliza` además quita lo que identifica
al cliente (transacciones Z, sociedad, nombre del cliente) antes de que un caso suba al núcleo.

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

**Dónde vive**: [`tools/soporte-sap/semantica/`](../tools/soporte-sap/semantica/). La corre
`node tools/soporte-sap/semantica/corre.mjs` (unos 35 s): entorno Python 3.12 con el
`requirements.lock` con hashes (dbt-core 1.12.5, dbt-postgres 1.11.0, dbt-metricflow 0.15.0,
metricflow 0.213.0; Apache 2.0) por `uv`, Postgres efímero `postgres@sha256:b0f9…` solo en
`127.0.0.1` y con contraseña al azar que no aparece en ninguna línea de comandos, `dbt build`,
`mf validate-configs` y `mf query` por alcance. Sin telemetría (`DBT_SEND_ANONYMOUS_USAGE_STATS=false`,
`DO_NOT_TRACK=1`). Nada de dbt Cloud ni de una capa semántica alojada: los datos no salen. Necesita
Docker y Python, así que **no entra al `validate`** (un gate nuevo sería CDC); lo que sí entra es la
prueba de las superficies contra el corte (`pruebas/semantica.ts`).

**Capas**:

| Capa | Modelos | Qué hace |
|---|---|---|
| Entradas | semillas (laboratorio) o `fuentes.yml` (producto, `--vars '{laboratorio: false}'`) | las mismas columnas que el rol `soporte_sap_metricas` puede leer: **ningún texto** |
| `staging` | `stg_organizacion`, `stg_incidencia`, `stg_sla_resultado`, `stg_horas`, `stg_importacion_fila` | tipa, normaliza (módulo, prioridad) y deja una fila por clave |
| `intermedio` | `int_incidencia_hechos`, `int_cliente_ciclo` | define UNA vez las banderas (resuelta, primer contacto, SLA medido) y la etapa del ciclo de vida |
| `marts` | `fct_incidencia`, `dim_cliente`, `fct_cliente_mes`, `fct_importacion`, `metricflow_time_spine` | las tablas que lee MetricFlow |
| Semántica | `modelos_semanticos.yml`, `metricas.yml` | 4 modelos semánticos (incidencias, clientes, ciclo de vida, importación) y el catálogo |

`dbt build`: **53 nodos, PASS=53** (5 semillas, 12 modelos, 36 pruebas: unicidad, nulos, valores
aceptados, relaciones, y tres propias: la importación cuadra, ningún hecho se pierde, el ciclo no tiene
huecos). `mf validate-configs`: 0 errores; 2 avisos que pone el parser de dbt 1.12 al convertir la
medida de los dos acumulados en métrica de entrada (la medida se ignora; el resultado es el mismo).

**El catálogo** (21 métricas, cada una con unidad, etapa del ciclo y si el cliente la ve):

| Etapa | Métricas |
|---|---|
| Onboarding | tiempo al primer valor, cobertura del mapeo (filas limpias / importadas) |
| Adopción | reuso del conocimiento (resuelto con regla del grafo) |
| Operación | volumen, resueltas, MTTR, primera respuesta, resolución al primer contacto, reapertura, backlog al cierre, cumplimiento de SLA de respuesta y de resolución, horas de consultor, horas por incidencia, proporción crítica (P1+P2) y proporción compleja (variables del pricing), respuestas tardías P1 y P2 (base del impacto para el N3) |
| Renovación | salud de la cuenta, riesgo de baja |
| Todas | clientes en cartera por etapa (alta, onboarding, adopción, operación, renovación) |

La **etapa** de cada cliente por mes y la fórmula de la **salud** son definiciones del laboratorio
(supuestos, D11): la salud es cumplimiento de SLA de respuesta × (1 − reapertura) y el riesgo de baja
es salud < 0.85. Sin SLA medido no hay salud: el corte dice «sin dato», nunca un cero.

**El corte semántico** es la salida: en el producto, la tabla `ss_metrica` (§12) con RLS por nivel;
en el laboratorio, `semantica/corte.json` (1 186 valores, versión = `sha256:` + la huella de las entradas). **Es lo único
que leen** los tableros N1, N2 y N3, el SLA, el pricing, los impactos y el chat
(`src/corte.ts` + `src/superficies.ts`). La prueba lo vigila de tres maneras: la misma métrica del mismo
periodo da el mismo número en las seis superficies; un valor centinela plantado en el corte aparece
igual en todas; y ningún archivo de superficie trae código que agregue (con cinco sabotajes que se
ponen en rojo). Si el generador de las entradas cambia y nadie vuelve a correr la capa, la versión del
corte no cuadra y la prueba falla.

**Quién ve qué** (la misma regla en `ss_metrica` y en `leeMetrica`): el laboratorio, agregados (total,
tamaño, consultora), nunca un cliente; la consultora, lo suyo y lo de sus clientes, nunca el total de
las demás; el cliente, solo lo suyo y solo lo que la métrica declara visible (no ve su salud, su riesgo
de baja ni las horas de consultor).

**Verificado contra un cálculo independiente** desde las semillas (2026-10-04): backlog, volumen,
MTTR y cumplimiento de SLA de abril, julio y septiembre, idénticos.

## 10. Contratos SLA

**Datos versionados** (`tools/soporte-sap/src/sla.ts`; en el producto, `ss_contrato_sla` con
`(id, version, vigente_desde)` y el contrato entero en `contenido`):

| | N1–N2 (laboratorio → consultora) | N2–N3 (consultora → cliente) |
|---|---|---|
| Objeto | la respuesta del laboratorio a lo que la consultora le escala | la atención a las incidencias del cliente |
| Metas | **por decidir** (no hay referencia pública para este servicio) | P1 respuesta 60 min continuos y P2 240 min hábiles, citadas de SAP Enterprise Support Schedule §2.1.1 como **referencia**; resolución y P3–P4 sin meta |
| Categorización | la del escalamiento es la de la incidencia | **un agente categoriza**; el cliente impugna y resuelve su consultora |
| Créditos, exclusiones | por decidir (el laboratorio) | por decidir (el laboratorio) |
| Disponibilidad | no se compromete antes de GATE 3 | no se compromete antes de GATE 3 |

Una versión nueva rige **después** de la anterior y no la edita (`nuevaVersion`); una incidencia
se mide con la versión vigente al recibirla (`vigenteEn`). La plantilla del documento
([`tools/soporte-sap/contratos/plantilla-contrato-sla.md`](../tools/soporte-sap/contratos/plantilla-contrato-sla.md))
lleva cada cifra y cada cláusula legal como `[POR DECIDIR]` (D13); lo que no es hueco es la
definición del reloj, que es la misma que usa el producto.

**El reloj** (`relojSla`, la única definición por ticket):

- arranca al recibir, en el calendario de la meta: hábil (lunes a viernes 09:00–18:00 de la Ciudad
  de México, feriados de la LFT art. 74) o continuo (24×7); lo recibido fuera de horario cuenta al
  abrir;
- la **espera del cliente** pausa la resolución; **resolver** lo detiene, también en una pausa; una
  **reapertura** lo reanuda desde la reapertura;
- un **cambio de prioridad** aplica la meta de la nueva prioridad desde la recepción (o desde el
  cambio, si el contrato lo pacta);
- sin respuesta y con el plazo vencido, **ya incumplió**; sin meta, nunca incumple;
- deja los **tramos** (corre, pausa, detenido) con el evento que abrió cada uno: la evidencia de un
  incumplimiento;
- con el reloj abierto, una **alerta interna** escala al 80 % de la meta (supuesto del laboratorio:
  un aviso operativo, no una cláusula).

`pruebas/sla.ts` prueba los bordes (fuera de horario, P1 en continuo, feriado, espera, resolver en
pausa, reapertura, cambio de prioridad en las dos modalidades, plazo vencido sin responder, alerta) y
que el cumplimiento de tres periodos sintéticos **recalculado desde los eventos** es el mismo número
que da la capa semántica.

**Lo que falta medir**: el N1–N2. El corpus sintético no trae escalamientos con hora de respuesta
del laboratorio; hasta que la sala los registre, ese contrato existe como dato y plantilla, sin
medición.

## 11. Pricing, costos, impactos y accionables

- **Pricing** (`tools/soporte-sap/src/pricing.ts`, `node tools/soporte-sap/evidencia/pricing.ts`).
  Las variables del N3 salen del **corte semántico** (volumen, proporción crítica P1+P2 y
  proporción compleja, dos métricas que se sumaron al catálogo para esto) y del **contrato**
  (¿alguna meta corre 24×7?); el tamaño, del perfil del cliente. Una regla determinista las lleva a
  un **tier** (esencial, profesional, crítico) con umbrales **supuestos** (D11), a la vista. El
  **costo por tier** = consumo del estimado (§14, cada cifra medida, derivada o supuesta) más las
  horas de consultor (horas por incidencia del corte × volumen supuesto), por un **precio unitario
  por decidir** (proveedor D12, modelo D7, BD D10, costo hora de la consultora): hasta tenerlo, el
  costo dice «no medido», nunca cero. **El precio de venta y el modelo de cobro son parámetros por
  decidir** (ERP-7, D5); los modelos de cobro de referencia (por tier, bolsa de horas, por ticket)
  están en §18. Ningún número de precio en el código ni en la pantalla (`pruebas/pricing.ts`).
- **Control de costos.** La guardia de presupuesto de la sala (fail-closed, aviso al 80 %) dice si
  se puede llamar al modelo; `accionAnteElPresupuesto` decide qué hace el triage: al 80 %, llama y
  avisa; al tope o sin fila de presupuesto, **P1 y P2 pasan a una persona en el momento** y P3 y P4
  esperan con aviso. Cortar el servicio por la factura es una decisión con víctima (C4): aquí nunca
  deja sin atención a un P1 o un P2.
- **Impactos en MXN** (`tools/soporte-sap/src/impactos.ts`, `node tools/soporte-sap/evidencia/impactos.ts`).
  Cada proyección muestra su fórmula, sus supuestos y su rango (bajo, central y alto). Los supuestos
  son parámetros (D15): el **costo hora del consultor** sale de una fuente pública (Jooble México,
  consultor SAP, $201.19 la hora al 30-09-2026) por un factor de carga supuesto (1.3 · 1.6 · 2.0);
  el costo de una hora de paro P1 y P2, la fracción sembrable, el ahorro por regla, el retrabajo
  por reapertura y las horas de paro por respuesta tardía son **supuestos del laboratorio sin
  fuente**, y así se dicen, hasta que la consultora los capture por cliente. Si un parámetro cambia,
  `recalcula` muestra el antes y el después. Una proyección no es una promesa al cliente, y la
  pantalla lo dice.
- **Accionables.** Dos familias, porque el dinero es de partes distintas: para la **consultora**
  (horas de consultor que se dejan de gastar: volver regla lo resuelto sin solución conocida,
  cerrar sin reaperturas) y para el **N3** (horas de paro evitadas: responder a tiempo). Cada uno
  trae su evidencia del corte semántico (sin dato, no hay accionable), su confianza (baja con menos
  de 15 incidencias; con supuestos de por medio, nunca alta) y su responsable.
- **FODA del N3.** Se arma solo con lo que el cliente ve de sí mismo: fortalezas y debilidades por
  umbrales supuestos a la vista, oportunidades con los accionables para el N3 y amenazas por
  tendencia (el backlog contra el mes anterior). Cada punto cita su dato (`pruebas/impactos.ts`).

## 12. Esquema de almacenamiento

**Propuesta, no aplicada**: [`tools/soporte-sap/migraciones/propuesta-soporte-sap.sql`](../tools/soporte-sap/migraciones/propuesta-soporte-sap.sql).
La prueban `pruebas/esquema.ts` (se aplica dos veces; RLS con `force` en las 22 tablas; ninguna
función `security definer` en `public`; árbol, roles y tenencia de las tablas hijas impuestos en
la base; solo agregar; ningún rol de servicio con `bypassrls` ni `update` sobre lo que se decide) y
`pruebas/aislamiento.ts` (63 comprobaciones con el rol real, buckets incluidos; varias son controles positivos), en un Postgres efímero.
La v2 nace de la revisión independiente del C3, que encontró cuatro afirmaciones sin sostén en el
SQL (alcance del agente, decisiones fabricables fuera de la sala, lectura del laboratorio y
tenencia de las tablas hijas).

**Tablas por dominio y sus claves de tenencia**:

| Dominio | Tablas | Tenencia | Notas |
|---|---|---|---|
| Identidad | `ss_organizacion`, `ss_miembro` | árbol laboratorio → consultora → cliente | el árbol y el rol por tipo de organización los impone un disparador |
| Producción | `ss_incidencia`, `ss_escalamiento`, `ss_evento`, `ss_adjunto`, `ss_campo_extraido`, `ss_impugnacion` | `consultora_id` + `cliente_id` | el cliente tiene que ser de esa consultora y cada hija hereda la tenencia de su incidencia (disparadores); `ss_evento` es de **solo agregar**, con fecha y actor que da la base; un campo lo confirma una persona a su nombre; el cliente impugna y su consultora resuelve |
| Sandbox | `ss_caso_sandbox`, `ss_cuarentena` | `origen_consultora_id`; la cuarentena por cliente | el sandbox solo tiene texto anonimizado; la cuarentena guarda **tipos** de señal, nunca el dato |
| Núcleo y FDE | `ss_propuesta` | `consultora_id` si es a medida, nulo si va al núcleo | el agente solo inserta en estado `propuesta` |
| Acceso | `ss_acceso_motivado` | por usuario y cliente | lo otorga **la consultora** a un miembro del laboratorio, con motivo, por 72 h como máximo desde una fecha que pone la base; se revoca, y nadie se lo otorga a sí mismo (D14 decide qué más ve el superadministrador) |
| SLA y horas | `ss_contrato_sla`, `ss_sla_resultado`, `ss_horas`, `ss_presupuesto` | N1–N2 por consultora; N2–N3 por cliente | contrato versionado por `(id, version)` |
| Onboarding | `ss_crudo`, `ss_mapeo`, `ss_procedencia`, `ss_importacion_fila` | `consultora_id` | el crudo es de **solo agregar** y se identifica por su huella; un mapeo aprobado dice quién; cada fila importada queda limpia, en revisión o descartada con motivo |
| Métricas | `ss_metrica` | `alcance` (total, tamaño, consultora, cliente) | el corte semántico (§9), con `etapa` (el segmento del ciclo de vida) y `visible_al_cliente` (la RLS no deja al N3 leer lo interno); solo lo escribe el job de métricas, nadie lo cambia ni lo borra; derivada: se regenera |
| Chat | `ss_chat_mensaje` | `usuario_id` | cada quien ve su conversación; solo el laboratorio conversa |

**Roles.** `authenticated` (las personas, por `auth.uid()`) y cuatro roles de servicio sin
`bypassrls` (más `sala_agente`, el de la sala, en su propia propuesta). Tres de ellos van cada uno acotado a la consultora del **token de tarea firmado** que presenta
(`request.jwt.claims`): `soporte_sap_agente` (lee y propone; nunca decide), `soporte_sap_ingesta`
(lee originales y deja campos por revisar) y `soporte_sap_plataforma` (export y el resultado del SLA; job
declarado, C7; tiene el privilegio de borrar por retención, pero ningún job lo usa todavía: D8). Sin token
válido no ven nada. La **restauración** no la hace un rol de servicio: corre con privilegio de migración (C7,
declarado en el C3) y verifica todo antes del commit (§13). El cuarto, `soporte_sap_metricas` (la
capa semántica, job declarado, C7), lee a **todas** las consultoras para dar totales, así que su
acotamiento es por **columna**: no tiene privilegio sobre títulos, descripciones, nombres, contenido,
motivos ni consultores (`pruebas/metricas-rls.ts` lo intenta columna por columna), y solo escribe en
`ss_metrica`. Las funciones de visibilidad viven en
`ss_priv`, un esquema que la API no expone.

**Buckets** (privados; ruta por tenant y nombre por sha256, así un mismo archivo no se duplica y
la ruta dice de quién es):

| Bucket | Ruta | Quién lee | Quién escribe |
|---|---|---|---|
| `ss-originales` | `{consultora}/{cliente}/{incidencia}/{sha256}` | el cliente y su consultora; la ingesta de esa consultora; el laboratorio solo con acceso motivado vigente | el cliente y su consultora, si la carpeta 2 es cliente de la carpeta 1 |
| `ss-sandbox` | `{consultora_origen}/{caso}/{sha256}` | el laboratorio; la consultora, lo que nació de ella | el agente de esa consultora, después del anonimizador |
| `ss-exportes` | `{consultora}/{fecha}-{sha256}` | la consultora (el laboratorio no) | el job de plataforma de esa consultora (§13) |

**Retención** (D8, valor por defecto): los originales se guardan mientras dure el contrato; al
salir, la consultora recibe su export (ERP-6) y se borran de la base y de Storage. En el respaldo
inmutable fuera de sitio **no se pueden borrar antes**: vencen cuando vence su bloqueo
(`RESPALDO_S3_BLOQUEO_DIAS`), y ese plazo es parte de D8. El job de retención todavía no existe. El crudo y la
cadena de eventos son la evidencia del servicio: viven lo mismo que el contrato.

**Crecimiento**: por tamaño de cliente en la §14, medido con carga sintética.

## 13. Respaldo y restauración

**Qué aplica en cada capa** (datos verificados el 2026-10-04 en la doc oficial; lo que depende del
proveedor del VPS queda como **pregunta abierta hasta D12**, no como dato):

| Capa | Snapshot | Respaldo del proveedor / PITR | Físico + WAL | Export lógico por tenant | Sincronización aparte |
|---|---|---|---|---|---|
| BD en Supabase gestionado (hoy) | no aplica: la BD no vive en el VPS | **Free: ninguno**. Pro: 7 días; Team: 14; Enterprise: 30. PITR es add-on (RPO ~2 min) y exige compute Small. Restaura **todo el proyecto**, con el proyecto inaccesible mientras dura | no aplica (lo opera el proveedor) | **sí**: es lo único que devuelve a **un** tenant (`exportaTenant` / `restauraTenant`) y es la portabilidad de ERP-6 | — |
| BD en un Postgres propio (si D10 lo elige) | solo si es **atómico** sobre `PGDATA` + WAL en el mismo volumen (equivale a un corte de luz; sin PITR) | — | **sí**: pgBackRest o WAL-G para PITR | **sí**, igual que arriba | — |
| Storage (originales, sandbox, exportes) | no aplica | **no**: el respaldo de la BD guarda solo los metadatos de `storage.objects` | no aplica | el export lleva el **manifiesto** de objetos, no sus bytes | **sí**: línea propia (Borg o rclone a un destino append-only o inmutable; proveedor por D12) |
| VPS (app, Caddy, OCR, `.env`) | sirve para **reconstruir rápido la máquina**, no como respaldo. Al proveedor elegido hay que preguntarle (D12): ¿es consistente con el servidor encendido? ¿incluye los volúmenes? ¿sobrevive al borrar el servidor? | — | — | — | `.env.production` cifrado con `age`, fuera del servidor (FASE0 §9) |

Fuentes: [Supabase, Database Backups](https://supabase.com/docs/guides/platform/backups) ·
[Hetzner, FAQ de backups y snapshots](https://docs.hetzner.com/cloud/servers/backups-snapshots/faq/)
(como ejemplo de las tres preguntas; no se usará) · [PostgreSQL, snapshots atómicos](https://www.postgresql.org/message-id/20200618192642.GH6680%40tamriel.snowman.net).

**Por qué el export por tenant y no solo el respaldo del proveedor** (probado en
`pruebas/respaldo.ts`): restaurar la base entera, sea un snapshot o el respaldo del proveedor,
regresa en el tiempo a **todas** las consultoras. En la prueba, B pierde una incidencia que no
tenía nada que ver.

**El procedimiento para un tenant** (job de plataforma declarado, C7; `ss-respaldo`):

1. `exportaTenant`: filas de las 17 tablas del tenant (`ss_metrica` no: es derivada y se
   regenera con la capa semántica; una prueba exige que toda tabla con `consultora_id` esté en una
   lista o en la otra), conteos y huella sha256 por tabla
   (calculada en la base) y el manifiesto de sus objetos.
2. Se guarda en `ss-exportes/{consultora}/{fecha}-{sha256}`, y su línea de respaldo es la de Storage.
3. `restauraTenant`: una sola transacción; borra las filas del tenant (hijas primero) y las vuelve
   a poner (padres primero) con los disparadores en modo réplica. Solo toca ese tenant.
4. `verificaRestauracion`: conteos y huellas del tenant iguales al export, y los de los demás
   iguales a como estaban. Si algo falla en el paso 3, la transacción no deja nada a medias.

**Simulacro en efímero** (`node tools/soporte-sap/evidencia/respaldo.ts`, 2026-10-04, PGlite en
proceso en una máquina de desarrollo):

| Tamaño de la consultora | Incidencias (12 meses) | Filas | Export | Restauración | Verificación | A = export | B intacta |
|---|---|---|---|---|---|---|---|
| S | 290 | 2 603 | 97 ms | 62 ms | 70 ms | ✓ | ✓ |
| M | 770 | 6 923 | 221 ms | 129 ms | 114 ms | ✓ | ✓ |
| L | 2 618 | 23 555 | 732 ms | 395 ms | 285 ms | ✓ | ✓ |

Son **tiempos de laboratorio**. **RPO y RTO de producción: desconocidos hasta GATE 3.**

## 14. Estimado de consumo por cliente y por tamaño

Medido con `node tools/soporte-sap/evidencia/estimado.ts` (2026-10-04), que escribe
[`tools/soporte-sap/medicion/estimado.json`](../tools/soporte-sap/medicion/estimado.json): lo leen
el pricing (§11) y el dimensionamiento del VPS (§15). **Cada cifra dice qué es**, y una derivada que
depende de un supuesto, aunque sea de lejos, lo dice (prueba: `pruebas/estimado.ts`).

| Insumo | Valor | Naturaleza |
|---|---|---|
| bytes de BD por incidencia (con 6 eventos, adjunto y horas) | 2 815 | **medida** (PGlite, 2 616 incidencias sintéticas) |
| bytes de export por incidencia | 3 857 | **medida** |
| ms de CPU por incidencia (categorizador + matriz sobre el grafo + cadena) | 0.518 | **medida** |
| segundos de OCR por página (Tesseract por zonas, CPU, sin GPU) | 0.29 | **medida** sobre una captura sintética |
| documentos por incidencia · bytes por documento · fracción de imágenes | 1.2 · 250 000 · 0.6 | **supuesta** |
| tokens por incidencia | 9 000 | **supuesta**: sin LLM real no hay medición (D7) |
| bytes servidos por incidencia · RAM base · RAM por trabajador de OCR | 400 000 · 768 MB · 350 MB | **supuesta** |

**Volumen por tamaño (supuesto, D11):** consultora S/M/L = 24/64/218 incidencias al mes; cliente
S/M/L = 8/20/45.

| Consumo al mes (consultora) | S | M | L |
|---|---|---|---|
| BD | 0.07 MB | 0.18 MB | 0.61 MB |
| Storage (originales) | 7.2 MB | 19.2 MB | 65.4 MB |
| Páginas de OCR · CPU de OCR | 17 · 0.08 CPU-min | 46 · 0.22 CPU-min | 157 · 0.76 CPU-min |
| Tokens (supuesto) | 216 000 | 576 000 | 1 962 000 |
| Respaldo (export) | 0.09 MB | 0.25 MB | 0.84 MB |
| Egreso | 9.6 MB | 25.6 MB | 87.2 MB |
| **Máquina si corriera sola** | 2 vCPU · 1.5 GB · 21 GB | 2 vCPU · 1.5 GB · 21 GB | 2 vCPU · 1.5 GB · 22 GB |

Todas las filas de consumo son **derivadas con supuesto** (el volumen por tamaño es supuesto); la
tabla completa, con la fórmula de cada fila y el tamaño de cliente, la imprime el script.

**Lectura.** La infraestructura que pide una consultora, incluso L, cabe en la máquina más chica que
tenga sentido (2 vCPU). Lo que mueve el costo no es el cómputo: son **las horas del consultor y del
experto** y, cuando haya un modelo real, **los tokens**, que hoy son supuesto. Por eso el pricing se
apoya en la mezcla de prioridades y el tiempo de respuesta contratado, no en la infraestructura. Con
un motor de OCR autohospedado sin GPU (unos 110 s por página, medido por el extractor), el OCR de una
consultora L ya pediría más vCPU en la hora pico: la prueba de `maquinaPara` lo cubre.

## 15. Despliegue en cualquier VPS

**Nada del producto depende de un proveedor.** El compose del monorepo (`docker-compose.yml`) se
dimensiona midiendo la máquina donde corre (`npm run configura:deploy`: `nproc`, `/proc/meminfo`, GPU
si hay) y no conoce planes de nadie. Solo Caddy publica puertos (80 y 443); la app, el OCR y el job
de la capa semántica no tienen ninguno.

| Servicio | Perfil | Qué hace | Red |
|---|---|---|---|
| `app` + `caddy` | (base) | la app con `/soporte-sap` (en producción, con `auth.uid()`; el laboratorio no se despliega) | `web`, `interna` |
| `ocr` | `ocr` | el extractor documental con Tesseract por zonas en CPU (spec 010) | `interna`, sin salida |
| `semantica` | `semantica` | el job de la capa semántica: `dbt build` + MetricFlow + inserción del corte en `ss_metrica`; un disparo por noche (`docker compose --profile semantica run --rm semantica`) | `web` (Supabase gestionado está fuera); `interna` con un Postgres propio (D10) |

**El job de la capa semántica** (`tools/soporte-sap/semantica/Dockerfile`): base
`python@sha256:57cd…` y el `requirements.lock` con hashes; sin privilegios (`nobody`) y sin
telemetría. Entra con un usuario de login que **solo es miembro de `soporte_sap_metricas`** (paso
humano: crearlo con su contraseña fuera del chat; la contraseña viaja por variable de entorno y
`configura:deploy` solo dice si está). Materializa sus modelos en `ss_semantica`, que la API no
expone, y no puede crear nada en `public` (`pruebas/semantica-produccion.ts`).

**Probado contra el esquema del producto** (`node tools/soporte-sap/semantica/ensayo-produccion.mjs`,
2026-10-04): red Docker interna, Postgres por digest con el Supabase mínimo y la propuesta aplicada,
las 542 incidencias sintéticas en las tablas `ss_*`, el usuario del job y la imagen construida: el job
escribió **1 186 valores en `ss_metrica` y los 1 186 coinciden con el corte del laboratorio**, con la
bandera «visible al cliente» bien puesta en todos (143 s, todo se tira al final).

**Lo que `configura:deploy` rechaza** además de lo de siempre: `SOPORTE_SAP_LABORATORIO=1` (el
laboratorio elige identidades y vive en memoria) y un `SS_PG_HOST` sin su usuario y contraseña.

**La máquina por tamaño** sale del estimado (§14): una consultora, aun L, cabe en 2 vCPU, 1.5 GB y
~22 GB de disco si corriera sola; el VPS de varias consultoras se dimensiona sumando y midiendo con
`configura:deploy`. Lo que cambia el tamaño es un motor de OCR autohospedado sin GPU, no el producto.

**Candidatos para el VPS con datos en México** (consultado el 2026-10-04; **D12 sigue abierta**: la
elige el laboratorio, porque decide dónde quedan los datos de los clientes, C4):

| Proveedor | Región | Desde | Fuente |
|---|---|---|---|
| AWS | Mexico (Central), `mx-central-1`, tres zonas en Querétaro | enero de 2025 | [AWS News Blog](https://aws.amazon.com/blogs/aws/now-open-aws-mexico-central-region) |
| Microsoft Azure | Mexico Central, Querétaro, tres zonas | 2024 | [Azure updates](https://azure.microsoft.com/de-de/updates/general-availability-microsoft-azure-now-available-from-new-cloud-region-in-mexico/) |
| Google Cloud | `northamerica-south1`, Querétaro | diciembre de 2024 | [Converge Digest](https://convergedigest.com/google-cloud-opens-new-region-in-queretaro-mexico/) |
| Oracle Cloud | Querétaro (su región 39) | junio de 2022 | [Oracle](https://www.oracle.com/news/announcement/oracle-becomes-first-hyperscaler-to-open-a-cloud-region-in-mexico-2022-06-30) |

No hay precios en la tabla a propósito: compararlos exige una cotización vigente del tamaño elegido.
A cualquiera de ellos (o a un VPS de otro proveedor) hay que hacerle las tres preguntas del §13 sobre
sus snapshots. **Un dato que cambia la decisión**: Supabase gestionado **no tiene región en México**
(la más cercana es Virginia o São Paulo; [Supabase, regions](https://supabase.com/docs/guides/platform/regions)).
Si la residencia en México es requisito, el VPS en Querétaro no basta: la base tendría que ser un
Postgres propio en la misma región (D10, con pgBackRest o WAL-G); si no lo es, la base vive fuera y el
contrato lo dice (C4). **Recomendación** para que el laboratorio decida: elegir primero D10 (dónde vive
la base) y después D12 con la misma región, cotizando dos de las cuatro.

## 16. Seguridad

Los controles, cada uno con la prueba que se pone roja si falta (detalle en el C3 del PRP-008):

| Riesgo | Control | Prueba |
|---|---|---|
| Un tenant lee a otro | RLS `enable` + `force` en las 22 tablas, tenencia de las hijas por disparador, buckets por ruta | `pruebas/aislamiento.ts` (63 comprobaciones), `pruebas/esquema.ts` |
| Un servicio se salta la RLS | ningún rol de servicio con `bypassrls`; cada uno acotado por un token de tarea firmado; ninguna superficie con `service_role` | `pruebas/token-tarea.ts`, `pruebas/esquema.ts` |
| Un modelo fabrica una aprobación | política `as restrictive` + sin `insert` para servicios; el chat no conoce la tabla | suite de la sala con S1–S11 (S2b y S10b incluidos) y `pruebas/chat.ts` (el sabotaje «el chat aprueba» la pone en rojo) |
| El job de métricas filtra texto | privilegios por columna: ni títulos, ni descripciones, ni nombres, ni motivos | `pruebas/metricas-rls.ts`, `pruebas/semantica-produccion.ts` |
| El cliente ve lo interno | `ss_metrica.visible_al_cliente` en la RLS (riesgo de baja, salud y horas son de la consultora) | `pruebas/metricas-rls.ts` |
| Un dato personal llega al sandbox | el anonimizador reduce, no garantiza: lo que deja forma de dato va a cuarentena, y RR. HH. y nómina siempre van a cuarentena (definitiva hasta D14, DP-7); la base rechaza en el sandbox un identificador con forma | `pruebas/anonimiza.ts` (0 fugas en 277, 63 del revisor), `pruebas/cierre-base.ts` |
| Un documento da órdenes | el texto extraído es dato, delimitado; nada lo ejecuta | `pruebas/ingesta.ts`, evidencia de documentos (0 obedecidas) |
| La cadena se reescribe | sha256 encadenado, solo agregar, fecha y actor de la base | `pruebas/cadena.ts` |
| El laboratorio se despliega | 404 sin la variable; `configura:deploy` la rechaza, y corre en `predeploy` aunque el árbol tenga sello (PRP-010 H-26) | `scripts/prueba-a2a.ts` (ruta declarada), `pruebas/superficie.ts` (el caso malo y el control positivo de `configura:deploy`) |
| Una instalación no cabe en lo contratado | el perfil `despliegue` del manifiesto (plantilla v3): `configura:deploy` mide la máquina contra el tamaño, la región frente a D10 («pendiente», nunca «cumple»), el respaldo inmutable y los secretos, sin imprimirlos; la ficha de servidor no dice «apto» sin GATE 3 | `pruebas/despliegue.ts`, siembras de `verifica:productos` |
| Un secreto en pantalla | contraseñas al azar por variable o stdin, nunca en una línea de comandos; huellas como `sha256:` | `npm run audita:secretos` |
| Cadena de suministro | Postgres y Python por digest; dbt y MetricFlow por lock con hashes | el corte registra con qué se generó (`generadoCon`) |

**Lo que esta corrida encontró y corrigió** (cada uno en los Aprendizajes del PRP): el C3 que afirmaba
controles que el SQL no tenía (cuatro), el anonimizador medido contra su propio banco (54 fugas de 63),
el simulador que no normalizaba el periodo (lo cazó el supervisor), la promoción del chat a un hilo de
segundo nivel (lo cazó el recorrido), un impacto en MXN que mezclaba denominadores, la RLS de
`ss_metrica` sin «visible al cliente» y sin etapa, y la vista del laboratorio que mostraba el título de
un caso que no se le escaló.

**Riesgos abiertos**: el corte no aplica un tamaño mínimo de grupo (un cliente S solo en su tamaño puede
quedar expuesto ante el laboratorio); el contrato N1–N2 no se puede medir sin escalamientos con hora;
Realtime, Auth y el JWT de Supabase no se probaron sin un Supabase real; y la residencia de los datos
depende de D10 y D12.

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
- Metas de respuesta del contrato de laboratorio (P1 una hora 24×7; P2 cuatro horas en horario
  local; la «acción correctiva» de P1 no es resolución): [SAP Enterprise Support Schedule, §2.1.1 y
  §2.1.2](https://assets.cdn.sap.com/agreements/product-use-and-support-terms/sup/sap-enterprise-support-schedule-canada-english-v10-2018.pdf).
  Son el soporte de SAP a sus licenciatarios: referencia, no promesa del laboratorio.
- Versiones pineadas de la capa semántica (PyPI, 2026-10-04): dbt-core 1.12.5, dbt-postgres 1.11.0,
  dbt-metricflow 0.15.0 y metricflow 0.213.0, todas Apache 2.0; dbt-metricflow 0.15 exige
  dbt-core ≥ 1.11 y < 1.13 y soporta Python < 3.15.
