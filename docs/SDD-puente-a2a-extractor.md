# SDD — El puente A2A, y por qué el extractor es su primera capacidad

> Diseño, no implementación. Cierra **cómo** se integra el protocolo agéntico de
> [`hermes-os-a2a`](https://github.com/lisagomez/hermes-os-a2a) con este template y con
> `tools/extractor-documental/`. No instala nada, no levanta ningún endpoint y no toma la decisión
> de exponer: eso es un CDC con gate humano (spec 005, RF-12).

---

## 1. El problema

La spec 005 lo enuncia en una línea: *«el template sabe **consumir** capacidades externas, pero no
sabe **ofrecerse** como una»*. Está en **0 de 16 tareas**.

Y falta algo más concreto que código: **una capacidad que valga la pena ofrecer**. TAR-13 de esa
spec pedía una *«capacidad de juguete»* precisamente porque no había otra cosa.

Ya la hay.

---

## 2. Lo que se descubrió al mirar `hermes-os-a2a`

Es público. Sus cinco agentes (`buzon-a2a`, `ventas-a2a`, `grafo-a2a`, `transcripcion-a2a`,
`enriquecimiento-a2a`) comparten una forma que no es casual y que conviene copiar entera.

### 2.1 La superficie es de tres rutas, y hay una prueba que lo obliga

| Ruta | Qué es |
|---|---|
| `.well-known/agent-card.json` | la Agent Card — **la ruta la exporta el SDK**, ver §3.3 |
| `/` | JSON-RPC A2A |
| `/health` | liveness; *«no reporta nada del interior»* |

Lo que hace que eso no sea una promesa es `test_opacidad.py`, y su prueba central **no prueba rutas
concretas: enumera las de la app y exige igualdad**.

```python
def test_superficie_es_exactamente_card_rpc_y_health():
    paths = sorted(r.path for r in build_app().routes)
    assert paths == sorted([AGENT_CARD_WELL_KNOWN_PATH, DEFAULT_RPC_URL, "/health"])
```

La diferencia importa. Una lista de rutas internas que deben dar 404 solo caza lo que alguien pensó
en poner en la lista; enumerar la superficie caza **la ruta que nadie previó**, que es la que se
filtra de verdad. Y una tercera prueba fija que `/health` devuelve exactamente `{"status": "ok"}`:
un health que reporta versiones, colas o estado de base de datos es reconocimiento gratis.

### 2.2 La frontera, en sus palabras

> ***«Ningún componente que ejecuta un modelo tiene credenciales.»*** … *«Toda salida exige la firma
> de una persona en `aprobaciones_salientes` — fila que este servicio no puede fabricar.»*

No es una recomendación de estilo: es lo que hace que un servicio que corre un LLM no pueda causar
daño aunque lo convenzan. El agente **no puede** enviar correo porque no tiene las llaves, no porque
se le haya pedido que no lo haga.

### 2.3 Red: nunca por el edge

`:4900`, solo `127.0.0.1`, por perfil de compose. *«Nunca se publica por el `edge`.»* La exposición
real es una decisión aparte, y se toma aparte.

---

## 3. Los dos hechos que deciden la integración

### 3.1 No se comparte código: se comparte protocolo

Hermes es **Python** (`app.py`, `card.py`, `executor.py` con el SDK `a2a`); el template es
**TypeScript/Next**. Copiar no es una opción, y no hace falta: A2A es un protocolo en el cable. El
template implementa su lado con `@a2a-js/sdk` —pineado sin rangos, RF-10— y hablan por JSON-RPC.

Lo que **sí** se porta es la forma: tres rutas, prueba de opacidad, health mudo, frontera de
credenciales.

| Hermes (Python) | Template (TypeScript) |
|---|---|
| `app.py` con Starlette | Route Handlers de Next (spec 005, TAR-9) |
| `card.py` | módulo que construye la Agent Card, validada contra los tipos del **SDK instalado** (RF-4) |
| `executor.py` | el ejecutor que traduce Task ↔ capacidad |
| `tests/test_opacidad.py` | su equivalente en `node --test` — §6 |
| perfil de compose, `127.0.0.1` | no publicar la ruta, y gate humano antes de exponer (RF-12) |

### 3.2 El extractor ya cumple la frontera de Hermes, sin habérselo propuesto

Ésta es la parte que cambia el plan de la spec 005.

El núcleo de `@tu-scope/extractor-documental` **no tiene credenciales**: el motor de OCR y el
almacén se **inyectan**. Eso se hizo para que el paquete fuera instalable en cualquier proyecto —y
está vigilado por `pruebas/contrato.ts`, que falla si algo importa un proveedor— pero resulta ser
**exactamente la propiedad que Hermes exige de un componente que ejecuta un modelo**.

Consecuencias concretas:

- **TAR-13 ya no necesita inventar una capacidad de juguete.** Hay una real, con 372 pruebas.
- **TAR-11 (opacidad) se abarata**: el extractor no tiene interior que filtrar. No conoce rutas, ni
  nombres de tabla, ni el motor que lo mueve — se lo dan.
- **TAR-10 (fail-safe) tiene ya la mitad**: los adaptadores no vuelcan ni la clave ni el cuerpo de
  la respuesta en un error, y hay pruebas que lo exigen.
- **RF-11 (nunca `service_role`) se cumple por construcción**: el adaptador recibe el cliente, no lo
  fabrica.

### 3.3 Lo que la introspección del SDK real corrigió — y por qué RF-4 existe

`@a2a-js/sdk@1.1.0`, instalado e introspeccionado el 2026-09-09. RF-4 exige validar contra **los
tipos del SDK instalado, no contra una lectura del proto**, y la primera corrida de esa regla ya
cazó dos errores **de este mismo documento**:

| Lo que decía este SDD | Lo que exporta el SDK |
|---|---|
| `/.well-known/agent-card.json` | `AGENT_CARD_PATH = ".well-known/agent-card.json"` — **sin barra inicial** |
| Task en estado `failed` (RF-7) | `TaskState.TASK_STATE_FAILED` |

Y una constante que no había mencionado y decide la interoperabilidad:
`A2A_CONTENT_TYPE = "application/a2a+json"`. Responder `application/json` no interopera con nada,
y **compila igual**.

Constantes verificadas, que el bridge debe **importar y no reescribir**:

```
AGENT_CARD_PATH      ".well-known/agent-card.json"
A2A_PROTOCOL_VERSION "1.0"
A2A_CONTENT_TYPE     "application/a2a+json"
A2A_VERSION_HEADER   "A2A-Version"
```

**La pieza que hace viable el punto de integración** (TAR-4): `@a2a-js/sdk/server` exporta
`JsonRpcTransportHandler`, `DefaultRequestHandler` e `InMemoryTaskStore` — es decir, se puede
atender JSON-RPC **sin Express**. Hay un `./server/express`, y no se usa: los Route Handlers de Next
bastan, y meter Express en el template sería arrastrar un servidor dentro de otro.

Dependencias que arrastra el SDK: **una**, `jose` — para firmar y verificar Agent Cards
(`generateAgentCardSignature`, `verifyAgentCardSignature`).

---

---

## 4. La Agent Card que expondría

Una sola skill. La entrada es un documento; la salida, campos con **confianza y región**.

```jsonc
{
  "name": "extractor-documental",
  "description": "Extrae datos de documentos con revisión humana",
  "version": "0.1.0",
  "skills": [{
    "id": "extraccion-documental",
    "name": "Extraer datos de un documento",
    "description": "PDF o imagen → campos con confianza y región de origen",
    "tags": ["ocr", "documentos", "facturas"]
  }]
}
```

**Lo que la Card NO dice, a propósito**: qué motor hay detrás, qué umbral usa el consumidor, ni si
la capa 0 resolvió sin llamar a nadie. Son detalles del interior, y §2.1 es tajante con eso.

### El campo que hace honesta esta capacidad

La respuesta lleva la confianza **por campo** y `revision_humana` como estado normal. Un consumidor
externo tiene que poder distinguir *«esto lo leí y estoy seguro»* de *«esto lo leí y hay que
mirarlo»*. Devolver solo los valores convertiría una estimación en un hecho en casa de otro — que es
justo lo que RF-8 prohíbe (*«nunca un 200 con respuesta inventada»*).

---

## 5. Modelo de amenazas (C3)

`AGENTS.md` ya clasifica esta superficie, aunque hable de otra cosa:

> *«Canales de chat externos… son superficie de entrada **no autenticada** hacia un agente que tiene
> llaves. NO se conectan sin modelo de amenazas de esa superficie (C3), AISIA (C4) y gate humano
> para toda acción irreversible.»*

Un endpoint A2A es **la misma clase**. Cambia el formato, no el riesgo.

| Amenaza | Qué la contiene |
|---|---|
| Documento adversario que intenta inyectar instrucciones | El extractor **no ejecuta** lo que lee: devuelve campos. No hay ruta desde el texto extraído a una acción |
| Sondeo de la superficie | Prueba de opacidad: tres rutas, enumeradas y verificadas |
| Filtración por mensajes de error | RF-6/RF-8. Los adaptadores ya no vuelcan clave ni cuerpo; el bridge no puede añadir stack traces |
| Consumo de cuota ajena (el que llama gasta tu OCR) | **Hueco abierto**: sin cuota por partner, un consumidor puede vaciar tu presupuesto. Se declara, no se resuelve aquí |
| Exfiltración por volumen (pedir muchos documentos) | **Hueco abierto**: sin límite de tasa por partner |

## 6. La prueba de opacidad, portada — y por qué **todavía no se escribe**

Éste es el artefacto de Hermes con más valor y el que menos depende de Python. Su equivalente:

```ts
// Cuando exista el bridge (spec 005, TAR-9), esto va con él.
test('la superficie A2A es EXACTAMENTE card, rpc y health', () => {
  // AGENT_CARD_PATH viene del SDK: no se reescribe a mano, que es como se cuela la barra de mas.
  assert.deepEqual(rutasDelBridge().sort(), [
    `/${AGENT_CARD_PATH}`, '/a2a', '/a2a/health',
  ].sort())
})
test('/health no reporta nada del interior', async () => {
  assert.deepEqual(await salud(), { status: 'ok' })
})
```

**No se escribe hoy, y es deliberado.** No existe el bridge: un verificador sin nada que verificar
es código que parece una capacidad y nunca ha corrido contra lo real — el fallo que esta fábrica ya
se comió con el CLI de Playwright, documentado en `aprendizajes-gobernanza.md`:

> *«Documentado y nunca ejecutado es una afirmación, no una capacidad — falla el día que un agente
> lo obedece.»*

Se escribe **en el mismo PR que el bridge**, y ahí sí muerde desde el primer minuto.

## 7. Qué cierra y qué no

**Cierra**: cómo se integra (protocolo, no código), qué capacidad se ofrece primero y por qué encaja,
la forma de la superficie, y qué se porta de Hermes.

**No cierra, y hay que decirlo**:

- **La cuota y el límite de tasa por partner.** Hoy no existen, y sin ellos un consumidor puede
  vaciar tu presupuesto de OCR. Es el hueco más grande de este diseño.
- **Autenticación más allá de una API key.** RF-9 ya marca OAuth2, OIDC y mTLS como residual
  explícito. Sigue siéndolo.
- **Si el `@a2a-js/sdk` cubre lo que hace falta.** TAR-1 y TAR-2 de la spec 005 existen justo para
  averiguarlo introspeccionando el paquete real, no leyendo el proto.
- **Qué pasa con un documento cuando el consumidor es externo.** Un tercero manda una factura de un
  cuarto: ahí hay una AISIA (C4) que **no está hecha**, y que no puede salir de este documento.

## 8. Verificación

Este SDD no se verifica ejecutando: se verifica leyéndolo contra la spec 005 y contra
`hermes-os-a2a`. Lo que sí se comprueba hoy:

```bash
npm run verifica:specs        # la 005 sigue íntegra con el hallazgo dentro
cd tools/extractor-documental && npm run prueba   # la capacidad ofrecida está probada
```

Y lo que **no** se hace aquí, nombrado para que no se cuele: instalar el SDK, escribir el bridge,
levantar un endpoint, ni exponer nada. Exponer es CDC con gate humano (RF-12), C3 y C4 — y la AISIA
del §7 está sin hacer.
