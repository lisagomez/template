# Ágora A2A con control financiero y de costos — Spec

> Compilado el 2026-10-27 con `/goal-compiler` y ampliado el 2026-10-28. Forma: **grafo** (15 artefactos, 41 aristas,
> 13 lazos; el plan de
> orquestación está compilado abajo, no se improvisa). Parte de tres insumos del 2026-10-27: el análisis del
> repositorio (commit `5114c0e`), el documento de diseño y el prototipo con datos ficticios. Decisiones del laboratorio
> de ese día:
> - Canal interno único, topes por agente, suspender y revocar (ver «DECISIONES YA TOMADAS»).
> - **Se agrega el control financiero y de costos, con el departamento financiero y el contable.**
> - **Contabilidad: Ágora propone y el departamento contable asienta.** Ágora lleva presupuesto, comprometido y costo
>   real; Finanzas aprueba sobre umbral; al cierre deja la póliza PROPUESTA con el contrato del ERP. No se construye la
>   contabilidad del ERP.
>
> Ampliación del 2026-10-28: **se agrega la funcionalidad de Arbrain** (la capa común del PR #283). Ágora es un
> producto compuesto sobre `tools/capa`: se usa como Arbrain y sus módulos se intercambian sin tocar la capa (ver «SE
> SIENTE COMO ARBRAIN»).

Insumos:
- **Documento de diseño** (Claude Docs): https://claude.ai/artifact/LVKF7tjds33kALU3WFeN77. Se lee con el conector de
  Claude Docs (`read` del doc `9dd1b3f8-94ca-4058-870d-decc54f9881e`); lo que este goal necesita está resumido aquí por
  si el conector no está.
- **Prototipo** con datos ficticios: https://claude.ai/artifact/BCzkQLqSK39NUV8L33A2bw (acción `read` del Artifact
  tool). Es referencia de interacción y de datos de ejemplo, no código a copiar.
- El análisis original (`agora-a2a-analisis-repositorio.md`, en Descargas) está incorporado entero en «LO QUE YA
  EXISTE» y «DECISIONES YA TOMADAS».

## MISIÓN

Cuando termines existe **Ágora**: el mejor espacio de trabajo posible para que una empresa mexicana planee y ejecute con
su equipo, sus agentes internos y los agentes de sus socios, en un solo lugar, sin que ningún agente decida por una
persona. Y donde **cada peso tiene dueño**: el que gasta un agente al pensar, el que compromete un plan y el que de
verdad se ejerce, cada uno con su centro de costo, su presupuesto, su aprobación y su destino contable.

La realidad que debe existir, contada por quien la usa (la empresa ficticia del prototipo, Distribuidora Golfo Norte):

1. **La Propietaria** abre Ágora y ve su organización como workspaces (Expansión Monterrey 2027, Operación Q4 2026),
   cada uno con dominios (Comercial, Operaciones, Finanzas) y categorías. En el riel «Espera tu clic» tiene solo lo que
   le toca decidir. Da de alta un agente externo (dos firmas), le pone topes, y lo puede suspender o revocar; la
   revocación corta en la siguiente llamada.
2. **El equipo** trabaja en el buzón de cada categoría (hilos de un nivel: el canal interno único) y en el tablero:
   tabla, kanban y Gantt, con editores por tipo de campo (estado, fecha, cronograma, persona con insignia
   humano/interno/externo, prioridad, moneda en MXN, progreso, dependencia, etiquetas, vínculo, archivo, hilo, fórmula).
   Mover una fecha propone mover sus sucesores; «Listo» exige dependencias cerradas.
3. **Los agentes** (coordinador, supervisor de reglas sin modelo, analista, especialistas internos y externos) proponen:
   crear ítems, mover fechas, asignar, cambiar montos. Cada propuesta lleva su sha256 y llega al hilo; la aprueba quien
   la matriz dice, y lo aprobado es exactamente lo que se aplica. A2 aplica lo reversible sin dinero ni terceros, y se
   deshace con un clic durante 24 h.
4. **El vigía** sigue fechas, recordatorios y topes; avisa al 80 %; suspende al agente cuya tarjeta cambió de huella.
5. **El departamento financiero** (dominio Finanzas) controla el dinero de los planes y el costo de operar Ágora (ver
   la sección siguiente).
6. **El departamento contable** recibe al cierre de cada periodo el paquete de costos con la póliza propuesta, la
   revisa, la acepta o la devuelve con motivo, y la asienta en su sistema. Ágora nunca asienta.
7. **Un socio externo** (Medios Norte, Fletes del Golfo, Empaques Regio, Despacho Fiscal Sierra: todos ficticios)
   entra por la Puerta A2A con su idCard, ve solo su categoría, solo propone, y lo que su llamada cuesta se carga a su
   tope. En este goal la Puerta se construye y se prueba entera contra un socio **simulado**; no se abre a nadie.
8. **Las métricas** salen de una capa semántica y el tablero se regenera: si el plan es realista, dónde intervenir,
   aceptación por agente, cuello de botella de aprobadores, autonomía efectiva, rechazos en la Puerta, costo por
   propuesta aceptada, consumo de cuota, llamadas tras revocar y las financieras. Ninguna cifra se escribe a mano ni la
   redacta un modelo.
9. **Todo se usa como Arbrain.** Ágora vive en una sola ventana: la jerarquía en el explorador, el tablero en el
   lienzo, «Espera tu clic» en el panel, el buzón en la conversación. La Propietaria pide «qué espera mi clic» o «abre
   el Gantt de Expansión Monterrey» y la ventana la lleva sin un modelo de IA; si no está segura, lo dice o pregunta
   entre dos. Habla con el Modo conversación, con motores locales. Ágora recuerda sus preferencias, la guía en el
   primer arranque, y para lo irreversible le pide su cita textual y un clic.

Todo en español, muy visual, a nivel de un producto de clase mundial (piensa en monday.com, Linear y Ramp juntos), no un
MVP.

## CONTROL FINANCIERO Y DE COSTOS (lo que se agrega)

Ágora controla dos clases de dinero y las lleva al mismo libro:

- **El dinero de los planes**: lo que los ítems comprometen (una pauta de medios, una ruta de reparto, una compra de
  empaques, unas visitas comerciales).
- **El costo de operar Ágora**: el gasto de modelo de cada agente (lo que ya mide `src/lib/ai/contabilidad.ts`), el
  costo por llamada de la Puerta y cualquier honorario de un socio que se registre como costo.

### 1. Centros de costo

La jerarquía ES el árbol de centros de costo: organización › workspace › dominio › categoría › ítem. Todo costo cae en
exactamente una hoja y sube por el árbol. El gasto de un agente se imputa a dos ejes a la vez: **al agente** (el que
originó la llamada; si la pidió una persona, el agente que la ejecutó, como ya se decidió) y **al centro de costo** de
la tarea que la motivó. Un costo sin centro no puede existir.

### 2. Tres cifras por centro, nunca una

- **Presupuesto**: aprobado y versionado (cada versión con quién, cuándo y por qué), por periodo mensual y por centro.
  El de una categoría acota los montos de sus ítems: el tipo de campo «moneda» del diseño ya lo dice (tope del
  presupuesto de la categoría).
- **Comprometido**: lo aprobado y aún no ejercido (una propuesta con monto aprobada, una cotización aceptada). Se libera
  o se convierte en ejercido; nunca se cuenta dos veces.
- **Ejercido**: el costo real, **con evidencia**: un CFDI recibido (UUID), un comprobante o el registro de uso de un
  modelo. Sin evidencia no hay ejercido, hay pendiente.
- **Disponible** = presupuesto − comprometido − lo ejercido que no venía de un compromiso. Una desviación sobre el umbral
  alerta en el hilo de la categoría y en «Espera tu clic» de Finanzas.

Contablemente esto es control presupuestal por compromisos (*encumbrance accounting*): investígalo, no lo inventes.

### 3. El costo de los agentes, en MXN y sin cifras inventadas

- El gasto de modelo se registra en USD por llamada (como hoy) y se lleva a MXN con un **tipo de cambio con fuente y
  fecha** (por ejemplo, el FIX que publica Banxico); en el laboratorio sale de un fixture que declara su fuente. Sin tipo
  de cambio, la cifra en MXN es `null` y se declara; no se estima.
- **`null` no es cero.** Una llamada sin datos de uso se guarda con costo `null`, y cada vista dice cuántas filas van
  sin costear («la cifra real es MAYOR»).
- Los tres topes por agente y el tope de gasto de la organización (ya decididos) leen de este libro: un solo dato, no dos
  contadores que se separan.

### 4. El departamento financiero en Ágora

- Dominio **Finanzas**, con sus categorías (en el prototipo: Presupuesto y Cierre anual).
- **Aprobador de Finanzas**: aprueba los montos sobre el umbral en toda la organización (Mariana Treviño en el
  prototipo), los presupuestos y sus ampliaciones, y la subida de un tope de gasto junto con la Propietaria. El dinero
  nunca es autónomo: ningún nivel de autonomía aprueba ni aplica un monto.
- Agentes del departamento: un **supervisor financiero determinista** (sin modelo; valida reglas y dice cuál falló) y un
  analista que propone análisis y escenarios con las cifras ya calculadas, nunca las cifras. Un observador externo (el
  Despacho Fiscal Sierra del prototipo, hoy en revisión) lee solo lo que su alcance permite. Qué dato financiero sale a
  un tercero es una decisión de C4, no un default.
- **Segregación de funciones** por defecto: quien solicita no aprueba, y quien aprobó un gasto no acepta su póliza.
  Desactivarla es una decisión registrada de la organización.

### 5. El departamento contable y la póliza propuesta

- Al cierre del periodo, Finanzas cierra los costos del mes. Es irreversible: pasa por el freno de `tools/capa` (cita
  textual y clic humano). Después del cierre solo cabe reclasificar en el periodo abierto.
- El cierre produce el **paquete para Contabilidad**: la póliza PROPUESTA con el contrato de ERP-5B
  (`erp/ERP-MAESTRO.md`, §5B.3). Lleva tipo (ingreso, egreso o diario), periodo y movimientos con cuenta, cargo o abono e
  importe. La **partida doble es estructural**: una póliza descuadrada no puede existir, ni la propone un agente ni la
  acepta un humano. Cada cuenta va mapeada a **código agrupador SAT**, con el **UUID** del CFDI vinculado cuando lo hay
  y sus documentos soporte. El paquete incluye también la balanza de costos del periodo y el comparativo de presupuesto
  contra real.
- El catálogo de cuentas y las plantillas de asiento son **configuración de la organización** que revisa el contador
  (como `reglas/dep-ctb.md` en el ERP), no código: Ágora no decide la contabilidad de nadie.
- Un humano con rol de Contabilidad la **acepta** (fila de aprobación sobre su sha256) o la **devuelve** con motivo.
  Ágora la exporta en el contrato y el departamento la asienta en su sistema. Ágora no asienta, no cierra la
  contabilidad y no presenta nada ante el SAT.

### 6. La evidencia del ejercido

Un costo ejercido se ata a su evidencia. Si conviene, reusa lo que ya lee CFDI en el repo (`src/features/buzon-cfdi`,
`tools/extractor-documental`, que lee el XML); es sugerencia descartable. Si lo usas: se lee el XML, no el PDF; el
sello no se verifica (leer bien no es autenticar), y un UUID repetido es un duplicado.

### 7. Los malos financieros que se siembran (gate de la fase 4)

Cada uno debe quedar **bloqueado por la base o por el supervisor**, nunca solo por la UI:

1. El mismo costo dos veces (mismo UUID o misma evidencia).
2. Un costo ejercido sin evidencia.
3. Un compromiso sin aprobación.
4. Un monto sobre el umbral aprobado por alguien que no es de Finanzas, o por un agente.
5. La subida del tope de gasto de un agente sin Finanzas.
6. La edición de un presupuesto o un costo de un periodo cerrado.
7. Un tipo de cambio sin fuente.
8. Una póliza propuesta descuadrada, o aceptada por quien aprobó el gasto.

### 8. Métricas financieras

Al catálogo del diseño se suman: presupuesto, comprometido, ejercido y disponible por centro y periodo; desviación
contra presupuesto; costo de modelo por agente, por workspace y por propuesta aceptada (en MXN); filas sin costo, y
consumo del tope de gasto. Cada cifra del tablero sale de la capa semántica y cuadra al centavo con el libro.

## SE SIENTE COMO ARBRAIN (la capa común, PR #283)

Ágora no trae una interfaz propia por fuera de la capa: es un producto compuesto sobre `tools/capa`, como la Recepción
y la mesa del experto. Lleva la funcionalidad de Arbrain más lo que construyen sus módulos, y cambiar uno de ellos no
toca la capa. Es la decisión del laboratorio del 2026-10-25 para toda herramienta, app y producto.

### 1. Lo que llena cada ranura en Ágora

| Ranura | En Ágora |
| --- | --- |
| Explorador | La jerarquía workspace › dominio › categoría, que también es el árbol de centros de costo |
| Lienzo | El tablero (tabla, kanban, Gantt), los costos, el paquete para Contabilidad, los agentes y la Puerta, las métricas |
| Panel | «Espera tu clic»: lo que la matriz dice que te toca aprobar, el freno pendiente y las alertas de presupuesto y de tope |
| Conversación | El buzón de la categoría abierta (ver la primera decisión de abajo) |
| Intención | Las intenciones de los enchufes de Ágora, resueltas sin LLM |
| Plan | El calendario: fechas de los ítems, recordatorios y calendario de cierre |
| Voz | Dictar en el buzón, escuchar cada respuesta y el Modo conversación, con motores locales |
| Memoria | Por organización: preferencias (vista, workspace abierto, cuánto pregunta); nunca cifras ni hilos |
| Freno | El de la capa, único: cierre del periodo, revocar un agente, avisar a un tercero, quitar la segregación de funciones |
| Primer arranque | El alta de la organización, paso por paso |
| Ajustes | Cuánto pregunta, la voz con «Probar» y la memoria |

### 2. Decisiones de este spec (corregibles por el laboratorio)

- **La conversación la llena el buzón.** Lo que alguien le dice a un agente es un mensaje en el hilo de la categoría
  abierta, nunca un chat aparte: así el canal interno único se cumple también dentro de la ventana. Lo que resuelve el
  enrutador sin LLM (ir a una pantalla, leer una cifra que ya calculó el libro) no es conversación con un agente.
- **Una intención no da autoridad.** Una intención lleva a una pantalla, lee o abre una propuesta. Un cambio de monto,
  fecha o responsable pedido por intención se vuelve **propuesta** en el hilo y nunca se aplica directo. Aprobar es un
  clic humano sobre el sha256, y el freno pide además la cita textual. Ni la voz, ni el texto del chat, ni una
  intención, ni un `click()` sintético aprueban, cierran o revocan.
- **Cuánto pregunta** tiene los tres niveles de la capa, pero en ninguno el dinero es autónomo y en los tres lo
  irreversible va al freno.
- **Voz solo local.** La composición declara `datosSensibles: true` (finanzas de la empresa y datos de socios), así que
  no se enciende ningún adaptador de nube. Sin motor local, el botón no aparece y la ranura explica por qué.
- **El primer arranque** da de alta la organización y cada paso nombra una sola decisión: nombre y marca, primer
  workspace y sus dominios, quién aprueba en Finanzas y con qué umbral, la segregación de funciones, y el primer agente
  interno con sus topes.
- **El resumen** declara solo conteos y enlaces (pendientes de clic, alertas de presupuesto, agentes suspendidos, pólizas
  por aceptar) y **ningún monto**, porque un monto es dato financiero. En este goal no sale de la máquina.
- **Marca propia**: Ágora pone su nombre, su asistente y su acento. Nada de «Arbrain» ni «Levy».

### 3. Módulos e intercambio

Cada pieza de Ágora con pantalla es un módulo con su `enchufe.json`: qué ranuras llena, qué intenciones atiende y con qué
ejemplos, qué acciones van al freno, qué memoria toca y qué sale de la máquina. Cómo se parte lo decides tú; una
sugerencia: buzón, tablero, costos, contabilidad, agentes y Puerta, y métricas. Donde ya existe un módulo con enchufe, se
compone en vez de rehacerse: el calendario llena el plan y el dictado llena la voz. La composición vive en
`productos/composiciones/agora.json`. Para probar el intercambio, se cambia en la composición el módulo del calendario o
el de la voz, y `git diff --stat -- tools/capa` queda vacío.

Si a la capa le falta algo que Ágora necesita, el cambio va aparte: genérico (que sirva a todo producto), con sus
pruebas y reportado. Nunca un caso especial para Ágora dentro de la capa.

El corpus de intenciones de Ágora se mide como el corpus D de la capa: la tasa de acierto se declara, y si cae, se dice.

### 4. Los malos de la capa que se siembran (gate de la fase 7)

Cada uno debe quedar bloqueado, con la prueba que lo demuestra:

1. «Apruébalo», dicho por voz o escrito en el buzón: no aprueba nada.
2. Cerrar el periodo o revocar un agente con un `click()` sintético, con Enter, o con una cita que escribió el asistente
   o un agente y no la persona.
3. Una cita del freno usada por segunda vez o pasados 15 minutos.
4. Una intención ambigua («muéstrame lo de Monterrey», con dos candidatos) que adivina en vez de preguntar entre los dos
   o decir que no sabe.
5. Un cambio de monto pedido por intención que se aplica directo en vez de quedar como propuesta.
6. Un módulo que escribe en la memoria una clave que su enchufe no declara, o una cifra financiera.
7. Un resumen con un monto o con texto libre.
8. Un adaptador de voz en la nube encendido en la composición de Ágora, o una pantalla de Ágora sin enchufe o fuera de
   la ventana sin motivo.

## LO QUE YA EXISTE (hechos verificados el 2026-10-27; la capa, el 2026-10-28)

Del análisis (commit `5114c0e`): ventas-whatsapp, Buzón A2A, Calendario y CRM Planeación sirven como fuente de controles
y código, no como módulos completos. «Buzón A2A» es `tools/sala-a2a` (la ruta `/buzon` es el buzón de CFDI y no
aplica). «CRM Planeación» está especificado en ERP-7 (`dep-pln`), pero su migración `007_planeacion.sql` no existe.

| Pieza | Para qué |
| --- | --- |
| `tools/ventas-whatsapp/src/a2a/pasarela.ts` (adaptar) | Inquilino del token, dominios y skills por propósito, Agent Card firmada ES256, `ListTasks` cerrado, lo ajeno = «no existe» |
| `tools/ventas-whatsapp/src/a2a/cliente.ts` | Verificar la firma de la tarjeta antes de delegar |
| `tools/ventas-whatsapp/src/agente/a2a-modelo.ts` | Bus con tenant + contextId, idempotencia por messageId |
| `tools/ventas-whatsapp/src/trazabilidad/cadena.ts` | Cadena de hashes por inquilino, anclas Merkle firmadas |
| `tools/sala-a2a` (src + migración, adaptar) | Hilos de un nivel, cuerpo como dato, aprobación solo humana sobre sha256. Laboratorio: 18 pruebas, S1–S9, PGlite; la migración es propuesta no aplicada |
| `tools/sala-a2a/src/presupuesto.ts` | Guardia fail-closed por tenant y clase de tarea, aviso al 80 %. Base de los topes por agente (hoy no es por agente) |
| `src/lib/ai/contabilidad.ts` | Registro de gasto por llamada en USD; sin datos de uso, costo `null`; aviso al 80 %; cortar lo decide la app |
| `src/features/a2a/puente.ts` | Endpoint opaco y saneado |
| `tools/calendario` | Pluma única idempotente, gate para notificar (el adaptador de Google, `gog`, no está medido) |
| `erp/migrations/001_nucleo.sql` (adaptar) | `sis_agente`, `sis_agente_version`, `sis_encargo` (`dry_run_hash`, `aprobacion_vence_at`), `sis_bitacora` |
| `tools/capa` (`@tu-scope/capa` 0.1.0; Arbrain v0.2.10 pineado en `upstream.lock.json`; PR #283) | La ventana con sus ranuras, el enrutador de intención sin LLM, el freno (cita textual y clic humano, 15 min, una vez), la memoria por inquilino, la voz con Modo conversación, el primer arranque y el resumen de solo conteos. Léete su `README.md` y `MAPA.md` |
| `productos/composiciones/*.json` y los 23 `enchufe.json` | El contrato de módulo. `recepcion.json` es el ejemplo de producto compuesto; `npm run verifica:enchufes` (ya en el validate, con siembras) cruza enchufes con rutas reales y exige que toda página esté dentro de la capa o fuera con motivo; `src/shared/capa/enchufes.ts` es generado |
| `scripts/capa/recorrido.ts` | Recorrido de Playwright de toda ruta dentro de la capa: ventana, módulo dueño en el lienzo y 0 errores de consola (`--solo <prefijo>`) |
| Enchufes de `tools/calendario` y `src/features/dictado` | Llenan el plan y la voz (el dictado con `/v1/audio/*`, solo `127.0.0.1` y con Bearer): son los módulos a intercambiar |
| `tools/estudio-dashboards` | Tablero regenerable sobre dbt + MetricFlow |

Queda fuera el canal de WhatsApp (`meta/`, `bsp/`, `flows/`, `dominios/`, `simulador/`).

Lo financiero y contable que ya hay:

- El ERP (`erp/`) es otro producto, de marca blanca, con frontera de entrega ratificada (modelo B,
  `erp/FRONTERA-DE-ENTREGA.md`). `npm run verifica:marca-blanca` exige una clase para todo archivo de `erp/`.
- Migraciones del ERP: 001–005 (`cob_*`, `fac_*`, `cfd_*`, `sis_*`, `inv_*`, `ped_*`, `sis_folio`, y `act_*` con
  `act_costo`). **No existen** `ctb_*`, `tes_*` ni `pln_*`: ERP-5B (contabilidad), 5D (tesorería) y 7 (planeación) son
  especificación. `erp/reglas/` solo tiene `act-contable.md`.
- ERP-5B define el contrato que respeta la póliza propuesta: `ctb_poliza` + `ctb_movimiento`, partida doble estructural
  (D-17), código agrupador SAT, vínculo póliza↔UUID, cierre irreversible, corrección por reclasificación, presupuesto
  contra real (`ctb_presupuesto`, `v_ctb_presupuesto_real`).
- ERP-5D fija la regla de oro que aquí también rige: **ningún agente mueve, invierte ni cubre dinero**.
- El prototipo trae valores de ejemplo, no decisiones: umbral de aprobación por monto de 100 000 MXN, tope de gasto de
  la organización de 8 000 MXN al mes, topes por agente con su uso, y Finanzas con Presupuesto y Cierre anual.

Infraestructura local:

- Hay Docker con imágenes `supabase/postgres` 17.x: sirven para un Postgres real y efímero. Hay contenedores de **otros
  proyectos** corriendo (`aprenderanatomia`, `sgi-local`): no se tocan. Levanta uno propio y bórralo al terminar.
- El puerto 3000 lo ocupa otro servidor; `npm run dev` detecta otro libre.
- En un worktree, el `node_modules` enlazado rompe Turbopack: haz un `npm ci` real antes del validate.

### Brechas para externos (del análisis)

1. Credencial por agente (hoy clave compartida o HMAC de plataforma).
2. Registro idCard con su ciclo: solicitud → revisión → prueba → aprobado → suspendido o revocado.
3. Huella fijada de la tarjeta (`card_sha256`) y de la llave (`kid`).
4. Aprobación por rol (hoy aprueba cualquier humano participante).
5. Jerarquía workspace › dominio › categoría.
6. Mensajería interna solo en el buzón de Ágora, topes por agente y revocación con efecto en la siguiente llamada (hoy el
   gasto solo se controla por inquilino).
7. Antirrepetición (`jti`).
8. Migraciones aplicadas en Postgres real (hoy PGlite o propuesta).
9. C3 + C4 firmados y gate humano antes de abrir la Puerta.

A estas se suman una décima, **el control financiero y de costos**, y una undécima, **que se sienta como Arbrain** (las
dos secciones de arriba).

## DECISIONES YA TOMADAS (no se re-litigan)

Del 2026-10-27:

- **Canal interno único.** Toda la comunicación del negocio, entre el equipo y los agentes internos o externos, se
  genera y se guarda en el buzón de Ágora. WhatsApp no es canal interno; Slack, Telegram o correo solo replican en
  lectura.
- **Topes por agente.** Mensajes por hora (ventana de 60 min), propuestas por día (día calendario, America/Mexico_City)
  y gasto de modelo en MXN por mes. Aviso al 80 % (el de gasto también a Finanzas). Al 100 %, la Puerta responde 429 con
  Retry-After, la propuesta se rechaza o el agente sigue solo con reglas. El gasto se cobra al agente que originó la
  llamada (si la pidió una persona, al agente que la ejecutó). El tope de gasto de la organización sigue por encima.
  Bajar un tope: Propietaria o Administrador; subirlo: Propietaria, y el de gasto también Finanzas. Cada cambio crea una
  versión nueva del idCard.
- **Suspender y revocar.** Suspender (Propietaria, Administrador, Aprobador del dominio o el vigía) es reversible y
  congela sus propuestas. Revocar (Propietaria o Administrador, con motivo) surte efecto en la siguiente llamada: la
  Puerta lee el idCard sin caché; se retiran sus propuestas, se cancelan sus tareas, sus ítems quedan sin responsable y
  se borran sus recordatorios.
- **Contabilidad: Ágora propone y el departamento contable asienta** (decidido al compilar este goal).

Del documento de diseño (léelos ahí): la matriz de aprobación por rol; los niveles de autonomía A0–A3 (A2 solo lo
reversible sin dinero ni terceros; dinero, irreversibles, datos sensibles, contacto con terceros y «quiero hablar con
una persona» nunca son autónomos); el modelo de datos (~30 tablas); el catálogo de métricas; los riesgos, y el plan en
8 fases (F0–F7).

Una decisión de orden que toma este spec (corregible por el laboratorio): en el diseño, la fase 0 cerraba con las firmas
de C3 y C4. Aquí **las firmas abren a terceros, no al laboratorio**: se construye con datos ficticios y sin exposición,
los borradores de C3 y C4 avanzan en paralelo, y las firmas son el último checkpoint antes de la apertura.

## GRAFO DEL SISTEMA

Nodos = artefactos; aristas = transformaciones tipadas (script, agente, manual, mixta); lazos = comparadores con
referencia. La fuente es `docs/goals/agora-a2a-grafo.json`, con el shape del conectoma. Este repo no tiene Biblioteca de
conectomas, así que no se materializa.

| Artefacto | Viene de | Lazo que lo cierra |
| --- | --- | --- |
| Insumo: diseño, prototipo y análisis | — | — |
| Borradores de C3, C4/AISIA, CDC y riesgos (sin firmar) | insumo | (los firma el laboratorio en el checkpoint final) |
| Núcleo de datos en Postgres real | insumo | Aislamiento entre organizaciones y RLS forzada, con sabotajes |
| Ágora montada en la capa común | insumo | La capa se consume, no se bifurca (enchufes verificados, `tools/capa` sin diff) |
| Buzón de Ágora | núcleo, capa | Aprobar fuera de rol lo rechaza la base |
| Tablero | núcleo, buzón, capa | Ningún agente edita directo |
| Libro de costos | núcleo, buzón, tablero | Cuadre del libro + los 8 malos financieros |
| Paquete para Contabilidad | libro de costos | Partida doble y contrato contable |
| Coordinador | buzón, tablero, libro de costos | Nada se aplica sin fila de aprobación |
| Puerta A2A (cerrada) | núcleo, buzón, libro de costos | Las comprobaciones de la Puerta, `llamadas_tras_revocar = 0` |
| Calendario y vigía | tablero, coordinador, libro de costos | Un reintento no duplica eventos |
| Métricas | tablero, libro de costos, coordinador, Puerta | Cada cifra sale de una métrica y cuadra con el libro |
| Ágora se siente como Arbrain | capa, tablero, libro de costos, paquete, Puerta, calendario, métricas | Los 8 malos de la capa, el recorrido y el intercambio de un módulo |
| Evidencia | borradores, paquete, calendario, Puerta, métricas, ventana | `npm run validate` + verificador independiente |
| Apertura a un socio real | borradores, Puerta, evidencia | Manual: firmas del laboratorio (fuera de este goal) |

Los dos fallos de grafo que vigilar aquí: **la convergencia que tira una fuente en silencio** (el libro de costos junta
tres; si el gasto de modelo no llega, el ejercido miente por omisión), y **el estado que se fuga entre nodos** (dos
contadores de gasto, uno en los topes y otro en el libro, que se separan). La ventana es la tercera convergencia
que vigilar: junta siete fuentes, y un módulo sin enchufe desaparece del explorador sin que nadie lo note (lo caza la
comprobación N/N de `verifica:enchufes`). Y la memoria de la capa no puede volverse un segundo libro: guarda
preferencias, nunca cifras.

## PLAN DE ORQUESTACIÓN (compilado con `grafo2plan.py`, no improvisado)

### Fase 1 · ⚡ GRUPOS EN PARALELO

**→ produce `Borradores de C3, C4/AISIA, CDC y registro de riesgo (sin firmar)`**
- ◆ subagente (modelo según routing-modelos.json) · **Redactar C3 (Puerta, buzón, espejos), C4/AISIA (datos financieros que salen, topes con víctima), CDC y riesgos** (desde Diseño, prototipo y análisis de Ágora (insumo))

**→ produce `Núcleo de datos en Postgres real (jerarquía, membresías, idCard, matriz, propuesta, bitácora, topes, revocación, jti)`**
- ◆ subagente con scripts deterministas · **Diseñar y aplicar las migraciones con RLS forzada; probarlas en Postgres real con sabotajes** (desde Diseño, prototipo y análisis de Ágora (insumo))

**→ produce `Ágora montada en la capa común (composición, marca propia, un enchufe por módulo, la ventana desde la primera pantalla)`**
- ◆ subagente con scripts deterministas · **Componer Ágora sobre tools/capa: composición, marca propia (sin Arbrain ni Levy), enchufes y la ventana montada** (desde Diseño, prototipo y análisis de Ágora (insumo))

**Gates al cerrar la fase:**
- ↻ Aislamiento entre organizaciones y RLS forzada [gris] — referencia: cada sabotaje en rojo y la suite en verde, en Postgres real y no solo en PGlite
- ↻ La capa se consume, no se bifurca [gris] — referencia: npm run verifica:enchufes en verde con los enchufes de Ágora y sus siembras en rojo; git diff --stat -- tools/capa vacío; ninguna marca de Arbrain ni Levy

### Fase 2

**→ produce `Buzón de Ágora (canales por categoría, hilos, aprobación por rol, espejos de solo lectura)`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ subagente con scripts deterministas · **Adaptar la sala: canal por categoría, aprobación solo humana por rol sobre el sha256** (desde Núcleo de datos en Postgres real (jerarquía, membresías, idCard, matriz, propuesta, bitácora, topes, revocación, jti))
- ◆ subagente con scripts deterministas · **El buzón llena la ranura de conversación: lo que se le dice a un agente es un hilo de la categoría** (desde Ágora montada en la capa común (composición, marca propia, un enchufe por módulo, la ventana desde la primera pantalla))

**Gates al cerrar la fase:**
- ↻ Aprobar fuera de rol lo rechaza la base [gris] — referencia: ningún agente ni rol de servicio inserta una aprobación; un espejo no crea tareas ni aprueba

### Fase 3

**→ produce `Tablero (tabla, kanban, Gantt, editores por tipo de campo; los agentes solo proponen)`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ subagente con scripts deterministas · **Tablas del tablero, historial por campo y tipos de columna** (desde Núcleo de datos en Postgres real (jerarquía, membresías, idCard, matriz, propuesta, bitácora, topes, revocación, jti))
- ◆ subagente con scripts deterministas · **Las propuestas de los agentes viven en el hilo de su categoría** (desde Buzón de Ágora (canales por categoría, hilos, aprobación por rol, espejos de solo lectura))
- ◆ subagente con scripts deterministas · **El tablero se pinta en el lienzo y la jerarquía es el explorador** (desde Ágora montada en la capa común (composición, marca propia, un enchufe por módulo, la ventana desde la primera pantalla))

**Gates al cerrar la fase:**
- ↻ Ningún agente edita directo [gris] — referencia: todo cambio de un agente es propuesta con sha256; A2 solo en campos sin dinero ni terceros

### Fase 4

**→ produce `Libro de costos (presupuesto, comprometido y ejercido por centro de costo, gasto de agentes en MXN)`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ subagente con scripts deterministas · **Centros de costo = la jerarquía; presupuesto versionado; tope de gasto por agente** (desde Núcleo de datos en Postgres real (jerarquía, membresías, idCard, matriz, propuesta, bitácora, topes, revocación, jti))
- ◆ subagente con scripts deterministas · **Aprobación de montos por Finanzas según la matriz** (desde Buzón de Ágora (canales por categoría, hilos, aprobación por rol, espejos de solo lectura))
- ◆ subagente con scripts deterministas · **El campo moneda del ítem se vuelve compromiso contra el presupuesto de su categoría** (desde Tablero (tabla, kanban, Gantt, editores por tipo de campo; los agentes solo proponen))

**Gates al cerrar la fase:**
- ↻ Cuadre del libro de costos [gris] — referencia: ejercido = suma de costos con evidencia; gasto de modelo = registro de uso; filas sin costo declaradas (null no es cero); tipo de cambio con fuente y fecha; desviación sobre umbral alerta
- ↻ Siembra de malos financieros [gris] — referencia: los 8 malos del spec bloqueados por la base o el supervisor, ninguno solo por la UI

### Fase 5 · ⚡ GRUPOS EN PARALELO

**→ produce `Paquete para Contabilidad (cierre de costos del periodo y póliza propuesta con el contrato del ERP)`**
- ◆ subagente con scripts deterministas · **Cierre de costos del periodo y póliza propuesta (partida doble, código agrupador SAT, UUID)** (desde Libro de costos (presupuesto, comprometido y ejercido por centro de costo, gasto de agentes en MXN))

**→ produce `Coordinador con interrupt() (solo agentes internos, gasto imputado)`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ subagente (modelo según routing-modelos.json) · **El coordinador habla por el buzón y propone; nunca aprueba** (desde Buzón de Ágora (canales por categoría, hilos, aprobación por rol, espejos de solo lectura))
- ◆ subagente (modelo según routing-modelos.json) · **Despliega planes y reparte a especialistas como propuestas** (desde Tablero (tabla, kanban, Gantt, editores por tipo de campo; los agentes solo proponen))
- ◆ subagente (modelo según routing-modelos.json) · **Cada llamada a un modelo pasa por la guardia de gasto y se imputa al agente y al centro de costo** (desde Libro de costos (presupuesto, comprometido y ejercido por centro de costo, gasto de agentes en MXN))

**→ produce `Puerta A2A externa, construida y CERRADA (probada contra un socio simulado)`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ subagente con scripts deterministas · **idCard sin caché, huellas fijadas, jti y revocación en la siguiente llamada** (desde Núcleo de datos en Postgres real (jerarquía, membresías, idCard, matriz, propuesta, bitácora, topes, revocación, jti))
- ◆ subagente con scripts deterministas · **Lo que entra por la Puerta llega al buzón como dato** (desde Buzón de Ágora (canales por categoría, hilos, aprobación por rol, espejos de solo lectura))
- ◆ subagente con scripts deterministas · **El gasto se cobra al agente que originó la llamada; al tope, 429 con Retry-After** (desde Libro de costos (presupuesto, comprometido y ejercido por centro de costo, gasto de agentes en MXN))

**Gates al cerrar la fase:**
- ↻ Partida doble y contrato contable [gris] — referencia: una póliza descuadrada no puede existir; toda cuenta con código agrupador SAT; solo un humano de Contabilidad la acepta; periodo cerrado no se edita, se reclasifica
- ↻ Nada se aplica sin fila de aprobación [gris] — referencia: el nodo relee la aprobación en la base; un resume falsificado se rechaza; sin presupuesto no se llama al modelo
- ↻ Las comprobaciones de la Puerta [gris] — referencia: tarjeta re-firmada, kid distinto, jti repetido, revocado, fuera de alcance y sobre tope: rechazo; llamadas_tras_revocar = 0

### Fase 6 · ⚡ GRUPOS EN PARALELO

**→ produce `Calendario y vigía (ciclo de fecha, recordatorios, suspensión por deriva o tope)`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ subagente con scripts deterministas · **Ciclo de fecha de los ítems** (desde Tablero (tabla, kanban, Gantt, editores por tipo de campo; los agentes solo proponen))
- ◆ subagente con scripts deterministas · **El vigía sigue las fechas y propone el seguimiento** (desde Coordinador con interrupt() (solo agentes internos, gasto imputado))
- ◆ subagente con scripts deterministas · **El vigía vigila topes, desviaciones de presupuesto y el calendario de cierre** (desde Libro de costos (presupuesto, comprometido y ejercido por centro de costo, gasto de agentes en MXN))

**→ produce `Capa semántica y tablero regenerable, con las métricas financieras`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ subagente con scripts deterministas · **Métricas de plan y propuestas** (desde Tablero (tabla, kanban, Gantt, editores por tipo de campo; los agentes solo proponen))
- ◆ subagente con scripts deterministas · **Métricas financieras desde el libro de costos** (desde Libro de costos (presupuesto, comprometido y ejercido por centro de costo, gasto de agentes en MXN))
- ◆ subagente con scripts deterministas · **Aceptación, retrabajo, autonomía efectiva y costo por propuesta aceptada** (desde Coordinador con interrupt() (solo agentes internos, gasto imputado))
- ◆ subagente con scripts deterministas · **Llamadas rechazadas por motivo y llamadas tras revocar** (desde Puerta A2A externa, construida y CERRADA (probada contra un socio simulado))

**Gates al cerrar la fase:**
- ↻ Un reintento no duplica eventos [gris] — referencia: idempotencia por clave; el vigía suspende por deriva y avisa al 80 %
- ↻ Cada cifra sale de una métrica [gris] — referencia: cifra del tablero = consulta semántica = libro de costos, al centavo

### Fase 7

**→ produce `Ágora se siente como Arbrain (intención sin LLM, «Espera tu clic» en el panel, freno, memoria, voz local, primer arranque, resumen de conteos)`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ subagente con scripts deterministas · **Memoria por organización sin cifras, primer arranque guiado y voz solo local** (desde Ágora montada en la capa común (composición, marca propia, un enchufe por módulo, la ventana desde la primera pantalla))
- ◆ subagente con scripts deterministas · **Intenciones del tablero con sus ejemplos; un cambio pedido por intención es propuesta, nunca se aplica** (desde Tablero (tabla, kanban, Gantt, editores por tipo de campo; los agentes solo proponen))
- ◆ subagente con scripts deterministas · **«Espera tu clic» de Finanzas en el panel; aprobar es un clic sobre el sha256, nunca voz ni intención** (desde Libro de costos (presupuesto, comprometido y ejercido por centro de costo, gasto de agentes en MXN))
- ◆ subagente con scripts deterministas · **El cierre del periodo por el freno de la capa (cita textual y clic humano)** (desde Paquete para Contabilidad (cierre de costos del periodo y póliza propuesta con el contrato del ERP))
- ◆ subagente con scripts deterministas · **Suspender desde la ventana; revocar y avisar a un tercero, por el freno** (desde Puerta A2A externa, construida y CERRADA (probada contra un socio simulado))
- ◆ subagente con scripts deterministas · **El calendario llena la ranura plan; intercambiarlo no toca la capa** (desde Calendario y vigía (ciclo de fecha, recordatorios, suspensión por deriva o tope))
- ◆ subagente con scripts deterministas · **Las métricas en el lienzo; el resumen de solo conteos, sin montos** (desde Capa semántica y tablero regenerable, con las métricas financieras)

**Gates al cerrar la fase:**
- ↻ Se siente como Arbrain sin saltarse un control [gris] — referencia: toda pantalla de Ágora dentro de la ventana con 0 errores de consola; los 8 malos de la capa bloqueados; el enrutador dice «no lo sé» o pregunta entre dos en vez de adivinar; intercambiar el calendario o la voz deja tools/capa sin diff; corpus de intenciones con su tasa medida

### Fase 8

**→ produce `Evidencia (validate, sabotajes, capturas, reporte, verificación independiente)`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ subagente (modelo según routing-modelos.json) · **Los borradores, listos para firma** (desde Borradores de C3, C4/AISIA, CDC y registro de riesgo (sin firmar))
- ◆ subagente (modelo según routing-modelos.json) · **Re-verificar el paquete contable de cero** (desde Paquete para Contabilidad (cierre de costos del periodo y póliza propuesta con el contrato del ERP))
- ◆ subagente (modelo según routing-modelos.json) · **Re-verificar idempotencia y vigía de cero** (desde Calendario y vigía (ciclo de fecha, recordatorios, suspensión por deriva o tope))
- ◆ subagente (modelo según routing-modelos.json) · **Re-verificar las comprobaciones de la Puerta de cero** (desde Puerta A2A externa, construida y CERRADA (probada contra un socio simulado))
- ◆ subagente (modelo según routing-modelos.json) · **Re-verificar que cada cifra cuadra con su fuente** (desde Capa semántica y tablero regenerable, con las métricas financieras)
- ◆ subagente (modelo según routing-modelos.json) · **Re-verificar de cero los enchufes, el recorrido, el freno y que la voz no aprueba** (desde Ágora se siente como Arbrain (intención sin LLM, «Espera tu clic» en el panel, freno, memoria, voz local, primer arranque, resumen de conteos))

**Gates al cerrar la fase:**
- ↻ Validate y verificación independiente [gris] — referencia: npm run validate en verde tras el último commit; un verificador que no construyó re-corre los gates de cero

### Fase 9

**→ produce `Apertura a un socio real (C3 y C4 firmados, doble firma): fuera de este goal`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ⏸ checkpoint del laboratorio · **El laboratorio firma C3 y C4** (desde Borradores de C3, C4/AISIA, CDC y registro de riesgo (sin firmar))
- ⏸ checkpoint del laboratorio · **Doble firma humana para el primer socio, en una categoría de prueba** (desde Puerta A2A externa, construida y CERRADA (probada contra un socio simulado))
- ⏸ checkpoint del laboratorio · **El laboratorio revisa la evidencia y el CDC antes del merge** (desde Evidencia (validate, sabotajes, capturas, reporte, verificación independiente))

Reglas al ejecutarlo: dos subagentes coexisten solo si escriben artefactos disjuntos y se hablan por el contrato de sus
aristas; una convergencia la hace un solo worker o un merge explícito; y el verificador de la fase 8 es un subagente que
**no construyó** lo que verifica y re-corre los gates de cero. Si el grafo cambia al construir, actualiza el JSON y
vuelve a compilar el plan: el mapa y la máquina tienen una sola pluma.

La capa está desde la fase 1: cada pantalla nace dentro de la ventana, con su enchufe. La fase 7 completa las ranuras y
cierra su lazo; no es el momento de envolver en la capa lo que se construyó por fuera.

## LIBERTAD TÉCNICA

Tú eliges arquitectura, stack, librerías y estrategia: probablemente sabes mejor que yo qué conviene. Cualquier
tecnología de este spec o del diseño (LangGraph JS con su checkpoint en Postgres, `@a2a-js/sdk` 1.1.0, dbt + MetricFlow,
DuckDB en el laboratorio) es sugerencia descartable, no requisito, salvo la sección RESTRICCIONES REALES. También eliges
dónde vive (el patrón del repo es una herramienta en `tools/` con núcleo sin React, Next ni Supabase, más la app en
`src/features/`), cómo se modela el compromiso y cómo se parte el trabajo. Optimiza por el mejor resultado posible, no
por el camino más corto.

## INVESTIGA ANTES DE CONSTRUIR

Investiga 2-3 referencias de clase mundial por frente y decide el enfoque a partir de eso:

- **Planeación colaborativa**: monday.com, Linear, Asana (tipos de columna, Gantt, automatizaciones, propuestas).
- **Control de gasto**: Ramp, Brex, Spendesk (presupuestos, políticas, aprobación por monto); control presupuestal por
  compromisos en NetSuite u Odoo.
- **Contabilidad mexicana**: el Anexo 24 (código agrupador SAT, vínculo póliza↔UUID) y el contrato de ERP-5B.
- **A2A**: la especificación y el SDK pineado del repo.
- **Que se sienta como Arbrain**: el README y el `MAPA.md` de `tools/capa`, el spec `docs/goals/capa-arbrain.md` y la
  Recepción como producto compuesto. Arbrain se lee solo en la etiqueta pineada del lock.

Reafirma el objetivo en una línea antes de cada edición grande para no derivar.

## DEFINICIÓN DE HECHO (evidencia visible en la conversación)

El evaluador solo ve la conversación: no corre comandos ni abre archivos. Todo se surfea.

1. **Validate**: el output de `npm run validate` en verde, corrido después del último commit, pegado.
2. **Gates por fase**: por cada fase de la 1 a la 7, el output de su suite con cada sabotaje en rojo antes del arreglo
   (o bloqueado) y la suite en verde. Incluye los 8 malos financieros, los 8 malos de la capa y el aislamiento entre
   organizaciones en Postgres real (con la versión del servidor en el output). También `npm run verifica:enchufes` y
   `git diff --stat -- tools/capa` vacío después de intercambiar un módulo.
3. **Capturas de Playwright**, pegadas, con antes y después donde hay movimiento:
   1. Tablero de un workspace en tabla, kanban y Gantt, con una propuesta de agente pendiente y las insignias
      humano/interno/externo.
   2. Un Editor intenta aprobar un monto sobre el umbral y la base lo rechaza; la Aprobadora de Finanzas lo aprueba; el
      comprometido de la categoría antes y después.
   3. Costos por workspace › dominio › categoría: presupuesto, comprometido, ejercido y disponible; el gasto de los
      agentes en MXN, con el tipo de cambio, su fuente y su fecha; las filas sin costo declaradas; un aviso al 80 %.
   4. Un agente cruza su tope de gasto: aviso al 80 % (también a Finanzas) y, al 100 %, el rechazo (429 con Retry-After
      en la Puerta).
   5. El cierre de costos del periodo por el freno (cita y clic). Contabilidad ve la póliza propuesta cuadrada, con
      códigos agrupadores y UUID, y la acepta; la persona que aprobó el gasto intenta aceptarla y se le rechaza; el
      export en el contrato.
   6. El socio simulado llama y es aceptado; se revoca; su siguiente llamada se rechaza; `llamadas_tras_revocar = 0`.
   7. El tablero de métricas regenerado con las financieras, junto a la consulta que prueba que cuadra con el libro.
   8. Un reintento del calendario no duplica el evento; el vigía suspende un agente por deriva de tarjeta.
   9. Ágora dentro de la ventana: la jerarquía en el explorador, «Espera tu clic» en el panel y el buzón en la
      conversación. Una intención resuelta sin LLM, una ambigua que pregunta entre dos, y «apruébalo» por voz que no
      aprueba nada. El primer arranque, paso por paso.
4. **Consola limpia**: la app corre sin errores de consola en los recorridos anteriores, y el recorrido de la capa pasa
   por todas las pantallas de Ágora.
5. **Verificación independiente**: el output de un verificador que no construyó, re-corriendo los gates de cero.
6. **Reporte de decisiones**: el stack y por qué, dónde vive, cómo se modela el compromiso, de dónde sale el tipo de
   cambio y cómo se reparte el gasto entre agente y centro de costo. También qué módulo llena cada ranura, la tasa del
   corpus de intenciones y lo que se le cambió a la capa, si se le cambió algo.
7. **Borradores listos para firma, sin firmar**: C3 (Puerta, buzón, espejos), C4/AISIA (qué dato financiero sale a quién;
   el tope que corta a un agente es una decisión con víctima), la propuesta de CDC y el registro de riesgo, con sus
   rutas.
8. **Lo que podría estar mal**: la lista, con lo resuelto y lo que queda abierto como pregunta de una línea.

## COMANDO DE VALIDACIÓN

- **Gate completo**: `npm run validate`, al cerrar cada fase y después del último commit (la gobernanza lee
  `git ls-files`, así que se corre después de commitear). En un worktree, `npm ci` real antes.
- **Latido**: en tu primer checkpoint declara UNA línea con typecheck + build + pruebas + sabotajes de lo que construyes
  (el patrón del repo es `npx tsc --noEmit -p . && npm --prefix tools/<herramienta> run -s build && npm --prefix
  tools/<herramienta> run -s prueba`) y córrela tras cada cambio grande. Después de cada cambio de UI, corre también el
  recorrido de Playwright. Pega los outputs.
- **Capa**: `npm run verifica:enchufes` (ya está en el validate) tras cada pantalla nueva, y `node scripts/capa/recorrido.ts
  --base <url> --solo <prefijo de Ágora>` tras cada cambio de UI.
- Un gate nuevo en el padrón (`.claude/gates.json`) es CDC: va en la propuesta para firma.

## RESTRICCIONES REALES

- **Solo laboratorio, con datos ficticios** (los del prototipo o sintéticos equivalentes). Nada de datos reales,
  personales ni financieros.
- **La Puerta no se expone**: se construye y se prueba contra un socio simulado. Abrirla exige C3 y C4 firmados y la
  doble firma humana; es el checkpoint final, no parte de este goal. Tampoco se conecta ningún canal de chat externo.
- **Ningún agente paga, mueve dinero, asienta, cierra un periodo ni aprueba.** La póliza es propuesta; el departamento
  contable asienta. Lo irreversible (cierre, revocación, aviso a terceros) pasa por gate humano.
- **No construyes la contabilidad del ERP** (`ctb_*`, `tes_*`): consumes su contrato de ERP-5B. Si tocas algo en `erp/`,
  le das clase en `erp/entrega.json` (si no, `verifica:marca-blanca` cae) y lo reportas.
- **Sin modelos de pago por defecto**: los agentes se prueban con un modelo determinista inyectado. Una llamada real
  necesita el OK del laboratorio y queda bajo el tope propio de la llave.
- **CDC (C1, C8)**: un skill, un prompt, una plantilla, una clase nueva en `.claude/routing-modelos.json` o un gate
  nuevo son CDC. Preparas el diff, corres `npm run regresion` y dejas la entrada como propuesta **fuera** de la bitácora
  (nunca «pendiente» dentro). La firma la escribe el laboratorio. Los modelos van pineados; `latest` no.
- **La capa se consume, no se bifurca.** Nada de marca de Arbrain. Ágora no depende en ejecución del Arbrain personal ni
  lee el cerebro personal. Subir la versión de Arbrain que pinea la capa es CDC y no entra en este goal. Ningún
  adaptador de voz en la nube.
- **`service_role`** solo en migraciones, webhooks verificados y jobs de plataforma declarados (C7); las superficies de
  negocio no lo usan. RLS forzada en toda tabla.
- **Secretos**: jamás se imprime un valor de entorno; se confirma presencia enmascarada.
- **Git**: trabajas en un worktree y una rama nuevos, no en `main` (otra sesión puede estar escribiendo el árbol).
  Commits sí; el push y el PR los hace el laboratorio.
- **Docker**: no toques los contenedores de otros proyectos; el Postgres de pruebas es tuyo y efímero.

## RED DE SEGURIDAD

- Si una fase no cierra sus gates en 3 intentos, detente y reporta qué gate, qué falla y qué probaste.
- Si llegas a un checkpoint del laboratorio (firmas, CDC, apertura, merge), detente con todo listo y reporta.
- Si algo te pide decidir sobre dinero ajeno o datos de terceros y este spec no lo resuelve, no lo resuelvas por
  default: pregúntalo.

## AL TERMINAR: post-mortem al grafo

Cuando el goal converja o se detenga, el ciclo no cierra hasta el post-mortem: el retrospectivo del ejecutor
(fricciones, huecos, fallas, qué funcionó); cada hallazgo mapeado a un nodo, una arista o un lazo de este grafo; los
hallazgos vueltos gates, reglas o estados (se actualiza el JSON y el estado de cada lazo: gris → ámbar solo con
evidencia, ámbar → morado solo tras uso real), y lo que funcionó declarado intocable.
