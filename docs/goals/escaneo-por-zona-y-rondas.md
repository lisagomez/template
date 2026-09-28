# Escaneo por zona, rondas diarias y conteo cíclico — Spec

> Compilado con `/goal-compiler` el 2026-09-27. Forma: **LOOP**. Zonas, roles, rondas y conteo son
> una misma app con una sola línea de meta; si se juntan en un solo agente no se pierde nada.
> Se construye ENCIMA de lo que ya existe: `tools/etiquetas-gs1/`, `/etiquetas/*`,
> `docs/SDD-etiquetas-gs1.md` (§9 zonas, §10 expediente y conteo, §11 recepción con foto).
> **Decidido por el laboratorio: cuenta el ALMACENISTA a ciegas; el SUPERVISOR abre, concilia y
> autoriza.** Nadie autoriza lo que contó. Consecuencia: el almacenista **nunca ve cantidades del
> sistema**. Para su trabajo le basta el lote, dónde está y su semáforo.

## Lo que hay hoy (hechos, no suposiciones)

- **Una pantalla por tarea**, cada una con su cámara o su pistola: `/leer` (qué es, semáforo),
  `/recibir` (recepción con foto de la caducidad), `/mover` (recibo → almacén → piso → merma),
  `/conteo` (conteo ciego), `/caducidades` (tablero), `/riesgo` (agente), `/expediente`.
  La persona tiene que saber a qué pantalla ir.
- **Etiquetas de ubicación GS1-128** ya impresas por zona: (414) GLN del sitio + (254) `RECIBO`,
  `ALMACEN`, `PISO` y `MERMA`, o rack-nivel-posición (`ALMACEN-B-04-2`). `leeUbicacion` las lee.
  Hoy solo `/mover` y `/conteo` usan la zona como contexto.
- **Roles por código del dispositivo**, que decide el servidor:
  - `ETIQUETAS_TOKEN` = operación (todo);
  - `ETIQUETAS_TOKEN_CONTEO` = solo cuenta y no recibe ninguna cantidad.

  El nombre se declara al emparejar y va a la cadena como seudónimo. La identidad es débil
  (riesgo 18 del SDD).
- **Conteo ciego**:
  - abre quien supervisa, y exige la integridad del sitio;
  - toma un punto de corte en la cadena;
  - el reconteo lo hace otra persona;
  - la conciliación por lote y zona la autoriza alguien que no contó;
  - se aplica como eventos `CONTEO`;
  - un faltante que se repite en la misma ubicación abre un incidente.
- **Agente de riesgo** (diario, determinista): días de inventario contra días vendibles.
  Recomienda transferir, promover o exhibir; una persona ejecuta o descarta, y queda en la cadena.
- **Semáforo de cinco colores con su acción**. El rojo bloquea la venta normal; liquidar o donar
  exige quién lo autoriza.
- **Tablero de caducidades**: esta semana, este mes, retirar del anaquel y resurtido FEFO.
- **Recepción con foto**: `EN_REVISION` → confirma quien registró → `RECIBIDO`. Lo pendiente no
  se mueve ni se vende. Motor local RapidOCR (lee el recorte de la guía, ~1-6 s en CPU). La cámara
  exige https.
- **En piso la pieza suelta ya no trae la etiqueta de la caja** (SDD §9: «al abrir la caja en piso,
  su etiqueta ya no identifica cada pieza»). Solo tiene el EAN del proveedor y su fecha impresa.

## MISION

Cuando termines, un día normal en un CEDIS o una sucursal se opera con el celular **sin navegar
menús**. La persona abre «Escanear», dice dónde está (escaneando la etiqueta de la zona) y a partir
de ahí cada escaneo o foto hace lo correcto para esa zona y para su rol. El control de caducidades
deja de ser una revisión aparte: **se hace solo, dentro del trabajo de todos los días**.

### 1. Escanear por zona: un gesto, la acción correcta

- **Contexto por ubicación**:
  - la persona escanea la etiqueta de la zona o del rack, o la toca en pantalla si no hay etiqueta;
  - la app lo recuerda hasta que cambie de zona, o hasta un tiempo sin actividad que tú propongas;
  - la zona actual se ve siempre, grande.
- **Cada escaneo hace la acción de su zona**, según el rol:
  - **Recibo** → registrar la entrada. Si el código trae (17)(10) (GS1-128, DataMatrix o Digital
    Link), directo; si no, la recepción con foto que ya existe (propuesta → confirma quien
    registró).
  - **Almacén** → qué es y qué hago:
    - el lote, su semáforo y su rack;
    - si hay un lote del mismo artículo que vence antes, «baja primero ése» (FEFO);
    - escanear la etiqueta de un rack ubica; mover a piso con un escaneo.
  - **Piso de venta** → ¿se puede vender? El color a pantalla completa, con la acción de su color:
    - amarillo: prioridad;
    - naranja: promoción;
    - rojo: retirar (liquidar o donar exige quién autoriza);
    - vencido: merma.

    Retirar es un escaneo, no un formulario.
  - **Merma** → registrar la baja con su motivo.
- **La pieza suelta en piso**:
  - la pieza trae solo el EAN del proveedor; con la foto de su fecha (el motor local que ya existe)
    se **identifica el lote**, comparando fecha y lote leídos con los lotes de ese artículo en ese
    sitio;
  - si no cuadra con ningún lote conocido, es un **hallazgo** que se registra (mercancía que no
    entró por recepción, o un lote mal capturado), no un error que se ignora.
- **Rápido y a ciegas**:
  - lectura continua (varios escaneos seguidos);
  - la respuesta llega con color a pantalla completa, vibración y sonido, para no tener que leer;
  - un contador de la sesión;
  - «deshacer el último», que es una `CORRECCION`, no un borrado.
- **Lo que no se puede, no aparece**: el servidor decide qué acción corresponde a ese rol en esa
  zona. La pantalla es una ayuda, no la frontera.

### 2. Rondas diarias: la lista de lo que hay que hacer hoy

- **Cada mañana**, por sitio y por zona, se arma la ronda del día con lo que ya sabe el sistema:
  - retirar del anaquel (rojo, vencido, venciendo en piso);
  - resurtir en orden FEFO;
  - promover (naranja, recomendaciones del agente);
  - confirmar lo pendiente de la bandeja;
  - ubicar lo que lleva más de X horas en recibo;
  - las ubicaciones que tocan de conteo cíclico (§3).
- **Ordenada por el recorrido** (rack a rack), no por tipo de tarea.
- **Una tarea se cierra con el escaneo que la prueba** (el lote correcto en la ubicación correcta),
  no con un «hecho». El cierre queda como evento en la cadena, con su seudónimo.
- **El supervisor ve el avance**: porcentaje por zona y lo atrasado. Lo que se atrasa más de lo que
  tú propongas escala al supervisor.
- Si una tarea ya no aplica (el lote se vendió), se cierra sola con su motivo.

### 3. Conteo cíclico por riesgo (decisión del laboratorio: cuenta el almacenista)

- **Pocas ubicaciones al día, no el inventario entero**, elegidas por riesgo:
  - caducidad cercana;
  - diferencias en conteos anteriores (el patrón que hoy abre incidentes);
  - valor;
  - días desde el último conteo.

  La regla es determinista y se explica: por qué se eligió cada ubicación.
- **El almacenista cuenta a ciegas dentro de su ronda**:
  - la sesión la abre el supervisor, con el punto de corte y la integridad que ya existen;
  - el almacenista lee la etiqueta de la ubicación y las cajas, sin ver lo esperado;
  - lo que sale de la tolerancia lo recuenta **otra persona**.
- **El supervisor concilia y autoriza**; nadie autoriza lo que contó. Los ajustes entran como
  `CONTEO`, como hoy.
- **Lo que hace que el conteo sea ciego**: la vista del almacenista, en TODAS sus pantallas, no
  trae cantidades del sistema (ni existencias, ni cajas por lote, ni lo esperado). Lo exige el
  servidor por rol, no la pantalla.

### 4. Roles que se notan en el trabajo

- Roles por código del dispositivo, como hoy, y los decide el servidor:
  - **recibo**: recibir y confirmar;
  - **almacenista**: ronda, ubicar, mover, piso, merma y contar a ciegas, sin cantidades;
  - **supervisor**: todo; abre y concilia conteos, autoriza, ve el tablero del día.

  El dispositivo solo-conteo y el de operación siguen existiendo.
- Cada rol entra directo a «Escanear» y a su ronda; los menús que no usa no aparecen.

### 5. El tablero del supervisor: el día en una pantalla

En una sola pantalla:

- el avance de las rondas;
- los pendientes por confirmar con su antigüedad;
- los lotes que entraron hoy a rojo;
- los conteos por conciliar y sus diferencias;
- los hallazgos de piso;
- las recomendaciones del agente sin decidir.

Cada renglón lleva al lugar donde se resuelve.

### 6. El andén y el piso sin señal

Al horizonte, un escaneo o una foto no se pierde por falta de señal: se encola, se ve qué falta de
subir, y al volver la señal se sincroniza en orden, respetando la cadena (el servidor decide y
rechaza lo que ya no aplique, y se dice). Si no cabe con calidad, dilo en el reporte.

### 7. Avisos

Al supervisor le llegan dentro de la app:

- las tareas atrasadas;
- los pendientes viejos;
- los lotes que entran a rojo;
- los hallazgos.

Un aviso fuera de la app (web push) pasa por servidores ajenos: solo con contenido sin datos del
negocio y como decisión aparte (C4).

### 8. ERP (propuesta, no aplicada)

Extiende `tools/etiquetas-gs1/migraciones/propuesta-pack-etiquetas.sql`:

- rondas y tareas, con su cierre por evento;
- roles;
- lo que haga falta para el conteo cíclico.

Todo con `cliente_id` y RLS; lo que es traza, solo-agregar. Se valida en el Postgres efímero con
casos nuevos y **no se aplica**.

## LIBERTAD TECNICA

Tú eliges:

- cómo se guarda el contexto de zona;
- cómo se generan y ordenan las rondas;
- la regla de riesgo del conteo;
- la UI de «Escanear»;
- la cola sin señal;
- cómo se reparten los roles.

Lo que nombra este spec (etiquetas (414)(254), `leeUbicacion`, el motor local) es contexto que ya
existe, no receta. Optimiza por menos toques y menos pantallas en la operación real, no por el
camino más corto.

## INVESTIGA ANTES DE CONSTRUIR

- 2-3 WMS o sistemas de tienda serios con operación guiada por escaneo:
  - tareas dirigidas;
  - conteo cíclico por ABC o por riesgo;
  - retiro por caducidad.

  Mira cómo reducen toques y cómo separan contar de autorizar.
- Buenas prácticas de UX de escaneo continuo en celular: retroalimentación háptica y sonora,
  pantalla completa por estado, uso con una mano.
- Offline-first en navegador (Service Worker, IndexedDB) y cómo se reconcilia contra un servidor
  que es la frontera.
- Next.js 16 cambió: lee la guía relevante en `node_modules/next/dist/docs/` antes de escribir
  código de Next.
- Reafirma el objetivo en una línea antes de cada edición grande.

## DEFINICION DE HECHO (evidencia visible en la conversación)

- **Pruebas en verde, pegadas**, que incluyan:
  - la acción de cada zona (recibo, almacén, piso, merma) según el rol, con el servidor rechazando
    lo que no toca;
  - la respuesta al almacenista **sin ninguna cantidad del sistema** en ninguna acción ni lectura;
  - la ronda del día generada del estado (determinista), en orden de recorrido;
  - una tarea que solo se cierra con el escaneo correcto, con su evento en la cadena;
  - una tarea que ya no aplica y se cierra sola;
  - la selección del conteo cíclico por riesgo, con su explicación;
  - el conteo del almacenista ciego, el reconteo por otra persona, y la autorización del supervisor
    (y nadie autoriza lo que contó);
  - la pieza suelta identificada por foto, y el hallazgo cuando no cuadra;
  - la cadena y el anclaje verificando.
- **Medición de agilidad**: toques y pantallas por tarea ANTES (las pantallas de hoy) y DESPUÉS
  («Escanear» por zona), para recibir, retirar de piso, resurtir FEFO y contar, medidos con
  Playwright en celular. Una tabla.
- **Playwright** (escritorio y celular, con cámara falsa), capturas pegadas de:
  - escanear la zona de recibo y recibir con un escaneo;
  - almacén: lote, semáforo, rack y «baja primero ése», sin cantidades;
  - piso: un lote en rojo retirado con un escaneo;
  - la ronda del día cerrándose por escaneos (antes y después);
  - el conteo cíclico del almacenista (ciego), y el supervisor conciliando y autorizando;
  - el tablero del día del supervisor;
  - una pieza suelta identificada por la foto de su fecha, y un hallazgo;
  - un escaneo sin señal que se sincroniza al volver.
- **Propuesta ERP** validada en Postgres efímero, **no aplicada**.
- Último output del comando de validación, en verde.
- Reporte de decisiones y lista de formas en que esto podría estar mal o incompleto, cada una con
  lo que se hizo.

## COMANDO DE VALIDACION

`npm run validate` (el gate completo, ya incluye `prueba:etiquetas`). Tras el build,
`npm run capturas:etiquetas`. Al tocar la propuesta ERP,
`bash tools/etiquetas-gs1/migraciones/prueba-efimera.sh`. Córrelos tras cada cambio grande y
pega el output. El motor local para las capturas: `bash tools/etiquetas-gs1/motores/instala-rapidocr.sh .datos/motores/rapidocr`.

## RESTRICCIONES REALES

- **Extiende lo que existe**. Rama propia desde `foto-caducidad` (sin mergear), sin merge.
- **El servidor es la frontera**: el rol lo decide el código del dispositivo, nunca el navegador.
- **El almacenista nunca recibe cantidades del sistema** (decisión del laboratorio).
- **Nadie autoriza lo que contó**, y el reconteo es de otra persona.
- **Ninguna caducidad cuenta sin confirmación humana** (hereda de la recepción con foto).
- **Cadena solo-agregar con seudónimos**: deshacer = `CORRECCION`, cerrar una tarea = un evento.
- **Lectura local**: ningún motor externo. Un aviso fuera de la app va sin datos del negocio y como
  decisión aparte (C4).
- **Solo datos ficticios** (prefijo 952). La BD compartida no se toca; el ERP es propuesta validada
  en efímero.
- Dependencias nuevas con **versión exacta**.
- No toques skills, prompts, `settings.json`, `.mcp.json` ni `AGENTS.md` (sería CDC, C1). Ningún
  secreto se imprime.
