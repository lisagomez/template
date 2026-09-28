# Plan 004 — Grafo de conocimiento

> **EJECUTADO por PRP-005 (2026-09-27).** Lo de abajo es el plan original, conservado. Antes decía: **Plan PROSPECTIVO y NO APROBADO.** Esta spec **no está construida**: `.claude/knowledge/`
> no existe y no hay motor de reglas en el repo (verificado 2026-08-30). Su propia sección
> RESTRICCIONES lo dice: *"Este spec es solo planeación. No se crean tablas ni se escribe el
> motor en esta tarea — es el blueprint para cuando un proyecto concreto lo necesite."*
>
> Por tanto este plan **no autoriza construir nada**. Es el blueprint que se convierte en
> PRP (`/prp` + `/bucle-agentico`) el día que un proyecto derivado necesite la capacidad.
>
> **No cierra la LIBERTAD TECNICA.** Dónde viven las reglas, el formato exacto del contrato
> interno y cómo se implementa el parser son decisiones de quien ejecute, no de este
> documento. Aquí se fija solo lo que la spec marca como no negociable.
>
> **Contrastado con el origen el 2026-09-26.** El PRP que este plan anunciaba existe como
> propuesta: `.claude/PRPs/PRP-005-grafo-de-conocimiento-al-golden-path.md` (**NO APROBADO**).
> Recomienda portar el motor, que son 283 líneas puras en Hermes, traer el conocimiento de
> Hermes como **dato pineado** y probar la paridad con un corpus generado desde el motor
> Python. La medición y las alternativas descartadas están en `docs/SDD-grafo-hermes-a-template.md`.

## Módulos propuestos (forma, no implementación)

| Módulo | Responsabilidad | Grado de libertad |
|---|---|---|
| Fuente única del conocimiento | Las reglas, divididas por dominio, versionadas, con fecha de corte y registro de cambios. Se generan **una vez** | **Fijo desde la Fase 0**: vive en este repo como paquete de datos (RF-15). Solo se añade (RF-14). El gate corre aquí |
| Almacén de reglas | Lo que cada proyecto carga de la fuente única: solo los dominios que declara | **Libre**: Supabase, archivo versionado, lo que convenga |
| Contrato interno | Esquema tipado del triple categoría/regla/veredicto | **Fijo**: Zod, nunca `any` (RESTRICCIONES) |
| Parser de lenguaje natural | Oración libre → campos estructurados | **Fijo**: solo estructura. **Jamás decide el veredicto** |
| Motor de evaluación | Campos → veredicto | **Fijo**: determinista, sin modelo de por medio |
| Redactor de respuesta | Veredicto → oración natural | **Fijo**: cita la fuente solo si el dominio la declara pública (RF-5) |
| Gate de validación | Detecta colisiones y conflictos antes de sembrar | **Fijo**: automático, no curación manual |

## La frontera que ordena todo el diseño

**El parser y el motor son dos responsabilidades separadas, y la frontera importa.** El LLM
traduce la oración a campos y opcionalmente redacta la respuesta final; el veredicto lo
calcula siempre el motor determinista.

Fusionarlas es exactamente el patrón que hace que una respuesta con forma de certeza pueda
estar inventada. **No es una preferencia de diseño: es la razón de ser de la spec.**

## Decisiones ya tomadas por la spec (no reabrir sin CDC)

1. **Fail-safe explícito.** Sin regla aplicable → "no hay información suficiente", jamás una
   respuesta con la misma forma segura que una real. Viene de un bug real: un agente dio un
   veredicto completo con el motor caído porque nadie le prohibió improvisar el formato.

2. **Exclusiones por categoría.** El clasificador por keywords puede matchear la categoría
   equivocada — caso real: "agente de seguros para drones" cayó en operación de drones
   porque ambas comparten "drones". Cada categoría declara qué la descarta.

3. **Conflicto degrada a fail-safe con bandera.** Dos reglas de la misma categoría con
   veredictos distintos **nunca** se resuelven eligiendo una.

4. **Cita por dominio** *(cambiada en la Fase 0 del 2026-09-26; antes: «sin aparato de
   citación»)*. En los dominios de fuente pública la respuesta cita la fuente, porque es la
   vía de verificación del tercero. En los de reglas internas la trazabilidad es para
   depurar, no para exhibir.

5. **Capacidad opt-in.** No entra al Golden Path por defecto.

6. **C7 aplica.** Si vive en Supabase: RLS habilitado y `service_role` fuera de la
   superficie de consulta.

7. **Juicio a la fecha del hecho, solo se añade** *(Fase 0, 2026-09-26)*. Retirar una regla
   cierra su vigencia. Cambiar un significado añade una versión. Nada se borra ni se edita
   en su sitio: tampoco categorías, keywords ni exclusiones.

8. **Una sola fuente, en este repo** *(Fase 0, 2026-09-26)*. Las reglas de Hermes se traen
   una vez, con su historial, y desde entonces se investigan y siembran aquí. Cada proyecto
   fija una versión exacta y registra sus dominios. `vigila:versiones` avisa de la nueva
   y nunca actualiza. Descartadas: que la fuente siga en Hermes (los arreglos quedarían
   fuera de esta gobernanza) y un repo propio (uno más con su CI). Hermes pasa a leerla
   después, en un paso aparte.

## Decisiones que quedan ABIERTAS para quien ejecute

- Cómo carga cada proyecto los dominios que registra (tabla o archivo versionado): depende
  del proyecto. La **fuente** ya no está abierta (decisión 8).
- Formato exacto del contrato categoría/regla/veredicto.
- Cómo se implementa el parser (el Golden Path ya trae Vercel AI SDK + Zod para esto:
  template `structured-outputs` del skill `ai`).
- Si el gate propio entra a `validate` como script nuevo o como caso del corpus existente.

## Estrategia de tests (derivada de la Definición de Hecho)

Cuatro pruebas, tres de ellas **negativas** — la proporción no es casual:

| Prueba | Qué demuestra | DoF |
|---|---|---|
| End-to-end con oración real | El flujo completo funciona sin payload armado a mano | 3 |
| Negativa: sin regla aplicable | El fail-safe existe de verdad | 4 |
| Negativa: colisión de categorías | Las exclusiones sirven (antes/después) | 5 |
| Negativa: conflicto de veredictos | Degrada, no elige | 6 |
| Conteo de reglas fijado en test | El conocimiento no deriva en silencio | 7 |

## Riesgo que este plan no resuelve

La propia spec lo pregunta en su punto 8 y sigue sin respuesta: **¿qué pasa si el LLM del
parser se cae?** ¿El motor deja de responder, o falla distinto que cuando no hay regla? Son
dos modos de fallo con la misma cara para el usuario y respuestas distintas. Quien ejecute
tiene que resolverlo o declararlo como límite conocido — no darlo por obvio.

## Riesgos que el contraste con el origen añadió (2026-09-26)

Medidos en `hermes-os-a2a@97d9f9e`. El plan de módulos de arriba no los veía:

- **El gate de siembra no ve conflictos de veredicto.** El seed real pasa con uno vivo
  (`INTERESES`). "Una regla rectora por categoría" allí es convención manual, y el módulo
  *Gate de validación* tiene que cubrirlo, no heredarlo.
- **Retirar una regla borra el pasado.** Allí las bajas son `DELETE`, y un hecho de 2024
  perdió su regla. El *Almacén de reglas* tiene que cerrar vigencia, no borrar (duda de la
  vigencia en la spec).
- **La decisión 4 (sin cita) iba contra el mecanismo de seguridad del origen.** Resuelto en
  la Fase 0 del 2026-09-26: la cita es por dominio.
