---
name: add-a2a
description: |
  Expone una capacidad de tu proyecto a otros AGENTES por el protocolo A2A: Agent Card,
  JSON-RPC y Tasks, con el SDK oficial pineado.

  Usar cuando: "expon esto como agente", "add a2a", "agent to agent", "que otro agente
  llame a mi app", "agent card", "interoperabilidad entre agentes", "protocolo A2A",
  "quiero ofrecer una capacidad", "conectar con hermes".

  A2A y MCP NO son lo mismo: MCP conecta un agente con herramientas; A2A conecta un agente
  con OTRO agente. Si lo que quieres es dar herramientas a tu propio agente, no es esto.

  NO USAR para: consumir un agente ajeno, webhooks normales, ni una API REST publica.
allowed-tools: Bash(npm *), Read, Write, Edit, Glob, Grep
---

# Add A2A — ofrecer una capacidad a otros agentes

Hoy este template sabe **consumir** capacidades externas. Esta skill le enseña a **ofrecerse**
como una.

Diseño completo: `docs/SDD-puente-a2a-extractor.md`. Spec: `.claude/specs/005-a2a-interoperabilidad/`.

## Lo primero: la entrevista. Sin ella no se genera NADA

**No hay default razonable para «cuál es tu negocio».** Igual que `/add-payments` pregunta qué se
va a cobrar, ésta pregunta qué capacidad se expone. Si el usuario no contesta las cuatro, **para y
no escribas ningún archivo** (RF-1, RF-2):

1. **¿Qué capacidad expones?** Una frase. Una sola skill por Agent Card para empezar.
2. **¿Qué entra?** Tipo y forma del input.
3. **¿Qué sale?** Y en particular: ¿lleva alguna medida de incertidumbre?
4. **¿Cuál es tu regla de oro?** El invariante que el protocolo **jamás** puede perder al traducir
   la respuesta. En el sistema de origen era «disclaimer + fuentes» porque el dominio era
   regulatorio. En el extractor documental es **la confianza por campo**: un consumidor externo
   tiene que poder distinguir «esto lo leí y estoy seguro» de «esto hay que mirarlo». Perder esa
   marca convierte una estimación en un hecho **en casa de otro**.

## Pre-requisitos

- El proyecto tiene una capacidad **real** que ofrecer. Si no la tiene, esto no es lo primero
  que necesita.
- Si la capacidad toca Supabase, `/add-login` primero (hace falta la sesión para respetar RLS).

## Principios críticos

1. **La superficie son TRES rutas y ni una más.** Card, JSON-RPC y health. Se verifica
   **enumerando**, no probando una lista de rutas prohibidas — ver abajo.
2. **`/health` no reporta nada del interior.** Exactamente `{"status":"ok"}`. Un health que dice
   versiones, colas o estado de base de datos es reconocimiento gratis.
3. **Ningún componente que ejecuta un modelo tiene credenciales.** Es la frontera de
   `hermes-os-a2a`, y es lo que hace que el servicio no pueda causar daño aunque lo convenzan: no
   puede, porque no tiene las llaves.
4. **Nunca un 200 con respuesta inventada, ni un 500 crudo.** Si la capacidad está caída o la
   entrada es corrupta, se devuelve una Task en `TASK_STATE_FAILED` con razón legible (RF-7, RF-8).
5. **`service_role` jamás** para simplificar el paso por A2A. Si la capacidad toca Supabase, llama
   a la función que ya respeta RLS (RF-11, control C7).
6. **Exponer a un partner o a internet es GATE HUMANO** (RF-12). Esta skill deja el endpoint
   montado y **sin publicar**; publicarlo es otra decisión, y va con C3 y C4.

## El SDK: pinéalo, y no reescribas sus constantes

```bash
npm install @a2a-js/sdk@1.1.0    # PINEADO, sin ^ ni ~ (RF-10)
```

**Verificado por introspección el 2026-09-09**, no leído del proto — que es lo que RF-4 exige, y
la primera corrida de esa regla cazó dos errores en el propio SDD:

```ts
import { AGENT_CARD_PATH, A2A_CONTENT_TYPE, A2A_PROTOCOL_VERSION } from '@a2a-js/sdk'
// AGENT_CARD_PATH      ".well-known/agent-card.json"   <- SIN barra inicial
// A2A_CONTENT_TYPE     "application/a2a+json"          <- NO application/json
// A2A_PROTOCOL_VERSION "1.0"
```

**Impórtalas, no las escribas.** La barra que falta produce `//well-known/…`; el content-type
equivocado no interopera con nada. Las dos **compilan igual**, y ése es el punto: el compilador no
sabe nada del protocolo — valida tu lectura de él, que es justo lo que puede estar mal.

El SDK arrastra **una** dependencia (`jose`, para firmar Agent Cards). `@a2a-js/sdk/server` exporta
`JsonRpcTransportHandler`, `DefaultRequestHandler` e `InMemoryTaskStore`: se atiende JSON-RPC **sin
Express**. Hay un `./server/express` y **no se usa** — meterlo sería un servidor dentro de otro.

## Archivos a crear

### 1. La Agent Card — `src/app/.well-known/agent-card.json/route.ts`

Construida con los tipos del SDK instalado (RF-4). Declara **solo** la capacidad entrevistada
(RF-5). No dice qué modelo hay detrás, ni qué umbral usa el consumidor, ni nada del interior.

Auth: declara un mínimo real —API key o bearer— y marca **OAuth2, OIDC, mTLS y la gestión
multi-partner como residual explícito** (RF-9). Declarar el hueco es más honesto que fingir
resolverlo; la spec oficial de descubrimiento reconoce que aún no estandariza registries.

### 2. El bridge — `src/app/a2a/route.ts`

Route Handler con `JsonRpcTransportHandler`. Traduce Task ↔ capacidad y **nada más**.

El `catch` es la pieza que decide si esto es seguro: **atrapa todo, y no deja pasar nada del
interior** — ni ruta, ni stack trace, ni nombre de tabla o de motor (RF-6). Devuelve
`TASK_STATE_FAILED` con una razón en español que no cite nada de dentro.

### 3. Health mudo — `src/app/a2a/health/route.ts`

```ts
export async function GET() {
  return Response.json({ status: 'ok' })   // exactamente esto, nada más
}
```

### 4. La prueba de opacidad — la que hace que lo anterior sea verdad

Portada de `hermes-os-a2a`, y **su forma importa**: enumera las rutas y exige igualdad, en vez de
probar una lista de rutas internas. Una lista solo caza lo que alguien pensó en ponerle; enumerar
caza **la ruta que nadie previó**, que es la que se filtra de verdad.

```ts
test('la superficie A2A es EXACTAMENTE card, rpc y health', () => {
  assert.deepEqual(rutasDelBridge().sort(), [`/${AGENT_CARD_PATH}`, '/a2a', '/a2a/health'].sort())
})
test('/health no reporta nada del interior', async () => {
  assert.deepEqual(await salud(), { status: 'ok' })
})
```

### 5. El fail-safe, probado apagando la capacidad

**Un fail-safe probado solo con el camino feliz no es un fail-safe.** Se prueba con la capacidad
caída **y** con entrada corrupta, antes de darlo por bueno (RF-7, RF-8). Es la garantía central
frente a un consumidor externo: si falla, falla en casa de otro.

## Antes de exponer nada: los dos huecos que hay que mirar

No son teóricos y esta skill **no los resuelve**:

- **Cuota y límite de tasa por partner.** No existen. Sin ellos, quien te llame puede vaciar tu
  presupuesto del motor que haya detrás. Es el hueco mayor.
- **AISIA (C4) sobre terceros.** Si un partner manda un documento de un cuarto, hay datos de alguien
  que no firmó nada. `AGENTS.md` es explícito: cuando el daño recae sobre terceros que no firmaron,
  **ninguna firma lo autoriza** — se rediseña o no se hace.

`AGENTS.md` clasifica esta superficie igual que un canal de chat externo: *«superficie de entrada
no autenticada hacia un agente que tiene llaves»*. Cambia el formato, no el riesgo.

## Flujo de ejecución

1. Entrevista (4 preguntas). Sin las cuatro, **para**.
2. `npm install @a2a-js/sdk@1.1.0` y confirma la versión resuelta.
3. Agent Card, bridge y health.
4. Prueba de opacidad **y** fail-safe, en el mismo paso. No después.
5. Corre `npm run validate`.
6. **Entrada en `BITACORA-CDC.md`**: exponer una capacidad cambia lo que este sistema hace para
   terceros, y eso es un CDC.
7. **Para.** No publiques la ruta. Di qué falta para exponerla: cuota, límite de tasa, C3 y C4.

## Mensaje final

Di, sin adornarlo:

- Qué capacidad quedó expuesta y cuál es su regla de oro.
- Que el endpoint está montado y **sin publicar**, y que publicarlo es gate humano.
- Los dos huecos: sin cuota por partner y sin AISIA de terceros.
- La versión exacta del SDK que quedó pineada.
