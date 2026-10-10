# AISIA — Soporte SAP (v3)

> Fecha: 2026-10-09 · Estado: **firmada** por lisagomez el 2026-10-10 · Revisión: al
> conectar un LLM real, al exponer la sala o el canal N1–N2, al cablear la aplicación de una
> solución en un SAP real, al salir del laboratorio o tras un incidente.
>
> **v3** (PRP-010): la v2 prometía controles que el código no tenía. Dos revisiones contra el código
> (05/10 y 07/10) encontraron 32 hallazgos, y el PRP-010 los cerró en código o los dice aquí. Una tercera
> revisión, contra el borrador de esta v3 (09/10), encontró 18 más, nueve sobre infirmables; también están
> cerrados en código o dichos aquí. **Cada
> afirmación de §4 y §5 tiene su fila** en la matriz
> ([`soporte-sap-firmas-matriz.md`](../../docs/goals/soporte-sap-firmas-matriz.md)). Cada fila queda en uno de tres
> estados: **probado**, si una prueba pasa sin su sabotaje y cae con él; **brecha**, si está abierta
> y declarada; o **depende**, si espera una decisión del laboratorio. Plantilla:
> `.claude/gobernanza/plantillas/aisia.md`. Su hermano, el modelo de amenazas (C3 v4), está en
> `.claude/PRPs/PRP-008-soporte-sap.md`.
>
> **Revisión 1** (2026-10-10, PRP-011): el laboratorio decidió **D1 «con consentimiento»**, y la base, la app y el
> contrato ya lo cumplen. La fila de D1 pasa de «depende» a «probado». Cambian la §3, la §4 «Conocimiento cruzado» y
> la §5. Va firmada al pie, junto a la firma de la v3.

## 1. Partes afectadas

- **Las empresas atendidas (N3)**: sus incidencias, documentos y datos de operación pasan por un
  sistema que categoriza, propone y mide. Nunca hablaron con el laboratorio.
- **Las personas dentro de los N3**: empleados cuyos datos de RR. HH., nómina o usuario SAP aparecen
  en un ticket o en una captura. No son usuarios de nada y no firmaron nada.
- **Las contrapartes de un CFDI**: proveedores y clientes del N3, a veces personas físicas, cuyo RFC
  y montos viajan en el XML adjunto.
- **Las consultoras (N2)**: el cliente que paga. Su reputación frente a sus clientes depende de lo
  que el sistema proponga y de lo que su tablero afirme.
- **Los consultores**: sus horas y su desempeño quedan medidos. Su empleador, la consultora, es
  quien los juzga.
- **El laboratorio (N1)**: aprueba sobre la operación de terceros y acumula conocimiento que nace
  de sus datos.
- **Los terceros del despliegue**: reciben los datos de todos los anteriores, según se decida. Son
  el proveedor de modelo (D7), la base de datos gestionada (D10) y el proveedor del servidor y del
  respaldo fuera de sitio (D12). Hoy no hay ninguno: no hay modelo, y el laboratorio no se despliega.
- **Quien tiene root en el servidor**: en modo despacho, alguien de la consultora. Lee todo, la base
  entera incluida, y la RLS no lo impide (C3, «Root ajeno»).

## 2. Daños posibles SIN atacante

| Daño | Cómo ocurre operando «bien» |
|---|---|
| **Dato personal en el sandbox** | El anonimizador no reconoce una forma de dato y el caso entra al sandbox común. |
| **Secreto del N3 en el núcleo** | Anonimizar quita datos personales, no las transacciones Z, las sociedades ni la forma del negocio del N3; una regla común los revela a las demás consultoras. |
| **Prioridad mal asignada** | Una incidencia de nómina se categoriza P3 en vez de P1: se atiende a destiempo y los empleados se quedan sin pago. O un documento reenviado que dice «urgente» sube a P1 un caso cualquiera. |
| **Solución equivocada aprobada** | La matriz da una solución con grado alto para un caso parecido pero distinto, y el supervisor la valida. En el simulador, el daño es al simulador; en un SAP real sería un cambio de datos que **no** se revierte con un transporte. |
| **Fatiga del aprobador** | Tras muchos planes buenos, quien aprueba en la sala deja de leer y aprueba uno que no arregla nada, o que arregla otra cosa. |
| **Conocimiento de una consultora usado para otra** | Lo aprendido con los datos de A se vuelve regla común y beneficia a su competidora B sin que A ni su cliente lo sepan (D1). |
| **El laboratorio lee lo que no necesita** | Operando como se diseñó, el laboratorio lee el texto de lo escalado, y en él hay datos personales (D14). |
| **Reidentificación por grupo chico** | Un agregado por tamaño con un solo cliente (un S solo en su tamaño) le da al laboratorio las cifras de ese cliente. |
| **FODA o accionable que afirma de más** | El tablero del N3 dice una debilidad o un impacto en MXN con pocos datos, y la consultora lo presenta como un hecho. |
| **Proyección tomada por promesa** | Un impacto en MXN con supuestos del laboratorio se lee como un compromiso. |
| **SLA mal medido** | El reloj no pausa una espera del cliente, o cuenta horas fuera del calendario: la consultora paga créditos que no debía, o el N3 no recibe los que le tocaban. |
| **Primera respuesta automática** | Una acción de la máquina (anonimizar, mandar el plan a la sala) cuenta como respuesta al cliente: una P1 «cumple» sin que nadie le haya respondido. |
| **Pausa unilateral** | La consultora pausa el reloj («se le pidió un dato al cliente») sin que haya pasado, o no lo reanuda cuando el cliente contesta, y su plazo deja de correr. |
| **Resolución unilateral** | La consultora (o una máquina) da por resuelta una incidencia que no lo está, y el reloj se detiene. |
| **Incumplimiento borrado** | Se baja la prioridad después de vencer la meta, y el incumplimiento desaparece del resultado. |
| **La consultora altera la impugnación** | La consultora reescribe la queja del cliente, la borra, o la resuelve sin que quede quién ni cuándo. |
| **Consultor juzgado por una métrica** | MTTR o primera respuesta sin contexto castigan a quien toma los casos difíciles; el seudónimo no lo protege de su propio empleador. |
| **Corte por presupuesto** | Sin presupuesto del mes o al tope, el agente no llama al modelo y el triage de una consultora se detiene. |
| **P1 sin evidencia leída** | La captura de una P1 queda sin leer (por el tope de OCR del mes, porque la máquina no tiene motor de OCR o porque no cupieron todas sus páginas) y el caso se atiende sin su evidencia. |
| **Restauración que toca a los demás** | Para devolver a un tenant a su estado se restaura la base entera, y los demás regresan en el tiempo. |
| **Opacidad** | El N3 no sabe que el laboratorio lee lo que su consultora escala, ni que un agente categoriza sus tickets. |
| **Riesgo de baja como etiqueta** | La capa semántica marca «riesgo de baja» con una fórmula y un umbral supuestos (salud < 0.85); la consultora trata distinto a ese N3 (menos atención, otro precio) por un número que el N3 no ve ni puede discutir. |

## 3. Severidad × probabilidad × reversibilidad

| Daño | Severidad | Probabilidad | ¿Reversible? |
|---|---|---|---|
| Dato personal en el sandbox | **Alta** | Media | **No**: una vez leído no se des-lee |
| Secreto del N3 en el núcleo | Alta | Media | No |
| Prioridad mal asignada | Alta (pagos, operación) | Media | Parcial: el retraso ya ocurrió |
| Solución equivocada aprobada | Alta en un SAP real · baja en el simulador | Media | En el simulador, sí; en un SAP real, **no** |
| Fatiga del aprobador | Alta en un SAP real · baja en el simulador | **Alta**: es estadística, no malicia (O3) | Igual que la solución que deja pasar |
| Conocimiento cruzado entre consultoras | Media-alta | Baja: D1 decidida, y la base exige el consentimiento | No |
| El laboratorio lee lo que no necesita | Media | Alta (es el diseño) | No |
| Reidentificación por grupo chico | Media | Media mientras haya tamaños con un cliente | No |
| FODA o accionable que afirma de más | Media | Media | Sí, si cada punto cita su dato y su confianza |
| Proyección tomada por promesa | Media | Alta | Sí |
| SLA mal medido | Media (dinero) | Baja-media | Sí, si fecha y actor de cada evento los da la base |
| Primera respuesta automática | Media (dinero) | Alta si la máquina marca | Sí, si la marca es un evento de una persona |
| Pausa unilateral | Media (dinero) | Media | Sí, si lo pedido queda escrito y el cliente reanuda el reloj él mismo |
| Resolución unilateral | Media (dinero) | Media | Sí, si resolver es de una persona y el cliente lo puede impugnar |
| Incumplimiento borrado | Media (dinero) | Media | Sí, si el incumplimiento ya ocurrido se queda |
| La consultora altera la impugnación | Media | Baja | No, si la queja original se pierde |
| Consultor juzgado por una métrica | Media | Media | Sí |
| Corte por presupuesto | Alta para un P1 | Media sin control | **No** para el P1 que esperó: por eso P1 y P2 nunca se cortan |
| P1 sin evidencia leída | Alta | Baja | Parcial: el retraso ya ocurrió |
| Restauración que toca a los demás | Alta | Baja con export por tenant | No, si se restaura la base entera |
| Opacidad | Media | Alta | Sí |
| Riesgo de baja como etiqueta | Media | Media | Sí, si la fórmula y el umbral se ven junto al número |

## 4. Mitigaciones

Lo que hace el código hoy. Cada punto tiene sus filas en la matriz.

- **Dato personal**:
  - **No es «cero fugas»**, y esta AISIA no lo promete. El anonimizador reduce el riesgo, y lo que no
    resuelve con certeza va a cuarentena.
  - **La medida honesta** fue un banco de control que escribió, sin ver el detector, alguien que no lo
    había escrito. Antes del arreglo encontró **3 fugas de 30**; hoy da 0, pero ya no mide: lo leyó quien
    escribió el arreglo. Queda como límite declarado un nombre en minúsculas, sin contexto y fuera de la
    lista de nombres comunes.
  - **Dos cerrojos que no dependen del anonimizador**:
    - la cuarentena guarda solo tipos de señal, y la base lo exige;
    - la base rechaza en el sandbox un identificador con forma (correo, RFC, CURP, NSS, CLABE,
      teléfono), aunque lo escriba el agente. Mira las mismas formas que el anonimizador, sobre el
      texto normalizado (un dígito o una arroba de ancho completo cuentan como tales), y una prueba
      comprueba que los dos cerrojos no se contradicen.
  - **Al bucket del sandbox nadie sube objetos**: el sandbox es solo texto, y una imagen no la revisa
    ningún cerrojo.
  - **Todo caso de RR. HH. o nómina va a cuarentena.** La cuarentena es **definitiva** y nadie la
    revisa hasta D14 (DP-7): falla seguro, porque el caso no entra al sandbox. Tampoco frena la
    atención: el caso sigue con su consultora y su reloj de SLA.
  - **Salir del laboratorio** exige medir el anonimizador sobre un corpus real con consentimiento (D9).
- **Secreto del N3**:
  - Lo que enseña el experto queda **a medida** de la consultora del caso, anonimizado.
  - Al núcleo solo lo sube el superadministrador, **generalizado**. `generaliza` quita los objetos
    propios, la estructura del cliente y los nombres de la consultora y del cliente; ayuda, pero no
    garantiza.
  - Los dos controles son la firma del superadministrador a su nombre y la base, que rechaza lo que
    llegue sin generalizar. Además, una propuesta no cambia de consultora, de alcance ni de contenido:
    lo único que cambia de dueña es la promoción al núcleo, y la hace el superadministrador. La base sola no basta: conoce los nombres de las organizaciones, no la
    marca ni las siglas de un cliente.
- **Prioridad**:
  - **La regla de prioridad** es determinista y visible (ITIL), y la urgencia y el impacto salen de
    lo que declara el cliente: un documento no sube la prioridad.
  - **El piso de nómina** vive en la base, con un solo vocabulario: un ticket con señales de nómina
    o RR. HH. no baja de P2 sin que una persona lo baje.
  - **La prioridad que mide el SLA es la que fijó la base**: la prioridad inicial la pone la
    categorización del agente, que es una y dice la prioridad de la incidencia (con su piso). Una
    persona no emite eventos de la máquina, y el impacto y la urgencia que declaró el cliente no se
    reescriben.
  - **Cambiar la prioridad**, una vez fijada, es un evento de una persona, con su motivo, y queda en la
    cadena.
  - **El N3 la puede impugnar**, en la app y en la base.
- **Solución equivocada**:
  - El veredicto lo da el motor determinista con su fuente.
  - El supervisor no es el ejecutor.
  - El humano ve el antes y el después en el simulador.
  - Se ejecuta **exactamente lo aprobado**: la huella se recalcula sobre lo que va a correr. La
    aplicación en un SAP real **no está cableada** (D6), así que el producto no la ofrece.
- **Fatiga del aprobador** (brecha): no la cierra una política. La mitigan el veredicto del
  supervisor y el antes y el después en el mismo mensaje, y que lo aprobado y lo ejecutado tengan la
  misma huella. Mientras no haya SAP real, su daño es al simulador.
- **Conocimiento cruzado**:
  - Aislado por consultora por defecto: lo enseñado queda a medida.
  - Al núcleo solo pasa lo que sube el superadministrador, generalizado.
  - El registro FDE dice qué fue a medida y qué al núcleo.
  - **D1, decidida (con consentimiento)**: al núcleo común solo sube con el consentimiento vigente de
    **la consultora y del cliente de origen**. Lo da una persona de cada organización, a su nombre, para la
    versión vigente de su contrato, y la base lo exige al promover.
  - El origen de cada enseñanza se guarda aparte: una entrada del núcleo no dice de dónde vino. El agente
    no propone directo al núcleo.
  - Revocar frena lo que no ha subido; lo ya subido, generalizado, se queda. El contrato lo dice (§12).
- **Lo que lee el laboratorio**:
  - Solo lo que **la consultora escala, a su nombre** (DP-3): el agente no escala. En la app, el plan
    verificado espera a la consultora, y a la sala del laboratorio llega solo si ella lo escala.
  - Lo leído de un original (el RFC y el total de un CFDI) va con el original: el laboratorio lo lee en
    lo escalado y con el acceso motivado vigente.
  - La cuarentena no la lee el laboratorio: nadie la revisa (DP-7).
  - Los originales, con un acceso que **otorga la consultora** por 72 h como máximo. La fecha la pone
    la base, se puede revocar, y nadie se lo otorga a sí mismo.
  - D14 decide qué más ve el superadministrador.
- **Reidentificación por grupo chico** (depende de D14): el corte no aplica todavía un tamaño
  mínimo de grupo. El contrato le dice al N3 que el laboratorio ve agregados de operación.
- **FODA, accionables y proyecciones**:
  - Cada punto cita su métrica del corte semántico.
  - Cada punto y cada accionable llevan **la confianza del volumen del cliente**; con pocos datos,
    baja.
  - Cada impacto muestra su fórmula, sus supuestos y su rango, y la pantalla dice que una proyección
    no es una promesa.
- **SLA**:
  - La fecha y el actor de cada evento los da la base, y la cadena la calcula la base.
  - El resultado lo calcula un job desde los eventos, con la misma función que la app. Sin contrato
    válido no inventa nada. El resultado no es la evidencia: la evidencia es la cadena, y cualquiera
    lo recalcula desde ella. La base no ata el resultado a los eventos (brecha del C3).
  - Las cifras del contrato las decide el laboratorio (D13).
  - **En modo despacho** la base vive en el servidor de la consultora, y quien tiene root puede
    reescribir la cadena: ahí la medición **no es evidencia independiente**, y el contrato lo dice.
- **Primera respuesta automática**: la primera respuesta es **un mensaje de una persona al
  cliente** (DP-4). Ni la base ni la app la marcan por una acción de la máquina, la base exige su
  texto, y el cliente lo lee.
- **Resolución unilateral**: resolver es un acto de una persona de la consultora; ni el agente, ni el
  cliente, ni el laboratorio lo emiten. Aplicar un plan en el simulador no resuelve. El cliente puede
  impugnar la resolución.
- **Incumplimiento borrado**: un incumplimiento que ocurrió con la prioridad anterior se queda,
  aunque la prioridad cambie después. Un cambio de prioridad tiene que cambiarla.
- **Pausa unilateral**:
  - Pausar el reloj es un evento de una persona de la consultora, y **dice qué se le pide al
    cliente**: sin eso, ni la base ni la app lo aceptan.
  - **El cliente lo ve y reanuda el reloj él mismo** al responder, sin depender de su consultora. El
    agente no lo reanuda.
  - El cliente puede impugnar la pausa. La impugnación la resuelve la misma consultora: lo que protege
    al cliente es que lo pedido y la pausa quedan en la cadena, y su queja en la base, con actor y fecha
    de la base, sin que nadie la reescriba ni la borre.
- **La consultora altera la impugnación**: no reescribe la queja (los permisos son por columna), la
  resuelve a su nombre con fecha de la base, y una impugnación resuelta no se reabre. Ningún rol de la
  API la borra. En la app, impugnar y resolver quedan además en la cadena.
- **Consultores**:
  - El producto **no ofrece** una vista de desempeño individual. Cada consultor ve sus horas, no las
    de sus colegas; los totales salen de la capa semántica, sin persona.
  - El seudónimo lleva sal, en la base y en el importador.
  - La capa semántica no lee nombres de consultores (privilegios por columna).
  - Las métricas por categoría y complejidad **no existen todavía**: no se prometen.
  - *Brecha*: la cadena dice qué consultor respondió y resolvió cada incidencia, y cuándo. Con ella,
    un colega o su empleador pueden reconstruir tiempos por persona.
- **Corte por presupuesto**:
  - El tope sale de la base por mes, y lo gastado, de la cadena; sin tope, nada llama al modelo.
  - El enjambre no prepara un plan sin el visto bueno del presupuesto.
  - Lo gastado no lo puede inflar una persona: los eventos que gastan son del agente.
  - **P1 y P2 nunca se cortan**: al tope pasan a una persona en el momento. P3 y P4 esperan. El
    aviso queda en la cadena y a la vista del consultor y del superadministrador.
- **P1 sin evidencia leída**: un P1 o un P2 con evidencia sin leer, entera o en parte y por cualquier
  causa, pasa a una persona en el momento, y se dice.
- **Restauración**:
  - Export y restauración **por tenant**, con el export firmado.
  - Se verifican el tenant de cada fila y las huellas, la suya y la de cada otra consultora, **antes
    del commit**.
  - La restauración corre con el privilegio de migración (declarado en C7).
  - Los bytes de Storage van por su línea de respaldo.
  - La retención no existe todavía (D8).
- **Opacidad**:
  - El contrato N2–N3 dice que un agente categoriza y que el laboratorio ve lo que la consultora le
    escala.
  - **El contrato todavía no exige el aviso de privacidad** hacia los empleados del N3: es redacción
    legal pendiente. Como el daño es de terceros, no queda como brecha: sin ese aviso, el producto no
    opera con datos reales.
- **Riesgo de baja**:
  - Es un aviso para la consultora, no una decisión. La pantalla muestra la fórmula y el umbral
    (supuestos del laboratorio) junto al número.
  - El producto no lo conecta con el precio ni con la prioridad.
  - **El N3 no lo ve ni lo puede discutir.** Eso no lo arregla esta AISIA: mostrárselo es una
    decisión de producto.

## 5. Decisión

**Mitigar** y operar **solo en laboratorio**.

Hay riesgos que **ninguna firma autoriza**, porque el daño cae sobre quien no firmó (límite de C5).
Para esos, firmar esta AISIA no basta: o un control los cierra, o el producto no los ofrece. Así
quedan hoy:

| Riesgo infirmable | Cómo queda |
|---|---|
| El dato personal de los empleados y de las contrapartes | Lo **reducen** los controles probados: anonimizador, cuarentena y el cerrojo de la base, que miran las mismas formas. No son cero fugas: **el producto no sale del laboratorio** sin medir el anonimizador sobre un corpus real (D9). |
| El aviso de privacidad hacia los empleados del N3 | Es redacción legal pendiente: sin él, **el producto no opera con datos reales**. |
| El secreto del N3 en el núcleo | A medida por defecto. Al núcleo, generalizado y firmado por el superadministrador, y la base lo exige. |
| La prioridad de una incidencia de nómina | El piso en la base, sin depender del categorizador, y la prioridad que mide el SLA es la que fijó la base. |
| El SLA, que es dinero entre la consultora y su cliente | Fechas y actor de la base, primera respuesta de una persona, resultado desde los eventos, y pausa que dice qué pide y que el cliente reanuda él mismo. En modo despacho, la medición **no se ofrece** como evidencia independiente (el contrato lo dice). |
| La impugnación del cliente | La base: la queja no se reescribe ni se borra, y la resuelta no se reabre. |
| La resolución y el incumplimiento | Resolver es de una persona de la consultora, y el cliente lo impugna. Un incumplimiento ya ocurrido se queda aunque cambie la prioridad. |
| Lo que lee el laboratorio | Lo que la consultora escala, también en la app, y lo leído de un original con el acceso motivado. |
| El triage urgente cortado por presupuesto, o sin su evidencia | P1 y P2 pasan a una persona; nunca se cortan. |
| La restauración que toca a otros tenants | Por tenant, verificada antes del commit. |
| Una solución mal aplicada en el SAP de un N3 | **No se ofrece**: no hay SAP real cableado (D6). |
| El conocimiento de una consultora usado para otra | A medida por defecto. Al núcleo común, solo generalizado y con el consentimiento vigente de la consultora y del cliente de origen (D1): la base lo exige. |

Para salir del laboratorio hacen falta:

- D3, D6, D7, D8, D10, D12, D13 y D14 decididas (D1 ya lo está);
- la redacción legal del §12 del contrato (conocimiento común) y quién puede consentir en cada organización;
- el anonimizador medido sobre un corpus real con consentimiento (D9);
- el tope de memoria del lector de PDF (PRP-010 H-22), cerrado;
- el aviso de privacidad hacia los empleados del N3, redactado y exigido en el contrato;
- los veredictos, desde `tools/conocimiento` y con su firma (H-20);
- GATE 3 cerrado en la máquina donde corra, si el laboratorio opera el servicio (D3): la ficha de
  servidor no dice «apto» sin él;
- el C3 y esta AISIA firmados.

Firmada por: lisagomez  Rol: responsable del proyecto  Fecha: 2026-10-10

Revisión 1 (D1), firmada por: lisagomez  Rol: responsable del proyecto  Fecha: 2026-10-10
