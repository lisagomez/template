# Grafo de conocimiento — Spec

> Destilado de la Fase 8 de Hermes OS (`.claude/memory/project/fase8-grafo-regulatorio.md`
> y `businessos/grafo/` del repositorio `hermes-os-a2a`), generalizado de motor de
> cumplimiento legal citado a **capacidad de uso general** para este boilerplate.
> **Forma: LOOP.** El parser de lenguaje natural, el motor de reglas, las exclusiones
> anti-colision y las pruebas comparten el mismo contexto de un solo modulo — no hay
> paralelismo real que grafear.

## MISION

Que este boilerplate pueda traer, cuando un proyecto lo necesite, un **grafo de
conocimiento**: un motor que responde preguntas del usuario **en oraciones libres**
contra reglas propias del negocio, con una respuesta acotada (nunca "no se que
contestar" disfrazado de respuesta segura). Lo regulatorio — "¿esto esta permitido?",
"¿que debo cumplir?" — es el primer caso de uso que trae de fabrica, probado en Hermes
con 68 reglas reales en produccion, pero **no es lo unico que el grafo sabe hacer**:
cualquier dominio con reglas propias y veredictos acotados (elegibilidad, políticas
internas, clasificacion de soporte, lo que sea) usa la misma estructura.

**1. Un modelo de grafo agnostico de dominio.** `categoria (palabras clave +
exclusiones) → regla → veredicto`, con un vocabulario de veredicto **acotado por
dimension** (no texto libre) y sin acoplarse a ningun dominio en particular. Lo legal
mexicano de Hermes es el ejemplo que prueba el patron, no la forma final.

**2. La entrada es una oracion, no un payload.** El usuario pregunta en su propio
lexico ("¿puedo hacer envios internacionales sin permiso especial?"), no llena un
formulario de `categoria`/`concepto`/`contexto`. Una capa de estructuracion — el
`ai` skill de este template, template `structured-outputs` (Vercel AI SDK + Zod) —
parsea esa oracion a los campos internos que el motor determinista necesita antes de
evaluar. El LLM estructura la pregunta; **no decide el veredicto**, eso lo sigue
haciendo el motor de reglas sin modelo de por medio.

**3. La salida tambien es una oracion, sin aparato de citacion.** A diferencia del
original de Hermes (que exige citar articulo y fuente primaria en cada respuesta,
doctrina correcta para lo legal pero pesada para uso general), aqui la respuesta se
entrega con la misma naturalidad con la que se pregunto — sin mostrar de que regla,
tabla o documento salio el dato. La trazabilidad interna (que regla disparo, para
poder depurar) es asunto de implementacion, no algo que la respuesta al usuario deba
exhibir.

**4. Fail-safe real: el motor nunca inventa certeza que no tiene.** Si ninguna regla
hace match, la respuesta dice explicitamente que no hay informacion suficiente — jamas
una respuesta con la misma forma segura que una respuesta real. Bug real de Hermes que
esto existe para no repetir: un agente dio un veredicto completo con el motor caido
porque nadie le prohibio expresamente improvisar el mismo formato de certeza.

**5. Anti-colision y conflicto resueltos por diseño, no por suerte.** Dos mecanismos
que Hermes tuvo que aprender con un incidente real cada uno, y que este spec ya trae
incorporados desde el dia uno:
   - **Exclusiones por categoria**: el clasificador por palabras clave puede matchear
     la categoria equivocada (caso real: "agente de seguros para drones" cayo en la
     categoria de operacion de drones en vez de intermediacion de seguros, porque
     ambas comparten la palabra "drones"). Cada categoria declara exclusiones que la
     descartan aunque sus keywords tambien matcheen.
   - **Regla de conflicto**: si dos reglas de la misma categoria arrojan veredictos
     distintos, el motor **degrada a fail-safe con bandera** — nunca elige una de las
     dos arbitrariamente.

**6. Tests atados al estado real del conocimiento.** Cualquier cambio a las reglas
(agregar, quitar, modificar) actualiza en el mismo cambio un test que fija el conteo
total y los casos de regresion — para que el conocimiento no derive en silencio.

## LIBERTAD TECNICA

Vos decidis donde viven las reglas (tabla de Supabase, archivo de configuracion
versionado, lo que convenga al proyecto), el formato exacto del contrato interno
categoria/regla/veredicto, y como se implementa el parser de lenguaje natural. Lo que
aparece aqui es **sugerencia descartable** salvo lo que diga RESTRICCIONES REALES.

Una advertencia que no es de stack, es de diseño: **el parser de lenguaje natural y el
motor de reglas son dos responsabilidades separadas, y la frontera importa.** El LLM
solo traduce la oracion a campos estructurados (y opcionalmente redacta la respuesta
final en lenguaje natural); el veredicto lo calcula siempre el motor determinista.
Fusionar ambas cosas — dejar que el LLM tambien decida el veredicto — es exactamente
el patron que hace que una respuesta con forma de certeza pueda estar inventada.

## INVESTIGA ANTES DE CONSTRUIR

1. Antes de diseñar el modelo de datos, lee la Fase 8 completa de `hermes-os-a2a`:
   `.claude/memory/project/fase8-grafo-regulatorio.md` (la cronologia completa,
   incluidos los dos incidentes reales que originan los puntos 4 y 5 de MISION) y
   `businessos/grafo/README.md` (la anatomia del servicio: modelo de datos, gate de
   validacion del seed, clasificador). Es el unico material que prueba que el patron
   funciona con reglas reales en produccion — no lo reinventes desde cero.
2. Lee el `ai` skill de este template (`structured-outputs` y `tools`) antes de
   diseñar el parser de lenguaje natural: el Golden Path ya trae Vercel AI SDK + Zod
   para exactamente este problema (respuesta tipada garantizada de un modelo).
3. Lee `CLAUDE.md` (Golden Path, Reglas de Codigo, control C7) y
   `.claude/gobernanza/GOBERNANZA.md` antes de proponer el modelo de datos: si el
   grafo vive en Supabase, RLS y la prohibicion de `service_role` en la superficie de
   consulta aplican igual que a cualquier otra tabla.
4. Confirma con el material de origen, no de memoria, los dos incidentes que motivan
   el punto 5 (colision de keywords, conflicto de veredictos) — son la evidencia de
   que el mecanismo hace falta, no una precaucion teorica.

## DEFINICION DE HECHO (evidencia visible en la conversacion)

1. **`npm run validate` en verde**, con su salida pegada, incluyendo el gate nuevo de
   este spec (ver COMANDO DE VALIDACION).
2. **Estructura del grafo**: arbol de archivos/tablas creadas y el contrato
   categoria/regla/veredicto (Zod o el schema elegido), con al menos dos dominios de
   ejemplo poblados — uno **regulatorio** (veredicto permitido/no_permitido/dudoso,
   espejo reducido del caso real de Hermes) y uno **generico** de otro dominio, para
   demostrar que el modelo no esta atado a lo legal.
3. **Prueba end-to-end con una oracion real**, no un payload armado a mano: una
   pregunta en lenguaje natural que el parser estructura, el motor evalua, y la
   respuesta vuelve tambien en lenguaje natural, sin exponer de que regla salio.
4. **Control negativo del fail-safe**: una pregunta sin regla aplicable devuelve la
   respuesta explicita de "no hay informacion suficiente" — pegar la salida.
5. **Control negativo de exclusiones**: una oracion diseñada para colisionar dos
   categorias (siguiendo el patron real de Hermes) cae en la categoria correcta gracias
   a la exclusion — pegar antes/despues (sin la exclusion, colisiona; con ella, no).
6. **Control negativo de conflicto**: dos reglas de la misma categoria con veredictos
   distintos hacen que el motor degrade a fail-safe con bandera, no que elija una —
   pegar la salida.
7. **Tests con el conteo de reglas real**, corridos y verdes, mostrando que agregar
   una regla nueva obliga a tocar el test en el mismo cambio.
8. **Autocritica**: que parte de este mecanismo podria fallar en produccion (¿el
   parser de lenguaje natural entiende mal una pregunta ambigua? ¿que pasa si el LLM
   del parser se cae — el motor deja de responder o falla distinto que si no hay
   regla?) y como quedo resuelto o declarado como limite conocido.

## COMANDO DE VALIDACION

```bash
npm run validate
```

Correlo tras cada cambio grande y **surfea su salida**. Si esta capacidad agrega un
verificador propio (por ejemplo, uno que confirme que toda categoria con exclusiones
las tiene activas, o que el fail-safe es alcanzable), entra a `validate` — si no cabe
ahi, no es un gate, es una intencion.

## RESTRICCIONES REALES

- **Alineado al Golden Path**: Next.js + Supabase, no el stack de Hermes
  (FastAPI + Postgres standalone + Docker). Si las reglas viven en Supabase, RLS
  habilitado y **sin `service_role` en la superficie de consulta** (control C7) —
  esa llave tiene BYPASSRLS y queda para migraciones/jobs de plataforma, no para
  responder preguntas de usuarios.
- **Zod para el contrato interno**, nunca `any`. La oracion del usuario es entrada no
  confiable como cualquier otra: se valida antes de usarse.
- **Es una capacidad opt-in**, no parte del Golden Path por defecto: se dispara cuando
  el proyecto necesita responder preguntas estructuradas contra reglas propias del
  negocio (elegibilidad, politicas internas, permisos, lo que sea) — no todo proyecto
  de este template la necesita.
- **No se exige citar fuente en la respuesta al usuario final.** Esto es una
  desviacion deliberada del original de Hermes (que la exige siempre para lo legal):
  aqui la trazabilidad interna, si se implementa, es para depuracion, no para
  exhibirse en la respuesta.
- **El LLM nunca decide el veredicto**, solo estructura la pregunta y puede redactar
  la respuesta final. El veredicto siempre sale del motor determinista — ver
  LIBERTAD TECNICA.
- **Todo cambio de comportamiento es un CDC (C1)**: si esta capacidad ya esta en
  produccion en algun proyecto y se le cambian las reglas de clasificacion o el prompt
  del parser, aplica diff + regresion + aprobacion, igual que cualquier otro cambio de
  comportamiento de agente.
- **Sostenible por una persona sola.** Si el mecanismo de exclusiones/conflicto exige
  curar manualmente cada regla nueva contra todas las existentes, no escala — el
  gate de validacion (equivalente al `--check` de Hermes) tiene que detectarlo
  automaticamente antes de sembrar, no depender de que alguien se acuerde de revisar.
- **Este spec es solo planeacion.** No se crean tablas ni se escribe el motor en esta
  tarea — es el blueprint para cuando un proyecto concreto lo necesite (via `/prp` +
  `/bucle-agentico`, el flujo normal de este template para features nuevas).
