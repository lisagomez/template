# Spec 005 — Capa de interoperabilidad A2A

> **Reexpresada al protocolo el 2026-08-30.** Derivada de la versión compilada por
> `/goal-compiler` el 2026-08-24. El texto original —incluida la tabla completa de
> descartes del material de origen— sigue recuperable:
> `git show 461803f:.claude/PRPs/specs/spec-a2a-interoperabilidad.md`
>
> Se conserva **Libertad técnica**, núcleo del diseño original.
>
> **Estado: NO CONSTRUIDA.** Ver `plan.md` y `tareas.md`.
>
> ⚠️ Sus datos de protocolo son de un fetch del **2026-08-24** sobre un estándar joven.
> Nada aquí es hecho confirmado hasta introspeccionar el paquete instalado.

## Contexto y objetivo

Hoy el template sabe **consumir** capacidades externas, pero no sabe **ofrecerse** como una:
no hay camino para que un proyecto nacido de aquí exponga una capacidad de su negocio a un
agente externo por un protocolo estándar.

A2A y MCP son complementarios, no competidores: MCP conecta un agente con herramientas y
datos; A2A conecta un agente con **otro agente**. Esta es la primera vez que el template se
ofrece como el segundo.

## Usuarios / actores

- **El dueño del proyecto derivado**, que declara qué capacidad expone y su invariante.
- **Un agente externo** (de un socio, un cliente, un ecosistema) que consume la capacidad.
- **La dueña del repo**, que autoriza la exposición real a internet.

## Historias de usuario

- H1: Como dueño quiero que la skill me pregunte cuál es mi capacidad y su regla de oro,
  porque no hay default razonable para "cuál es tu negocio".
- H2: Como consumidor externo quiero un fallo legible en vez de un 200 con dato inventado,
  para poder confiar en la respuesta cuando sí llega.
- H3: Como dueña quiero que exponer el endpoint a un partner sea una decisión mía y no un
  efecto secundario de generar la skill.

## Requisitos funcionales (criterios de aceptación en EARS)

- RF-1: CUANDO se invoque la skill, EL SISTEMA entrevistará al usuario sobre la capacidad a
  exponer, su entrada, su salida y su regla de oro.
- RF-2: SI la entrevista no se completa, ENTONCES EL SISTEMA no generará nada.

  > **No hay default razonable para "cuál es tu negocio".** Igual que la skill de pagos
  > pregunta qué se va a cobrar, ésta pregunta cuál es la capacidad a exponer y su regla de
  > oro: el invariante que el protocolo jamás puede perder al traducir la respuesta. En el
  > sistema de origen ese invariante era "disclaimer + fuentes" porque el dominio era
  > regulatorio; aquí lo declara cada usuario para el suyo.
- RF-3: EL SISTEMA servirá una Agent Card en `/.well-known/agent-card.json`.
- RF-4: CUANDO se construya la Agent Card, EL SISTEMA la validará contra los tipos que
  exporta el SDK **instalado**, no contra una lectura del proto.

  > **Un Agent Card mal formado no interopera con nada, aunque tu código compile.** El
  > compilador no sabe nada del protocolo: valida tu lectura de él, que es justo lo que
  > puede estar mal.
- RF-5: EL SISTEMA expondrá solo la capacidad declarada en la Agent Card.
- RF-6: SI una petición intenta alcanzar una ruta interna, un stack trace o un nombre de
  tabla o de motor, ENTONCES EL SISTEMA no lo filtrará.
- RF-7: SI la capacidad está caída, la entrada es inválida u ocurre una excepción interna,
  ENTONCES EL SISTEMA devolverá una Task en estado `failed` con razón legible.
- RF-8: EL SISTEMA nunca devolverá un 200 con respuesta inventada ni un 500 crudo con
  detalle interno.

  > **Un fail-safe que solo se probó con el camino feliz no es un fail-safe.** Se prueba
  > apagando la capacidad detrás y con entrada corrupta, antes de darlo por bueno. Es la
  > garantía central frente a un consumidor externo: si falla, falla en casa de otro.
- RF-9: EL SISTEMA declarará un mínimo de autenticación real (API key o bearer) y marcará
  OAuth2, OIDC, mTLS y la gestión multi-partner como residual explícito.

  > **Declarar el hueco es más honesto que fingir resolverlo** — el mismo tratamiento que el
  > sistema de origen le dio a "exposición a internet". La spec oficial de descubrimiento
  > reconoce que aún no estandariza registries: tampoco hay que inventar ese mecanismo.
- RF-10: EL SISTEMA pineará la versión del SDK, sin rangos.
- RF-11: SI la capacidad toca Supabase, ENTONCES EL SISTEMA llamará a la función que ya
  respeta RLS, y jamás usará `service_role` para simplificar el paso por A2A.
- RF-12: MIENTRAS no exista gestión de credenciales por partner, EL SISTEMA exigirá gate
  humano antes de exponer el endpoint real a un partner o a internet.
- RF-13: EL SISTEMA registrará el contrato de la skill en el corpus de regresión, verificado
  por el mismo mecanismo que las skills existentes.

## Requisitos no funcionales

- **Golden Path sin excepciones**: TypeScript, ningún servicio en otro lenguaje, ningún
  contenedor nuevo.
- **Aislar, no fundir**: el bridge vive en su propio espacio de rutas y no importa código de
  features de negocio salvo la interfaz declarada.
- Todo en español, salvo los identificadores que el estándar exige literales: esos no se
  traducen, o se rompe la interoperabilidad.
- La `description` de la skill debe ser magra o no cabe en el presupuesto de contexto.
- Secretos: ningún token de un consumidor externo se imprime ni se loguea, ni al depurar.

## Libertad técnica *(sección conservada del diseño original)*

La ruta exacta del bridge, los nombres de archivo de la plantilla y cómo resolver el punto
de integración con el SDK (handler núcleo envuelto vs. adaptador Express) son decisiones de
quien ejecuta. El paquete y el path de la Agent Card **no** son libres: son hechos
verificados del protocolo.

Dos advertencias de física del problema: **un Agent Card mal formado no interopera con nada,
aunque el código compile**, y **un fail-safe probado solo con el camino feliz no es un
fail-safe**.

## Casos límite

- El SDK expone una superficie proto/gRPC nativa **y** una capa de compatibilidad JSON-RPC:
  cuál usar es una decisión que se toma **introspeccionando el paquete instalado en el
  momento de construir**, no algo que esta spec pueda fijar por adelantado sin arriesgar
  quedar obsoleta.
- No hay adaptador oficial para el framework del Golden Path, solo para Express.
- **Un protocolo joven envejece rápido en cualquier lenguaje.** El material de origen ya
  advertía que los tutoriales de una versión anterior mentían sobre esto. La lección que se
  generaliza no es "cuidado con aquel lenguaje": es que la fuente es el paquete instalado,
  no el tutorial ni esta spec.
- Se lee el material de origen **con la desconfianza que este repo ya se ganó el derecho a
  tener**: lo que no se pueda verificar contra la fuente real se marca como afirmación de
  origen, no como hecho.
- El presupuesto de descripciones de skills está al 95 %: puede que no quepa sin recortar
  descripciones ajenas en el mismo cambio.

## Impacto sobre terceros (control C4)

Esta capa expone el sistema **hacia fuera**: por definición, casi todo su impacto es sobre
terceros.

| Parte afectada | Daño con el sistema funcionando bien | Qué lo mitiga |
|---|---|---|
| **El agente que consume la capacidad** | Un 200 con respuesta inventada hace que actúe sobre un dato falso, y el fallo ocurre **en casa de otro**, donde nadie puede diagnosticarlo | RF-7 y RF-8: Task `failed` con razón legible, jamás un 200 fabricado |
| Usuarios cuyos datos pasan por la capacidad | Un error que filtra ruta interna, nombre de tabla o stack trace entrega información que ellos no cedieron | RF-5 y RF-6: opacidad por diseño, no como buena práctica |
| Usuarios del proyecto expuesto | Auth mínima sin gestión de credenciales por partner: un consumidor puede acceder a más de lo previsto | RF-9 declara el residual en vez de fingirlo; RF-12 exige **gate humano** antes de exponer a un partner real |
| Usuarios de la base de datos | Usar `service_role` para "simplificar" el paso por A2A anula RLS para todos los inquilinos a la vez | RF-11: se llama a la función que ya respeta RLS |

**Límite de C5**: los consumidores externos y sus usuarios no firmaron nada. Exponer un
endpoint sin gestión de credenciales por partner **no se resuelve con una firma del dueño**
si hay datos de terceros detrás: o hay gate humano y residual declarado, o no se expone.

## Fuera de alcance

- Exponer cualquier endpoint real a internet desde este repo: la demostración usa una
  capacidad de juguete.
- Reimplementar el protocolo a mano o traer el SDK de otro lenguaje.
- Inventar un mecanismo de registries: la spec oficial de descubrimiento reconoce que aún no
  lo estandariza.
- El A2A de pagos entre agentes (x402, ERC-8004, AP2), ya descartado en la spec 001.

## Trazabilidad del destilado

Cada descarte fue decisión, no olvido:

| Elemento del origen | Qué pasa aquí | Por qué |
|---|---|---|
| Bridge en Python con su SDK | Se descarta el lenguaje y el SDK; se conserva el patrón, traducido a TypeScript | Golden Path: un solo stack |
| Dominio de evaluación regulatoria | Se descarta el contenido; se conserva el mecanismo (la skill entrevista) | Un boilerplate no nace atado a un vertical |
| "Regla de oro" fija = disclaimer + fuentes | Se descarta el contenido; se conserva como campo que el usuario declara | El invariante irrenunciable es específico de cada negocio |
| Opacidad de la superficie | Se conserva sin cambios | Principio agnóstico de dominio y de stack |
| Fail-safe (Task `failed`, nunca inventar) | Se conserva sin cambios | Misma razón que la opacidad |
| `docker-compose` multi-servicio con red interna | Se descarta | El bridge vive en el único contenedor de la app |
| La advertencia "proto-first, los tutoriales viejos mienten" | Se descarta el SDK concreto; se conserva la advertencia como principio | Un protocolo joven envejece rápido en cualquier lenguaje |
| "Exposición a internet" como residual | Se conserva el tratamiento, aplicado al mínimo de auth | Declarar el hueco es más honesto que fingir resolverlo |

## Criterios de finalización

Agent Card servida y validada contra el SDK instalado · una Task que completa · una que
falla con razón legible · opacidad demostrada por intento fallido · **control negativo**:
romper una garantía pone la regresión en rojo · decisión de integración documentada con la
evidencia de introspección · **la tabla de arriba, pegada**, mostrando que cada descarte fue
decisión y no olvido.

## Dudas abiertas

- [NECESITA ACLARACIÓN] ¿Qué parte de la autenticación mínima es teatro por no haberse
  probado nunca contra un consumidor externo real? Solo se puede responder ejecutando.
- [NECESITA ACLARACIÓN] ¿Qué campos del protocolo pueden moverse por ser un estándar joven?
