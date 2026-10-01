# Reporte del goal «vendedor con IA en WhatsApp, fases 0-3» — decisiones y dónde podría estar mal

> 2026-09-30 · rama `ventas_ia_waba` · spec `docs/goals/ventas-ia-waba.md`.

## 1. Decisiones (qué se eligió y por qué)

| Decisión | Por qué |
|---|---|
| **Herramienta sin dependencias** en `tools/ventas-whatsapp` y la app en `src/features/ventas-whatsapp` | El contrato de la casa (`docs/EMPAQUETAR-HERRAMIENTA.md`). Node sirve para cripto, HTTP y archivos. Lo que pide el SDK de A2A va en su propia entrada (`./a2a`) con peer opcional |
| **Todo se inyecta**: almacén, transporte a Meta, procesador, modelo, reloj, ids y cola | Así el laboratorio y producción corren el mismo código. P-01 (BSP), P-02 (vault) y P-03 (procesador) quedan abiertas detrás de una interfaz, sin decidirse en código |
| **Simulador de Meta propio** (Graph API, webhooks firmados, precio por mensaje, Flows, CAPI, Administrador de anuncios) | No hay sandbox oficial que cubra coexistencia, precios de 2026, CTWA y CAPI juntos. Cada forma de payload cita su página de Meta y lo que no se pudo verificar dice «SUPUESTO» |
| **El LLM vive en el orquestador; los dominios son deterministas** | La fuente sugería un «cerebro por dominio», pero cobrar, reservar, atribuir o conciliar no necesitan modelo. Con uno solo, cada conversación cuesta menos tokens y hay menos superficie para alucinar. El modelo de A2A deja meter un LLM en un dominio sin reescribir nada |
| **Lo estructurado no pasa por el modelo** | Botones, carrito (`order`) y Flows van directo a los dominios. Solo el texto libre llama al LLM: hay menos costo (cada respuesta de IA cuesta tokens y un mensaje de Meta) y menos riesgo |
| **Barreras en código, antes y después del modelo**; el traspaso tampoco depende del modelo | La política de AI Providers castiga al agente que se vuelve asistente general. Un modelo que ignora sus instrucciones no se salta un `if` |
| **Pocos mensajes ricos**: carrusel en vez de lista de textos, aviso de privacidad en el pie del primer mensaje, Flows para los datos | Desde el 1/oct/2026 se cobra cada respuesta. Una compra completa sale en 4 mensajes del negocio |
| **Un pago confirma solo si el monto cuadra** con el total del catálogo; sobre el umbral decide el dueño | Es dinero de un tercero: no se acepta con firma (límite de C5) |
| **Ledger de conversiones** con `event_id` = `<pedido>:Purchase` | Es la compuerta de la fase 3: un pedido jamás se cuenta dos veces |
| **Ventana de atribución de 7 días** por origen, y el pedido cuenta para el origen vigente AL PEDIR | Sin ventana, un cliente que vuelve un mes después se atribuye al anuncio viejo |
| **Cola durable** antes del 200 | Meta no reintenta lo que ya acusó: un proceso caído perdería el mensaje |
| **Fase 3 con A2A real**: `pedidos` y `atribucion` detrás de una pasarela con el SDK oficial, Agent Card firmada (ES256, JWS sobre JCS) y el inquilino tomado del token | Es lo que la fuente pide para la fase 3, y lo demuestra el circuito completo corriendo por A2A (`pruebas/a2a.ts`) |
| **Almacén JSON** en la app y esquema Postgres con RLS como propuesta validada en PGlite | «La BD compartida no se toca» (restricción). Aplicar una migración es acción irreversible: gate humano |

## 2. Dónde el simulador podría divergir de Meta (y qué se hizo)

| Punto | Estado | Qué se hizo |
|---|---|---|
| Cupo de **1,000 mensajes de servicio gratis** por número al mes | NO está en la página de Meta consultada el 30/09; lo publican proveedores | Dato con `verificado: false`; el laboratorio calcula también la **sensibilidad sin cupo** (USD 0.010 por conversación). P-06: confirmarlo en la primera factura |
| **Tarifas de México** | Fuentes secundarias que difieren entre sí | Tarjeta con `verificada: false`; el tablero dice «estimado». P-05: bajar la tarjeta oficial en MXN |
| `pricing.type` de los mensajes que caen en el cupo | No documentado | Se usa `free_customer_service` (SUPUESTO marcado en `meta/tarifas.ts`) |
| Desde cuándo corren las **72 h de la ventana gratis** | La página dice «remain open for 72 hours» sin fijar el inicio | Se toma desde la respuesta que la abre (SUPUESTO marcado) |
| Código de error con el número **desconectado** (coexistencia) | No encontrado | Se usa 131000 (SUPUESTO marcado); la app pausa al inquilino por el `account_update`, que sí está documentado |
| **427 y 432** del endpoint de Flows | Solo el 421 se releyó el 30/09 | Quedan como de la tabla de Meta; verificarlos en la prueba del primer Flow real |
| Forma del **`nfm_reply`** | La página de referencia devolvió 404 el 30/09 | Forma de la guía de Flows (`response_json` como texto con `flow_token`); verificar en el primer Flow real |
| **Ventana de 7 días** de `event_time` en la Conversions API | La página de Business Messaging no la fija | Se toma la de la CAPI general (SUPUESTO marcado) |
| **Carrusel interactivo** de productos (2 a 10 tarjetas) | Verificado el 30/09 | — |
| Límites de botones y listas, firma, verificación GET, estados con `pricing`, `referral` con `ctwa_clid`, `order`, `automatic_events` en milésimas, QR (140 caracteres, 2,000 por número), ecos, historial y 2593109, cifrado de Flows | Verificados contra la documentación el 30/09 | Pruebas que usan esas formas exactas |
| **Ráfagas y orden**: Meta reintenta hasta 7 días y no garantiza orden | Simulado con duplicación y desorden | Idempotencia por `wamid`; los estados solo avanzan (una prueba de desorden encontró que un `sent` tardío pisaba un `read`: corregido) |

## 3. Otras formas en que esto podría estar mal (y qué se hizo)

| Riesgo | Qué se hizo |
|---|---|
| Las **barreras son léxicas**: un modelo real puede salirse con palabras que ninguna regla cubre | Se probó el peor caso: 200 conversaciones con un modelo adversarial, 0 fechorías entregadas, medidas en el transporte. **La corrida con el modelo real es obligatoria** antes del piloto (P-04, CDC del routing). Hoy: «no medido» |
| **Falsos positivos** de las barreras («gracias a Dios», «pan», «armar un pedido») | Encontrados y corregidos al escribir el léxico; hay una prueba de frases normales que deben pasar |
| **Métricas de conversión y resolución** vienen de clientes guionados | Marcadas «simulada»; la mezcla de clientes la declara el laboratorio y no predice la real |
| **Proceso caído** entre el 200 y el trabajo | Cola durable y reanudación al arrancar, probadas |
| **Denial-of-wallet** | Topes por conversación y por mes, **límite por remitente** (20 mensajes en 10 min) y, desde la cuarta vuelta, la **frontera del número** (contactos nuevos y mensajes por hora) con lista de bloqueo, probados. Los límites por número son ficticios hasta el piloto |
| El «escribiendo…» cuando lo atiende el dueño | Corregido: solo cuando el agente va a contestar |
| Una hoja de catálogo con errores **aplicada a medias** | Corregido: la sincronización es atómica |
| **Tablas del restaurante** (una sola reserva por horario) | Encontrado por el laboratorio; ahora hay capacidad por tipo de mesa |
| **Idempotencia del bus** con memoria sin tope | Acotada a 5,000 entradas |
| La **hora local** se toma con un desfase fijo de −6 h | Correcto para Veracruz (sin horario de verano desde 2022); para la frontera norte o multipaís habría que usar la zona IANA |
| El **tablero lee** colecciones de otros dominios | Es una proyección de solo lectura, no escribe: la regla «cada dominio escribe solo lo suyo» se sostiene |
| Tokens de la pasarela A2A **HMAC propios** | Para el laboratorio; en producción, OAuth 2.0 client credentials (C3) |
| El pago se confirma por el **webhook** del procesador | Firma + monto + idempotencia + conciliación; falta verificar contra su API (P-03) |

## 4. Segunda vuelta (2026-09-30, pedido del laboratorio)

| Qué | Resultado |
|---|---|
| **Optimización de respuestas y costos** | Enrutador determinista antes del modelo (el patrón de TypeSafe, sin TypeSafe), sin segunda llamada cuando la herramienta ya responde, y compactación de mensajes. A/B sobre el mismo día con cola larga: **−86.4 % de tokens y −85.8 % de llamadas, misma resolución (93.3 %) y conversión (64.7 %)**. Mensajes: −0 %, porque cada turno ya era un solo mensaje. Honestidad: sin la cola larga el ahorro salía 100 % por construcción, y por eso se agregó |
| **Hallazgo** | Con el optimizador encendido, el modelo adversarial NO recibió ni un turno del negocio (0 fechorías generadas): lo que el enrutador entiende nunca llega al modelo. La barrera de salida se sigue probando con el optimizador apagado (el peor caso) |
| **Cronómetro de ventanas** | 24 h, 72 h gratis, plazo para contestar un anuncio y costo del siguiente mensaje; aviso al dueño una vez por ventana; cuenta regresiva en la bandeja |
| **Trazabilidad con cadena de hashes** | Una cadena por inquilino con huellas HMAC y seudónimos, anclada con Merkle + Ed25519. Detecta alteración, borrado y reescritura; el borrado ARCO del texto no la rompe |
| **Fuga de datos personales corregida** | La prueba de la cadena encontró que el id de conversación era `conv_<teléfono>`, así que el teléfono viajaba en el `contextId` de A2A, las trazas y la cadena. Ahora es un HMAC del teléfono |
| **A2A por propósito** | Tokens con skills; una agencia solo lee `reporte_roas` (agregado) y lo demás le responde «no existe». Nueve casos de uso en `A2A-CASOS-DE-USO.md` |
| **Roadmaps** | Costos ficticios mes a mes y presupuesto del piloto (MXN 16,721.64 ficticio en esta vuelta; con el BSP propio de la tercera, MXN 125,251.64); conversaciones-plantilla (12 de 16 probadas; lo pendiente es de las fases 4-5). Generados del código, con prueba de igualdad y de vigencia de los supuestos medidos |
| **Grafo** | Motor de reglas: las reglas de la LFPDPPP 2025 de la casa aplican ya a la AISIA; se proponen dominios de política de comercio y de categorías de plantilla (sin sembrar: pide firma). Grafo del sistema: `docs/grafos/ventas-ia-waba.json`, y `grafo2plan.py` confirma las dos convergencias que el diseño serializa |
| **Descartes** | D-01 TypeSafe y D-02 gestión de teléfonos como negocio (`DECISIONES-ABIERTAS.md`). D-02 se revirtió en la tercera vuelta |

## 5. Tercera vuelta (2026-09-30): números y BSP propio como líneas de negocio

El laboratorio revirtió D-02 e incluyó el desarrollo del BSP. Quedan como N-01 y N-02 en
`DECISIONES-ABIERTAS.md`, con P-01 reescrita y dos decisiones nuevas (P-09 proveedor de números,
P-10 paso a Solution Partner).

| Qué | Resultado |
|---|---|
| **N-01 números** (`src/dominios/numeros.ts`) | Pool con venta (línea a nombre de la pyme) y renta; alta en Meta con código por SMS o voz, verificación, registro con PIN y nombre visible; cuarentena de 90 días; calidad con aviso; cobro del mes con el pool entero pagado. 5 pruebas contra un simulador del alta con los límites verificados el 30/09 (2 números sin verificar el negocio, 20 verificado; 10 registros en 72 h con 133016) |
| **N-02 BSP propio** (`src/bsp/`) | Alta por Embedded Signup con lo verificado el 30/09: evento `WA_EMBEDDED_SIGNUP`, código de 30 s, canje, `subscribed_apps`, crédito compartido (`whatsapp_credit_sharing_and_attach`) y registro con PIN. Bóveda para el token de negocio; baja que revoca; factura por modalidad; conciliación con Meta; tope de crédito que frena solo el marketing. 5 pruebas |
| **Hallazgo: la línea de crédito no admite MXN** | Se comparte en AUD, EUR, GBP, IDR, INR o USD. Como Solution Partner, cobramos en pesos lo que Meta nos cobra en dólares: el tipo de cambio es riesgo nuestro. El alta lo marca (`riesgoCambiario`) y P-10 lo pone como condición |
| **Hallazgo: con Tech Provider la pyme no envía hasta poner su método de pago** | El alta deja al inquilino pausado con el motivo y lo activa al confirmarlo. Con Solution Partner no espera |
| **Roadmap de costos** | Dos líneas nuevas (N-01, N-02) y el margen con las tres. Números: margen ficticio de MXN 67,711 en el año, casi nada en el piloto. BSP: construirlo (MXN 108,000 ficticio, sin mantenimiento) contra comprarlo (Kapso, MXN 115,477 en el año). El presupuesto del piloto sube de MXN 16,721.64 a MXN 125,251.64 porque el desarrollo del BSP va ahí: sin ser Tech Provider no se puede atender a una pyme con nuestra app |
| **Gobierno** | C3 con tres activos (tokens de todas las pymes, crédito, pool y PIN), dos fronteras (página de alta, buzón de códigos) y tres atacantes (alta fraudulenta, abuso del crédito, secuestro de número). C4 con dos partes afectadas nuevas: los clientes del dueño anterior de un número y la pyme que depende de nuestro BSP. **No se firman**: la cuarentena y cortar el servicio por crédito. **Sí se firman**: el impago de una pyme y el tipo de cambio |

**Dónde podría estar mal**:
- **SUPUESTOS del simulador**: el código de error de Meta cuando el número sigue en la app de
  consumo o el portafolio llegó a su tope (se usa 100); la regla de revisión del nombre visible; que
  el código de Embedded Signup sea de un solo uso; que con coexistencia no se llame a `register`. Cada
  uno está marcado en el código.
- **Retirar la línea de crédito en la baja**: el endpoint no se verificó, así que el paso queda
  como manual y el alta lo registra como no hecho (no se finge).
- **Trámites de números en México**: el registro de líneas con identidad del titular (reforma de
  2025) y si un número virtual recibe el código de Meta **no se verificaron aquí**. Van en P-09.
- **Precios y costos de números, horas de desarrollo y margen del BSP**: ficticios. Sirven para ver
  la forma, no para fijar precio.
- **La página de alta** no verifica todavía el `origin` del mensaje ni ata la sesión a quien recibió
  la liga (C3). La bóveda es en memoria (P-02).

## 6. Cuarta vuelta (2026-10-01): frontera, alta segura y la plataforma en la app

| Qué | Resultado |
|---|---|
| **Frontera del número** (`agente/frontera.ts`) | Cierra la brecha del C3 de la granja de números. Pasados 40 contactos nuevos en la hora, los siguientes reciben una sola cortesía con el menú y nada más: sin modelo y sin bandeja. Pasados 400 mensajes en la hora, el agente sigue con el enrutador y los traspasos, sin modelo. Un aviso por ventana. Probado: una granja de 60 contactos gasta 40 llamadas al modelo, no 60, y un cliente de antes sigue atendido en plena ráfaga |
| **Hallazgo: el arnés adversarial era una granja** | Las 200 conversaciones llegaban en el mismo instante simulado y la frontera las contenía antes de que llegaran al agente. Ahora llegan cada 2 minutos: el arnés mide las barreras del agente y la frontera tiene sus propias pruebas |
| **Lista de bloqueo** | El dueño bloquea o desbloquea desde la bandeja. Del bloqueado se guarda lo que escribe, no se le responde ni se marca como leído, y la acción queda en la cadena de hashes |
| **Alta segura** (`bsp/liga.ts`) | Liga firmada, que vence y sirve una vez (un abandono deja reintentar). Origen exigido más estricto que la muestra de Meta, que con `endsWith('facebook.com')` deja pasar `evilfacebook.com`. El token entra a la bóveda solo si Meta acepta la suscripción de ESA WABA. Una WABA por pyme |
| **Persistencia** | Las altas, el embudo, los nonces de las ligas y el pool de números viven en archivo y sobreviven a un reinicio. Los tokens no: siguen en una bóveda en memoria hasta P-02 |
| **La app** | Botón de bloquear en la bandeja del dueño, y una página de plataforma (`/plataforma-ventas-whatsapp`, con su propio token y solo en el laboratorio) con las altas y su embudo, el pool de números y la factura del mes en las dos modalidades |

**Dónde podría estar mal**: los límites de la frontera son ficticios (40 y 400 por hora) y un
negocio con un anuncio exitoso podría rebasarlos de buena fe: en ese caso sus clientes nuevos
reciben la cortesía y el menú, no el agente completo, y el dueño recibe el aviso. Una granja
que pide «una persona» todavía llega a la bandeja. En la app, las altas simuladas crean pymes
cuyo número no existe en el simulador de Meta por HTTP: sirven para ver el alta y la factura, no
para conversar.

## 7. Horizonte (fases 4-5): qué lo habilita y qué lo estorbaría

**Lo habilita**: `tenant` en todo y RLS en el esquema; el alta de inquilino ya es una operación
(`semilla` en la app del laboratorio, y `creaBsp` con Embedded Signup en la herramienta, contra el simulador); la pasarela A2A multi-inquilino con
Agent Card firmada; los adaptadores de transporte y de pago; los datos de país en la tarjeta de
tarifas (`paises`) y `recipient_country` desde el `wa_id`.

**Lo estorbaría si no se corrige antes**: el almacén JSON (para 10 o más pymes, Postgres con la
propuesta de esquema); la hora local con desfase fijo (paquetes de país: zona IANA); el catálogo
en una hoja por pyme (Commerce Manager por API en la fase 4); el procesamiento en un solo proceso
(la fase 5 pide trabajadores horizontales: la cola durable ya separa recibir de procesar); el
agente único en el orquestador (un dominio `fiscal` por país entraría como un agente A2A más).
