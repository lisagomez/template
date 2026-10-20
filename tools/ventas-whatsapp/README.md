# @tu-scope/ventas-whatsapp (0.1.0)

Un vendedor con IA dentro del WhatsApp de una pyme: atiende, cierra el pedido, cobra con una liga y
le demuestra al dueño cuánto vendió cada anuncio. La plataforma además **vende o renta el número** y
**da de alta a la pyme con un BSP propio**. Fases 0 a 3, **en el laboratorio**: todo corre contra un
simulador fiel de Meta, sin un número real.

## Qué hace

- **Canal (fase 0)**: el webhook de la Cloud API con la firma `X-Hub-Signature-256` sobre el cuerpo
  crudo, el 200 inmediato con una **cola durable** detrás (lo que se acusó no se pierde si el proceso
  se cae) y la idempotencia por `wamid`. También calcula las ventanas de 24 h y de 72 h de los
  anuncios Click-to-WhatsApp y el precio de cada mensaje según las reglas del 1/oct/2026.
- **Coexistencia**: el eco del dueño que contesta desde su celular calla al agente en ese chat.
  Además ingiere el historial y pausa al negocio si se desconecta (`PARTNER_REMOVED`).
- **Agente (fase 1)**: acotado al negocio.
  - Las barreras van antes y después del modelo: inyección, temas ajenos, precio o existencias
    inventados, identidad, fuga de instrucciones y ligas ajenas.
  - El precio y las existencias salen solo del catálogo.
  - Pasa la conversación al dueño si hay una queja, un monto alto, dos fallos de comprensión, se
    agota el presupuesto o el cliente pide una persona.
  - Contesta con pocos mensajes ricos: botones, carrusel y Flows.
- **Comercio (fase 2)**:
  - catálogo desde la hoja o el CSV de la pyme;
  - carrito nativo (`order`);
  - Flows dinámicos cifrados (entrega, checkout con RFC, reservación) y uno estático (calificar lead);
  - liga del procesador de pagos, pago idempotente y conciliación.
- **Atribución (fase 3)**:
  - toma el `ctwa_clid` del primer mensaje y lo reporta como `LeadSubmitted` y `Purchase` por la
    Conversions API **una sola vez** (ledger);
  - atribuye las etiquetas orgánicas (`[QR-MESA]`…) y crea enlaces cortos y QR;
  - compara contra `automatic_events`;
  - arma el tablero de ROAS y el costo real por conversación (Meta + IA).
- **A2A**: los seis dominios usan el modelo de A2A desde el día uno. `pedidos` y `atribucion`
  pueden correr como agentes A2A reales (SDK oficial) detrás de una pasarela multi-inquilino, con
  Agent Card firmada.
- **Multi-inquilino**: cada pyme ve, gasta y atribuye solo lo suyo, y se prueba.
- **Frontera del número**, antes del agente:
  - 20 mensajes en 10 min por contacto;
  - pasados 40 contactos nuevos en una hora, los siguientes reciben una sola respuesta de cortesía, sin
    modelo y sin llegar a la bandeja; los clientes de antes siguen atendidos;
  - pasados 400 mensajes en una hora, el agente sigue con respuestas fijas y traspasos, sin modelo;
  - lista de bloqueo del dueño, que queda en la cadena de hashes.

  Los límites se ajustan por pyme y hoy son ficticios.
- **Optimización de respuestas y costos**:
  - un enrutador determinista antes del modelo: saludo, catálogo, producto, FAQ, reserva y despedida
    no gastan tokens;
  - no hay segunda llamada si la herramienta ya da la respuesta;
  - los mensajes de un turno se compactan.

  Medido en A/B sobre el mismo día con cola larga: −86 % de tokens, con la misma resolución y
  conversión.
- **Cronómetro de ventanas**: por conversación dice cuánto queda de las 24 h y de las 72 h gratis,
  y qué costaría el siguiente mensaje. Avisa al dueño, una vez por ventana, cuando una conversación
  que lleva él cierra en menos de 2 h.
- **Trazabilidad con cadena de hashes** por inquilino:
  - mensajes, tareas A2A (con `tenant`, `contextId` y `taskId`) y acciones del dueño;
  - huellas HMAC y seudónimos, sin datos personales;
  - anclaje con raíz de Merkle firmada (Ed25519) guardada aparte;
  - detecta alteraciones, borrados y reescrituras.
- **A2A por propósito**: los tokens acotan dominios y skills (una agencia solo lee el reporte de ROAS).
- **Números como línea de negocio (N-01)**, para la pyme que no trae número:
  - **venta** (la línea a nombre de la pyme, que se la lleva si se va) o **renta** (un número del
    pool, con la portabilidad dicha antes de venderlo);
  - el alta en Meta completa: código por SMS o voz, verificación, registro con PIN de dos pasos y
    nombre visible, con los límites de Meta (2 números sin verificar el negocio, 10 registros en
    72 h, número en la app de consumo);
  - **cuarentena de 90 días** antes de reasignar un número liberado, calidad del número con aviso en
    rojo, y el cobro del mes (la renta paga el pool entero).
- **BSP propio (N-02)**: da de alta a la pyme en nuestra app de Meta por Embedded Signup.
  - Ata cada alta a una **liga firmada** que vence y sirve una vez, y solo acepta el mensaje si viene de
    facebook.com (más estricto que la muestra de Meta).
  - Canjea el código (vive 30 s) y guarda el token de negocio en una bóveda, nunca en el inquilino, y
    solo después de que Meta acepte que la WABA es suya.
  - Suscribe la WABA, comparte la línea de crédito (Solution Partner) y registra el número, o toma
    uno del pool si la pyme no trajo.
  - Factura el mes por pyme en las dos modalidades (Tech Provider: Meta le cobra a la pyme; Solution
    Partner: nosotros, con margen y tipo de cambio) y concilia contra la factura de Meta.
  - Al tope de crédito frena solo el marketing y deja la decisión a una persona. La baja revoca el
    acceso y le deja a la pyme su WABA y su número.
- **Puerta de salida de OpenWA** (`./openwa`): la API de OpenWA 0.25.0 servida sobre este BSP, para que quien hoy
  usa OpenWA (WhatsApp Web o Baileys, no oficiales) pase a la Cloud API cambiando solo la URL y la llave. Es
  compatible con la API de OpenWA; no es OpenWA.
  - Las 203 operaciones del contrato pineado (`openwa/openapi-0.25.0.json`, licencia MIT en `openwa/LICENSE-OpenWA`)
    están clasificadas en una matriz que se GENERA de los criterios (`openwa/MATRIZ.md`), cada fila con su fuente:
    igual 25, diferencia 32, imposible 66, pendiente 18, fuera 62.
  - Las 57 que se sirven cumplen el openapi en petición y respuesta; las otras 146 contestan 501 con la alternativa
    oficial y nunca se simulan.
  - Iniciar una sesión da la liga de alta (Embedded Signup) en lugar del QR; fuera de la ventana de 24 h, el texto
    contesta 422 con las plantillas aprobadas; las plantillas pasan por la revisión de Meta.
  - Mismas llaves y alcances (sesión, chat, IP), mismos webhooks con la misma firma HMAC, la misma idempotencia y una
    frontera de contactos nuevos por hora.
- **Laboratorio de negocio**: roadmap de costos (ficticio, con presupuesto del piloto) y roadmap de
  conversaciones-plantilla. Los dos se generan del código y una prueba impide que el papel diverja.

### Qué no hace (a propósito)

- **No conecta un número real.** La app se niega a hablar con la Graph API real sin C3 y C4
  firmados (`piloto/`).
- **No gasta en un LLM.** El agente corre con un modelo simulado. El real (`modeloCompatibleOpenAI`)
  responde «no medido» hasta que haya llave, el CDC del routing y la firma.
- No cobra por su cuenta: un pedido sobre el umbral o un pago que no cuadra pasan al dueño.
- No hace marketing masivo ni plantillas de marketing: solo mensajes de servicio y utilidad.
- No es la plataforma multi-pyme de la fase 4 ni el multipaís de la fase 5. La arquitectura no las
  impide, pero no están construidas (`piloto/REPORTE.md`).
- **No da de alta pymes reales ni comparte crédito real**: el BSP y la línea de números corren
  contra el simulador. Falta ser Tech Provider y elegir proveedor de números (`piloto/`, P-09 y P-10).
- No reasigna un número liberado antes de su cuarentena, aunque sobre presupuesto: los clientes del
  dueño anterior siguen escribiendo a ese número.
- No corta el servicio de una pyme al llegar al tope de crédito: frena el marketing y avisa.
- No usa TypeSafe (descartado, D-01): del producto solo se tomó el patrón del enrutador con umbrales
  en código.

## Casos de uso

- **El laboratorio decide si el vendedor está listo para una pyme piloto**: abre
  `/laboratorio-ventas-whatsapp`. Ahí ve cada caso con su estado (pasa o no medido), las compuertas
  de las fases 0 a 3 con la naturaleza de cada cifra y una conversación de punta a punta por pyme
  con sus costos.
- **El dueño de la pyme atiende lo que el agente le pasó**: en `/ventas-whatsapp` ve la bandeja,
  toma la conversación, contesta y la devuelve al agente. También ve cuánto vendió cada campaña y
  cada QR.
- **Un cliente llega por un anuncio de tacos un martes en la noche**:
  1. recibe el menú en un carrusel;
  2. arma su carrito y llena la dirección en un Flow;
  3. paga con la liga;
  4. el dueño ve la venta atribuida a su campaña, y Meta recibe un solo `Purchase`.
- **Una taquería sin número de WhatsApp Business**: entra por Embedded Signup sin número, la
  plataforma le asigna uno del pool, lo verifica y lo registra, y ese mismo día recibe pedidos. Si
  un año después se va, el número entra a cuarentena (renta) o se lo lleva (venta).
- **El laboratorio cierra el mes como BSP**: factura a cada pyme la cuota, lo que cobró Meta con su
  margen (Solution Partner) y sus números, y ve qué WABA no cuadra con la factura de Meta.
- **Una agencia que tiene su CRM conectado a OpenWA** cambia `baseUrl` y `apiKey` en el SDK de OpenWA y sigue
  mandando y recibiendo; antes pega sus llamadas en `/migracion-openwa` y ve cuáles cambian, cuáles no existen por la
  vía oficial y qué usar en su lugar.
- **Cambiar de BSP o de procesador**: el transporte (`ClienteGraph`), el alta (`GraphBsp`) y el cobro
  (`ConectorPagos`) se inyectan. Con el BSP propio o con uno ajeno (Kapso), se cambia el adaptador y
  no la app.

## Requerimientos de infraestructura

- **Runtime**: Node ≥ 22.18 (las pruebas corren `.ts` sin cargador). El núcleo no tiene dependencias
  npm. La entrada `./a2a` pide `@a2a-js/sdk` 1.1.0 como peer opcional.
- **Dependencias del sistema**: ninguna. Playwright y Chromium solo para `e2e/capturas.mjs`.
- **CPU, GPU y memoria**: sin GPU.
  - Procesamiento propio por mensaje: p95 2.3 ms y máximo 48 ms, medido en el laboratorio (WSL2) sin
    el modelo real ni la red de Meta.
  - Acuse del webhook por HTTP: p95 6.2 ms.
  - Memoria: no medido.
- **Servicios externos**:
  - la Graph API de Meta (Cloud API, Conversions API, Embedded Signup y, como Solution Partner, la
    línea de crédito);
  - un proveedor de números (SIM o virtuales mexicanos) con un buzón donde llegue el código;
  - un procesador de pagos con ligas y webhook firmado;
  - un proveedor de LLM.

  En el laboratorio, todos son simuladores locales.
- **Variables de entorno**: el núcleo no lee ninguna. La app lee `VENTAS_WA_APP_SECRET`,
  `VENTAS_WA_VERIFY_TOKEN`, `VENTAS_WA_FLOW_SECRET`, `VENTAS_WA_FLOWS_LLAVE`, `VENTAS_WA_GRAPH_URL`,
  `VENTAS_WA_TOKENS`, `VENTAS_WA_PAGOS_URL`, `VENTAS_WA_PAGOS_SECRETO`, `VENTAS_WA_PANEL_TOKENS`,
  `VENTAS_WA_DOMINIOS_LIGA`, `VENTAS_WA_LABORATORIO`, `VENTAS_WA_C3_C4_FIRMADOS`,
  `VENTAS_WA_A2A_LLAVE`, `VENTAS_WA_A2A_SECRETO`, `VENTAS_WA_TRAZA_LLAVE`, `VENTAS_WA_ANCLA_LLAVE` y
  `VENTAS_WA_DATOS`.
- **Almacenamiento**: el almacén se inyecta. Hay uno en memoria (pruebas) y otro en un archivo JSON
  con una cola en carpeta (la app, en `.datos/ventas-whatsapp/`, fuera de git). El esquema para
  Postgres/Supabase con RLS es una **propuesta validada en efímero y no aplicada**
  (`migraciones/`).
- **Salida del perímetro (C4)**: en el laboratorio, nada sale. En el piloto saldrían:
  - a Meta: mensajes, catálogo y eventos de conversión con `ctwa_clid`, sin datos personales en el
    evento;
  - al procesador: monto y referencia;
  - con el BSP propio, nada nuevo sale: el token de negocio entra (a la bóveda) y el cobro de Meta
    llega en su factura;
  - al proveedor de LLM, el texto del cliente. Esto es una decisión abierta (P-04): seudonimizar
    antes y firmar la AISIA.

## Uso

```ts
import { creaVendedor, clienteGraphMultiInquilino, conectorPagosHttp, modeloSimulado } from '@tu-scope/ventas-whatsapp';
import { almacenArchivo, colaEnArchivo } from '@tu-scope/ventas-whatsapp/almacen-archivo';

const vendedor = creaVendedor({ almacen, graph, pagos, modelo: modeloSimulado(), secretos, llavePrivadaFlows, dominiosLiga, colaDurable });
vendedor.webhook.recibe(cuerpoCrudo, firma); // → { status: 200 } en microsegundos; el agente trabaja detrás
```

La app de este repo lo monta en `src/features/ventas-whatsapp` (rutas bajo `/api/ventas-whatsapp`).
El laboratorio en proceso (`creaCircuito`, `correAdversarial`, `mideLaboratorio`, `transcribe`)
está en `./laboratorio`, y los simuladores de Meta (con el alta de números y Embedded Signup) y del
procesador en `./simulador`.

```ts
import { creaBsp, creaGestorNumeros, bovedaEnMemoria, leeEventoSignup } from '@tu-scope/ventas-whatsapp';

const numeros = creaGestorNumeros({ pool, meta: registroDeMeta, buzon, reloj, pin });
const bsp = creaBsp({ graph: graphBsp, boveda, almacen, reloj, modalidad: 'tech_provider', pin, numeros });
await bsp.completa({ inquilinoId, code, recibidoEn, evento: leeEventoSignup(mensaje)!, perfil, telefonoVisible });
```

```ts
import { altasDelBsp, creaFachada } from '@tu-scope/ventas-whatsapp/openwa';

const fachada = creaFachada({ graph, administracion, altas: altasDelBsp(bsp, almacen, urlAlta), llaveMaestra, secretoApp, entregaWebhook });
await fachada.atiende({ metodo: 'POST', ruta: '/api/sessions/s1/messages/send-text', consulta, cabeceras, cuerpo }); // → { status, cuerpo }
```

La app la sirve en `/api/ventas-whatsapp/openwa` (solo laboratorio, con `VENTAS_WA_OPENWA_LLAVE`) y el panel en
`/migracion-openwa`. La matriz se regenera con `npm run matriz` (y una prueba falla si alguien la edita a mano).

## Pruebas

`npm run prueba` compila y corre 117 pruebas en unos 20 s. También entran en el `validate` de la raíz por
`prueba:tools`. Cubren:

- canal, ventanas y costo;
- agente, con 200 conversaciones adversariales;
- traspaso;
- comercio;
- Flows;
- atribución;
- A2A;
- aislamiento;
- coexistencia;
- robustez;
- esquema en PGlite;
- el laboratorio;
- optimización A/B;
- cronómetro;
- trazabilidad;
- roadmaps;
- números (alta, límites de Meta, cuarentena, cobro);
- BSP (Embedded Signup, crédito, baja, factura y conciliación);
- alta segura (liga, origen, WABA ajena, persistencia);
- frontera del número (granja, ráfaga, bloqueo);
- puerta de salida de OpenWA: la matriz contra el contrato pineado, el contrato con ajv (57/57), los 146 501 con
  alternativa, el SDK oficial 0.6.0 sin modificar, y la seguridad (llaves, firmas, idempotencia, frontera, lockfiles).

La evidencia por HTTP con la app construida y las capturas salen de
`npm run build && node tools/ventas-whatsapp/e2e/capturas.mjs`; las de la puerta de salida (el SDK contra la app
construida, con guardia de red, y el panel en escritorio y celular), de `node tools/ventas-whatsapp/e2e/openwa.mjs`.

## Del documento fuente

`docs/INVESTIGACION-ventas-ia-whatsapp.md` (la investigación del laboratorio) y el spec del goal,
`docs/goals/ventas-ia-waba.md`. Lo que falta para el piloto está en `piloto/`:
- los borradores de C3 y C4;
- la propuesta de CDC del routing;
- las decisiones abiertas y las descartadas;
- los casos de A2A por propósito;
- la revisión del grafo;
- los roadmaps de costos y de conversaciones;
- el reporte.

El grafo del producto está en `docs/grafos/ventas-ia-waba.json`, y los roadmaps se regeneran con
`node tools/ventas-whatsapp/e2e/genera-roadmaps.mjs`.
