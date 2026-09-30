# Ventas con IA en WhatsApp para pymes — Documentación de desarrollo por fases

> **Documento de origen del laboratorio**, copiado el 2026-09-30 para que el `/goal` de
> `docs/goals/ventas-ia-waba.md` lo lea. El texto es el original; solo se normalizó el formato
> (escapes de markdown y viñetas de las fuentes). Los diagramas embebidos no viajaron: quedan
> marcados como «Diagrama no incluido». Los datos de plataforma (precios, fechas,
> campos de webhook, requisitos) son de **septiembre de 2026**: se verifican contra la
> documentación vigente de Meta antes de codificar cada uno.

Sep 29, 2026 · @lisa

## Resumen ejecutivo

La aplicación a construir es un **vendedor con IA dentro de WhatsApp para pymes**: atiende 24/7, muestra catálogo, cierra la venta y le demuestra al dueño cuánto dinero generó cada peso invertido en anuncios. Se construye en 6 fases, de una sola pyme piloto (Fase 0–1) a una plataforma multi-cliente y multipaís como Tech Provider de Meta (Fase 4–5).

La decisión de arquitectura más importante: **la IA debe ser un agente de ventas de un negocio concreto, nunca un asistente de propósito general**. Desde el 15 de enero de 2026 WhatsApp solo permite asistentes de IA de propósito general donde la ley lo obliga, y los cobra aparte. Un agente acotado al catálogo y políticas de la pyme queda fuera de esa regla.

La segunda decisión: la ventaja económica está en los anuncios Click-to-WhatsApp. Una conversación que nace de ese anuncio abre 72 horas en las que la entrega de mensajes es gratis, y si la venta se reporta con la Conversions API, Meta optimiza la campaña hacia compradores reales. Ese circuito anuncio → chat con IA → venta → señal de conversión es el producto.

**Aviso de precios (vigente desde el 1 de octubre de 2026):** Meta cobra cada respuesta libre ("mensaje de servicio") a la tarifa de utilidad del país, con 1,000 mensajes de servicio gratis por número al mes; la utilidad dentro de la ventana de 24 h también se cobra. Meta Business Agent cobra por tokens desde el 1 de agosto: USD 2 por millón, unos 4–5 centavos de dólar por mensaje. Sigue gratis la entrega dentro de las 72 h de un anuncio Click-to-WhatsApp. Sin método de pago registrado al 30 de septiembre, Meta deja de entregar mensajes de servicio.

El documento parte del audio "Ventas con IA en WhatsApp para pymes" (10 min, transcrito completo), lo contrasta con la documentación vigente de Meta y lo convierte en un plan ejecutable.

## Lo que plantea el audio

El audio critica un índice del ecosistema de desarrolladores de Meta: lista todo (videojuegos, Threads, wearables) al mismo nivel que la mensajería, y deja a una pyme sin ruta. Propone tres correcciones, que aquí se toman como los tres pilares del producto.

| Eje | Problema que señala | Propuesta del audio | Cómo lo adopta este plan |
| --- | --- | --- | --- |
| 1. Stack de inicio | "Todo el mapa del océano" para alguien que solo navega un río | Poner WhatsApp Business Platform y WhatsApp Flows al centro; agrupar Login y Webhooks como prerrequisitos; descartar lo demás | Fase 0 y 1: solo Cloud API, Webhooks, tokens de sistema y Flows |
| 2. IA integrada | La IA (Model API, Wit.ai, Meta Business Agent) vive en un silo separado de la mensajería | Conectar la IA a los webhooks y superponerla a Flows para llevar al cliente de la consulta a la reserva sin humanos | Fase 1: agente de ventas conectado al webhook, con traspaso a humano |
| 3. Monetización y ROI | Catalog y Conversions API aparecen como piezas abstractas | Catálogo dentro del chat; Conversions API servidor a servidor porque el Pixel no ve compras en WhatsApp | Fase 2 (comercio) y Fase 3 (atribución) |

El argumento más fuerte del audio es el tercero: si la venta ocurre en el chat y nadie la reporta a Meta, el dueño ve "cero ventas" en su campaña, la pausa y el proyecto muere. Este plan lo trata como requisito, no como extra.

## Investigación: estado real de la plataforma (septiembre 2026)

El diagnóstico del audio es correcto, pero varias herramientas que menciona ya cambiaron. Estas son las diferencias que alteran el diseño.

| Tema | Lo que sugiere el audio | Estado actual según Meta | Implicación |
| --- | --- | --- | --- |
| Cerebro de IA | Wit.ai para entender mensajes; Llama vía Model API | Meta ya ofrece [Meta Business Agent](https://developers.facebook.com/documentation/meta-business-agent/overview): agente administrado con conocimiento (FAQs, web, archivos), conectores a APIs propias, traspaso a tu app, pruebas y presupuestos. El portal lista la Model API con el modelo Muse Spark | Wit.ai (intención/entidades) queda como opción secundaria. Decisión tomada: agentes propios con LLM vía API; Meta Business Agent solo como referencia |
| Elegibilidad del agente de Meta | No lo menciona | Excluye Finanzas, Gobierno, Salud, Alcohol, Apuestas, medicamentos OTC y servicios matrimoniales; exige cuenta de plataforma (no la app Business), país autorizado y verificación. La fuente autoritativa es el endpoint Eligibility | No aplica con agentes propios; sí aplican las políticas de comercio de WhatsApp por giro |
| IA de propósito general | No lo menciona | Desde 15/ene/2026 los "AI Providers" solo pueden ofrecer asistentes generales donde la ley lo exige, y se cobran por mensaje en esos países ([política](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers/)) | El agente debe limitarse al negocio: catálogo, pedidos, citas, soporte |
| Precios | No lo menciona | Desde 1/oct/2026 se cobra cada respuesta libre (servicio) y la utilidad dentro de la ventana; 1,000 mensajes de servicio gratis por número al mes; Meta Business Agent cobra por tokens desde 1/ago/2026 ([precios](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/)) | Cada respuesta del agente cuesta: menos mensajes por conversación, más botones, listas y Flows |
| Anuncios Click-to-WhatsApp | Medir con Conversions API | Además abren una ventana de 72 h en la que la entrega de cualquier mensaje es gratis (los tokens de Meta Business Agent sí se cobran) | Los anuncios CTWA bajan el costo de mensajería a casi cero en la fase de venta |
| Catálogo "dentro de Flows" | Integrar el catálogo en un Flow | El catálogo vive en mensajes nativos (producto único, multiproducto, carrusel) que devuelven un webhook `order`. Flows sirve para formularios: datos de envío, citas, calificación | Catálogo con mensajes de producto; Flows para checkout y reservas |
| Pagos en el chat | Comprar en el chat | Los pagos nativos documentados son India y Brasil | En México: botón de URL con liga de pago de un procesador local y conciliación por webhook del procesador |
| Atribución | Conversions API | Se envía `Purchase` o `LeadSubmitted` con `action_source: business_messaging` y el `ctwa_clid` que llega en el primer mensaje del anuncio. Existe además un webhook `automatic_events` que detecta compras y leads | Guardar el `ctwa_clid` desde el primer mensaje es obligatorio |
| Pymes que ya usan la app | No lo menciona | "Coexistencia": la pyme usa la app WhatsApp Business y la API con el mismo número | Elimina la mayor barrera de adopción: no pierden su número ni su historial |

Conclusión: el stack de inicio del audio sigue siendo válido, pero el "cerebro" hoy se resuelve mejor con Meta Business Agent o un LLM propio, y el comercio en México requiere un procesador de pagos externo.

## Insights estratégicos

1. **El producto no es un chatbot, es un circuito de ingresos medible.** La pyme no compra "IA"; compra ventas atribuibles. El diferenciador frente a bots genéricos es cerrar el ciclo anuncio → conversación → pedido → evento de conversión.
2. **La economía favorece a quien atiende tráfico de anuncios y con pocos mensajes.** Desde el 1 de octubre de 2026 cada respuesta cuesta, salvo las primeras 1,000 de servicio al mes por número y lo entregado dentro de las 72 h de un anuncio Click-to-WhatsApp. El cliente que llega por anuncio es el más barato de atender, y un buen agente resuelve con pocos mensajes ricos (botones, listas, Flows) en vez de muchos textos cortos.
3. **Acotar la IA es a la vez cumplimiento y calidad.** La regla contra asistentes generales obliga a un agente que solo hable del negocio. Eso mismo reduce alucinaciones y soporte.
4. **Agentes propios.** Decisión: el cerebro son tus agentes, con el LLM que elijas. Dan control, portabilidad y costo predecible (proveedor de IA + mensaje de servicio a Meta). Meta Business Agent queda solo como referencia de funciones a replicar: conocimiento, conectores, evaluaciones y presupuestos. Recomendación: diseñar una capa `AgentGateway` que aísle al proveedor de LLM para poder cambiarlo sin tocar el resto.
5. **La coexistencia resuelve la adopción.** El miedo principal de una pyme es perder su número y su historial. Poder seguir usando la app mientras la API y el agente trabajan en paralelo reduce la fricción de venta de tu servicio.
6. **El traspaso a humano es parte del producto, no una falla.** Quejas, montos altos y pedidos especiales deben pasar al dueño. Meta lo soporta con traspaso de control de conversación; tu agente debe detenerse y transferir al agotar su presupuesto de tokens por conversación.
7. **Escalar de 1 a 100 pymes es otro producto.** Ser Tech Provider con Embedded Signup convierte el alta de cada cliente en un flujo de minutos, pero exige verificación del negocio, revisión de la app y un modelo multi-inquilino.

## Arquitectura de referencia y stack de inicio

El stack de inicio que pide el audio se reduce a cuatro piezas de Meta: Cloud API con Webhooks, Catálogo, WhatsApp Flows y Conversions API; el cerebro son tus agentes. Todo lo demás del portal (videojuegos, Threads, wearables, Audience Network) queda fuera.

> [Diagrama no incluido: arquitectura de referencia · canal, plataforma Meta, backend propio]

El `AgentGateway` es la pieza central: aloja tus agentes propios y aísla al resto del sistema del proveedor de LLM que uses. La base de datos multi-inquilino que respalda todos los servicios se detalla en la sección de modelo de datos.

| Capa | Pieza | Uso en el producto |
| --- | --- | --- |
| Canal | Cloud API + Webhooks | Recibir y enviar mensajes, estados y pedidos |
| Canal | Tokens de usuario de sistema | Autenticación permanente de servidor a servidor |
| Experiencia | Mensajes interactivos y WhatsApp Flows | Botones, listas, carrusel; formularios de envío y citas |
| Comercio | Catálogo (Commerce Manager) | Productos en el chat y webhook `order` |
| Inteligencia | Agentes propios (LLM a elección) | Responder, recomendar, crear pedidos, escalar |
| Medición | Conversions API for Business Messaging | Reportar ventas y leads del anuncio a Meta |
| Escala | Embedded Signup, coexistencia, Tech Provider | Alta autoservicio de muchas pymes |

## Modelo multi-inquilino con interoperabilidad A2A por dominio

Cada pyme es un inquilino aislado, y cada área del negocio (ventas, catálogo, pedidos, citas, soporte, atribución) es un agente propio que se expone con el protocolo [A2A](https://a2a-protocol.org/latest/specification/). El orquestador que atiende WhatsApp no hace el trabajo: delega por A2A en el agente del dominio correcto, siempre indicando el inquilino. A2A llegó a la versión 1.0 en marzo de 2026 con soporte nativo para multi-inquilino y Agent Cards firmadas, y en agosto de 2026 pasó a la Agentic AI Foundation de la Linux Foundation.

> [Diagrama no incluido: multi-inquilino con A2A por dominio · orquestador, gateway, 6 agentes de dominio]

A2A conecta agentes entre sí; MCP conecta cada agente con sus herramientas y datos. El plano de inquilinos garantiza que ningún agente vea datos o gaste presupuesto de otra pyme.

### Jerarquía de inquilinos y aislamiento

| Nivel | Qué es | Qué se aísla |
| --- | --- | --- |
| Plataforma | Tu empresa | Llaves de firma de Agent Cards, app de Meta, facturación global |
| Partner | Agencia de marca blanca (Fase 5) | Su marca, sus usuarios y la lista de pymes que administra |
| Inquilino | Una pyme | WABA y números, tokens cifrados, catálogo, configuración de agentes, límites de gasto de IA y mensajes |
| Canal | Número de WhatsApp de la pyme | Webhook, calidad del número, plantillas |
| Conversación | Chat con un cliente final | Contexto A2A, historial, estado del agente o traspaso a humano |

Aislamiento recomendado: base de datos compartida con `tenant_id` en cada tabla y seguridad por fila para pymes estándar; esquema o base propia solo para clientes grandes que lo paguen. Secretos por inquilino en un almacén de secretos, nunca en la configuración del agente.

### Dominios y sus agentes

| Dominio | Agente A2A | Skills en su Agent Card | Herramientas (MCP) | Datos que posee |
| --- | --- | --- | --- | --- |
| Ventas | `ventas` | recomendar producto, cotizar, calificar lead | CRM, cotizador | leads, cotizaciones |
| Catálogo e inventario | `catalogo` | buscar producto, consultar existencias y precio | Catálogo de Meta, POS o inventario | productos, existencias |
| Pedidos y pagos | `pedidos` | crear pedido, generar liga de pago, estado de pedido | Procesador de pagos, facturación | pedidos, pagos |
| Citas | `citas` | ver disponibilidad, reservar, reprogramar | Calendario, data endpoint de Flows | agenda, reservas |
| Soporte y traspaso | `soporte` | responder políticas, abrir caso, pasar a humano | Base de políticas, bandeja | casos |
| Atribución y ROI | `atribucion` | registrar origen, enviar conversión, reporte de ROAS | Conversions API, tablero | eventos de conversión |

Regla de dominio: cada agente es el único que escribe en sus datos; los demás le piden por A2A. Así un cambio de POS o de procesador de pagos solo toca un agente.

### Arquitectura por capas de cada dominio

Cada dominio se entrega como un paquete completo en cuatro capas, con el mismo contrato en todos: así un dominio nuevo (p. ej. logística) se agrega sin tocar los demás, y cualquier capa se puede reemplazar sin romper las otras.

> [Diagrama no incluido: arquitectura por capas de cada dominio · 4 capas]

Las peticiones bajan de la interfaz al agente y de ahí a otros agentes o sistemas; los eventos (pago confirmado, mensaje nuevo) suben por webhooks y notificaciones A2A.

| Capa | Responsabilidad | Regla de diseño |
| --- | --- | --- |
| Interfaz de usuario | Lo que ven el cliente final (chat, Flows, botones, catálogo) y el dueño (panel, bandeja, tablero) | Sin lógica de negocio ni acceso directo a datos; habla con el orquestador o con la API del dominio |
| Endpoint de agente | El cerebro del dominio: LLM elegido, skills, guardarraíles, presupuesto por inquilino, evaluaciones | Un endpoint por dominio; se invoca por A2A (desde otros agentes) o por la API (desde la interfaz) |
| Interoperabilidad A2A | Descubrimiento (Agent Cards firmadas), enrutamiento por dominio y `tenant`, ciclo de vida de tareas, notificaciones | Solo agentes hablan A2A; toda tarea lleva `tenant`, `contextId` y `taskId` |
| Webhooks, APIs y CLIs | Entrada de eventos (Meta, procesador de pagos, POS), API REST del dominio, CLI de operación, servidores MCP hacia sistemas | API primero: toda capacidad existe como API; la CLI envuelve la API; los webhooks se normalizan a eventos internos |

**Qué contiene cada dominio en cada capa**

| Dominio | Interfaz de usuario | Endpoint de agente | Interoperabilidad A2A | Webhooks, APIs y CLIs |
| --- | --- | --- | --- | --- |
| Ventas | Recomendaciones y carrusel en el chat; panel de leads | Califica, recomienda y cotiza | Card `ventas`; pide existencias y precio a `catalogo` | Webhook `messages`; API `/leads`; CLI `ventas leads exportar`; MCP al CRM |
| Catálogo e inventario | Mensajes de producto y catálogo; panel de productos | Búsqueda de productos con precio y existencias vigentes | Card `catalogo`; atiende a `ventas` y `pedidos` | Sincronización con Commerce Manager; API `/productos`; CLI `catalogo sync`; MCP al POS |
| Pedidos y pagos | Flow de checkout, botón de liga de pago, estado del pedido | Arma carrito, valida y genera el cobro | Card `pedidos`; artifact del pedido; push al orquestador al confirmarse el pago | Webhook `order` de Meta y del procesador; API `/pedidos`; CLI `pedidos conciliar`; MCP a facturación |
| Citas | Flow dinámico de reserva; recordatorios | Disponibilidad y reglas de agenda | Card `citas`; `input-required` para elegir horario | Data endpoint de Flows; API `/citas`; CLI `citas agenda`; MCP al calendario |
| Soporte y traspaso | Bandeja humana; respuestas de políticas | Responde políticas, abre casos, decide escalar | Card `soporte`; tareas rechazadas o escaladas visibles al dueño | Webhook `smb_message_echoes`; API `/casos`; CLI `soporte casos`; MCP a la base de políticas |
| Atribución y ROI | Tablero de ROAS del dueño | Asigna origen y decide qué evento enviar | Card `atribucion`; recibe artifacts de `pedidos` y `ventas` | Webhooks `referral` y `automatic_events`; Conversions API; API `/reportes`; CLI `atribucion reenviar` |

**Contrato mínimo para dar de alta un dominio**

- [ ] Agent Card firmada, con skills y tarjeta extendida por inquilino
- [ ] Especificación OpenAPI de su API REST, con `tenant_id` obligatorio
- [ ] Comandos de CLI para operar y depurar (los mismos que puede usar un agente de código)
- [ ] Eventos que publica y webhooks que consume, documentados
- [ ] Componentes de interfaz: mensajes interactivos, Flows y vista en el panel
- [ ] Conjunto de evaluaciones del agente y presupuesto por defecto

La CLI tiene un doble uso: el equipo de soporte la usa para operar sin entrar a la base de datos, y tus propios agentes de código o de operación la usan como herramienta, igual que Kapso ofrece CLI y servidor MCP sobre su API.

### Enrutamiento multi-inquilino en A2A

A2A v1.0 permite tres mecanismos combinables ([guía de multi-tenancy](https://a2a-protocol.org/latest/topics/multi-tenancy/)); la propuesta usa los tres:

1. **URL por dominio:** `https://agents.tudominio.com/ventas`, `/catalogo`, `/pedidos`… Cada agente publica su propia Agent Card con su URL.
2. **Campo `tenant` en cada solicitud:** el identificador opaco de la pyme (p. ej. `pyme_8f3a`). El cliente debe repetir el valor que anuncia la Agent Card en cada mensaje.
3. **Token con el inquilino:** OAuth 2.0 *client credentials* con el inquilino y los dominios permitidos en el token. El gateway rechaza cualquier solicitud cuyo `tenant` no coincida con el token.

**Agent Card de ejemplo** (servida en `/.well-known/agent-card.json` del dominio del agente y firmada con JWS):

```json
{
  "name": "Agente de pedidos",
  "description": "Crea pedidos, genera ligas de pago y reporta su estado",
  "version": "1.0.0",
  "supportedInterfaces": [{
    "url": "https://agents.tudominio.com/pedidos",
    "protocolBinding": "HTTP+JSON",
    "protocolVersion": "1.0",
    "tenant": "pyme_8f3a"
  }],
  "capabilities": { "streaming": true, "pushNotifications": true, "extendedAgentCard": true },
  "skills": [
    { "id": "crear_pedido", "name": "Crear pedido", "tags": ["pedidos"] },
    { "id": "liga_pago", "name": "Generar liga de pago", "tags": ["pagos"] }
  ]
}
```

La tarjeta pública muestra solo lo genérico; la *extended Agent Card*, que exige autenticación, revela skills y límites específicos de esa pyme.

### Cómo se traduce una conversación de WhatsApp a A2A

| WhatsApp | A2A |
| --- | --- |
| Chat con un cliente final | `contextId` (uno por conversación e inquilino) |
| Petición de negocio (cotizar, pedir, agendar) | `Task` en el agente del dominio |
| El agente necesita un dato (talla, dirección) | Estado `TASK_STATE_INPUT_REQUIRED` → el orquestador pregunta por WhatsApp o abre un Flow |
| Respuesta del cliente o resultado del Flow | Nuevo `Message` con el mismo `taskId` y `contextId` |
| Confirmación de pedido, liga de pago, resultado de cita | `Artifact` de la tarea (datos estructurados) |
| Pago confirmado horas después | Notificación *push* del agente de pedidos al orquestador |
| Queja o monto alto | El agente de soporte rechaza o escala (`TASK_STATE_REJECTED` o traspaso a humano) |

### Interoperabilidad con terceros

El mismo gateway permite, sin integraciones a la medida, que agentes externos colaboren con los de la pyme: el agente del ERP o POS de la pyme, un agente de logística que cotiza envíos, o el agente de una agencia partner que administra varias pymes. Cada externo recibe credenciales por inquilino y solo ve las skills de su *extended Agent Card*. Esto convierte tu plataforma en un punto de integración, no solo en un chatbot.

### Seguridad y operación

- Firmar todas las Agent Cards (JWS) y verificar la firma antes de delegar, para evitar tarjetas falsas.
- Enviar siempre el encabezado `A2A-Version: 1.0`; versionar cada agente de dominio por separado.
- Nunca devolver "no autorizado" distinto de "no existe": A2A pide no revelar tareas de otro inquilino.
- Presupuesto de tokens y de mensajes por inquilino, aplicado en el orquestador y en cada agente.
- Trazas con `tenant`, `contextId` y `taskId` en cada llamada para auditar y cobrar por uso.
- Idempotencia con `messageId` para que un reintento del webhook de WhatsApp no cree dos pedidos.

### Evolución por fase

| Fase | Qué se construye |
| --- | --- |
| 1–2 | Un solo servicio con módulos por dominio cuyas interfaces ya usan el modelo A2A (Task, Message, Artifact), llamadas en proceso |
| 3 | Se separan `pedidos` y `atribucion` como agentes A2A reales detrás del gateway (son los que más cambian por pyme) |
| 4 | Todos los dominios detrás del gateway, `tenant` obligatorio, Agent Cards por inquilino y alta automática al crear la pyme |
| 5 | Se abre el gateway a agentes externos y a partners; tarjetas extendidas y cobro por uso de skills |

Decisión clave: no empezar con microservicios. El modelo de datos A2A desde el día uno permite separarlos después sin reescribir el orquestador.

## Operación en varios países

La misma plataforma sirve a pymes de varios países si el país se trata como una dimensión más del inquilino: el núcleo (orquestador, gateway A2A, agentes de dominio) es único, y lo que cambia por país vive en un **paquete de país** de configuración y conectores. Los datos de cada pyme se guardan en la región que exige su país.

> [Diagrama no incluido: operación multipaís · núcleo global, paquetes de país, regiones de datos]

Agregar un país nuevo es llenar un paquete y, si su ley lo pide, habilitar una región de datos; no se toca el núcleo.

### Qué cambia de un país a otro

| Factor | Qué varía | Cómo lo resuelve la plataforma |
| --- | --- | --- |
| Tarifas de Meta | Se cobra según el país del **destinatario**. Argentina, Brasil, Chile, Colombia, México y Perú tienen tarifa propia; el resto de la región paga "Resto de Latinoamérica" ([precios](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/)). Desde oct/2026 el mensaje de servicio cuesta lo mismo que la utilidad del país | Guardar `recipient_country` en cada mensaje y costear con la tarjeta del país; tablero de costos por país y por pyme |
| Moneda de facturación | La WABA factura en una de 16 monedas (USD, MXN, BRL, COP, ARS, CLP, PEN, EUR, entre otras). Clientes con país de facturación Brasil deben pasar a BRL antes del 30/jun/2027; India a INR antes del 31/dic/2026 | Moneda de la WABA en el paquete de país; tus planes cobrados en moneda local y tarifas de Meta a costo |
| Números | Un número local da confianza; los números virtuales piden requisitos regulatorios distintos por país | Proveedor de números y pools por país (Twilio/Telnyx o SIM local); coexistencia cuando la pyme ya tiene número |
| Pagos en el chat | Brasil (Pix, boleto, ligas, un clic) e India (UPI) tienen pagos nativos; el resto usa ligas de procesadores locales | El agente `pedidos` elige el conector de pago del paquete de país vía su MCP |
| Facturación fiscal | CFDI (México), NF-e (Brasil), factura electrónica DIAN (Colombia), SII (Chile), SUNAT (Perú), ARCA (Argentina) | Nuevo dominio `fiscal` con un conector por país |
| Protección de datos | Ley federal mexicana, LGPD (Brasil), Ley 1581 (Colombia), GDPR (UE), entre otras | Aviso de privacidad y base legal por país; retención y derechos ARCO/titulares configurables |
| Residencia de datos | Algunos sectores o países exigen datos en el país | Local storage de Meta por número (`data_localization_region`, p. ej. `BR`) + tu base de datos en la región |
| Política de IA | En países donde Meta debe permitir asistentes generales (Brasil hoy) les cobra aparte | Tus agentes siguen acotados al negocio; revisar la lista de países de la [política de AI Providers](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers/) cada trimestre |
| Idioma y tono | es-MX, es-CO, es-AR, pt-BR: vocabulario, formalidad y moneda en texto | Plantillas por código de idioma; instrucciones y evaluaciones del agente por locale |
| Coexistencia | No está disponible para algunos códigos de país | Verificar el país antes de vender coexistencia; si no, número dedicado |
| Zona horaria | El mes de facturación y los límites se cuentan en la zona horaria de la WABA; horarios de atención y días festivos por país | Zona horaria y calendario en el paquete de país; envíos de marketing solo en horario local |

### Residencia de datos con local storage de Meta

Meta permite fijar, por número, el país donde se guarda el contenido de los mensajes en reposo ([local storage](https://developers.facebook.com/documentation/business-messaging/whatsapp/local-storage/)): el contenido puede procesarse fuera hasta 60 minutos (90 en Marketing Messages API) y después solo se conserva en la región elegida. Se activa con la Settings API antes de registrar el número; en un número ya activo implica darlo de baja y registrarlo de nuevo, con menos de 5 minutos de corte y sin volver a verificar.

```
POST /{phone_number_id}/settings
{ "storage_configuration": { "status": "IN_COUNTRY_STORAGE_ENABLED", "data_localization_region": "BR" } }
```

Las regiones disponibles se consultan en el parámetro `data_localization_region` de la documentación de registro; los medios subidos con local storage solo los puede usar ese número.

### Cómo encaja en el modelo multi-inquilino y A2A

- **Inquilino:** agrega `country`, `currency`, `locale`, `data_region` y `timezone`; la conversación guarda `recipient_country` (puede diferir del país de la pyme).
- **Paquete de país:** tabla `country_pack` con moneda, tarjeta de tarifas vigente, conector de pago, conector fiscal, textos legales, idiomas, festivos y proveedor de números.
- **Agentes de dominio:** los mismos en todos los países; lo local entra por sus herramientas MCP (`pagos-mx`, `pagos-br`, `fiscal-co`…). El dominio `fiscal` se agrega como séptimo agente.
- **Enrutamiento A2A:** URL por región y dominio (`https://mx.agents.tudominio.com/pedidos`, `https://br.agents.tudominio.com/pedidos`) + `tenant`. La Agent Card extendida de cada inquilino anuncia solo las skills disponibles en su país (p. ej. `pago_pix` solo en Brasil).
- **Despliegue:** una instancia regional del núcleo por región de datos; el plano de control (alta de pymes, facturación de tu plataforma, llaves de firma) puede ser global.

### Orden sugerido de expansión

| Etapa | Países | Por qué en ese orden | Qué hay que construir |
| --- | --- | --- | --- |
| 1 | México | Mercado base, piloto en Veracruz | Paquete MX completo |
| 2 | Colombia, Perú, Chile | Mismo idioma, tarifa propia de Meta, procesadores locales similares | Paquetes de país, conectores de pago y fiscales, ajustes de locale |
| 3 | Brasil | Mercado grande con pagos nativos (Pix) pero portugués, LGPD, BRL obligatorio y cargos a IA general | Agente y plantillas en pt-BR, región de datos Brasil, conector Pix |
| 4 | Argentina y resto de la región | Moneda volátil o tarifa regional compartida | Precios indexados o en USD; paquete regional |

**Antes de abrir un país:** tarjeta de tarifas de Meta de ese país cargada; proveedor de números y de pagos probado; conector fiscal; aviso de privacidad revisado por un abogado local; agente evaluado en el locale; 3 pymes piloto con el mismo esquema de 13 semanas.

## Fases de desarrollo, de menor a mayor escala

Cada fase termina en una compuerta medible; no se avanza sin cumplirla. Las duraciones son estimaciones para un equipo de 2–3 desarrolladores.

> [Diagrama no incluido: hoja de ruta · 6 fases con su compuerta]

La tercera línea de cada fase es su compuerta de salida; el detalle de cada una sigue abajo.

### Fase 0 — Fundaciones (semanas 1–2) · 1 pyme piloto

Objetivo: enviar y recibir mensajes de forma segura en un número real.

- Crear portafolio de negocio en Meta, app de Meta y cuenta de WhatsApp Business (WABA); iniciar la verificación del negocio.
- Registrar el número (o conectar el de la pyme por coexistencia) y generar un **token de usuario de sistema** permanente; nunca tokens temporales en producción.
- Endpoint de webhook en HTTPS: verificación GET (`hub.challenge`), validación de firma `X-Hub-Signature-256`, respuesta 200 inmediata y procesamiento en cola.
- Idempotencia por `message.id`; guardar estados `sent/delivered/read/failed` y el objeto `pricing` de cada estado.
- Plantilla `hello_world` enviada y bot eco funcionando.

**Compuerta:** 100 % de mensajes entrantes persistidos sin duplicados; latencia de acuse del webhook < 1 s.

### Fase 1 — MVP: agente de ventas con IA (semanas 3–6) · 1–3 pymes

Objetivo: el agente responde preguntas frecuentes y captura pedidos o citas sin intervención humana.

- `AgentGateway`: capa que aloja tus agentes propios: LLM elegido por ti, recuperación sobre FAQs, políticas y catálogo, e interfaz que permite cambiar de proveedor de LLM sin tocar el resto.
- Herramientas del agente: `buscar_producto`, `consultar_existencias`, `crear_pedido`, `agendar_cita`, `escalar_a_humano`.
- Mensajes interactivos: botones de respuesta, listas, carrusel; indicador de escritura y acuse de lectura.
- Traspaso a humano por reglas (queja, monto > umbral, 2 fallos de comprensión) con bandeja simple para el dueño.
- Guardarraíles: el agente solo habla del negocio; opt-in registrado; límite de turnos y tokens por conversación.

**Compuerta:** ≥ 70 % de conversaciones resueltas sin humano; tiempo de primera respuesta < 10 s; cero respuestas fuera de dominio en 200 pruebas.

### Fase 2 — Comercio en el chat (semanas 7–10)

Objetivo: que el cliente vea productos, arme su pedido y pague sin salir de WhatsApp (salvo la página del procesador).

- Catálogo en Commerce Manager sincronizado desde el inventario de la pyme (hoja de cálculo o POS).
- Mensajes de producto único, multiproducto y carrusel; procesar el webhook `order` como carrito.
- WhatsApp Flows para datos de envío, dirección, horario de entrega y citas, con endpoint de datos para disponibilidad en vivo.
- Pago: liga de un procesador local enviada con botón de URL; confirmación por webhook del procesador; mensaje de estado del pedido (plantilla de utilidad; se cobra desde el 1/oct/2026 salvo dentro de las 72 h de un anuncio).

**Compuerta:** ≥ 20 % de conversaciones con intención de compra terminan en pedido pagado; conciliación de pagos sin diferencias.

### Fase 3 — Atribución y ROI (semanas 11–13)

Objetivo: que el dueño vea en su Administrador de anuncios cuántas ventas generó cada campaña.

- Capturar `referral.ctwa_clid`, ID de anuncio y campaña del primer mensaje de cada conversación.
- Crear dataset y enviar eventos por Conversions API: `LeadSubmitted` al calificar, `Purchase` con valor y moneda al pagar; `action_source: business_messaging`, `messaging_channel: whatsapp`.
- Registro (ledger) de eventos enviados para no contar dos veces un pedido; comparar contra el webhook `automatic_events` si se activa.
- Tablero para el dueño: gasto, conversaciones, pedidos, ingresos, costo por venta, ROAS.

**Compuerta:** ≥ 95 % de ventas originadas en anuncios con evento aceptado por Meta; el ROAS del tablero cuadra con el Administrador de anuncios ± 10 %.

### Fase 4 — Multi-pyme / Tech Provider (meses 4–6) · 10–100 pymes

Objetivo: dar de alta una pyme nueva en minutos, sin trabajo manual.

- Registro como Tech Provider y revisión de la app para los permisos `whatsapp_business_messaging` y `whatsapp_business_management`.
- Embedded Signup v4 en tu sitio (la v2 se retira el 15/oct/2026), con flujo de coexistencia para pymes que ya usan la app.
- Arquitectura multi-inquilino con agentes de dominio expuestos por A2A (ver sección dedicada): un `tenant` por pyme con su WABA, número, token, catálogo, configuración del agente y límites de gasto.
- Panel de autoservicio: horario, tono, FAQs, catálogo, reglas de escalamiento, métricas.
- Facturación de tu servicio (suscripción + uso) separada de la facturación de Meta.

**Compuerta:** alta de pyme < 30 min de punta a punta; costo de IA por conversación medido por inquilino; margen bruto positivo por cliente.

### Fase 5 — Escala y optimización (mes 7 en adelante) · 100+ pymes

Objetivo: operar con alta disponibilidad y crecer ingresos por cliente.

- Procesamiento de webhooks con cola y trabajadores horizontales; monitoreo de throughput, límites de mensajería y calidad del número.
- Marketing Messages API con precio máximo por mensaje; campañas segmentadas con opt-in; reactivación de clientes inactivos.
- Evaluaciones continuas del agente (conjuntos de prueba por vertical) y ajustes de instrucciones.
- Canales adicionales solo cuando el núcleo esté estable: llamadas por WhatsApp, Instagram y Messenger con la misma capa de agente.
- Plantillas por vertical (restaurantes, retail, servicios con cita) para acelerar ventas, y expansión a otros países con paquetes de país (ver Operación en varios países).

**Compuerta:** disponibilidad ≥ 99,9 %; calidad del número en verde; churn mensual de pymes < 3 %.

## Números de WhatsApp: cómo conseguirlos e integrarlos

Para cada proyecto la regla es: si la pyme ya tiene clientes en su WhatsApp, se conecta **su** número por coexistencia; si el proyecto es nuevo o necesita automatización estable, se usa un número **dedicado** a la API. Un número sirve solo para una cuenta: no puede estar a la vez en WhatsApp personal y en la API, y debe poder recibir un código por SMS o llamada (salvo que sea pre-verificado).

| Opción | De dónde sale | Ventajas | Límites | Úsala para |
| --- | --- | --- | --- | --- |
| Número actual de la pyme (coexistencia) | La app WhatsApp Business que ya usa | Conserva número, contactos y hasta 6 meses de historial; el dueño sigue contestando desde el celular | 20 msg/s fijos; sin grupos ni listas de difusión; requiere ser Tech Provider/Solution Partner o usar uno (p. ej. Kapso) | Pymes con clientela existente |
| Número actual migrado a API dedicada | El número de la pyme, dado de baja de la app | Máxima estabilidad y funciones completas | El dueño deja de usar la app en ese número; se pierde el historial de la app | Pymes con volumen alto o equipo con bandeja web |
| SIM nueva de operador mexicano | Chip prepago o línea de empresa (Telcel, AT&T, Movistar) | Número local +52, barato, el cliente confía en él | Hay que conservar la SIM activa para verificaciones; trámite manual por proyecto | Pilotos y pymes nuevas |
| Número virtual de proveedor de telefonía | Twilio, Telnyx u otro, comprado por API | Se provisiona por código; inventario por país | Números mexicanos piden documentación regulatoria (dirección, paquete regulatorio) | Plataforma con muchas altas |
| Número pre-verificado de Kapso | Pool gestionado por Kapso | Alta sin SMS; el plan gratis incluye uno | País por defecto: EE. UU. (+1); se libera si no hay mensajes de producción en 30 días | Pruebas, demos y marcas que aceptan +1 |
| Números locales vía Kapso + tu Twilio | Tu cuenta de Twilio, administrada por Kapso | Pools pre-verificados por país; alta sin OTP | Complemento de USD 400/mes en planes Pro/Team/Platform (incluido en Enterprise) | Revender números locales a escala (Fase 4–5) |

**Cómo integrar un número a un proyecto (checklist)**

1. Elegir la opción de la tabla según el cliente.
2. Conectar el número a una WABA dentro del portafolio correcto: por Embedded Signup (tu app de Tech Provider) o por un *setup link* de Kapso.
3. Registrar el número en Cloud API con PIN de verificación en dos pasos (omitir en coexistencia: ya está registrado).
4. Solicitar el nombre visible (display name) y completar el perfil del negocio.
5. Suscribir tu app a los webhooks de la WABA y guardar `waba_id` y `phone_number_id` en el `tenant`.
6. Asignar el método de pago de Meta (tarjeta de la pyme o línea de crédito del proveedor).
7. Generar enlace corto y QR del número (siguiente sección) y conectar el agente.

**Si quieres revender números a tus clientes**, el modelo más limpio es que cada pyme sea dueña de su WABA en su propio portafolio y tú operes como Tech Provider (o sobre Kapso). Así la pyme no queda atada a ti si se va, cumples las reglas de Meta y el cobro de mensajes puede ir a su tarjeta o a tu línea de crédito con recargo.

## Coexistencia: app WhatsApp Business + API en el mismo número

Con coexistencia la pyme conecta su número actual de la app WhatsApp Business a Cloud API: tu agente atiende por API y el dueño sigue escribiendo desde su celular, con los chats sincronizados en ambos lados ([guía de Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/)). Tras conectarse, lo que el dueño envía desde la app sigue siendo gratis; lo que sale por API paga la tarifa de Cloud API.

**Requisitos**

- App WhatsApp Business versión 2.24.17 o superior, con actividad reciente (Meta puede pedir más uso antes de aceptar el número).
- Ser Tech Provider o Solution Partner con Embedded Signup y *session logging*; si aún no lo eres, hacerlo a través de un proveedor como Kapso.
- Webhook capaz de absorber ráfagas grandes (el historial llega en bloques de miles de mensajes).
- Número sin credit line ni WABA de un proveedor anterior; si existe, revocarla primero.

**Paso a paso técnico**

1. Suscribir tu app a los campos de webhook `history`, `smb_app_state_sync` y `smb_message_echoes`, además de `messages`.
2. Mostrar Embedded Signup (v4); la pyme elige conectar su cuenta existente, escribe su número, recibe el mensaje de la cuenta oficial, toca **Conectar** y acepta compartir historial.
3. Capturar el evento `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` con el `waba_id` y el código canjeable por token.
4. Hacer el onboarding normal **sin** registrar el número (ya está registrado).
5. Verificar con `GET /{phone_number_id}?fields=is_on_biz_app,platform_type`: debe devolver `true` y `CLOUD_API`.
6. En menos de 24 h, llamar `POST /{phone_number_id}/smb_app_data` con `sync_type: smb_app_state_sync` (contactos) y luego con `sync_type: history` (historial). Cada llamada se puede hacer una sola vez; si se vence el plazo, la pyme debe repetir el alta.
7. Guardar el historial: llega en fases (día 0–1, 1–90, 90–180) y fragmentos con `chunk_order` y `progress`; los medios solo de los últimos 14 días. Si la pyme no comparte historial, llega el error `2593109`.
8. Reflejar en tu bandeja cada `smb_message_echoes` (lo que el dueño contesta desde el celular) para que el agente no responda encima.

**Reglas de convivencia agente ↔ dueño**

- Si llega un *echo* del dueño en una conversación, el agente se pausa en ese chat por un tiempo definido (p. ej. 2 h) o hasta que el dueño lo libere desde el panel.
- Lo que el dueño envía desde la app no abre ni extiende la ventana de 24 h de la API; el agente debe calcular la ventana solo con mensajes del cliente.
- Mensajes que llegan antes del alta no abren ventana: responder con plantilla.

**Qué cambia en la app de la pyme**

| Función | Después de conectar |
| --- | --- |
| Chats individuales | Se sincronizan con la API (hasta 6 meses de historial) |
| Contactos | Se sincronizan |
| Grupos, llamadas, catálogo de la app, respuestas rápidas, etiquetas | Siguen en la app; no pasan a la API |
| Listas de difusión | Se desactivan (quedan de solo lectura) |
| Mensajes temporales, ver una vez, ubicación en tiempo real | Se desactivan |
| Dispositivos vinculados | Se desvinculan; se pueden volver a vincular (excepto WhatsApp para Windows y WearOS) |
| Velocidad de envío por API | Fija en 20 mensajes por segundo |

**Desconexiones a vigilar.** No se puede dar de baja por API; la pyme se desconecta desde la app (Ajustes → Cuenta → Plataforma empresarial) y llega `account_update` con `PARTNER_REMOVED`. Meta también desconecta si el celular principal pasa unos 14 días inactivo o si la pyme cambia de dispositivo; al reinstalar puede reconectarse y llega `ACCOUNT_RECONNECTED`. Tu sistema debe pausar los envíos del inquilino y alertar al dueño en esos casos. Kapso advierte además que la coexistencia es menos estable que un número dedicado: para automatización de alto volumen conviene migrar después.

## Puntos de entrada: wa.me, enlaces cortos y QR

Todo cliente que escribe primero abre la ventana de 24 h; por eso cada canal de la pyme (web, Instagram, ticket, empaque, local) debe terminar en un enlace a WhatsApp con un mensaje prellenado que le diga al agente de dónde viene.

| Tipo | Formato | Cuándo usarlo |
| --- | --- | --- |
| Enlace wa.me | `https://wa.me/522291234567?text=Hola%2C%20vengo%20del%20men%C3%BA` | Rápido, sin API; el número queda visible y el texto no se puede cambiar después de impreso |
| Enlace corto de Meta | `https://wa.me/message/<CÓDIGO>` | Oculta el número; el mensaje prellenado se edita cuando quieras; hasta 2,000 por número ([QR y enlaces cortos](https://developers.facebook.com/documentation/business-messaging/whatsapp/qr-codes/)) |
| Código QR | Imagen PNG o SVG del enlace corto | Mesas, mostrador, flyers, empaque, tickets |
| Anuncio Click-to-WhatsApp | Botón del anuncio | Tráfico pagado con `ctwa_clid` y 72 h de entrega gratis |

**Crear un enlace corto con QR por API**

```
POST /{phone_number_id}/message_qrdls
{ "prefilled_message": "Quiero pedir [QR-MESA]", "generate_qr_image": "SVG" }
→ { "code": "...", "deep_link_url": "https://wa.me/message/...", "qr_image_url": "..." }
```

**Atribución sin anuncios.** Meta no da analítica de escaneos de QR. Solución: incluir una etiqueta distinta en cada mensaje prellenado (`[QR-MESA]`, `[IG-BIO]`, `[TICKET]`, `[WEB-HERO]`), detectarla en el primer mensaje, guardarla en `conversation.origen` y quitarla antes de pasarla al agente. Así el tablero muestra ventas por canal orgánico junto a las de anuncios.

En México el formato de wa.me usa el código de país 52 seguido de los 10 dígitos, sin espacios ni signos; probar siempre el enlace final en un celular antes de imprimir. Ojo: en webhooks de la API algunos números mexicanos pueden llegar con el prefijo antiguo 521; normaliza el `wa_id` antes de buscar al contacto para no duplicarlo.

## WhatsApp Flows: diseño e implementación

Un Flow es un formulario de varias pantallas que se abre dentro del chat. Sirve donde la conversación libre falla: capturar datos estructurados (dirección, fecha, talla, presupuesto) sin errores y con menos mensajes, lo que desde octubre de 2026 también reduce costo.

| Modo | Cómo funciona | Úsalo para |
| --- | --- | --- |
| Estático | Todo el contenido vive en el Flow JSON; no llama a tu servidor | Encuestas, formularios de datos fijos, calificación de leads con opciones cerradas |
| Dinámico | Meta llama a tu *data endpoint* en cada pantalla y tú devuelves los datos; requiere cifrado configurado por número | Horarios disponibles, existencias, precios, cobertura de entrega, opciones que dependen de respuestas previas ([Kapso: estático vs dinámico](https://docs.kapso.ai/docs/whatsapp/flows/static-vs-dynamic.md)) |

**Flows recomendados por fase**

| Flow | Modo | Fase | Qué devuelve al backend |
| --- | --- | --- | --- |
| Calificación de lead | Estático | 1 | Presupuesto, necesidad, fecha, zona → evento `LeadSubmitted` |
| Datos de entrega | Dinámico | 2 | Dirección validada contra zona de cobertura, horario, costo de envío |
| Reserva de cita | Dinámico | 2 | Servicio, profesional, fecha y hora confirmadas |
| Checkout | Dinámico | 2 | Resumen de carrito, datos de facturación → genera liga de pago |
| Encuesta post-venta | Estático | 3 | Calificación y comentario → alerta si es baja |

**Implementación**

1. Diseñar las pantallas en el constructor de Flows de WhatsApp Manager (o por API/SDK) y guardar el Flow JSON en tu repositorio.
2. Para Flows dinámicos: generar el par de llaves, subir la llave pública al número, publicar el endpoint HTTPS que descifra la solicitud, responde con los datos de la siguiente pantalla y cifra la respuesta. Mantener la respuesta rápida (consultas precalculadas o en caché).
3. Publicar el Flow (una versión publicada no se puede despublicar; se crea una nueva versión).
4. Enviarlo dentro de la ventana como mensaje interactivo de tipo `flow`, o fuera de ella dentro de una plantilla con botón de Flow.
5. Recibir el resultado en el webhook `messages` como respuesta interactiva (`nfm_reply`) con el JSON de respuesta; validarlo, guardarlo en el pedido o cita y continuar la conversación con el agente.

**Cómo lo usa el agente.** El agente decide *cuándo* abrir un Flow (herramienta `abrir_flow(tipo)`) y retoma la conversación con los datos ya estructurados. Tu agente los envía con la misma API de mensajes interactivos.

## Kapso: qué acelera y cuándo usarlo

[Kapso](https://docs.kapso.ai/docs/introduction) es una capa de infraestructura sobre Cloud API: te da números, alta de clientes, bandeja, Flows y webhooks listos, y tú construyes el agente y el negocio encima. Como tus agentes son propios, Kapso solo aportaría transporte, números, alta de clientes y bandeja; su mayor valor aquí es como referencia de modelo de negocio (siguiente sección).

| Pieza de este plan | Construirla tú | Con Kapso |
| --- | --- | --- |
| Número de pruebas | Registrar SIM y verificar | Número sandbox gratis y número pre-verificado +1 en el plan gratis |
| Alta de pymes (Fase 4) | Ser Tech Provider + Embedded Signup propio | *Setup links* por cliente; compatible con tu propia app de Tech Provider |
| Coexistencia | Requiere ser Tech Provider/Solution Partner | Flujo de conexión de la app Business ya integrado |
| Webhooks | Firma, reintentos, orden | Webhooks con firma, *buffering*, orden y reintentos |
| Flows dinámicos | Cifrado + endpoint propio | Cifrado asistido y endpoint desplegado como función serverless |
| Bandeja humana | Construir panel | Bandeja compartida, asignaciones y bandeja embebible por iframe |
| Agente | `AgentGateway` propio | Tus agentes reciben el webhook con el formato original de Meta (opción kind meta) y responden por su API; su nodo de agente no hace falta |
| Difusiones | Colas y límites | Broadcasts por API o CSV con seguimiento por destinatario |
| Cobro de mensajes Meta | Tarjeta por WABA | Pagar con créditos Kapso o con el método de pago de Meta; en soluciones multi-partner, 5 % de cargo por facturación gestionada |

**Planes publicados** ([precios Kapso](https://docs.kapso.ai/docs/whatsapp/pricing-faq.md)): Free con 2,000 mensajes/mes y 1 número; Pro con 100,000 mensajes y 3 números; Platform con 1,000,000 mensajes y 50 números. Kapso cuenta mensajes entrantes y salientes. Los precios en dólares de cada plan están en kapso.ai/pricing y no se incluyen aquí.

**Riesgo a gestionar:** dependencia de un proveedor. Mitigación: mantener `AgentGateway`, modelo de datos y lógica de negocio en tu backend; usar Kapso solo como transporte y consola; que cada pyme sea dueña de su WABA para poder migrar (Kapso documenta migraciones desde Twilio, YCloud y 360dialog, y el camino inverso existe vía Embedded Signup).

## Kapso como modelo de negocio (referencia)

Kapso vende **infraestructura horizontal de WhatsApp** por suscripción con mensajes incluidos, pasa los cargos de Meta a costo y gana en los extras que crecen con el cliente: excedentes, números, facturación gestionada y complementos. No vende el agente ni el resultado de negocio; ese hueco es justo donde entra tu producto.

| Fuente de ingreso | Precio publicado | Qué la hace crecer |
| --- | --- | --- |
| Suscripción | Free USD 0 (2,000 mensajes, 1 número); Pro USD 25/mes (100,000 mensajes, 3 números); Platform USD 299/mes (1,000,000 mensajes, 50 números); Enterprise a medida ([Kapso vs Twilio](https://kapso.com/twilio-alternative-for-whatsapp)) | Volumen y número de clientes conectados |
| Excedente de mensajes | USD 0.002 por mensaje en Pro y USD 0.001 en Platform ([blog de precios de Kapso](https://kapso.ai/blog/whatsapp-api-pricing-2026)); cuenta entrantes y salientes | Cada conversación suma por los dos lados |
| Números conectados extra | USD 10 en Pro, USD 5 en Platform | Agencias y SaaS con muchas pymes |
| Números locales con tu Twilio | Complemento de USD 400/mes | Clientes fuera de EE. UU. que quieren número local |
| Depósito por número pre-verificado | Se abona como crédito del proyecto | Caja por adelantado |
| Facturación gestionada de Meta | 5 % sobre mensajes en soluciones multi-partner, más margen cambiario en cuentas no USD | Cada peso que la pyme gasta en Meta |
| IA | Sin sobreprecio; solo comisión de procesamiento de 4.4 % + USD 0.30 | Adopción de su nodo de agente |

**Qué pasa a costo:** las tarifas de Meta se cobran sin margen, ya sea con créditos Kapso o directo a la tarjeta de Meta ([precios Kapso](https://kapso.com/pricing)). Eso genera confianza y evita competir en el costo que nadie controla.

**Posicionamiento:** ataca a Twilio en precio por volumen. Twilio suma USD 0.005 por cada mensaje, entrante o saliente, encima de Meta ([Customer.io](https://docs.customer.io/accounts-and-workspaces/whatsapp-billing.md)); Kapso incluye 100,000 mensajes en USD 25. Sus guías de migración son a la vez documentación y canal de adquisición.

**Por qué el modelo funciona:** el costo marginal de mover un mensaje es muy bajo, así que los excedentes tienen alto margen; la pyme es dueña de su WABA (baja fricción para entrar), pero workflows, bandeja, Flows y funciones alojadas crean costo de salida.

**Qué copiar para tu negocio**

- Planes por número conectado + volumen incluido, con excedente claro.
- Tarifas de Meta a costo y visibles; tu margen en el servicio, no en el mensaje.
- Enlace de alta por cliente (setup link) como producto de primer nivel.
- Guías de migración desde competidores como canal de venta.

**Dónde te diferencias:** agentes propios entrenados por vertical, Flows de venta listos y atribución de ROI con Conversions API. Kapso es transporte; tú vendes ventas medibles. Puedes construir sobre Cloud API directo (sin cuota de plataforma, más trabajo) o sobre un BSP como Kapso (menos trabajo, cuota fija); la decisión depende de si quieres ser también el proveedor de infraestructura.

## Migraciones desde Twilio y otros proveedores

Migrar es mover el número de la pyme desde la cuenta de WhatsApp (WABA) de su proveedor actual a una nueva conectada a tu plataforma. Es un buen producto de entrada: la pyme ahorra en cuotas por mensaje y tú ganas un cliente que ya usa WhatsApp en serio. El costo real es el tiempo sin enviar plantillas mientras Meta aprueba las nuevas.

**Costo de plataforma comparado** (cuotas del proveedor por mes; las tarifas de Meta son iguales en los tres casos y no se incluyen)

| Mensajes al mes (entrantes + salientes) | Twilio (USD 0.005 c/u) | Kapso | Cloud API directo |
| --- | --- | --- | --- |
| 10,000 | USD 50 | USD 25 (Pro) | USD 0 + tu infraestructura |
| 100,000 | USD 500 | USD 25 (Pro) | USD 0 + tu infraestructura |
| 1,000,000 | USD 5,000 | USD 299 (Platform) | USD 0 + tu infraestructura |

Twilio además cobra USD 0.001 por mensaje fallido. Con agentes que conversan mucho, la cuota por mensaje de Twilio pesa más que el propio costo de Meta.

**Proceso técnico (un número a la vez)** — basado en la [guía de migración de Twilio de Kapso](https://docs.kapso.ai/docs/migrate/from-twilio), válido para cualquier destino:

1. Inventariar en WhatsApp Manager la WABA actual: otros números, plantillas (nombre, idioma, texto, categoría) y activos.
2. Exportar el historial de mensajes del proveedor anterior: no se transfiere.
3. Confirmar que el proveedor anterior revocó su línea de crédito; si Meta bloquea la salida por saldo pendiente, lo resuelve el soporte directo de Meta.
4. Quitar el número de la WABA anterior (y la WABA del portafolio si ya no se usa). Desde aquí el número deja de enviar.
5. Esperar unos 5 minutos y conectar el número por tu Embedded Signup (o setup link), creando una WABA nueva.
6. Recrear y enviar a revisión las plantillas en la nueva WABA; hasta que Meta las apruebe solo se puede responder dentro de la ventana de 24 h.
7. Cambiar el código de envío y los webhooks (tabla de equivalencias abajo), probar con un número de baja actividad y luego migrar el resto por lotes.
8. Apagar los envíos en el proveedor anterior y liberar el remitente.

Meta también documenta la migración de números entre socios vía Embedded Signup y de forma programática; conviene evaluarla en el piloto porque puede reducir la ventana sin envíos.

**Equivalencias Twilio → Cloud API**

| Twilio | Cloud API / Kapso |
| --- | --- |
| `From=whatsapp:+E164` | `phone_number_id` del número |
| `ContentSid` + `ContentVariables` | Nombre de plantilla + idioma + `components` con parámetros en orden |
| `twilio/quick-reply`, `list-picker`, `call-to-action` | `interactive` de tipo `button`, `list`, `cta_url` |
| `whatsapp/flows` | `interactive` de tipo `flow` |
| Webhook form-encoded + TwiML | JSON con respuesta `200`; las respuestas automáticas pasan a tu agente |
| Firma HMAC-SHA1 sobre URL + parámetros | Meta: `X-Hub-Signature-256` sobre el cuerpo; Kapso: HMAC-SHA256 del cuerpo en `X-Webhook-Signature` |
| Subcuentas por cliente | Un inquilino por pyme con su propia WABA (setup link o Embedded Signup) |
| Messaging Services (pools de remitentes) | No existe: se envía desde un `phone_number_id` concreto |

**Cómo venderla como servicio**

- **A quién:** pymes y agencias en Twilio u otros BSP con volumen alto, y negocios que usan herramientas no oficiales de WhatsApp (riesgo de bloqueo del número).
- **Oferta:** diagnóstico gratuito de su factura actual → migración con ventana programada (fin de semana o madrugada) → plantillas recreadas y aprobadas → tu agente propio activo desde el primer día.
- **Cobro:** cuota de migración + tu plan mensual; el ahorro en cuotas por mensaje financia la migración en pocos meses para clientes de volumen alto.
- **Riesgos a contratar por escrito:** días sin plantillas aprobadas, pérdida del historial del proveedor anterior y bloqueos por línea de crédito ajenos a ti.

## Modelos de negocio

El modelo recomendado es empezar vendiendo el servicio llave en mano a pocas pymes de un mismo giro, convertirlo en un SaaS vertical cuando el alta sea autoservicio, y abrir marca blanca para agencias solo al final.

> [Diagrama no incluido: evolución del modelo de negocio · 3 etapas + complementos]

Cada etapa se financia con la anterior; los complementos se venden desde el primer cliente.

| Modelo | Cómo cobras | Qué construyes | Riesgo principal |
| --- | --- | --- | --- |
| Llave en mano (agencia) | Cuota de implementación + mensualidad de operación; mensajes de Meta a la tarjeta de la pyme | Configuración por cliente, agente, catálogo, tablero | Horas humanas por cliente; no escala sin estandarizar |
| SaaS vertical | Plan mensual por número con conversaciones de IA incluidas + excedente | Plantillas por giro, panel de autoservicio, alta automática | Costo de IA y de mensajes de servicio por conversación |
| Marca blanca para agencias | Licencia por agencia + cargo por número conectado | Multi-inquilino con marcas, permisos, facturación | Soporte a terceros; exige Tech Provider o plataforma tipo Kapso Platform |
| Pago por resultado (complemento) | Porcentaje de ventas atribuidas o cargo por pedido cerrado | Atribución confiable (Conversions API + etiquetas de origen) | Disputas sobre qué venta es atribuible |
| Gestión de anuncios CTWA (complemento) | Tarifa fija o % de inversión publicitaria | Campañas, creativos, reporte de ROAS | Resultados dependen de la inversión de la pyme |

Los precios concretos quedan abiertos hasta medir, en las pymes piloto, el costo real por conversación (IA + mensajes de servicio desde el 1/oct/2026) y el ticket promedio vendido por chat.

## Casos de uso y sus roadmaps

Las cinco verticales comparten las Fases 0–3; lo que cambia es el punto de entrada, lo que el agente sabe y el Flow que cierra la venta. Elegir **una** vertical para las primeras 3–5 pymes permite reutilizar agente, Flows y plantillas.

> [Diagrama no incluido: roadmaps por caso de uso · 5 verticales × 4 etapas]

Cada celda es el entregable de esa etapa; la compuerta de salida es la misma de la fase correspondiente.

| Vertical | Venta típica en el chat | Evento para Conversions API | Métrica que le importa al dueño | Restricción del giro |
| --- | --- | --- | --- | --- |
| Restaurante | Pedido a domicilio o para recoger | `Purchase` | Pedidos por noche, ticket promedio | Venta de alcohol restringida |
| Tienda | Producto con talla/color | `Purchase` | Ventas por chat, carritos recuperados | Ninguna relevante |
| Servicios con cita | Reserva pagada o confirmada | `LeadSubmitted` o `Purchase` si hay anticipo | Citas agendadas, inasistencias | Ninguna relevante (salvo servicios de salud) |
| Ticket alto (inmuebles, autos) | Lead calificado y visita agendada | `LeadSubmitted` | Costo por lead calificado | El financiamiento puede considerarse servicio financiero |
| Educación | Inscripción pagada | `Purchase` | Inscritos por campaña | Ninguna relevante |

**Vertical recomendada para empezar en Veracruz:** restaurantes o tiendas locales: ciclo de venta corto, ticket frecuente, uso intensivo de WhatsApp y resultado visible en semanas. Salud (clínicas, farmacias) maneja datos sensibles: posponerla hasta tener revisión legal.

## Modelo de datos, eventos y endpoints clave

Ocho entidades cubren las fases 0 a 4; `tenant_id` va en todas desde el primer día para no migrar al escalar.

| Entidad | Campos principales | Fase |
| --- | --- | --- |
| `tenant` | nombre, giro, waba_id, phone_number_id, token (cifrado), zona horaria, plan, límite de gasto IA | 0 (1 fila) → 4 |
| `contact` | wa_id, BSUID, nombre, opt_in (fecha, fuente), etiquetas | 0 |
| `conversation` | contact_id, abierta_en, vence_csw, vence_fep, origen (orgánico/anuncio), ctwa_clid, ad_id, estado (agente/humano) | 1 |
| `message` | wamid, dirección, tipo, contenido, estado, pricing.category, pricing.billable | 0 |
| `product` | retailer_id, nombre, precio, existencias, catalog_id | 2 |
| `order` | conversation_id, items, total, moneda, estado, referencia de pago | 2 |
| `payment` | order_id, procesador, id externo, estado, conciliado | 2 |
| `conversion_event` | order_id, event_name, event_id, enviado_en, respuesta de Meta | 3 |

**Endpoints de Meta que usa la app** (Graph API, versión fija en configuración):

```
POST /{phone_number_id}/messages            # texto, interactivos, plantillas, producto
POST /{phone_number_id}/media               # subir imágenes/documentos
GET  /{waba_id}/message_templates           # administrar plantillas
POST /{dataset_id}/events                   # Conversions API (Purchase, LeadSubmitted)
GET  /{waba_id}?fields=pricing_analytics    # costos por categoría
Webhook: messages, statuses, order, referral, message_template_status_update,
         phone_number_quality_update, account_update, automatic_events
```

**Evento de compra por Conversions API** (se dispara cuando el procesador confirma el pago):

```json
{
  "data": [{
    "event_name": "Purchase",
    "event_time": 1790000000,
    "event_id": "order_8841:Purchase",
    "action_source": "business_messaging",
    "messaging_channel": "whatsapp",
    "user_data": {
      "whatsapp_business_account_id": "<WABA_ID>",
      "ctwa_clid": "<guardado del primer mensaje>"
    },
    "custom_data": { "currency": "MXN", "value": 1250.00 }
  }]
}
```

El `ctwa_clid` no llega en conversaciones iniciadas desde anuncios en Estados de WhatsApp; para esos casos, atribuir por `ad_id` en el tablero propio.

## Costos, modelo de negocio y KPIs

El costo por pyme tiene tres componentes; desde el 1 de octubre de 2026 el de Meta ya no es casi cero, pero se controla con el origen del tráfico y el número de mensajes por conversación.

| Componente | Qué lo genera | Cómo controlarlo |
| --- | --- | --- |
| Mensajería Meta | Plantillas (marketing, utilidad, autenticación) y, desde 1/oct/2026, respuestas libres de servicio a la tarifa de utilidad del país, con 1,000 de servicio gratis por número al mes. México tiene tarifa propia; tarjeta en MXN | Llevar tráfico por anuncios CTWA (72 h de entrega gratis); menos mensajes por conversación con botones y Flows; tope de precio en Marketing Messages API; método de pago registrado en Meta |
| IA | Tus agentes: pago al proveedor de LLM + mensaje de servicio a Meta por cada respuesta (referencia de mercado: Meta Business Agent cuesta ~4–5 ¢ USD por mensaje) | Presupuestos por tokens y por turnos (Meta Business Agent los permite en ventanas de 1, 7, 14 y 30 días); respuestas con botones en lugar de texto libre cuando se pueda |
| Infraestructura y pagos | Hosting, base de datos, comisión del procesador de pagos | Arquitectura serverless en Fases 0–3; comisión trasladada en el precio |

**Modelo de ingresos propuesto** (a validar con las pymes piloto): suscripción mensual por pyme con un volumen de conversaciones con IA incluido, más cargo por conversación adicional; los cargos de plantillas de Meta se trasladan al costo. Un plan superior agrega tablero de ROI y campañas. Precio y volumen incluidos quedan como pregunta abierta hasta medir el costo real de IA en la Fase 1.

**KPIs por nivel**

| Nivel | KPI | Meta inicial |
| --- | --- | --- |
| Operación | Tiempo de primera respuesta | < 10 s |
| Operación | Conversaciones resueltas sin humano | ≥ 70 % |
| Ventas | Conversión conversación → pedido pagado | ≥ 20 % (con intención de compra) |
| Ventas | Ticket promedio por chat | Línea base en Fase 2 |
| Marketing | ROAS de campañas CTWA | Medido en Fase 3 |
| Marketing | Costo por venta | Medido en Fase 3 |
| Negocio | Margen bruto por pyme | Positivo desde la Fase 4 |
| Negocio | Churn mensual de pymes | < 3 % |

Pregunta abierta: bajar la tarjeta de tarifas en MXN vigente y modelar el costo mensual de una pyme típica antes de fijar precios.

## Riesgos, políticas y cumplimiento

El riesgo mayor es de política, no técnico: un agente que se sale del negocio o mensajes sin consentimiento pueden restringir el número de la pyme.

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| El agente actúa como asistente de propósito general | Reclasificación como "AI Provider" y restricción | Instrucciones y filtros que rechazan temas ajenos; pruebas de dominio en cada versión |
| Giro regulado (salud, finanzas, alcohol, etc.) | Restricciones de comercio y datos sensibles | `AgentGateway` con reglas por giro; revisar también las políticas de comercio de WhatsApp para ese giro |
| Mensajes sin opt-in o plantillas de marketing en exceso | Baja calidad del número, límites de envío, bloqueo | Registrar opt-in con fecha y fuente; límite de frecuencia por contacto; monitorear `phone_number_quality_update` |
| Datos personales de clientes (nombre, teléfono, dirección) | Incumplimiento de la ley mexicana de protección de datos | Aviso de privacidad visible en el primer contacto; cifrado en reposo; retención limitada; acceso por inquilino |
| Alucinaciones de precio o existencias | Pérdidas y quejas | Precio y stock solo desde herramientas (`consultar_existencias`), nunca desde el texto del modelo |
| Cambios de precios o políticas de Meta | Margen variable | Meta solo cambia tarifas el día 1 de cada trimestre con aviso previo; revisar trimestralmente y trasladar costos |
| Dependencia de un solo proveedor de IA | Costos o caída | Doble ruta en `AgentGateway`; evaluaciones comparables entre proveedores |
| Doble conteo de conversiones | ROAS inflado, decisiones erróneas | `event_id` único por pedido y ledger de eventos enviados |

Antes de la Fase 4 conviene una revisión legal del contrato con las pymes: quién es responsable del contenido, del consentimiento y del tratamiento de datos.

## Plan de ejecución de 90 días

Los primeros 90 días cubren las Fases 0 a 3 con una sola pyme piloto; la meta al día 90 es mostrarle al dueño ventas atribuidas a sus anuncios.

**Semanas 1–2 · Fundaciones**

- [ ] Elegir pyme piloto (retail o restaurante: catálogo simple, ticket frecuente, fuera de giros excluidos)
- [ ] Portafolio de negocio, app de Meta, WABA; iniciar verificación del negocio y registrar método de pago en Meta (requisito para mensajes de servicio)
- [ ] Conectar el número (coexistencia si la pyme ya usa la app)
- [ ] Webhook con firma, cola e idempotencia; bot eco en producción
- [ ] Elegir proveedor de LLM y medir el costo por conversación con 50 chats de prueba

**Semanas 3–6 · Agente de ventas**

- [ ] `AgentGateway` con tu agente propio y el LLM elegido
- [ ] Cargar FAQs, horarios, políticas y catálogo inicial
- [ ] Herramientas: producto, existencias, pedido, cita, escalar
- [ ] Bandeja de traspaso para el dueño
- [ ] 200 conversaciones de prueba; ajustar hasta cumplir la compuerta de Fase 1

**Semanas 7–10 · Comercio**

- [ ] Catálogo en Commerce Manager sincronizado
- [ ] Mensajes de producto y webhook `order`
- [ ] Flow de envío/cita con endpoint de datos
- [ ] Liga de pago del procesador + webhook de confirmación + estado del pedido

**Semanas 11–13 · Atribución**

- [ ] Captura de `ctwa_clid` y datos del anuncio
- [ ] Dataset y eventos `LeadSubmitted` / `Purchase` con ledger
- [ ] Primera campaña CTWA con presupuesto pequeño
- [ ] Tablero de ROI y reunión de resultados con el dueño

**Decisión al día 90:** si se cumplen las compuertas 1–3, iniciar el registro como Tech Provider y la Fase 4 con 5–10 pymes del mismo giro.

## Fuentes

- Audio "Ventas con IA en WhatsApp para pymes" (10:03 min), transcrito para este documento.
- [Documentación para desarrolladores de Meta (índice, es_LA)](https://developers.facebook.com/docs/?locale=es_LA)
- [WhatsApp Business Platform — overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview)
- [Pricing on the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/)
- [Pricing policy for AI Providers](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers/)
- [Meta Business Agent — overview](https://developers.facebook.com/documentation/meta-business-agent/overview)
- [Meta Business Agent — índice de guías](https://developers.facebook.com/documentation/meta-business-agent/llms.txt)
- [Meta Business Agent — Agent Budget](https://developers.facebook.com/documentation/meta-business-agent/reference/configure/agent-budget.md)
- [Conversions API for Business Messaging](https://developers.facebook.com/docs/marketing-api/conversions-api/business-messaging/)
- [Webhook automatic_events](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/automatic_events)
- [Payment Links (Payments API, India)](https://developers.secure.facebook.com/docs/whatsapp/cloud-api/payments-api/payments-in/payment-links)
- [Upcoming pricing updates: Meta Business Agent, service and utility messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages)
- [Onboard WhatsApp Business app users (coexistencia)](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/)
- [Reconnect offboarded coexistence clients](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/reconnect-offboarded-coexistence-clients/)
- [QR codes and short links](https://developers.facebook.com/documentation/business-messaging/whatsapp/qr-codes/)
- [WhatsApp Business Platform — Local storage](https://developers.facebook.com/documentation/business-messaging/whatsapp/local-storage/)
- [Kapso — Introduction](https://docs.kapso.ai/docs/introduction)
- [Kapso — índice de documentación](https://docs.kapso.ai/llms.txt)
- [Kapso — Instant setup (números pre-verificados)](https://docs.kapso.ai/docs/platform/phone-numbers/instant-setup.md)
- [Kapso — Provide local numbers](https://docs.kapso.ai/docs/platform/phone-numbers/provide-local-numbers.md)
- [Kapso — Coexistence troubleshooting](https://docs.kapso.ai/docs/how-to/whatsapp/coexistence-troubleshooting.md)
- [Kapso — Flows estáticos vs dinámicos](https://docs.kapso.ai/docs/whatsapp/flows/static-vs-dynamic.md)
- [Kapso — Pricing](https://docs.kapso.ai/docs/whatsapp/pricing-faq.md)
- [Kapso — Migrate from Twilio](https://docs.kapso.ai/docs/migrate/from-twilio)
- [Kapso — Migrate from another provider](https://docs.kapso.ai/docs/migrate/from-another-provider)
- [Kapso — Twilio alternative for WhatsApp (planes)](https://kapso.com/twilio-alternative-for-whatsapp)
- [Kapso — Pricing](https://kapso.com/pricing)
- [Kapso — WhatsApp API pricing in 2026](https://kapso.ai/blog/whatsapp-api-pricing-2026)
- [Customer.io — Billing for WhatsApp messages (tarifa de Twilio)](https://docs.customer.io/accounts-and-workspaces/whatsapp-billing.md)
- [Twilio — Migrate phone numbers and WhatsApp senders](https://www.twilio.com/docs/whatsapp/migrate-numbers-and-senders)
- [A2A Protocol Specification (v1.0.0)](https://a2a-protocol.org/latest/specification/)
- [A2A — Multi-Tenancy and Multi-Agent Routing](https://a2a-protocol.org/latest/topics/multi-tenancy/)
- [A2A — sitio oficial](https://a2a-protocol.org/latest/)
