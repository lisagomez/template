# PRP-008: Soporte SAP (corrida A: el producto en laboratorio)

> **Estado**: corrida A **cerrada** (2026-10-04; en `main` por el PR #211). Sus controles los revisaron dos
> agentes (05/10 y 07/10) y los cerró el PRP-010 (fases 0 a 3, PRs #226 a #240). El C3 v4 de abajo y la AISIA v3
> los firmó lisagomez el 2026-10-10 (PRP-010, fase 5).
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
| Un agente que «arregla» en el SAP del cliente es un riesgo que nadie firma | el agente propone; un humano aprueba en una fila que ningún modelo puede escribir; en el SAP real no aplica nada el producto: lo aplica una persona con su propio acceso (D6, decidida) |

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

> **v4** (PRP-010, 2026-10-09). La v2 salió de la revisión independiente del 2026-10-04, y la v3 añadió la capa
> semántica. Dos revisiones más contra el código (05/10 y 07/10) encontraron que la v3 afirmaba controles que no
> existían fuera de las pruebas: el token de tarea verificado por una «pasarela» que no hay, el presupuesto que nadie
> leía, la impugnación sin pantalla. El PRP-010 los cerró en código o los declara aquí. Una tercera revisión, contra
> el borrador de esta v4 (09/10), encontró 18 más; también están cerrados en código o declarados. **Revisión 1**
> (2026-10-10, PRP-011): D1 decidida «con consentimiento»; se firma con la revisión de la AISIA. **Revisión de la
> vitrina** (2026-10-11): la vitrina de laboratorio en Vercel y su sección en vivo, que pasa al laboratorio de la máquina
> del laboratorio por un túnel firmado; se firma con la revisión 10 de la AISIA. **Cada frase de esta sección
> tiene su fila** en la matriz ([`docs/goals/soporte-sap-firmas-matriz.md`](../../docs/goals/soporte-sap-firmas-matriz.md)),
> en uno de tres estados: **probado** (una prueba pasa sin su sabotaje y cae con él), **brecha** (abierta y declarada)
> o **depende** (espera una decisión del laboratorio). Donde una frase la sostiene una fila de la AISIA, se dice.

**Activos que toca**, por daño:

1. datos personales de empleados y usuarios de los N3 en tickets y adjuntos (RR. HH., nómina,
   RFC/CURP/NSS), y de las contrapartes de un CFDI;
2. la integridad de las decisiones humanas: aprobaciones en la sala, mapeos, campos confirmados,
   propuestas e impugnaciones (una fila «decidida» que no decidió nadie);
3. el SLA y las horas: dinero entre consultora y cliente, y la cadena de eventos que es su evidencia;
4. los originales de los clientes y los exportes por tenant;
5. los secretos del servidor: el que firma los tokens de tarea, el que firma los exportes, la sal de los
   seudónimos y la del importador, las llaves del destino de respaldo y la contraseña de la base;
6. la matriz común y el grafo (el foso, ERP §1.7), envenenables por la siembra;
7. el presupuesto de modelo y de OCR, y la disponibilidad del VPS compartido;
8. la máquina donde corre, que en modo despacho es de la consultora.

**Fronteras que cruza**:

- el texto y los adjuntos del N3, falsificables y maliciosos contra los parsers (XML del CFDI, PDF);
- la sala, que es superficie **externa** porque las consultoras son terceros;
- el chat del HIL;
- los exportes de tickets de cada consultora;
- la salida del modelo, simulado hoy;
- el paso del sandbox al núcleo (siembra);
- el puente A2A del extractor;
- el `.env.production` del servidor, que puede estar en una máquina de la consultora;
- el root de esa máquina, en modo despacho;
- el destino de los respaldos, que es de un tercero (D12: Backblaze B2 US East; las copias salen cifradas).

**Flujos**. Cada «⇢» cruza una frontera; ahí vive el riesgo.

1. **Ingesta**: el N3 levanta la incidencia ⇢ la ruta (tamaño antes de leer) ⇢ la ingesta valida los bytes ⇢ el
   bucket de originales y el adjunto ⇢ el OCR local, con el tope del mes ⇢ los campos, delimitados como dato y por
   revisar.
2. **Triage y solución**: la categorización determinista (la prioridad sale de lo que declara el cliente, con el piso
   de nómina en la base) → el grafo (veredicto con su fuente) → el enjambre, con el visto bueno del presupuesto del
   mes ⇢ la sala: una persona aprueba a su nombre, atada a la huella del plan ⇢ el simulador, con lo aprobado y nada
   más.
3. **Aprendizaje**: el anonimizador ⇢ el sandbox, o la cuarentena si queda forma de dato o es de nómina ⇢ el experto
   enseña y queda **a medida** de la consultora ⇢ el superadministrador lo sube al núcleo, generalizado, y la base lo
   exige ⇢ `tools/conocimiento`, firmado por el laboratorio (hoy no: ver «Siembra»).
4. **SLA**: los eventos de una persona (responder, pausar diciendo qué se pide, la respuesta del cliente, resolver),
   con fecha y actor de la base ⇢ la cadena, que calcula la base ⇢ el job de plataforma calcula el resultado desde
   los eventos y el contrato vigente.
5. **Métricas**: el job de métricas lee a todas las consultoras, por columna ⇢ `ss_metrica` ⇢ cada nivel lee lo suyo,
   y el N3 solo lo que la métrica declara visible para él.
6. **Respaldo**: el export firmado por tenant ⇢ el destino inmutable fuera de sitio. La restauración, con privilegio
   de migración, verifica todo antes del commit.
7. **Despliegue**: `configura:deploy` mide la máquina y el `.env.production` contra el perfil del producto ⇢
   `predeploy`, siempre ⇢ la imagen.

**Atacantes relevantes**:

- **O1**: instrucciones en un ticket, un adjunto o un mensaje.
- **O2**: datos falsos en un exporte o un documento; un consultor que carga horas a otro cliente; una
  región o una respuesta del proveedor declaradas en falso.
- **O3**: el experto que aprueba en verde tras cuarenta planes buenos.
- **O4**: abuso de la ingesta para quemar OCR o tumbar el VPS. Un motor autohospedado sin GPU va a
  unos 110 s por página.
- **O5**: dbt, MetricFlow, la imagen de Postgres y las dependencias npm.
- **O6**: el agente (o un rol de servicio) comprometido o manipulado, usado como palanca; y el root de una
  máquina ajena.

**Controles y brechas**:

- **Alcance de los roles de servicio (O6).** La consultora de la tarea sale de un token firmado por el
  orquestador, que no corre el modelo. Es un HMAC propio, no un JWT, y **la firma la verifica la base**:
  `ss_priv.consultora_de_tarea()` la comprueba con un secreto que solo lee esa función (DP-2).
  - El agente presenta su token; nunca fija su alcance. Una sesión que fija sus variables con SQL no cambia de
    consultora.
  - No dan alcance un token de otro rol, uno vencido ni uno firmado con otro secreto.
  - Con la tarea de A, el agente ve 0 filas de B. En la sala, el tenant del agente también sale del token (S11).
  - Ninguno de los cuatro roles de servicio tiene `bypassrls` ni `login`, aunque ya existieran así.
- **Decisiones humanas (doble cierre en todas).** Un rol de servicio solo inserta en estado inicial (`propuesto`,
  `por_revisar`, `propuesta`) y no decide. El agente solo actualiza su incidencia, y por columna: categoría y
  prioridad inicial, sin fechas ni estados terminales. Una persona decide **a su nombre** por política restrictiva
  (`auth.uid()`). Lo que va al núcleo lo decide el superadministrador (D2).
  - Responder, pausar, resolver y cambiar la prioridad son actos de una persona **de la consultora**: ni el agente,
    ni el cliente, ni el laboratorio los emiten. Escalar al laboratorio es de la consultora; registrar una decisión
    de la sala, de la persona del laboratorio que decide. Las reglas de la base fallan cerradas ante un NULL: en un
    disparador, lo que devuelve una función se compara con `is (not) distinct from`, y una prueba lo vigila en todos.
  - Una persona emite solo actos de persona. Los eventos de la máquina (categorizar, preparar un plan, leer un
    adjunto, el presupuesto) son del agente, y la categorización es una y dice la prioridad que fijó la base.
  - Una propuesta no cambia de consultora, de alcance ni de contenido; lo único que cambia de dueña es la promoción
    al núcleo, que hace el superadministrador. Un campo revisado no se deshace, y su evidencia es la del documento.
  - El consentimiento para el núcleo común (D1) lo da una persona de esa organización, a su nombre, con su contrato
    y la fecha de la base; ningún rol de servicio ni el laboratorio lo escriben.
  - La salida de un cliente la registra una persona del cliente o de su consultora, y la de una consultora entera, el
    superadministrador, a su nombre y con la fecha de la base; ni el agente ni la plataforma (D8, DP-2). Nadie elige
    su plazo: sale del contrato.
  - En la sala, una aprobación es del tenant, de la tarea y de la huella de su mensaje: una persona de B no aprueba
    el plan de A. Ningún componente que ejecuta un modelo la fabrica: la suite de la sala tiene 11 sabotajes (S1,
    S1·force, S2, S2b, S3 a S7, S10 y S11), y cada uno la pone en rojo.
  - *Brecha*: S8 («el agente publica como si fuera un humano») y S9 se comprueban, pero no tienen sabotaje propio:
    nadie las ha visto caer.
  - Aprobar desde el chat no aprueba: se promueve al hilo del plan en la sala. El agente escribe solo en el chat del
    usuario de su turno.
  - *Brecha*: la fatiga del aprobador (O3) no la cierra una política. La mitigan el veredicto del supervisor, el
    antes y el después del simulador en el mismo mensaje, y que lo ejecutado tenga la huella de lo aprobado.
- **Tenencia atada (O2).** Un disparador ata la tenencia de cada tabla hija a su incidencia (o, sin incidencia, el
  cliente a su consultora).
  - También van atados el campo extraído al adjunto de su incidencia, la fila importada al crudo de su consultora y
    el contrato al cliente de su consultora.
  - Los tres buckets son privados, aunque ya existieran públicos. El de originales exige que la carpeta 2 sea
    cliente de la carpeta 1.
  - La cadena de eventos la calcula la base (secuencia, anterior, huella y fecha), y el actor también lo da la base:
    nadie firma con el seudónimo de otro.
  - *Brechas*: `ss_procedencia` no tiene a qué atarse, porque su registro es texto libre. Y los buckets no fijan
    tamaño ni tipo en Storage (depende de su versión): los valida la ingesta, que es la única que sube a originales.
- **Datos personales.** Lo sostienen, sobre todo, las filas de la AISIA («Dato personal en el sandbox», «El
  laboratorio lee lo que no necesita»; por D7, «Dato del cliente en un proveedor de modelo»: lo crudo solo va a un
  modelo autohospedado; y por D8, «Dato que vive de más o que vuelve»: los originales vencen por contrato, al salir se
  borra tras la gracia y una restauración no devuelve lo borrado).
  - El laboratorio lee solo lo que **la consultora escala, a su nombre** (DP-3). Los originales, con un acceso que
    otorga la consultora a un miembro del laboratorio por 72 h como máximo, con la fecha que pone la base; se puede
    revocar y nadie se lo otorga a sí mismo.
  - Los exportes son de la consultora, y el laboratorio no los lee.
  - El anonimizador **reduce, no garantiza**. Lo que deja forma de dato, y todo caso de RR. HH. o nómina, va a una
    cuarentena que guarda solo tipos de señal, y nadie la revisa: es definitiva (D14). La base rechaza en el sandbox un
    identificador con forma.
  - Lo leído de un original (el RFC y el total de un CFDI) va con el original: el laboratorio lo lee en lo escalado
    y con el acceso motivado vigente. La cuarentena no la lee el laboratorio.
  - Al bucket del sandbox nadie sube objetos: es solo texto. El cerrojo de la base mira las mismas formas que el
    anonimizador, sobre el texto normalizado.
  - El seudónimo de otra persona no lo calcula nadie por la API: cada quien obtiene solo el suyo.
  - El OCR es local: la ingesta no acepta un motor externo, y `configura:deploy` no deja encenderlo con Soporte SAP,
    ni con una decisión C4 (límite de C5).
  - *Brecha*: un dato sensible con una forma que ningún detector conoce. Por eso existen la cuarentena y el cerrojo
    de la base, y no un «probablemente limpio».
- **Inyección (O1).** El contenido de tickets, adjuntos y mensajes es dato. Lo leído de un documento entra a la
  incidencia delimitado, y la prioridad sale de lo que declara el cliente. Categoría, veredicto y tier son
  deterministas y no leen instrucciones: de las instrucciones sembradas en texto, imagen y XML, 0 obedecidas.
  - *Brecha* (O1, O2): un parámetro del plan (usuario SAP, BP, RFC) puede salir de un documento del cliente. Lo
    cubre la aprobación humana del plan, que muestra sus parámetros y queda atada a su huella; nada marca de dónde
    salió cada uno.
  - *Brecha*: el día que el modelo sea real, el corpus de inyecciones se corre contra él antes de encenderlo (D7).
- **Archivos maliciosos y abuso (O1, O4).**
  - Se valida por bytes y por tamaño. La ruta mira el tamaño de la subida antes de leerla, y responde 413 si no lo
    declara o si pasa del tamaño de cinco adjuntos. Más de cinco archivos se rechazan con su motivo, no se recortan
    en silencio.
  - Una persona no emite los eventos que gastan presupuesto: no agota el modelo ni el OCR de su consultora.
  - Al bucket de originales solo sube la ingesta, después de validar, y el adjunto lo registra ella.
  - Una incidencia no pasa de 10 adjuntos: lo exige la base, contando los que ya tiene.
  - El lector de XML del extractor rechaza `<!DOCTYPE` y toda declaración `<!`, así que no resuelve entidades
    externas (`tools/extractor-documental/src/xml/lexico.ts`).
  - El OCR tiene un tope de páginas del mes por consultora (`ss_presupuesto`). Sin tope, o con lecturas sin medir,
    no corre, y no registra más páginas de las que le quedan.
  - El servicio de OCR corre con memoria acotada en su contenedor.
  - La capa 0 lee el PDF en el proceso de la app, y su inflado tiene un tope por documento (32 MiB, H-22): se lee por
    trozos y se corta al pasarlo. Ese PDF no se lee, queda como adjunto sin extracción, se dice por qué y no va al
    motor. El tope sale de la memoria de la máquina, no de un corpus: se recalibra con el corpus real.
- **Cadena de suministro (O5).** dbt, MetricFlow y Postgres van pineados por versión y la imagen
  por digest; las dependencias npm ya pasan por el lockfile.
  - *Brecha*: hasta que un CDC adopte `vigila:versiones` para estas piezas, nadie avisa de un
    parche de seguridad.
- **Jobs de plataforma (C7, declarados).** Ninguno es `service_role`.
  - `soporte_sap_ingesta` lee originales y deja campos por revisar, acotada por su token: con la tarea de A no lista
    los originales de B.
  - `soporte_sap_plataforma` exporta lo de su consultora con su propio rol, y escribe solo el resultado de SLA que
    calcula su job, el de su consultora. No inserta decisiones ni eventos, y no borra impugnaciones.
  - Por retención (D8) borra **solo lo que la base da por vencido**: los bytes de un original con su plazo cumplido y,
    con el export de quien se va y la gracia terminada, el tenant entero. En Storage solo sube su export. Con la salida
    registrada nada de ese tenant cambia, y el job del SLA lo omite. El job de retención (`src/retencion.ts`) separa
    el plan, que no borra, de su ejecución; todavía no corre en ningún servidor: falta contratarlo (D12 ya lo eligió) y GATE 3.
  - *Brecha*: el crudo de importación y su procedencia no tienen cliente; los de un cliente que se va se quedan hasta
    que se va su consultora.
  - *Brecha* (O6): la base no ata el resultado de SLA a los eventos: un job comprometido escribiría otro. No es la
    evidencia: la evidencia es la cadena, que la plataforma no toca, y cualquiera recalcula el resultado desde ella.
  - `soporte_sap_metricas`, el job de la capa semántica, lee a **todas** las consultoras para dar totales. Su
    acotamiento es por columna: no lee títulos, descripciones, nombres, contenido, motivos ni consultores. Solo
    inserta en `ss_metrica`, que nadie cambia ni borra, y cada nivel lee lo suyo; el N3, solo lo que la métrica
    declara visible para él.
  - **La restauración corre con privilegio de migración**, declarado aquí: vuelve a poner los eventos con su fecha y
    su cadena originales, con los disparadores en modo réplica. Por eso verifica antes la firma del export y el
    tenant de cada fila, y antes del commit, la huella de esa consultora y la de cada otra (filas de la AISIA,
    «Restauración que toca a los demás»).
  - Un agregado sobre un grupo chico no delata a su cliente ante el laboratorio (D14): la base solo le deja ver el de
    un grupo de 3 clientes o más, y suprime la partición entera si lo suprimido se despejaría restando del total. El
    job de la capa semántica marca el corte del laboratorio con la misma regla, y una prueba cruza las dos.
- **La ruta del laboratorio (`/api/soporte-sap`).** Declarada en `scripts/prueba-a2a.ts` (RF-20): misma app y
  puerto, estado sintético en memoria, identidades de laboratorio, sin base ni `service_role`.
  - Sin `SOPORTE_SAP_LABORATORIO=1` responde 404, también el GET.
  - No le devuelve al usuario un error interno: solo los rechazos del laboratorio llevan su mensaje.
  - `configura:deploy` rechaza la variable en producción.
  - *Brecha*: la ruta no autentica. Con la variable encendida, cualquiera elige el rol, superadministrador incluido,
    y el GET le devuelve su vista. Por eso no se enciende fuera del laboratorio.
  - *Brecha*: lo que la ruta manda al log del servidor no está inventariado (ni retención ni dueño).
- **Siembra (frontera sandbox → núcleo).** Lo que cambia un veredicto lo firma el laboratorio en
  `tools/conocimiento`; el agente solo deja propuestas.
  - Al núcleo común se llega **promoviendo** algo a medida, y solo con el consentimiento vigente de la consultora y
    del cliente de origen (D1, PRP-011). El agente no propone directo al núcleo, y el origen de cada propuesta se
    guarda aparte: una entrada del núcleo no dice de dónde vino.
  - **El candado de H-20**: con incidencias reales, el conocimiento sale de `@tu-scope/conocimiento` en la versión
    exacta que fija el producto, registrada, y con la huella registrada de cada regla (`conocimientoDeProduccion`).
    Una regla editada en su sitio, o la matriz sintética del laboratorio, no pasan. El código de la matriz pone los
    pasos del plan, pero no sube un veredicto. Un barrido exige que la matriz sintética solo la importe el laboratorio.
  - *Depende* (H-20): las reglas reales del dominio `sap-soporte` entran a `tools/conocimiento` con la primera
    incidencia real, sembradas con su versión y firmadas por el laboratorio. La matriz del laboratorio es sintética y
    no se siembra en la fuente única de la casa. Hasta entonces, el producto no arranca con incidencias reales.
- **Perfil de despliegue.** `configura:deploy` mide la instalación contra el perfil `despliegue` del manifiesto
  (plantilla v4), sin imprimir ni guardar un secreto:
  - la máquina contra el tamaño contratado (vCPU, RAM y disco);
  - la región frente a su decisión: mientras esté abierta, «pendiente», nunca «cumple». Con D10 decidida, una
    instalación gestionada de Soporte SAP solo pasa en `us-east-1`; en despacho, la región la decide quien pone la
    máquina, y solo tiene que declararla;
  - el destino de respaldo inmutable fuera de sitio, por S3: si falta, avisa; sin https, sin días de bloqueo o con un
    bloqueo mayor que el tope de la `retencion` del producto (365 días en Soporte SAP, D8), no pasa;
  - los secretos del producto: presentes y de 32 caracteres o más;
  - con Soporte SAP, ningún motor de OCR fuera de la máquina (`OCR_RESPALDO`), ni con una decisión C4.

  Corre en `predeploy` **siempre**, también con el sello vigente (H-26). La ficha de servidor de cada consultora no
  dice «apto» sin una restauración probada en esa máquina (GATE 3).
  - *Brecha* (O2): la región, el proveedor y las respuestas sobre snapshots los declara quien instala. Nadie puede
    comprobarlos desde la máquina: los verifica quien contrata.
- **Root ajeno (modo despacho).** En modo despacho el servidor es de la consultora. Quien tiene root lee la base
  entera, los secretos (incluida la sal de los seudónimos) y los respaldos, y la RLS no lo impide.
  - *Brecha*: lo que ve de su propia operación (sus clientes, las horas de cada consultor y quién es cada seudónimo)
    no lo cierra ningún control. Va al contrato. D3, decidida (mixto): la consultora opera su N2, y si lo hace en su
    propio servidor, ese servidor es suyo.
  - **No se ofrece**: en modo despacho, la medición del SLA **no es evidencia independiente** frente al N3, porque
    root puede reescribir la cadena entera, huellas incluidas. El contrato lo dice (§5).
- **La vitrina y la sección en vivo.** La vitrina de laboratorio vive en Vercel, protegida (solo la abre quien el
  laboratorio invite) y con datos sintéticos. Su sección en vivo pasa por un túnel al laboratorio que corre en la máquina
  del laboratorio: el laboratorio no se despliega.
  - En su despliegue solo existe la vitrina (`VITRINA_SOPORTE_SAP=1`, horneado en el build): otra página lleva a ella y
    otra API, `/api/soporte-sap` incluida, da 404.
  - En Vercel o en la vitrina, el build falla con `SOPORTE_SAP_LABORATORIO` puesta, con cualquier valor. Nada de la
    vitrina importa el runtime de laboratorio ni lee su variable.
  - Vercel firma cada petición (HMAC del método, la ruta, el cuerpo y el instante) y el portero de la máquina del
    laboratorio la verifica: dentro de 60 s y una sola vez. Sin esa firma responde como si no existiera, así que la URL
    del túnel filtrada no abre nada, y la llave no viaja por el túnel.
  - El portero escucha solo en 127.0.0.1 y solo deja pasar `/api/soporte-sap`, con `rol` y `export`. No acepta
    archivos: quien levanta elige documentos de muestra, que el portero lee de su propio disco.
  - El texto con forma de dato personal (el mismo anonimizador del producto) se rechaza en Vercel, antes de cruzar el
    túnel, y otra vez en el portero.
  - El secreto vive solo en el servidor de Vercel y en un archivo de la máquina del laboratorio: ninguna variable
    pública ni componente de cliente lo toca.
  - *Brecha*: dentro del laboratorio un invitado elige su identidad, también la de superadministrador, y aprueba en la
    sala. El laboratorio es sintético, y el riesgo es del laboratorio.
  - *Brecha*: un dato real sin forma de dato (el nombre de una empresa, cómo opera) pasa el filtro. Lo mitigan el aviso
    permanente, que no haya adjuntos y que el estado viva en memoria; va en la AISIA.
  - *Brecha*: quién está invitado y el enlace para compartir se configuran en el panel de Vercel; el código no los
    prueba. Se comprueba en cada despliegue que sin sesión no abre.
  - *Brecha*: Vercel y el proveedor del túnel ven el tráfico de lo en vivo, que es sintético.
- **Superficie.** Nada del producto expuesto: la vitrina expone el laboratorio sintético a invitados, con su control.
  Exponer la sala o el canal N1–N2 del producto es gate humano con este C3 y la AISIA firmados. *Brecha*: Realtime y el
  JWT de Supabase no se prueban sin un Supabase real.

**Priorización** de lo que queda abierto, por daño y por cuándo muerde:

| # | Brecha | Muerde | Qué la cierra |
|---|---|---|---|
| 1 | Un PDF tumba la app de todos los tenants (H-22) | cerrado: tope de inflado por documento (32 MiB), por memoria | recalibrarlo con el corpus real del extractor |
| 2 | La ruta del laboratorio sin autenticar | si la variable se enciende en un servidor expuesto | `configura:deploy` la rechaza y el build de Vercel también; lo en vivo de la vitrina pasa firmado a la máquina del laboratorio, solo para invitados |
| 3 | Root ajeno en modo despacho | el día que una consultora opere su propio servidor | el contrato (D3 decidida: mixto); el SLA de ese modo no se ofrece como evidencia |
| 4 | Veredictos fuera de `tools/conocimiento` (H-20) | al resolver la primera incidencia real (el candado ya impide arrancar sin ellas) | sembrar las reglas reales del dominio `sap-soporte` en `tools/conocimiento`, con su firma |
| 5 | Parámetros del plan que salen de un documento | con un modelo real que extraiga parámetros | marcar el origen de cada parámetro (D7) |
| 6 | Grupo chico ante el laboratorio | cerrado con D14: 3 clientes o más, con supresión complementaria | — |
| 7 | La fatiga del aprobador | si D6 cambia y el producto llega a aplicar en un SAP real | ningún control: la mitigan el supervisor y la huella; con D6 (fuera del producto), su daño directo es al simulador |
| 8 | El resultado de SLA sin atar a los eventos | con un job de plataforma comprometido | recalcularlo desde la cadena; atarlo en la base |
| 9 | Lo demás: logs de la ruta, `ss_procedencia`, límites de los buckets, S8 y S9 sin sabotaje, parches de O5, Realtime y JWT, región autodeclarada, forma desconocida de dato | al salir del laboratorio | cada una en su fila de la matriz |

### Evaluación de impacto (C4)

Firmada por lisagomez el 2026-10-10: [`.claude/gobernanza/AISIA-soporte-sap.md`](../gobernanza/AISIA-soporte-sap.md).
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

- **2026-10-04 · un filtro en el lector no es un control en la base.** El lector del corte del
  laboratorio respetaba «visible al cliente», pero la RLS de `ss_metrica` no: en producción, un N3 habría
  leído su propio riesgo de baja. Y la tabla no tenía dónde guardar la etapa del ciclo de vida, así que
  el job habría chocado con su propia restricción de unicidad. Las dos salieron al escribir el job de
  producción y probarlo contra el esquema real, no en el laboratorio. **Lección**: lo que el laboratorio
  filtra en código, producción lo tiene que filtrar en la base; la prueba que lo demuestra corre contra
  el esquema, con el rol real.

- **2026-10-04 · el supervisor encontró un defecto que nadie buscaba.** El simulador abría el
  periodo con el texto tal cual (`2026/10`) y el síntoma lo normalizaba (`2026-10`): «abrir el
  periodo» no quitaba el error. La primera prueba del par ejecutor → supervisor lo puso en rojo
  porque el supervisor comprueba el síntoma **después**, en vez de confiar en que el paso corrió. Un
  verificador que re-ejecuta encuentra lo que uno que lee la previsión no ve.
- **2026-10-04 · un hilo de un nivel también se cuida en la promoción.** El chat promovía la
  petición al hilo de la v2 de un plan, que ya es respuesta, y la sala lo rechazaba (400). La
  promoción va a la raíz del hilo. El recorrido de Playwright lo encontró como un error de consola.

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
