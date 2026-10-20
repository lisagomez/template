# Modelo de amenazas (C3) — revisión de ventas-whatsapp por la puerta de salida de OpenWA — PROPUESTA

> Fecha: 2026-10-20 · Estado: **PROPUESTA, sin firmar**. La redactó el agente del goal
> `docs/goals/ventas-whatsapp-puerta-openwa.md`; **la firma es humana y ningún agente la fabrica.** Plantilla
> `.claude/gobernanza/plantillas/modelo-amenazas.md`. Revisa el borrador de ventas
> (`tools/ventas-whatsapp/piloto/C3-modelo-de-amenazas-BORRADOR.md`) por la **superficie nueva**: una API compatible con
> la de OpenWA 0.25.0 que **integradores ajenos llaman** (su CRM, su bot, su n8n) y webhooks que salen hacia **sus**
> receptores. Hoy: solo laboratorio, simulador de Meta, ningún número conectado.
>
> **Alcance de la firma**: el laboratorio. Firmarla **no** abre la fachada a integradores fuera de la máquina: eso pide
> esta revisión firmada, el C3 de ventas firmado, la AISIA (C4) que cubra el flujo de OW-10 y el gate humano.
>
> aprobación humana ☐ · **Aprobado por**: pendiente

**Activos que toca** (por daño, además de los del borrador de ventas):
1. **Las llaves de la fachada** (la ADMIN de quien opera y las que se emiten a cada integrador): quien tiene una, manda
   mensajes en nombre de la pyme por la Cloud API.
2. **Datos personales de los clientes finales** que ahora **salen** del BSP hacia los receptores de webhooks que el
   integrador registra (texto, nombre de perfil, número).
3. **La calidad del número de la pyme**: quien viene de OpenWA viene de mandar sin ventana ni plantillas; por la vía
   oficial, el abuso la hace restringir.
4. **La liga de alta** (Embedded Signup) que la sesión entrega en lugar del QR.
5. **La identidad**: la fachada es compatible con la API de OpenWA y no es OpenWA (marca y licencia MIT de un tercero).

**Fronteras que cruza** (entrada NO confiable):
- `/api/ventas-whatsapp/openwa/api/...`: cualquier petición con `X-API-Key` (o `Authorization: Bearer`).
- Los webhooks **salientes** a URLs que registra quien tiene una llave.
- `/api/ventas-whatsapp/openwa-webhook`: el webhook de Meta para los números de las sesiones.
- `/api/ventas-whatsapp/openwa-informe`: el informe de migración (público, sin llave).
- La liga de alta en `signupUrl` y en el 501 del QR.

**Atacantes relevantes**: un integrador con una llave robada o con más alcance del que debe; un integrador malicioso que
registra un webhook hacia la red interna; quien falsifica webhooks de Meta o de la fachada; quien usa la fachada para
mandar masivo y quemar el número; quien abusa del informe público.

## Amenazas y controles

| # | Amenaza | Control (probado) | Brecha que queda |
|---|---|---|---|
| OW-1 | **Llave robada o filtrada**: mandar en nombre de la pyme | Se guarda el sha256 y se compara en tiempo constante; la llave en claro sale una vez; rol, alcance por sesión, chat e IP, vencimiento y revocación (`openwa-seguridad.ts`, prueba de llaves) | Sin límite de peticiones por llave; la llave ADMIN vive en el entorno (P-02, la bóveda, sigue abierta) |
| OW-2 | **Escalada de rol**: un OPERATOR que crea llaves o un VIEWER que manda | Rol mínimo por operación como lo documenta OpenWA (ADMIN las llaves y las entregas fallidas; VIEWER las lecturas); probado 403 en los dos casos | — |
| OW-3 | **Cruce entre pymes**: el integrador de una pyme lee los chats de otra | `allowedSessions` filtra listas y niega lo ajeno (403); crear sesiones pide una llave sin alcance; probado | Con la semántica de OpenWA, una llave SIN `allowedSessions` ve todas las sesiones. **Propuesta**: en producción, a cada pyme solo llaves con alcance de su sesión; la ADMIN solo para quien opera |
| OW-4 | **SSRF por webhook**: registrar `http://10.0.0.5/admin` y que la fachada lo llame | Solo `https`, o `http` a la máquina local (laboratorio); sin seguir redirecciones; tope de 10 s por entrega | `https` hacia un host interno con TLS o un DNS que resuelve a una IP privada no se bloquea todavía: **falta resolver y negar rangos privados antes de entregar** |
| OW-5 | **Webhook falsificado hacia el integrador** | `X-OpenWA-Signature: sha256=<HMAC-SHA256 del cuerpo crudo>` con el secreto del webhook (≥ 16), el mismo esquema de OpenWA; el SDK oficial lo verifica (probado en el SDK y por HTTP) | Sin secreto no hay firma (así es OpenWA). **Propuesta**: exigir secreto fuera del laboratorio |
| OW-6 | **Webhook falso de Meta** (inyectar un «mensaje recibido») | `X-Hub-Signature-256` sobre el cuerpo crudo ANTES de leerlo; sin firma o con otra llave, 401 y ningún evento (probado) | — |
| OW-7 | **Masivo que quema el número** (`send-bulk`, el hábito de OpenWA) | La ventana de 24 h la decide Meta y la fachada contesta 422 FUERA_DE_VENTANA; fuera de ella solo plantillas que Meta revisó; frontera de salida (contactos nuevos por sesión y hora, 429 SEND_PACING_LIMITED); los límites de Meta salen como 429 (probado) | El límite de la frontera (40/h) es **ficticio** hasta medir el piloto; dentro de la ventana, el volumen a contactos que escribieron no se dosifica |
| OW-8 | **Doble envío por reintento** (doble cobro de una plantilla) | `Idempotency-Key` con los códigos de OpenWA (REUSED, IN_PROGRESS, OUTCOME_UNKNOWN, INVALID); un 4xx libera la llave; probado que Meta recibe uno | El registro de idempotencia vive en memoria: un reinicio lo olvida |
| OW-9 | **Datos personales en los logs** | La fachada no escribe a la consola ni registra cuerpos, teléfonos o llaves; probado: cero escrituras en un recorrido completo | Lo que registre el proxy o la plataforma de despliegue queda fuera de este control |
| OW-10 | **Datos de clientes finales hacia terceros**: el texto y el número salen al receptor que registre el integrador | Solo a quien tiene una llave con alcance de esa sesión; firma HMAC; sin cuerpos en logs | **Salida del perímetro (C4)**: el flujo «BSP → integrador de la pyme» no está en la AISIA de ventas. Quien decide qué integración recibe los datos es la pyme (responsable); el aviso de privacidad de la pyme tiene que nombrarlo. **No se abre sin esa revisión de la AISIA** |
| OW-11 | **Liga de alta reenviada** | La del BSP: firmada (HMAC), vence a los 7 días y sirve una vez (prueba `alta-segura.ts`); solo la ve quien tiene una llave con alcance de la sesión | Si un tercero la usa antes que la pyme, da de alta su WABA en esa sesión: la pyme lo ve en `GET /sessions/{id}` (`phone`) |
| OW-12 | **Pasar por OpenWA** (marca, soporte, licencia) | Se dice «compatible con la API de OpenWA»; `engineType: meta-cloud-api`; el agente de usuario de las entregas es el propio; la licencia MIT de OpenWA va con el contrato pineado (probado) | — |
| OW-13 | **Abuso del informe público** | Zod, 50,000 caracteres y 500 renglones como máximo; función pura sobre la matriz pública; no guarda ni registra | Sin límite de peticiones |
| OW-14 | **La fachada expuesta fuera del laboratorio** | 503 sin `VENTAS_WA_LABORATORIO=1` y sin la llave ADMIN; la configuración se niega a la Graph API real sin C3 y C4 firmados; las tres rutas declaradas en `prueba:a2a` | Abrirla a integradores reales es **gate humano** con esta revisión firmada |
| OW-15 | **El vendedor con IA contestando encima del integrador** (la sesión es un inquilino del BSP) | Los webhooks de esos números llegan a `/openwa-webhook`, no a `/webhook` del vendedor | En producción eso pide la sobrescritura de la URL de callback por WABA de Meta: **no verificada** contra la documentación vigente; hasta entonces, una pyme no puede estar en las dos superficies con el mismo número |

**Separaciones que se preservan**: la fachada no tiene LLM; la ventana, la revisión de plantillas y el bloqueo los decide
Meta (la fachada solo traduce su respuesta); lo imposible por la vía oficial contesta 501 con alternativa y no se simula;
ningún token de negocio sale de la bóveda ni pasa por la API de la fachada.
