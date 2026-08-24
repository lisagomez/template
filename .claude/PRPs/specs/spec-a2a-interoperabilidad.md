# Capa de Interoperabilidad A2A del SaaS Factory — Spec

> Compilado por `/goal-compiler` el 2026-08-24 desde 3 documentos de la Fase 5 —
> Interoperabilidad A2A de Hermes OS / businessos (`grafo-a2a`: el puente que expone su
> grafo de evaluación regulatoria fiscal/contable/contractual LATAM como agente del
> protocolo Agent2Agent usando `a2a-sdk` 1.1.0 en Python) y el repositorio oficial
> `a2aproject/A2A` + `a2aproject/a2a-js` (verificado por fetch directo el 2026-08-24),
> alineado con este template.
> **Forma: LOOP.** Investigar el protocolo, diseñar la entrevista de descubrimiento,
> generar la skill `add-a2a` con su plantilla de bridge y cablear el gate comparten el
> mismo contexto de repo y cierran con el mismo `npm run validate`; colapsarlos en un solo
> agente no pierde nada. Grafearlo sería teatro de complejidad.

## MISION

Hoy este template sabe **consumir** capacidades externas (MCP, skill `ai` con OpenRouter)
pero no sabe **ofrecerse** como una: no existe ningún camino para que un proyecto nacido de
aquí exponga una capacidad de su propio negocio a un agente externo —de un socio, de un
cliente, de un ecosistema— por un protocolo estándar. A2A y MCP son complementarios, no
competidores: MCP conecta un agente con herramientas/datos; A2A conecta un agente con
**otro agente**. Esta es la primera vez que el template se ofrece como el segundo.

Hermes OS ya resolvió una versión de este problema con `grafo-a2a`, pero atada a un dominio
(evaluación regulatoria) y a una infraestructura (Python + `docker-compose` multi-servicio
con red interna) que este template no tiene y no debe imitar: el Golden Path es un solo
stack, sin excepciones, y el `docker-compose.yml` real trae exactamente dos servicios
(`app` + `caddy`).

Al terminar, un proyecto que nazca de aquí hereda seis cosas que hoy no existen:

**1. Una skill `/add-a2a` que ENTREVISTA, nunca asume el dominio.** Igual que
`/add-payments` pregunta qué se va a cobrar, `/add-a2a` pregunta **cuál** es la capacidad
de negocio a exponer (una server action o ruta que ya existe, o una que el usuario declara
que va a existir), su entrada, su salida, y su **regla de oro**: el invariante que el
protocolo jamás puede perder al traducir la respuesta. En Hermes era "disclaimer + fuentes"
porque el dominio era regulatorio; aquí es un campo que cada usuario declara para SU
dominio. Sin esta entrevista la skill no genera nada — no hay default razonable para
"cuál es tu negocio".

**2. Un bridge A2A nativo en TypeScript con el SDK oficial `@a2a-js/sdk` (pineado).**
Existe SDK oficial de JavaScript/TypeScript (`npm install @a2a-js/sdk`, mantenido
activamente por `a2aproject`) — no hay que reimplementar el protocolo a mano ni traer el
SDK Python de Hermes. El bridge vive como Route Handlers de Next.js, en su propio espacio
de rutas dentro del mismo proyecto y contenedor `app`. El núcleo del SDK es agnóstico de
framework; trae un adaptador opcional para Express (`@a2a-js/sdk/server/express`,
peer-dependency) pero **no uno oficial para Next.js** — la sesión que ejecute este spec
debe introspeccionar el paquete instalado para decidir si el handler núcleo se envuelve
directamente en un Route Handler (Request/Response estándar de la Web) o si hace falta
aceptar Express como dependencia adicional. "Aislar, no fundir" se mantiene, pero aquí el
aislamiento es un límite de código (rutas propias, sin importar features de negocio salvo
la interfaz declarada de la capacidad), no un límite de proceso/contenedor como en Hermes.

**3. Precisión de protocolo verificada contra la fuente, nunca contra tutoriales.** Agent
Card en `/.well-known/agent-card.json` (RFC 8615, confirmado vigente), con los campos
reales del proto actual (`name`, `description`, `supportedInterfaces` — el protocolo ya
modela múltiples transportes/URLs por agente, no un `url` plano —, `provider`, `version`,
`capabilities`, `securitySchemes`, `defaultInputModes`/`defaultOutputModes`, `skills`).
Estados de Task reales: `submitted`, `working`, `completed`, `failed`, `canceled`,
`input-required`, `rejected`, `auth-required`. El propio material de origen advierte que
`a2a-sdk` es proto-first y que tutoriales viejos (v0.2) mentían sobre esto — la lección que
se generaliza no es "cuidado con Python": es que un protocolo joven envejece rápido en
cualquier lenguaje, y hoy conviven en el SDK JS una superficie proto/gRPC nativa y una capa
de compatibilidad JSON-RPC 2.0 (`@a2a-js/sdk/compat/v0_3`) — cuál usar es una decisión que
se toma introspeccionando el paquete instalado en el momento de construir, no algo que este
spec puede fijar por adelantado sin arriesgar quedar obsoleto.

**4. Opacidad por diseño (heredada sin cambios).** La superficie A2A expone SOLO la
capacidad declarada en la Agent Card: nunca rutas internas del proyecto, nunca el motor o
modelo detrás de la capacidad, nunca detalles de error internos (stack traces, nombres de
tabla o de servicio). Principio agnóstico de dominio y de stack — se traslada intacto.

**5. Fail-safe (heredado sin cambios).** Servicio/capacidad caída, entrada inválida, o
excepción interna → una Task en estado `failed` con razón legible. Nunca un 200 con
respuesta inventada, nunca un 500 crudo con detalle interno. Es la garantía central frente
a un consumidor externo — se traslada intacta.

**6. Un mínimo de auth para terceros, declarado, con lo que falta marcado como residual.**
El proto oficial soporta 5 esquemas en `securitySchemes`: API key, HTTP bearer, OAuth2,
OpenID Connect, mTLS. El mínimo pragmático para un primer consumidor (API key o bearer) se
declara real; OAuth2/OIDC/mTLS y la gestión de credenciales multi-partner quedan como
residual explícito — igual que Hermes OS dejó "exposición a internet" como residual en vez
de fingir una solución completa. La spec de descubrimiento oficial reconoce que **no
estandariza aún** registries/catálogos más allá de la Agent Card estática — no hay que
inventar ese mecanismo tampoco.

Todo lo anterior entra al gate existente: `add-a2a` gana una entrada en
`.claude/gobernanza/golden-sets/contratos.json` (capa A de C2), verificada por
`npm run regresion` dentro de `npm run validate` — el mismo mecanismo que ya cubre
`add-login`/`add-payments`.

### Lo que se DESCARTA del material de origen (y por qué)

| Elemento de origen (Hermes OS / `grafo-a2a`) | Qué pasa aquí | Por qué |
|---|---|---|
| Lenguaje del bridge: Python + `a2a-sdk` 1.1.0 | Se descarta el lenguaje y el SDK; se conserva el patrón (capacidad expuesta como agente A2A), traducido a TypeScript + `@a2a-js/sdk` | Golden Path: un solo stack. `docker-compose.yml` no tiene topología multi-servicio |
| Dominio: evaluación regulatoria fiscal/contable/contractual LATAM | Se descarta el contenido; se conserva el mecanismo (la skill entrevista, nunca asume) | Un boilerplate no nace atado a un vertical |
| "Regla de oro" = disclaimer + fuentes, fija | Se descarta el contenido; se conserva como campo que el usuario declara en la entrevista | El invariante irrenunciable es específico de cada negocio |
| Opacidad de la superficie A2A | Se conserva sin cambios | Principio agnóstico de dominio y de stack |
| Fail-safe (Task `failed`, nunca inventar) | Se conserva sin cambios | Misma razón que la opacidad |
| `docker-compose` multi-servicio con red interna (`hermes-net`) | Se descarta | Incompatible con el Golden Path; el bridge vive en el único contenedor `app` |
| `a2a-sdk` 1.1.0 Python y la advertencia "proto-first, tutoriales v0.2 mienten" | Se descarta el SDK concreto; se conserva la advertencia como principio general, ahora aplicada también a la superficie proto/JSON-RPC dual del SDK JS actual | Un protocolo joven envejece rápido en cualquier lenguaje |
| "Exposición a internet" como residual | Se conserva el mismo tratamiento, aplicado al mínimo de auth para terceros | El template no trae gestión de credenciales por partner; declarar el hueco es más honesto que fingir resolverlo |

No se toca el material de origen de Hermes; solo se lee. Y este A2A **no es** el que
`spec-gobernanza-agentica.md` ya descartó (x402/ERC-8004/AP2, pagos entre agentes, vertical
blockchain): ese sigue fuera. Este es el protocolo Agent2Agent de interoperabilidad de
tareas (Linux Foundation), y entra por primera vez al template.

## LIBERTAD TECNICA

Tú eliges la ruta exacta del bridge dentro de Next.js, el nombre de archivos de la
plantilla que la skill genera, y cómo resolver el punto de integración con
`@a2a-js/sdk` (handler núcleo envuelto directo vs. adaptador Express). El paquete
`@a2a-js/sdk` y el path `/.well-known/agent-card.json` NO son libres — son hechos
verificados del protocolo, no una elección de este spec. Cualquier otro detalle de
implementación nombrado aquí es sugerencia descartable, salvo lo que diga RESTRICCIONES
REALES.

Dos advertencias que no son stack, son física del problema:

- **Un Agent Card mal formado no interopera con nada, aunque tu código compile.** Valídalo
  contra los tipos que exporta `@a2a-js/sdk` instalado, no contra tu propia lectura del
  proto.
- **Un fail-safe que solo se probó con el camino feliz no es un fail-safe.** Pruébalo
  apagando la capacidad detrás y con entrada corrupta antes de darlo por bueno.

## INVESTIGA ANTES DE CONSTRUIR

1. **Instala `@a2a-js/sdk` e introspecciona el paquete real** (`node -e` sobre sus
   exports, o sus `.d.ts`): confirma la forma exacta de `AgentCard` en TypeScript
   (nombres en camelCase, cuáles son opcionales), el enum/tipo de `TaskState`, si el
   handler núcleo es extraíble sin Express, y si conviene la superficie proto/gRPC nativa
   o la capa de compatibilidad JSON-RPC (`@a2a-js/sdk/compat/v0_3`). Los hallazgos de este
   spec (fetch del 2026-08-24 contra el repo oficial) son el punto de partida, no la
   última palabra — verifica contra la versión que `npm install` resuelva en ese momento.
2. **Lee el repositorio oficial `a2aproject/A2A`** (`specification/a2a.proto` y
   `docs/topics/agent-discovery.md`) para lo que este spec no cubrió en detalle: reglas
   exactas de transición entre estados de Task, forma exacta de `AgentSkill` (ejemplos,
   modos de input/output por skill), y el mecanismo de "Extended Agent Card" autenticada
   si el proyecto derivado lo necesita.
3. **Lee los 3 documentos de la Fase 5 de Hermes OS / businessos** completos, con la
   desconfianza que este repo ya se ganó el derecho a tener: lo que no puedas verificar
   contra la fuente real se marca como afirmación de origen, no como hecho.
4. **Lee el estado real de este template**: `AGENTS.md` (Golden Path, Reglas de Código,
   C1-C7), `docker-compose.yml` (confirma que sigue siendo `app` + `caddy`),
   `.claude/skills/add-payments/SKILL.md` y `.claude/skills/add-mobile/SKILL.md` (patrón
   de entrevista + pre-requisitos + generación de archivos),
   `.claude/gobernanza/golden-sets/contratos.json` (formato del contrato de C2 capa A), y
   cómo Next.js 16 App Router sirve un path bien conocido como `/.well-known/...`
   (Route Handler vs archivo estático) antes de asumir la convención correcta.
5. **Mide el presupuesto de contexto antes de escribir el frontmatter**:
   `npm run mide:contexto` reporta hoy las descripciones de skills al 87%/3500 y el total
   de sesión al 89%/12000. La `description` de `add-a2a` tiene que ser magra o el
   presupuesto se pasa.

## DEFINICION DE HECHO (evidencia visible en la conversación)

El evaluador solo ve esta conversación: no corre comandos, no lee archivos por su cuenta.
Todo tiene que estar surfeado en el transcript.

1. **`npm run validate` en verde**, con su salida pegada, incluyendo el gate nuevo.
2. **La skill existe**: árbol de `.claude/skills/add-a2a/` y el índice de `SKILL.md`,
   mostrando que declara la entrevista de descubrimiento, el campo de regla de oro, el
   path del Agent Card, los métodos/estados usados, la opacidad, el fail-safe, la regla C7
   (`service_role`) y el gate humano para exposición real a un partner.
3. **`@a2a-js/sdk` pineado en `package.json`**, con la versión exacta resuelta y su fuente.
4. **Prueba end-to-end con una capacidad de juguete** (nunca datos ni lógica de un cliente
   real): Agent Card servida (JSON completo), una llamada que complete una Task
   (`completed`, con resultado), y una llamada con entrada inválida o la capacidad apagada
   que produzca `failed` con razón legible.
5. **Opacidad demostrada**: intento de llegar desde la superficie A2A a algo interno (ruta
   de negocio, stack trace, nombre de tabla/motor) y evidencia de que no se filtra nada.
6. **Control negativo del contrato**: rompe a propósito una de las seis garantías (ej.
   borra el manejo de `failed`, o haz que el fail-safe devuelva 200 con dato inventado) →
   `npm run regresion` en rojo, salida pegada; restaura → verde.
7. **Trazabilidad del destilado**: la tabla de MISION, pegada, mostrando que cada descarte
   fue decisión, no olvido.
8. **Decisión de integración con Next.js documentada**: cómo se resolvió lo de Express
   vs. handler núcleo directo, con la evidencia de introspección del paquete instalado.
9. **Presupuesto de contexto**: salida de `npm run mide:contexto` con el coste de la
   `description` nueva contra el presupuesto actual.
10. **Entrada firmada en `.claude/gobernanza/BITACORA-CDC.md`** (radio: skill nuevo) y la
    entrada nueva en `contratos.json`, y memoria del proyecto actualizada.
11. **Autocrítica**: ¿qué parte de la auth mínima es teatro porque nunca se probó contra
    un consumidor externo real? ¿qué campo del protocolo puede moverse por ser un estándar
    joven? ¿qué le falta a esto para servirle a un partner real? Resuélvelas antes de
    cerrar.

## COMANDO DE VALIDACION

```bash
npm run validate
```

No se crea un script de red nuevo: el contrato de `add-a2a` entra a
`.claude/gobernanza/golden-sets/contratos.json` (capa A de C2), verificado por
`npm run regresion`, ya parte de `validate` — el mismo mecanismo de `add-login` y
`add-payments`. Si algo no cabe en `validate`, no es un gate.

La prueba end-to-end del punto 4 de DEFINICION DE HECHO corre en una app descartable
(fuera de este repo o en un directorio no versionado), nunca con datos de cliente, y su
salida se pega en la conversación. `@a2a-js/sdk` como dependencia queda cubierto por el
vigilante existente `npm run vigila:versiones` — no se construye uno nuevo.

## RESTRICCIONES REALES

- **Es boilerplate**: la demostración usa una capacidad de juguete; no se expone ningún
  endpoint real a internet desde este repo.
- **No romper `npm run validate` actual**: `npm run regresion` da hoy 92/92 contratos
  verdes; `npm run verify:gobernanza` puede traer fallos preexistentes no relacionados con
  A2A en algunos checkouts — confírmalo antes de asumir que el gate parte limpio, y no lo
  arregles como parte de esta tarea salvo que bloquee el nuevo contrato.
- **Golden Path — un solo stack, sin excepciones**: el bridge es Route Handlers de Next.js
  en TypeScript con `@a2a-js/sdk` pineado. Ningún servicio en otro lenguaje, ningún
  contenedor nuevo en `docker-compose.yml`.
- **C7 (`service_role`/RLS)**: si la capacidad expuesta toca Supabase, el bridge llama a la
  misma función/server action que ya respeta RLS; jamás usa `service_role` para
  "simplificar" el paso por A2A.
- **Aislar, no fundir**: el código del bridge vive en su propio espacio de rutas; no
  importa código de features de negocio salvo la interfaz declarada de la capacidad.
- **Opacidad y fail-safe son no negociables**, sin importar el dominio.
- **Presupuesto de contexto**: la `description` de `add-a2a` tiene que ser magra; si no
  cabe, la profundidad va a `references/`, no al frontmatter ni al cuerpo corto.
- **CDC (C1)**: skill nuevo = diff + regresión + aprobación humana + entrada en
  `BITACORA-CDC.md`.
- **Gate humano antes de exponer el endpoint A2A real a un partner o a internet**: se
  documenta como decisión de riesgo (C5) si se activa antes de tener gestión de
  credenciales por partner.
- **Todo en español**, salvo los identificadores de protocolo que el estándar exige literal
  (nombres de campo, métodos RPC): esos no se traducen, o rompen interoperabilidad real.
- **No inventar campos ni casing**: lo no verificado contra el paquete `@a2a-js/sdk`
  instalado se marca "afirmación de origen/spec, no hecho confirmado en código".
- **Secretos**: cualquier token o API key de un consumidor externo nunca se imprime ni se
  loguea, ni siquiera para depurar.
- **No tocar el material de origen de Hermes OS / businessos** — es solo lectura.
