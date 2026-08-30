# Spec 004 — Grafo de conocimiento

> **Reexpresada al protocolo el 2026-08-30.** Derivada de la versión compilada por
> `/goal-compiler` el 2026-08-24. El texto original sigue recuperable:
> `git show 461803f:.claude/PRPs/specs/spec-grafo-de-conocimiento.md`
>
> Se conserva **Libertad técnica**, núcleo del diseño original.
>
> **Estado: NO CONSTRUIDA.** Su alcance declarado **es** el blueprint, no la
> implementación. Ver `plan.md` y `tareas.md`.

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
- RF-5: CUANDO se devuelva una respuesta, EL SISTEMA la entregará en lenguaje natural sin
  exponer de qué regla, tabla o documento salió.
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
  > que el sistema de origen tuvo que aprender con un incidente real cada uno; esta spec los
  > trae incorporados desde el día uno para no pagarlos otra vez.
- RF-9: CUANDO se agregue, quite o modifique una regla, EL SISTEMA obligará a actualizar en
  el mismo cambio el test que fija el conteo total.
- RF-10: EL SISTEMA validará la oración del usuario como entrada no confiable antes de
  usarla.
- RF-11: SI las reglas viven en Supabase, ENTONCES EL SISTEMA mantendrá RLS habilitado y
  `service_role` fuera de la superficie de consulta.
- RF-12: EL SISTEMA detectará colisiones y conflictos **antes de sembrar**, sin depender de
  que alguien revise cada regla nueva contra todas las existentes.

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

**Límite de C5, y por eso el fail-safe no es negociable**: quien recibe la respuesta no firmó
nada y actúa sobre ella. Ninguna firma del dueño autoriza a devolver certezas inventadas a
un tercero. Si un proyecto derivado quisiera saltarse el fail-safe "porque molesta",
**se rediseña o no se hace** — no hay vía de registro de riesgo para esto.

## Fuera de alcance

- **Crear tablas o escribir el motor en esta tarea.** Esta spec es planeación: es el
  blueprint para cuando un proyecto concreto lo necesite, vía `/prp` + `/bucle-agentico`.
- Exigir cita de fuente en la respuesta al usuario final: desviación deliberada del
  original. La trazabilidad interna es para depurar, no para exhibirse.

## Criterios de finalización

Dos dominios de ejemplo poblados (uno regulatorio, uno genérico) · prueba end-to-end con una
oración real, no un payload armado a mano · **tres controles negativos**: fail-safe,
exclusiones (antes/después) y conflicto · test que fija el conteo de reglas.

## Dudas abiertas

- [NECESITA ACLARACIÓN] ¿Qué ocurre si el modelo del parser se cae? El motor tiene que
  fallar de forma **distinguible** de "no hay regla aplicable", o son dos fallos con la
  misma cara para el usuario. Sin resolver.
