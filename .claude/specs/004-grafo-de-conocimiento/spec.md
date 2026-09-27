# Spec 004 — Grafo de conocimiento

> **Reexpresada al protocolo el 2026-08-30.** Derivada de la versión compilada por
> `/goal-compiler` el 2026-08-24. El texto original sigue recuperable:
> `git show 461803f:.claude/PRPs/specs/spec-grafo-de-conocimiento.md`
>
> Se conserva **Libertad técnica**, núcleo del diseño original.
>
> **Estado: CONSTRUIDA (2026-09-27, PRP-005, las 9 fases).** Originalmente era solo el blueprint; se construyó con
> la opción D: el motor en `tools/grafo-conocimiento` y la fuente única en `tools/conocimiento`. Lo que queda abierto
> está en la Autocrítica del PRP-005 (el parser con un modelo real no está medido). Ver `plan.md` y `tareas.md`.
>
> **Contrastada con el origen el 2026-09-26** (`hermes-os-a2a@97d9f9e`, medido, no de memoria):
> `docs/SDD-grafo-hermes-a-template.md`. De los 12 RF, Hermes cumple 6, cumple a medias 4,
> contradice 1 a propósito (RF-5) y 1 no le aplica (RF-11). Los dos incidentes constan en la
> fuente. La forma de construirla está en `.claude/PRPs/PRP-005-grafo-de-conocimiento-al-golden-path.md`,
> **PROPUESTO — NO APROBADO**: esta spec sigue sin autorizar código.
>
> **Fase 0 de PRP-005 cerrada el 2026-09-26** con las decisiones del laboratorio:
> - opción D;
> - cita por dominio (RF-5);
> - juicio a la fecha del hecho (RF-13 y RF-14);
> - una sola fuente del conocimiento, en este repo, de la que cada proyecto elige dominios (RF-15 y RF-16).
>
> Las dudas de la cita y de la vigencia quedan resueltas; la del parser sigue abierta (TAR-10).

## Contexto y objetivo

Que el boilerplate pueda traer, cuando un proyecto lo necesite, un motor que responde
preguntas **en oraciones libres** contra reglas propias del negocio, con una respuesta
acotada — **nunca un "no sé qué contestar" disfrazado de respuesta segura**.

Lo regulatorio es el primer caso de uso, probado en Hermes con 68 reglas en producción, pero
no es lo único: cualquier dominio con reglas propias y veredictos acotados (elegibilidad,
políticas internas, clasificación de soporte) usa la misma estructura.

## Usuarios / actores

- **El usuario final**, que pregunta en su propio léxico y recibe una oración.
- **El dueño del negocio**, que cura las reglas.
- **El proyecto derivado**, que activa la capacidad si la necesita.

## Historias de usuario

- H1: Como usuario quiero preguntar "¿puedo hacer envíos internacionales sin permiso
  especial?" en mis palabras, para no llenar un formulario de categoría/concepto/contexto.
- H2: Como dueño quiero que el motor diga que no sabe cuando no hay regla aplicable, para
  que nadie tome una decisión sobre una certeza inventada.
- H3: Como dueño quiero agregar una regla sin que el conocimiento derive en silencio.

## Requisitos funcionales (criterios de aceptación en EARS)

- RF-1: EL SISTEMA modelará el conocimiento como `categoría (palabras clave + exclusiones) →
  regla → veredicto`, con vocabulario de veredicto acotado por dimensión, no texto libre.
- RF-2: CUANDO el usuario formule una pregunta en lenguaje natural, EL SISTEMA la
  estructurará a los campos internos antes de evaluar.
- RF-3: EL SISTEMA calculará el veredicto siempre con el motor determinista.
- RF-4: SI el modelo de lenguaje interviene, ENTONCES EL SISTEMA limitará su papel a
  estructurar la pregunta y, opcionalmente, redactar la respuesta — nunca a decidir el
  veredicto.
- RF-5: CUANDO se devuelva una respuesta, EL SISTEMA la entregará en lenguaje natural y
  citará la fuente **solo si el dominio la declara pública**. Si el dominio es de reglas
  internas, no expondrá de qué regla, tabla o documento salió.

  > **Decidido por el laboratorio el 2026-09-26** (Fase 0 de PRP-005). Antes decía «sin exponer» para
  > todo dominio. En el origen, la cita es el mecanismo de seguridad del tercero, que puede
  > comprobar el artículo. Ocultarla en un dominio de fuente pública le quita esa vía; exhibir
  > una regla interna puede no convenir. Por eso cada dominio declara si cita.
- RF-6: SI ninguna regla hace match, ENTONCES EL SISTEMA responderá explícitamente que no
  hay información suficiente, con una forma distinguible de una respuesta real.

  > **Por qué, y no es teórico.** Jamás una respuesta con la misma forma segura que una
  > respuesta real. Bug real que esto existe para no repetir: **un agente dio un veredicto
  > completo con el motor caído, porque nadie le prohibió expresamente improvisar el mismo
  > formato de certeza.** No bastó con que el motor estuviera abajo: hacía falta la
  > prohibición explícita.

- RF-7: CUANDO las palabras clave de dos categorías coincidan, EL SISTEMA aplicará las
  exclusiones declaradas para descartar la categoría incorrecta.

  > **Caso real, no precaución teórica.** "Agente de seguros para drones" cayó en la
  > categoría de *operación de drones* en vez de *intermediación de seguros*, porque ambas
  > comparten la palabra "drones". Cada categoría declara qué la descarta **aunque sus
  > keywords también matcheen**.

- RF-8: SI dos reglas de la misma categoría arrojan veredictos distintos, ENTONCES EL
  SISTEMA degradará a fail-safe con bandera, y nunca elegirá una de las dos.

  > Anti-colisión y conflicto se resuelven **por diseño, no por suerte**. Son dos mecanismos
  > que el sistema de origen tuvo que aprender; esta spec los trae incorporados desde el día
  > uno para no pagarlos otra vez.
  >
  > **Corregido contra la fuente el 2026-09-26.** Aquí se decía que cada uno se aprendió «con
  > un incidente real», y solo vale para las exclusiones: incidente en producción, commit
  > `86ee4dc`. El conflicto → `dudoso` estaba en el motor **desde el primer commit** (`c321bee`,
  > portado del motor viejo `inferenceEngine.js`). Lo que llegó después fue un *gotcha* cazado
  > **en desarrollo** (Fase B, 2026-08-07): una regla de prohibiciones con `no_permitido` junto
  > al `permitido` general degradaba toda la categoría. Desde entonces Hermes lo evita **a
  > mano**, y su gate no lo detecta (RF-12).
- RF-9: CUANDO se agregue, quite o modifique una regla, EL SISTEMA obligará a actualizar en
  el mismo cambio el test que fija el conteo total.
- RF-10: EL SISTEMA validará la oración del usuario como entrada no confiable antes de
  usarla.
- RF-11: SI las reglas viven en Supabase, ENTONCES EL SISTEMA mantendrá RLS habilitado y
  `service_role` fuera de la superficie de consulta.
- RF-12: EL SISTEMA detectará colisiones y conflictos **antes de sembrar**, sin depender de
  que alguien revise cada regla nueva contra todas las existentes.
- RF-13: CUANDO se evalúe una pregunta, EL SISTEMA aplicará las reglas vigentes **en la fecha
  del hecho**. Si el hecho no trae fecha, usará la de la consulta y lo dirá en la respuesta.
- RF-14: CUANDO se retire una regla o cambie su significado, EL SISTEMA cerrará la vigencia de
  la versión anterior y añadirá la nueva. Nunca borrará ni editará en su sitio una regla,
  categoría, palabra clave o exclusión ya usada.
- RF-15: EL SISTEMA tomará el conocimiento de **una única fuente versionada**, y cada proyecto
  usará solo los dominios que declare.
- RF-16: SI existe una versión nueva del conocimiento, ENTONCES EL SISTEMA lo avisará sin
  aplicarla, y la actualización requerirá aprobación humana.

  > **RF-14 y las correcciones de modelado (decidido el 2026-09-27 al firmar INTERESES).** RF-14
  > habla de cambios de SIGNIFICADO en el tiempo: la ley cambia, y el pasado debe seguir encontrando
  > la regla de entonces. Una **corrección de modelado** es otra cosa: la ley no cambió, el conocimiento
  > la expresaba mal. Esa va como **versión nueva del paquete**, firmada y registrada en `CAMBIOS.md`,
  > y no como vigencia. Lo que respondía la versión anterior lo conservan git y la versión que cada
  > proyecto fija. Primer caso: INTERESES en `@tu-scope/conocimiento` 0.2.0.
  >
  > **RF-13 a RF-16, decididos por el laboratorio el 2026-09-26** (Fase 0 de PRP-005).
  >
  > - **RF-13 y RF-14: juicio a la fecha del hecho.** Es la duda que la spec dejaba abierta. El
  >   origen demostró por qué el motor solo no basta: allí retirar una regla la borraba, y un
  >   hecho de 2024 se quedó sin regla.
  > - **RF-15 y RF-16: una sola fuente.** El conocimiento se genera una vez, en este repo, y
  >   cada proyecto elige sus dominios. Ningún proyecto se actualiza solo: subir de versión es
  >   una decisión.

## Requisitos no funcionales

- Alineado al Golden Path: Next.js + Supabase, no el stack del origen.
- **Zod para el contrato interno, nunca `any`.**
- Capacidad **opt-in**: no entra al Golden Path por defecto.
- Sostenible por una persona sola: **si el mecanismo de exclusiones y conflicto exige curar
  manualmente cada regla nueva contra todas las existentes, no escala.** El gate tiene que
  detectarlo automáticamente antes de sembrar, no depender de que alguien se acuerde de
  revisar.

## Libertad técnica *(sección conservada del diseño original)*

Dónde viven las reglas (tabla, archivo versionado), el formato exacto del contrato interno y
cómo se implementa el parser son decisiones de quien ejecuta.

Una advertencia que no es de stack, es de diseño: **el parser de lenguaje natural y el motor
de reglas son dos responsabilidades separadas, y la frontera importa.** El modelo solo
traduce la oración a campos estructurados, y opcionalmente redacta la respuesta final; el
veredicto lo calcula siempre el motor determinista.

Fusionar ambas cosas —dejar que el modelo también decida el veredicto— **es exactamente el
patrón que hace que una respuesta con forma de certeza pueda estar inventada.** No es una
preferencia de arquitectura: es la razón por la que esta spec existe.

Y sobre el material de origen: es el único que prueba que el patrón funciona con reglas
reales en producción. **No lo reinventes desde cero**, y confirma los dos incidentes contra
la fuente, no de memoria — son la evidencia de que el mecanismo hace falta.

## Casos límite

- **Colisión de palabras clave**, caso real: "agente de seguros para drones" cayó en
  operación de drones en vez de intermediación de seguros, porque ambas comparten "drones".
- **Conflicto de veredictos** en la misma categoría.
- **Motor caído**: un agente dio un veredicto completo con el motor abajo, porque nadie le
  prohibió improvisar el mismo formato de certeza.
- **Pregunta ambigua** que el parser entiende mal.
- **Parser caído**: ¿el motor deja de responder, o falla distinto que cuando no hay regla?

## Impacto sobre terceros (control C4)

**Esta es la spec donde el daño a terceros es el riesgo principal, no un efecto lateral.**

| Parte afectada | Daño con el sistema funcionando bien | Qué lo mitiga |
|---|---|---|
| **Quien pregunta y actúa sobre la respuesta** | Un veredicto inventado sobre *"¿esto está permitido?"* lleva a alguien a incumplir algo real, o a no hacer algo que sí podía. **Sin atacante ninguno**: basta que falte una regla y que el sistema improvise en vez de callar | RF-6: fail-safe explícito, con forma **distinguible** de una respuesta real. Es el requisito que justifica la spec entera |
| Quien pregunta | Cae en la categoría equivocada por colisión de palabras clave y recibe la respuesta correcta **de otra cosa** | RF-7: exclusiones por categoría |
| Quien pregunta | Dos reglas en conflicto y el motor elige una: la respuesta es arbitraria pero suena firme | RF-8: degrada a fail-safe con bandera, nunca elige |
| Quien pregunta | El modelo decide el veredicto y lo inventa con formato de certeza | RF-3 y RF-4: el veredicto sale siempre del motor determinista |
| Quien pregunta, **y el tercero sobre quien se decide** | El proyecto sigue con una versión vieja del conocimiento y responde con una ley que ya cambió, o juzga un hecho pasado con la ley de hoy | RF-13 y RF-14: juicio a la fecha del hecho, sin borrar el pasado. RF-16: el aviso de versión nueva. La fecha de corte de cada dominio va visible en la respuesta |

**Límite de C5, y por eso el fail-safe no es negociable**: quien recibe la respuesta no firmó
nada y actúa sobre ella. Ninguna firma del dueño autoriza a devolver certezas inventadas a
un tercero. Si un proyecto derivado quisiera saltarse el fail-safe "porque molesta",
**se rediseña o no se hace** — no hay vía de registro de riesgo para esto.

## Fuera de alcance

- **Crear tablas o escribir el motor en esta tarea.** Esta spec es planeación: es el
  blueprint para cuando un proyecto concreto lo necesite, vía `/prp` + `/bucle-agentico`.
- Citar la fuente en los dominios de **reglas internas**: ahí la trazabilidad es para
  depurar, no para exhibirse. En los de fuente pública la cita sí se muestra (RF-5,
  decidido el 2026-09-26).
- Que **Hermes** lea del paquete central: es un paso aparte, con su propio gate y firma
  (decidido el 2026-09-26). Hasta entonces su `reglas.json` queda
  **ya congelado** desde `97d9f9e` (hermes-os-a2a PR #317, 2026-09-27; `grafo-congelado` es check obligatorio de su `master`),
  el mismo corte que traerá la migración, para que no nazcan dos fuentes.

## Criterios de finalización

Dos dominios de ejemplo poblados (uno regulatorio, uno genérico) · prueba end-to-end con una
oración real, no un payload armado a mano · **tres controles negativos**: fail-safe,
exclusiones (antes/después) y conflicto · test que fija el conteo de reglas.

Desde la Fase 0 del 2026-09-26, se suman:
- el dominio regulatorio de ejemplo son **drones de reparto + agentes de seguros**, registrados
  desde la fuente única, y un proyecto de prueba demuestra que **solo** recibe los dominios que declara;
- **control de vigencia**: un hecho de 2024 sigue encontrando la regla que regía entonces,
  aunque ya esté retirada;
- **control de aviso**: publicar una versión nueva del conocimiento avisa al proyecto y **no** lo actualiza.

## Dudas abiertas

- **[RESUELTA el 2026-09-27 → PRP-005 Fase 5: parser caído = `FalloSinVeredicto` `parser_no_disponible`]** ¿Qué ocurre si el modelo del parser se cae? El motor tiene que
  fallar de forma **distinguible** de "no hay regla aplicable", o son dos fallos con la
  misma cara para el usuario. Sin resolver.

  > **Lo que el origen enseña, y lo que no (contraste del 2026-09-26).** Hermes **no tiene
  > parser**: la oración se clasifica por keyword y quien la estructura es el agente de la
  > vertical, que es un LLM. No puede contestar esta duda por nosotros. Sí demuestra dos cosas:
  >
  > - **En el servicio, «no puedo operar» y «no hay regla» ya fallan distinto.** Con la base caída,
  >   la API devuelve HTTP 503 y no un `dudoso` (`businessos/grafo/app.py:36-43`). El puente A2A
  >   termina en `failed` y nunca en un veredicto (`grafo-a2a/executor.py:109-111`).
  > - **En el agente, prohibirlo por instrucción no bastó.** Es el incidente del motor caído
  >   (`businessos/negocio/AGENTS.md:143-150`): un bot dijo «el grafo no está disponible» y en el
  >   mismo mensaje dio un «Veredicto: PERMITIDO».
  >
  > Forma propuesta: parser caído = **error tipado sin objeto veredicto**, distinto de `sin_regla`,
  > y un redactor que **no puede ejecutarse** sin un veredicto del motor. Sigue abierta porque hay
  > que decidirla y probarla (TAR-10).
  >
  > **Hecho el 2026-09-27** (`tools/grafo-conocimiento/src/lenguaje/`). Si el modelo falla, no responde
  > a tiempo o devuelve algo sin forma, sale un `FalloSinVeredicto` `parser_no_disponible`, que no admite
  > veredicto. El redactor solo acepta un `Resultado`, y el fallo tiene su propia plantilla («No es que no
  > haya una regla: es que no la llegué a buscar»), distinta de la de sin regla. Probado.
  > **Y un motivo nuevo que el origen no tenía**: `clasificacion_dudosa`, cuando la categoría que propone el
  > parser no cuadra con las keywords o las exclusiones del texto. Es la defensa contra un modelo secuestrado (O1).

- **[RESUELTA el 2026-09-26 → RF-13 y RF-14: a la fecha del hecho, solo se añade]** **El grafo
  modela qué significa algo, no qué significaba en una
  fecha, y esa diferencia decide si sirve para una auditoría.** RF-9 vigila la deriva
  *interna* —nadie cambia una regla sin declararlo— pero no la *externa*: el día que la
  autoridad redefine un código que sigue existiendo, actualizar el grafo **reescribe en
  silencio el significado de todo lo que ya se procesó**. La pregunta que importa después no
  es qué quiere decir un código hoy, sino qué quería decir cuando se leyó aquel documento.

  > **Por qué aparece aquí y no es teórico.** Lo destapó el lector de CFDI de
  > `tools/extractor-documental/` el 2026-09-10. Al preguntarse cómo mantener la estructura
  > al día resultó que hay tres clases de cambio, y las dos primeras ya tienen mecanismo:
  > una versión nueva la caza el pineado, y un campo nuevo lo caza declarar en vez de
  > descartar (`medicion/deriva.mjs` y `medicion/catalogos.mjs`). La tercera —**un cambio de
  > significado sin cambio de estructura**— no la caza nada, y medido sobre el catálogo
  > publicado se ve por qué: 5,8 MB, 162.233 códigos y **cero descripciones legibles**. El
  > fichero dice qué códigos son válidos; qué quiere decir cada uno vive en un documento
  > para leer, no para comparar.
  >
  > Por eso el extractor emite **códigos y nunca etiquetas**: para que el significado tenga
  > un solo sitio donde vivir, que es este grafo. Lo que convierte esa decisión en una
  > obligación para esta spec — si el significado vive aquí, aquí es donde tiene que poder
  > fecharse.

  Lo que hay que resolver antes de construirlo: si un veredicto se calcula contra las reglas
  **vigentes hoy** o contra las **vigentes en la fecha del hecho**, y cuál de las dos pide de
  verdad el caso de uso. Hay precedente dentro de la casa: `src/versiones.ts` del extractor ya
  resuelve exactamente esto para las correcciones de un campo, con historial y valor vigente,
  y su lección es que **el histórico se diseña antes, porque después no se reconstruye**. Sin
  resolver.

  **La forma que tendría, si se resuelve por la fecha del hecho.** Sale de discutirlo el
  2026-09-10, y se anota aquí para que no haya que volver a derivarla:

  - **Solo se añade, nunca se edita.** Un significado nuevo es una entrada nueva con su
    vigencia. Editar en su sitio es exactamente lo que reescribe el pasado, y es el fallo que
    esta duda existe para evitar.
  - **La clave de búsqueda es `(código, fecha del hecho)`, no `código` a secas.** Es el cambio
    que lo decide todo: con la clave corta, el mismo documento devuelve un veredicto distinto
    según cuándo lo consultes.
  - **La fecha la afirma quien publica, no quien mira.** Medido: el catálogo del SAT declara
    su `last-modified` por HTTP, así que una instantánea puede fecharse contra la fuente. Un
    "lo vi el martes" no sirve para decir qué valía entonces.
  - **El extractor ya aporta las dos mitades** y no hace falta pedirle nada nuevo: emite el
    código (nunca la etiqueta) y la fecha del comprobante.
  - **La serie no hay que construirla.** `tools/extractor-documental/medicion/catalogos.mjs`
    sella su referencia en un fichero versionado, así que el historial de git **es** el
    repositorio de versiones. Vale la pena mirarlo antes de inventar una tabla de histórico:
    puede que la mitad del problema ya esté resuelta por donde vive el dato.

  Y el límite, que se estrecha pero no desaparece: detectar que una descripción cambió es
  mecánico; decidir si ese cambio **afecta a una regla** no lo es. Una descripción se
  reescribe sin cambiar el fondo, y el fondo cambia con un retoque menor. El diff lo señala,
  una persona lo juzga.

  > **El origen lo confirma con un caso medido (contraste del 2026-09-26).**
  >
  > - **El motor de Hermes ya evalúa a la fecha del hecho.** `contexto.fecha` es la fecha de la
  >   operación, cada regla lleva `vigente_desde`/`vigente_hasta` y hay pruebas que lo fijan.
  > - **El ciclo de vida de sus datos reescribe el pasado:**
  >   - ninguna de sus 98 reglas usa `vigente_hasta`;
  >   - retirar una regla es un `DELETE` (`_bajas`);
  >   - editarla es un `upsert` sobre la misma clave;
  >   - las keywords de las categorías no tienen historial.
  > - **Efecto medido.** La regla de la ley de 2010 (`MX-LFPDPPP-21-CONFIDENCIALIDAD`,
  >   `vigente_desde 2010-07-06`) **se borró** el 2026-07-30 en vez de cerrarse. Hoy, «cláusula de
  >   confidencialidad» con un hecho del 2024-06-01 devuelve `dudoso / sin regla aplicable`: la
  >   auditoría de un contrato de 2024 **ya no tiene regla**.
  >
  > Resolverlo solo en el motor no basta: la forma de arriba («solo se añade») tiene que llegar
  > hasta las bajas y hasta las keywords. **Decidido el 2026-09-26**: el caso de uso lo exige
  > (RF-13 y RF-14).

- **[RESUELTA el 2026-09-26 → RF-5: por dominio]** **¿La cita de la fuente protege o expone?** RF-5 y el segundo
  punto de "Fuera de alcance" dejan fuera exhibir la regla al usuario final. En el origen es
  al revés: la cita es su **mecanismo de seguridad** («cero afirmación sin fuente citada»). Quien recibe
  «permitido» puede comprobar el artículo por sí mismo, y la lectura de la fuente primaria
  cazó una numeración equivocada (Art. 72 frente a 74 de la Ley de Aviación Civil) que citar a
  ciegas habría propagado.
  Para reglas **internas** de negocio, exhibirlas puede no convenir. Para reglas de **fuente
  pública**, ocultar la cita le quita al tercero su única vía de verificación, y eso es un daño
  de la tabla de impacto (C4).
  Lo que hay que decidir: si la desviación se mantiene para todo dominio o se declara **por
  dominio**. Evidencia: `docs/SDD-grafo-hermes-a-template.md` §5.3. **Decidido el
  2026-09-26: por dominio**, y RF-5 queda reescrito.
