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
>
> **Revisión 2** (2026-10-10): el laboratorio decidió **D3 «mixto»**. Hasta GATE 3, la consultora opera su N2 (la
> atención y el SLA con su cliente) y el laboratorio opera solo el N1 (sala, sandbox y núcleo), sin comprometer
> disponibilidad. Cambia la §5. Va firmada al pie.
>
> **Revisión 3** (2026-10-10): el laboratorio decidió **D6 «fuera del producto»**. El producto no se conecta a
> ningún SAP ni guarda sus credenciales. Llevar una solución al SAP del N3 lo hace una persona de la consultora o del
> N3, con su propio acceso y bajo el control de cambios del N3, y la pantalla y el contrato (§13) lo dicen. Cambian
> la §4 «Solución equivocada» y «Fatiga del aprobador», y la §5. Va firmada al pie.
>
> **Revisión 4** (2026-10-10): el laboratorio decidió **D7 «externo solo anonimizado»**. Lo crudo (ticket, chat,
> documentos y adjuntos) nunca va a un proveedor externo de modelos, tampoco con pesos abiertos: solo a un modelo
> autohospedado. Lo anonimizado y lo generalizado pueden ir a uno externo con su decisión C4. Entra el daño «Dato del
> cliente en un proveedor de modelo» (§2 y §3), y cambian la §1, la §4 y la §5. Va firmada al pie.
>
> **Revisión 5** (2026-10-11, PRP-012): el laboratorio decidió **D8**. Mientras dura el contrato, los originales se
> borran N días después de la última resolución, nunca con una impugnación abierta, y la incidencia, su cadena y los
> campos revisados se quedan. Al salir, una persona registra la baja, lo del cliente se congela, se genera su export
> firmado y, tras la gracia, se borra. En los respaldos el borrado llega cuando vence el bloqueo (365 días como
> máximo, fuera del archivo legal), y una restauración nunca devuelve lo borrado. N y la gracia los decide el
> laboratorio con su asesoría legal (DP-4): sin ellos no se borra nada. Entra el daño «Dato que vive de más o que
> vuelve» (§2 y §3); cambian la §1, la §4 «Restauración» y la §5, y entra la §4 «Retención y salida». Va firmada al
> pie.
>
> **Revisión 6** (2026-10-11): el laboratorio decidió **D10**. En el modo gestionado, la base y los archivos viven en
> un proyecto de Supabase propio del producto, plan Pro con PITR, en Virginia (Estados Unidos): Supabase no tiene
> región en México. Quien exija que sus datos se queden en México va por el modo despacho, con Supabase autohospedado
> en la máquina de su consultora. Entra el daño «Dato fuera de México» (§2 y §3), y cambian la §1, la §4
> «Restauración», la §4 «Dónde viven los datos» (nueva) y la §5. Va firmada al pie.
>
> **Revisión 7** (2026-10-11): el laboratorio decidió **D12**. El servidor del modo gestionado es de AWS, en
> `us-east-1`, la misma nube y región que la base. El respaldo inmutable fuera de sitio va a Backblaze B2 US East
> (Reston, Virginia), otra empresa, cifrado antes de salir y con Object Lock en modo compliance dentro del tope de D8.
> Cambian la §1, la §4 «Dónde viven los datos», los pendientes que esperaban a D12 y la §5. Va firmada al pie.
>
> **Revisión 8** (2026-10-11): el laboratorio decidió **D13 y D14**. En el contrato N1–N2 el laboratorio solo
> compromete su respuesta a lo que la consultora le escala, de la escalada a su primera decisión en la sala; la cifra,
> hasta GATE 3. El superadministrador ve lo mínimo de hoy, la cuarentena es definitiva y nadie la revisa, y un agregado
> solo se le muestra si su grupo tiene 3 clientes o más, sin poder despejar un grupo chico restando del total. Cambian
> la §2, la §3, la §4 «Dato personal», «Lo que lee el laboratorio», «Reidentificación por grupo chico» y «SLA», y la
> §5. Va firmada al pie.
>
> **Revisión 9** (2026-10-11): **H-22 cerrado y el candado de H-20**. El lector de PDF tiene un tope de inflado por
> documento (32 MiB, sacado de la memoria de la máquina porque no hay corpus real con que medirlo): lo que lo pasa no
> se lee, no va al motor y cuenta como evidencia sin leer. Con incidencias reales, los veredictos solo pueden salir de
> `tools/conocimiento` en su versión exacta y registrada, y la matriz sintética no pasa; las reglas reales entran con
> la primera incidencia real, firmadas. Cambian la §4 «P1 sin evidencia leída» y la §5. Va firmada al pie.
>
> **Revisión 10** (2026-10-11): **la vitrina en Vercel y su sección en vivo**. Una vitrina de laboratorio, con datos
> sintéticos, vive en Vercel y solo la abre quien el laboratorio invite. Su sección en vivo pasa al laboratorio que corre
> en la máquina del laboratorio, por un túnel en el que cada petición va firmada; el laboratorio no se despliega. Entra
> un daño nuevo, «Dato real en la sección en vivo»: un invitado podría escribir ahí datos reales. Cambian la §1, la §2,
> la §3, la §4 y la §5, y el C3 gana el control «La vitrina y la sección en vivo». Va firmada al pie, con el C3.

## 1. Partes afectadas

- **Las empresas atendidas (N3)**: sus incidencias, documentos y datos de operación pasan por un
  sistema que categoriza, propone y mide. Nunca hablaron con el laboratorio. Cuando se van, se llevan su export, y lo
  suyo se borra (D8).
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
  el proveedor de modelo (D7), la base de datos gestionada (D10: Supabase, en Virginia, Estados Unidos), el
  proveedor del servidor (D12: AWS, en la misma región) y el del respaldo fuera de sitio (D12: Backblaze B2, US East,
  que recibe las copias cifradas). Hoy ninguno recibe datos de los N3: no hay modelo, y el producto no se despliega. La
  vitrina de laboratorio sí: Vercel la sirve con datos sintéticos y ve el tráfico de su sección en vivo, que también
  es sintético; el túnel recomendado no lo descifra (revisión 10). Al
  proveedor de modelo, por D7, nunca le llega lo crudo.
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
| **El laboratorio lee lo que no necesita** | Operando como se diseñó, el laboratorio lee el texto de lo escalado, y en él hay datos personales (D14 lo deja en lo que la consultora escala). |
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
| **Dato del cliente en un proveedor de modelo** | Para categorizar, resumir o extraer parámetros, el texto de un ticket, del chat o de un documento (con datos de empleados del N3 o secretos de su negocio) se manda a un proveedor de modelos, que lo conserva o entrena con él. Pesos abiertos en un proveedor ajeno no cambian nada: el dato sale igual. |
| **Dato fuera de México** | En el modo gestionado, la base y los archivos de los N3 viven en un proveedor de Estados Unidos. Los datos de sus empleados y de sus contrapartes quedan bajo otra jurisdicción, y el N3 puede no saberlo, o estar obligado a guardarlos en México. |
| **Dato real en la sección en vivo** | La vitrina tiene una sección en vivo para invitados, con datos sintéticos. Un invitado, una consultora que lo evalúa, escribe ahí el ticket real de un cliente suyo, con nombres o identificadores de sus empleados: llega a la máquina del laboratorio, lo ven los demás invitados, y pasa por Vercel. |
| **Dato que vive de más o que vuelve** | Las capturas y los CFDI de un N3, con datos de sus empleados y de sus contrapartes, se guardan para siempre; el N3 se va y lo suyo se queda; se borra del servicio y sigue en una copia de respaldo; o una restauración devuelve lo que ya se había borrado. Y al revés: el borrado automático se lleva algo antes de tiempo, con una impugnación abierta o antes de que quien se va tenga su export. |

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
| Reidentificación por grupo chico | Media | Baja con D14: el laboratorio solo ve grupos de 3 clientes o más, y no puede despejar uno chico restando | No |
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
| Dato del cliente en un proveedor de modelo | **Alta** | Baja: hoy no hay modelo, y para lo crudo la política lo prohíbe | **No**: lo que sale no se recupera |
| Dato fuera de México | Media-alta (datos de terceros, otra jurisdicción) | **Alta** en el modo gestionado: es el diseño | Parcial: el N3 puede pasar al modo despacho y borrarse del proveedor (D8), pero lo que ya estuvo fuera estuvo |
| Dato que vive de más o que vuelve | **Alta** (datos de terceros) | Baja con D8: la base decide qué vence, y sin plazos en el contrato no se borra nada | Lo que vive de más, sí: se borra. Lo borrado antes de tiempo, **no** |
| Dato real en la sección en vivo | Media-alta (datos de terceros) | Baja: solo invitados, aviso permanente, sin adjuntos y el filtro de forma de dato | Parcial: vive en memoria y se pierde al apagar; lo que ya vio otro invitado no se des-ve |

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
    revisa (D14): falla seguro, porque el caso no entra al sandbox. Tampoco frena la
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
  - Se ejecuta **exactamente lo aprobado**: la huella se recalcula sobre lo que va a correr.
  - **D6, decidida (fuera del producto)**: el producto no se conecta a ningún SAP ni guarda sus credenciales, y lo
    único que ejecuta es el simulador. Llevar una solución al SAP del N3 lo hace una persona de la consultora o del
    N3, con su propio acceso y bajo el control de cambios del N3. La pantalla y el contrato (§13) dicen que el antes
    y el después son del simulador, no del SAP del cliente.
  - Una credencial de SAP pegada en una incidencia, en el chat o en un adjunto **no la detecta** el producto
    (brecha): el contrato dice que no se comparten por ahí.
- **Fatiga del aprobador** (brecha): no la cierra una política. La mitigan el veredicto del
  supervisor y el antes y el después en el mismo mensaje, y que lo aprobado y lo ejecutado tengan la
  misma huella. Como el producto no aplica en un SAP real (D6), su daño directo es al simulador; llevar lo
  aprobado al SAP del N3 lo decide una persona, fuera del producto, con el control de cambios del N3.
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
  - **D14, decidida**: el superadministrador no ve nada más que esto, y la cuarentena no la revisa nadie, tampoco él.
- **Reidentificación por grupo chico** (D14, decidida):
  - El laboratorio ve un agregado solo si su grupo (el total, una consultora o un tamaño) tiene **3 clientes o más**
    en ese periodo.
  - Si lo suprimido de una partición (las consultoras, o los tamaños) suma 1 o 2 clientes, se despejaría restando
    del total, y la partición entera se suprime. Con las dos consultoras del laboratorio, hoy solo ve el total.
  - Lo aplica la base al leer, y el corte del laboratorio sale marcado con la misma regla desde la capa semántica;
    una prueba cruza las dos, y las pantallas solo leen la marca.
  - El contrato (§11) le dice al N3 que el laboratorio ve agregados de operación, solo de grupos de 3 clientes o más.
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
  - Las cifras del contrato las decide el laboratorio. **D13, decidida**: en N1–N2 el laboratorio solo compromete su
    respuesta a lo que la consultora le escala, de la escalada a su primera decisión en la sala, con fechas de la base;
    la consultora la ve en cada incidencia. La cifra y los créditos quedan en blanco hasta GATE 3.
  - *Brecha*: un caso escalado sin plan en la sala no tiene ese reloj; el laboratorio lo atiende por el chat, que no
    registra una respuesta.
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
  causa, pasa a una persona en el momento, y se dice. Un PDF que infla más que su tope por documento (H-22) es una de
  esas causas: no se lee, no va al motor y queda como adjunto sin extracción.
- **Restauración**:
  - Export y restauración **por tenant**, con el export firmado.
  - Se verifican el tenant de cada fila y las huellas, la suya y la de cada otra consultora, **antes
    del commit**.
  - La restauración corre con el privilegio de migración (declarado en C7).
  - Los bytes de Storage van por su línea de respaldo.
  - **El PITR de Supabase restaura el proyecto entero** (D10), y con él a todos los tenants: se usa solo ante un
    desastre que los alcanza a todos. Devolver a un tenant es siempre el export por tenant. Tras un PITR se aplica la
    lista de bajas, como tras cualquier restauración.
  - **Una restauración no devuelve lo borrado** (D8): la lista de bajas viaja aparte de la base, y la más reciente
    se aplica antes del commit. La restauración por tenant la exige, y tras restaurar la base entera se aplica igual.
  - *Depende*: quien lleva la lista a todos los niveles de respaldo es el job de respaldo del servidor, que todavía
    no existe: falta contratar el servidor que eligió D12, y GATE 3.
- **Dónde viven los datos** (D10, decidida):
  - **En el modo gestionado**, en un proyecto de Supabase **propio del producto**, plan Pro con PITR, en Virginia
    (`us-east-1`): Supabase no tiene región en México. Propio, porque una restauración del proyecto no regresa a otros
    productos, y la región, el plan y el costo son de este. `configura:deploy` no deja pasar una instalación gestionada
    que declare otra región.
  - **En el modo despacho**, Supabase autohospedado en la máquina de la consultora: los datos quedan donde ella
    decida, en México si quiere. La región la declara quien pone la máquina, y la dice su contrato con su cliente.
  - El contrato (§11) le dice al cliente dónde viven sus datos, quién los guarda por encargo y cómo quedarse en
    México. **El aviso de privacidad** hacia los empleados del N3 tiene que decir la transferencia: es redacción legal
    pendiente, y sin él el producto no opera con datos reales.
  - **El servidor** del modo gestionado es de AWS, en `us-east-1` (D12). La app y el OCR procesan ahí los datos en
    claro, en memoria y en disco temporal; la base y los archivos no viven en él.
  - **Las copias de respaldo** salen **cifradas**, con la llave privada fuera del servidor, a Backblaze B2 US East
    (D12): otra empresa que el servidor y que la base. Van con Object Lock en modo compliance, dentro del tope de D8:
    el destino no las lee, y nadie las borra antes de su bloqueo. El contrato lo dice (§11). *Depende*: las cifra y
    las sube el job de respaldo del servidor, que todavía no existe (GATE 3).
  - *Brecha* (O2): la región la declara quien instala; nadie la comprueba desde la máquina.
- **Retención y salida** (D8, decidida):
  - **Originales**: se borran N días después de la última resolución, de la incidencia o de una impugnación, y nunca
    con una impugnación abierta. La fila del adjunto y los campos revisados se quedan. La base decide qué venció: la
    plataforma no borra nada que no lo haya hecho, ni de otra consultora.
  - **N y la gracia viven en el contrato** y los decide el laboratorio con su asesoría legal (DP-4). Sin ellos no se
    borra nada. Hoy los contratos del laboratorio no los dicen: nada vence, y la pantalla lo dice.
  - **La salida la registra una persona** del cliente o de su consultora (la de una consultora entera, el
    superadministrador); un agente no (DP-2). Desde ese momento lo del cliente se congela: no entra nada nuevo, nada
    suyo cambia y su export firmado es el último. Lo descargan él y su consultora; el laboratorio ve la baja, no el
    export.
  - **El job de retención borra solo**: es la única acción irreversible que el producto hace sin una persona en el
    momento. Borra únicamente lo que la base da por vencido (un original con su plazo cumplido; un tenant con su
    export y la gracia terminada), con el rol de plataforma de su consultora (C7). Separa el plan, que dice qué
    vence sin borrar nada, de su ejecución. Una baja se da por cumplida solo si no queda nada del tenant.
  - **En los respaldos**: una copia inmutable no se borra antes de que venza su bloqueo. El bloqueo no pasa de 365
    días (`configura:deploy` rechaza uno mayor), y Soporte SAP no entra al archivo legal de la casa. Así el borrado
    llega a todas las copias en 12 meses como máximo, y el contrato lo dice (§14).
  - Se quedan el sandbox anonimizado, lo subido al núcleo generalizado y las métricas agregadas, que no dicen de
    quién vinieron.
  - *Brecha*: el crudo de importación y su procedencia son de la consultora y no tienen cliente; los de un cliente
    que se va se quedan hasta que se va su consultora.
  - *Depende*: el job de retención no corre todavía en ningún servidor: falta contratar el que eligió D12, y GATE 3.
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
- **Proveedor de modelo** (D7, decidida: externo solo anonimizado):
  - Hoy el producto no llama a ningún modelo: el triage, el chat y el supervisor son deterministas.
  - Cuando llame (CDC del routing), la llamada pasa por `puedeLlamar`. Lo crudo (ticket, chat, documentos y
    adjuntos) solo va a un modelo autohospedado. Lo anonimizado (sandbox) y lo generalizado (núcleo) van a uno
    externo solo con su decisión C4, que exige el anonimizador medido (D9) y un contrato sin conservación ni
    entrenamiento. Lo que no lleva texto de clientes sigue el routing.
  - Dónde corre el modelo se deduce de la dirección de su servidor: autohospedado es la propia máquina o una red
    privada, y un nombre público es externo diga lo que diga.
  - Un barrido del producto exige que un módulo que importe un SDK de modelo o el `lib/ai` de la app pase por la
    política.
  - **Brechas**: una dirección privada puede ser un túnel hacia un proveedor externo, y una llamada HTTP escrita a
    mano a la API de un modelo no la ve el barrido. Las revisa el CDC del routing.
  - El contrato (§11) le dice al cliente que su texto no va a un proveedor externo.

- **La vitrina en vivo** (revisión 10):
  - Solo la abre quien el laboratorio invite, y todo lo que muestra es sintético. El laboratorio no se despliega: lo en
    vivo pasa a la máquina del laboratorio por un túnel, con cada petición firmada. Si la vitrina responde a quien
    llega sin sesión, la máquina del laboratorio no abre lo en vivo, y lo cierra si pasa mientras corre.
  - En vivo no se suben archivos: quien levanta elige documentos de muestra, que la máquina del laboratorio lee de su
    disco.
  - El texto con forma de dato personal se rechaza antes de cruzar el túnel y otra vez al llegar. Lo reconoce el mismo
    anonimizador del producto: nombre en contexto, correo, teléfono, RFC, CURP, NSS y CLABE.
  - Un aviso permanente dice que los datos son sintéticos y pide no escribir datos reales. El estado vive en memoria y
    se pierde al apagar el laboratorio.
  - *Brecha*: un dato real sin forma de dato (el nombre de una empresa, cómo opera) pasa el filtro. No es «cero datos
    reales»: lo acota que solo entra quien el laboratorio invita.

## 5. Decisión

**Mitigar** y operar **solo en laboratorio**.

Hay riesgos que **ninguna firma autoriza**, porque el daño cae sobre quien no firmó (límite de C5).
Para esos, firmar esta AISIA no basta: o un control los cierra, o el producto no los ofrece. Así
quedan hoy:

| Riesgo infirmable | Cómo queda |
|---|---|
| El dato personal de los empleados y de las contrapartes | Lo **reducen** los controles probados: anonimizador, cuarentena y el cerrojo de la base, que miran las mismas formas. No son cero fugas: **el producto no sale del laboratorio** sin medir el anonimizador sobre un corpus real (D9). |
| El dato del cliente en un proveedor de modelo | **No se ofrece** para lo crudo (D7, decidida): solo va a un modelo autohospedado, y la política lo exige en el código. Lo anonimizado o generalizado va a uno externo solo con su decisión C4. Hoy no hay modelo. |
| El aviso de privacidad hacia los empleados del N3 | Es redacción legal pendiente: sin él, **el producto no opera con datos reales**. |
| El secreto del N3 en el núcleo | A medida por defecto. Al núcleo, generalizado y firmado por el superadministrador, y la base lo exige. |
| La prioridad de una incidencia de nómina | El piso en la base, sin depender del categorizador, y la prioridad que mide el SLA es la que fijó la base. |
| El SLA, que es dinero entre la consultora y su cliente | Fechas y actor de la base, primera respuesta de una persona, resultado desde los eventos, y pausa que dice qué pide y que el cliente reanuda él mismo. En modo despacho, la medición **no se ofrece** como evidencia independiente (el contrato lo dice). |
| La impugnación del cliente | La base: la queja no se reescribe ni se borra, y la resuelta no se reabre. |
| La resolución y el incumplimiento | Resolver es de una persona de la consultora, y el cliente lo impugna. Un incumplimiento ya ocurrido se queda aunque cambie la prioridad. |
| Lo que lee el laboratorio | Lo que la consultora escala, también en la app, y lo leído de un original con el acceso motivado. De los agregados, solo los de grupos de 3 clientes o más (D14). |
| El triage urgente cortado por presupuesto, o sin su evidencia | P1 y P2 pasan a una persona; nunca se cortan. |
| La restauración que toca a otros tenants | Por tenant, verificada antes del commit, y sin devolver lo borrado: la lista de bajas se aplica antes del commit. |
| El dato de terceros fuera de México | **Se dice y se puede evitar** (D10 y D12): el contrato y el aviso de privacidad dicen dónde viven los datos y quién los guarda, las copias salen cifradas a un tercero que no las lee, y quien exija México va por el modo despacho, con la base en la máquina de su consultora. Sin el aviso, el producto no opera con datos reales. |
| El dato de terceros que vive de más, o que vuelve | Los originales vencen por contrato y la base decide qué venció; al salir, lo del cliente se congela y se borra tras la gracia, con su export en la mano; el borrado llega a las copias en 12 meses como máximo. Sin N ni gracia en el contrato **no se borra nada**: el producto no ofrece un borrado que nadie fijó. |
| Una solución mal aplicada en el SAP de un N3 | **No se ofrece** (D6, decidida): el producto no se conecta a ningún SAP ni guarda sus credenciales. La aplica una persona, fuera del producto, con el control de cambios del N3, y la pantalla y el contrato dicen que el antes y el después son del simulador. |
| El conocimiento de una consultora usado para otra | A medida por defecto. Al núcleo común, solo generalizado y con el consentimiento vigente de la consultora y del cliente de origen (D1): la base lo exige. |
| Un dato real en la sección en vivo | Lo **reducen** el filtro del anonimizador antes del túnel y al llegar, que no haya adjuntos, el aviso permanente y el estado en memoria. No es cero: un dato sin forma pasa, y queda declarado. Solo entra quien el laboratorio invita. |

Para salir del laboratorio hacen falta:

- la cifra del plazo de respuesta del laboratorio en N1–N2, al cerrar GATE 3 (D13; las decisiones D1, D3, D6, D7, D8,
  D10, D12, D13 y D14 ya están tomadas);
- N y la gracia de salida en el contrato, decididas por el laboratorio con su asesoría legal, y la redacción legal del
  §14 (D8, DP-4);
- el job de respaldo del servidor, llevando la lista de bajas a todos los niveles (D8; con GATE 3);
- la redacción legal del §12 del contrato (conocimiento común) y quién puede consentir en cada organización;
- el anonimizador medido sobre un corpus real con consentimiento (D9);
- el tope de memoria del lector de PDF (H-22), recalibrado con el corpus real: hoy está cerrado con un tope de 32 MiB
  por documento, sacado de la memoria de la máquina;
- el aviso de privacidad hacia los empleados del N3, redactado y exigido en el contrato, con la transferencia de sus
  datos a Estados Unidos en el modo gestionado (D10);
- los veredictos reales, sembrados en `tools/conocimiento` con su firma (H-20): el candado ya impide arrancar con
  incidencias reales sin ellos, y la matriz sintética del laboratorio no pasa;
- GATE 3 cerrado en la máquina donde corre lo que opera el laboratorio (el N1, por D3), antes de comprometer
  disponibilidad: la ficha de servidor no dice «apto» sin él;
- el C3 y esta AISIA firmados.

Firmada por: lisagomez  Rol: responsable del proyecto  Fecha: 2026-10-10

Revisión 1 (D1), firmada por: lisagomez  Rol: responsable del proyecto  Fecha: 2026-10-10

Revisión 2 (D3), firmada por: lisagomez  Rol: responsable del proyecto  Fecha: 2026-10-10

Revisión 3 (D6), firmada por: lisagomez  Rol: responsable del proyecto  Fecha: 2026-10-10

Revisión 4 (D7), firmada por: lisagomez  Rol: responsable del proyecto  Fecha: 2026-10-10

Revisión 5 (D8), firmada por: lisagomez  Rol: responsable del proyecto  Fecha: 2026-10-11

Revisión 6 (D10), firmada por: lisagomez  Rol: responsable del proyecto  Fecha: 2026-10-11

Revisión 7 (D12), firmada por: lisagomez  Rol: responsable del proyecto  Fecha: 2026-10-11

Revisión 8 (D13 y D14), firmada por: lisagomez  Rol: responsable del proyecto  Fecha: 2026-10-11

Revisión 9 (H-20 y H-22), firmada por: lisagomez  Rol: responsable del proyecto  Fecha: 2026-10-11

Revisión 10 (la vitrina en Vercel y su sección en vivo, con el C3), lisagomez  Rol: responsable del proyecto  Fecha: 2026-10-12