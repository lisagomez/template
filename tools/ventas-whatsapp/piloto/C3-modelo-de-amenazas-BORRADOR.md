# Modelo de amenazas (C3) — Vendedor con IA en WhatsApp — BORRADOR

> Fecha: 2026-09-30 · Estado: **BORRADOR, sin firmar** · Lo redactó el agente del goal
> `docs/goals/ventas-ia-waba.md`. **La firma es humana y ningún agente la fabrica.** Sin este
> documento firmado, más la AISIA (C4) y el gate humano, el canal NO se conecta a un número
> real (AGENTS.md, «Canales de chat externos»). La app lo hace cumplir: con la Graph API real y
> sin `VENTAS_WA_C3_C4_FIRMADOS=1`, el canal no arranca.
>
> Revisión: al conectar el primer número real, al activar el modelo real, al abrir la pasarela
> A2A a un partner, al cambiar de BSP o de procesador de pagos, al dar de alta la primera pyme
> por Embedded Signup (N-02), al vender o rentar el primer número (N-01), al pasar a Solution
> Partner, o tras un incidente.

## Modelo de amenazas

**Activos que toca** (por daño si se comprometen):
1. **Tokens de usuario de sistema** de cada WABA (mandan mensajes en nombre de la pyme) y el
   **secreto de la app** (firma de webhooks y del endpoint de Flows). Quien los tiene, es la pyme.
2. **Datos personales de clientes finales**: nombre, teléfono, dirección, lo que escriben
   (historial de hasta 6 meses en coexistencia).
3. **Dinero**: ligas de pago, confirmación de pagos, estado «pagado» del pedido.
4. **La calidad del número de la pyme** y su cuenta de WhatsApp (un agente abusivo la puede
   hacer restringir: es el sustento del negocio).
5. **Presupuesto** de IA y de mensajería (denial-of-wallet).
6. **Señal a Meta** (Conversions API): eventos falsos envenenan la optimización de anuncios.
7. **Los tokens de negocio de TODAS las pymes** (BSP propio, N-02): el alta por Embedded Signup
   junta en un solo lugar un token por WABA. Comprometer ese lugar es comprometer a todas.
8. **La línea de crédito** (Solution Partner, P-10): Meta nos cobra lo que manden las pymes.
9. **El pool de números y sus PIN de dos pasos** (N-01): quien controla el código de
   verificación o el PIN de un número, controla el canal de la pyme que lo usa.

**Fronteras que cruza**:
- **Mensaje del cliente final** (texto libre, botones, carrito, Flows) → agente con llaves. NO
  autenticado: cualquiera con WhatsApp escribe. Es la frontera principal.
- **Webhook de Meta** (mensajes, estados, ecos, historial, cuenta, automatic_events).
- **Endpoint de datos de Flows** (llamado por Meta, cifrado).
- **Webhook del procesador de pagos**.
- **Salidas del LLM** (no se confían por diseño).
- **Pasarela A2A** (hoy local; abrirla a un partner cambia el modelo).
- **Panel del dueño** (token por dispositivo).
- **Página de alta** (Embedded Signup): el `code` y el mensaje de sesión llegan del navegador de
  la pyme a nuestra página, y de ahí al servidor.
- **Buzón de códigos del proveedor de números** (SMS o voz de las líneas del pool).

**Atacantes relevantes**:
- **O1 — cliente malicioso que conversa**: inyección de prompt («ignora tus instrucciones»),
  pedir temas ajenos para convertir al agente en asistente general (riesgo de reclasificación
  como «AI Provider»), regatear un precio inventado, pedir datos de otros clientes.
- **O2 — contraparte deshonesta**: webhook de pago falso marcando «pagado»; carrito con
  `item_price` manipulado; `ctwa_clid` inventado para inflar atribución; `flow_token` adivinado.
- **O4 — bots**: ráfagas para quemar presupuesto (denial-of-wallet) o degradar la calidad del
  número; reintentos para duplicar pedidos.
- **O6 — compromiso de un servicio**: la pasarela A2A o el trabajador del webhook usados como
  palanca hacia otro inquilino.
- **O3 — fatiga**: el dueño que ya no lee lo que el agente le pasa en la bandeja.
- **O7 — alta fraudulenta**: reusar un `code` capturado, mandar un mensaje de sesión inventado
  o colgar una WABA ajena del inquilino de otro.
- **O8 — pyme que abusa del crédito**: marketing masivo pagado con nuestra línea (Solution Partner).
- **O9 — secuestro de un número del pool**: *SIM swap*, un buzón del proveedor comprometido o
  un PIN filtrado.

**Controles (y la brecha que queda)**:

| Amenaza | Control implementado y probado | Brecha abierta |
|---|---|---|
| Inyección / tema ajeno (O1) | Barrera ANTES del modelo (inyección, 14 familias de temas ajenos, temas restringidos del giro) y DESPUÉS (identidad, fuga de instrucciones, tema ajeno por vocabulario, ligas ajenas). 200 conversaciones con modelo adversarial: 0 entregadas (`pruebas/agente.ts`) | Las barreras son LÉXICAS: un modelo real puede salirse sin disparar ninguna. **La corrida con el modelo real es obligatoria antes del piloto** (hoy «no medido») |
| Precio o existencias inventados (O1) | Precio y existencias solo de herramientas; la salida con un monto no respaldado se bloquea y sale una plantilla segura | Montos escritos con palabras («noventa y cinco») no se detectan |
| Pago falso (O2) | HMAC del webhook del procesador; idempotencia por id de pago; el monto tiene que cuadrar con el total o el pedido queda en revisión; conciliación contra el reporte del procesador | Verificar contra la API del procesador (no solo su webhook) antes de entregar; depende del procesador que se elija |
| Carrito manipulado (O2) | El precio es el del catálogo, no el del mensaje; la diferencia se anota | — |
| `ctwa_clid` inventado (O2) | Solo se toma del `referral` del primer mensaje firmado por Meta; Meta rechaza clics ajenos | — |
| `flow_token` adivinado o ajeno (O2) | Token HMAC con inquilino, conversación, tipo y vencimiento; 427 si no valida; el orquestador rechaza tokens de otra conversación | — |
| Webhook falso de Meta (O2) | `X-Hub-Signature-256` sobre el cuerpo crudo, comparación en tiempo constante; 401 | Rotación del secreto de la app: sin procedimiento escrito |
| Reintentos / duplicados (O4) | Idempotencia por `wamid`, `origen_wamid`, id de pago y `event_id` (en código y en el esquema) | — |
| Denial-of-wallet (O4) | Tope de turnos y tokens por conversación y de tokens por mes por inquilino; al agotarse, pasa al dueño (no silencio). **Frontera del número** (`agente/frontera.ts`, 2026-10-01): 20 mensajes en 10 min por contacto; pasados 40 contactos NUEVOS en la hora, los siguientes reciben una sola cortesía sin modelo y sin llegar a la bandeja (los clientes de antes siguen atendidos); pasados 400 mensajes en la hora, nadie gasta modelo pero siguen las respuestas fijas y los traspasos; un aviso por ventana. **Lista de bloqueo** del dueño desde la bandeja, en la cadena de hashes (probado en `pruebas/frontera.ts`) | Los límites son FICTICIOS: se calibran con el tráfico del piloto (por inquilino, `politicas.frontera`). Una granja que pide «hablar con una persona» todavía llega a la bandeja; el dueño la bloquea uno por uno |
| Cruce entre inquilinos (O6) | Almacén con vistas por inquilino; bus A2A que exige `tenant`; pasarela que toma el inquilino del token y responde «no existe» a lo ajeno; RLS en el esquema propuesto | La pasarela usa tokens HMAC propios: en producción, OAuth 2.0 client credentials |
| Secretos (activos 1) | Tokens fuera de la configuración del agente y de los logs; la app lee de un almacén de secretos inyectado | **P-02 abierta**: hoy salen de variables de entorno. Vault antes del piloto |
| Alta fraudulenta (O7) | El código vive 30 s y sirve una vez; se canjea servidor a servidor. **Liga de alta** firmada (HMAC), con vencimiento de 7 días y de un solo uso: el inquilino sale de la liga, nunca del navegador. **Origen** exigido: https y facebook.com o un subdominio (la muestra de Meta usa `endsWith('facebook.com')`, que deja pasar `evilfacebook.com`). El token entra a la bóveda solo si Meta acepta la suscripción de ESA WABA; una WABA por pyme y ninguna WABA colgada de otra (probado en `pruebas/alta-segura.ts`) | El origen lo verifica nuestra página en el navegador; el servidor solo ve lo que la página reporta, y su garantía real es el canje del código y la suscripción |
| Tokens de todas las pymes juntos (activos 7) | Bóveda aparte: el token nunca entra al inquilino, al almacén, al registro del alta ni a una traza (probado); la baja lo revoca y desuscribe la WABA | **P-02 abierta**: en el laboratorio la bóveda es en memoria. Con el BSP propio, la bóveda deja de ser recomendable y pasa a ser condición |
| Abuso del crédito (O8) | Aviso al 80 %; al 100 % se frena solo el marketing y una persona decide (`estadoCredito`) | Sin límite de crédito por pyme ni política firmada (P-10): hasta entonces, solo Tech Provider |
| Secuestro de un número (O9) | PIN de dos pasos por número, fuera del pool, del alta y de las trazas (probado); el límite de Meta de 10 registros en 72 h se respeta antes de llamar | El buzón del proveedor es un punto único: acceso, bitácora y alerta de *SIM swap* se definen con P-09 |
| Número reciclado (activos 2) | Cuarentena de 90 días antes de reasignar; el número vuelve sin el nombre visible del dueño anterior (probado) | — |
| Fatiga del dueño (O3) | La bandeja muestra el motivo (queja, monto, no se entendieron…) y la conversación entera | Sin aviso fuera de la app (push/correo): decisión de flujo de datos aparte |

**Prioridad antes de conectar un número real**: (1) corrida con el modelo real; (2) calibrar los
límites de la frontera con el tráfico del piloto (hechos en el laboratorio el 2026-10-01); (3) vault
para los tokens (P-02); (4) verificación del pago contra la API del procesador elegido; (5) con el
BSP propio, la bóveda antes de la primera pyme por Embedded Signup (la liga y el origen ya están).

Firmada por: ____________  Rol: ____________  Fecha: ____________
