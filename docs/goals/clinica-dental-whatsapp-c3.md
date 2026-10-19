# Modelo de amenazas (C3), revisión 1: el canal de WhatsApp del portal del paciente

> Fecha: 2026-10-19 · Estado: **PROPUESTA, sin firmar** · Plantilla `.claude/gobernanza/plantillas/modelo-amenazas.md`.
> Revisa la C3 firmada del portal (`docs/goals/clinica-dental-c3.md`, 2026-10-16), que **no se edita**: T-1 a T-13
> siguen vigentes; esta revisión agrega lo que trae WhatsApp (T-14 a T-27) y cambia el control de T-13.
> Goal `docs/goals/clinica-dental-whatsapp.md`. **Alcance de esta revisión: SOLO laboratorio**, contra el simulador de
> Meta de `tools/ventas-whatsapp`, con clínicas y pacientes sintéticos. Firmarla **no** abre el canal real (ver §Lo que
> falta para un número real).
>
> **aprobación humana ☐** · **Aprobado por**: pendiente

**Activos nuevos que toca** (por daño): (1) el **número de WhatsApp vinculado** de cada paciente y el hecho de que es
paciente de una clínica dental; (2) la agenda de la clínica, ahora movible desde un chat (Flows); (3) el número de
WhatsApp de la clínica y su calidad ante Meta (plantillas pausadas, número restringido); (4) el secreto de la app de
Meta, la llave privada de los Flows y el token de Graph (cuando existan); (5) el presupuesto: respuestas del LLM y
mensajes que cobra Meta.

**Fronteras nuevas** (entrada NO confiable, todo validado): el **webhook** de Meta (`/api/clinica-dental/whatsapp/webhook`:
mensajes de cualquier número del mundo, estados, ecos de coexistencia, cambios de cuenta y de plantilla); el **endpoint
de datos de los Flows** (`/api/clinica-dental/whatsapp/flows`: cifrado y firmado, lo llama WhatsApp en cada pantalla); los
**payloads de botón** que vuelven del celular de la persona; los **medios** (notas de voz que se bajan para el ASR local;
fotos que no se bajan); el **código de vinculación** que llega por chat.

**Atacantes relevantes** (catálogo O1-O6): cualquiera con un WhatsApp (escribe al número de la clínica sin cuenta en el
portal); quien recibe un enlace de vinculación reenviado; quien copia o adivina un payload de botón o un `flow_token`;
una granja de números que quema el presupuesto o la calidad del número; quien manda webhooks falsos al endpoint público.

## Amenazas y controles

| # | Amenaza | Control (probado o medido) | Brecha que queda |
|---|---|---|---|
| T-14 | **Celular mal escrito**: los recordatorios (que dicen que alguien va al dentista) le llegan a un tercero | **Nunca se le escribe al celular del registro.** Solo a un número que mandó el código por WhatsApp Y que la persona confirmó desde su cuenta (`whatsapp-vinculo.ts`: «un número que NO probó ser del paciente no recibe nada»; recorrido: 0 mensajes a Meta antes de vincular) | — |
| T-15 | **Enlace o código reenviado** (el T-6 de Telegram, en WhatsApp): un tercero manda el código primero | Código de un solo uso (30 min); el número queda PENDIENTE; si no es el celular del registro, la persona tiene que **saber** los 4 últimos dígitos del WhatsApp desde el que escribió (no se le muestran); «No fui yo» lo descarta y el código queda quemado. Al tercero solo le llega «confirma en el portal» (probado y en el recorrido, capturas 08a/08b) | Una persona que confirma su propio celular sin leer no tiene fricción (es su número: no hay daño). Si el registro trae el celular de OTRA persona y esa persona manda el código, coincide: el registro con un celular ajeno sigue siendo el riesgo de T-14 del lado del formulario |
| T-16 | **Webhook falso** (inventar mensajes o estados) | HMAC-SHA256 del secreto de la app sobre los **bytes crudos** (`X-Hub-Signature-256`), comparado en tiempo constante; sin firma o con un byte de más, 401 y nada se procesa (probado; medido por la ruta HTTP: wa-10) | El secreto del laboratorio es de prueba: en producción, gestor de secretos y rotación |
| T-17 | **Reintentos y desorden de Meta** (hasta 7 días, sin orden, `delivered` que no llega) | Cola durable antes del 200; idempotencia por `wamid` (entrante) y por (`wamid`, estado); el estado de un aviso solo avanza; un `failed` tardío no deshace una entrega (probado) | — |
| T-18 | **Botón copiado o forjado** («Cancelar cita» de otra persona) | Payload firmado (HMAC: clínica + acción + cita) Y la cita tiene que ser del paciente **vinculado al número que toca** (probado: botón ajeno → «ya no está activa»; firma alterada → «no es válido»; medido por el webhook: wa-10) | — |
| T-19 | **Flow ajeno o tras desvincular** | `flow_token` firmado (clínica, paciente, número, flujo, cita, vence en 24 h); el endpoint exige que el número **siga vinculado** a ese paciente (427 si no); la identidad nunca sale del payload; una cita ajena en el payload no se encuentra (probado) | Meta sugiere 2-3 días de vigencia; aquí 24 h. Con un número real, medir si hace falta más |
| T-20 | **Inyección** por chat, nota de voz o pie de foto | Las barreras del asistente (T-1) en el mismo orden; **urgencias por regla antes que todo**, también en notas de voz (ASR local) y pies de foto; una **foto nunca** se baja ni va al LLM (probado; medido: corpus de inyección y wa-09) | Igual que T-1: lo sutil llega al LLM; su daño es un texto equivocado, no una acción |
| T-21 | **Denial-of-wallet y de calidad** por una granja de números | Frontera: 20 mensajes en 10 min por contacto (después, silencio) y 400 por hora por número (después, sin LLM); tope US$1 del asistente con libro de gasto (probado) | **Lo que cobra Meta** por las respuestas de servicio (pasados 1,000 al mes) no tiene tope propio: lo frena solo la frontera. Antes de un número real: tope diario de mensajes de servicio por número |
| T-22 | **Lectura cruzada**: un número no vinculado pide citas o datos | Un número no vinculado es un visitante: el asistente no recibe citas (`citas: null`) y «mis citas» contesta cómo vincularse (probado; medido: 0 citas reveladas a números no vinculados) | — |
| T-23 | **Dos voces en un chat** (coexistencia): la recepción contesta desde su celular y el asistente también | El eco de la recepción calla al asistente en ESE chat 12 h; «quiero hablar con alguien» hace lo mismo; las **urgencias se contestan igual** (probado) | 12 h es una cifra del laboratorio: medir con la recepción real |
| T-24 | **El canal se cae** (número desconectado, plantilla pausada o desactivada, recategorizada a marketing) | Alerta a la clínica; el aviso que falla para siempre sale por **correo de respaldo** en la misma corrida (probado) | Si la persona no tiene correo vigente, el respaldo rebota (T-7 del correo) |
| T-25 | **Datos de salud hacia Meta** (la Cloud API descifra y guarda hasta 30 días) | Plantillas mínimas: nombre de pila, clínica y fecha; **nunca el servicio** (probado sobre el texto renderizado); la foto no se baja; el `history` de coexistencia no se guarda; el libro no lleva el número (probado: 0 apariciones) | Lo que la persona escribe o dice en su chat lo ve Meta: inherente al canal, se dice en el aviso de privacidad y en la AISIA |
| T-26 | **Canal real conectado sin gobierno** (cambia el control de T-13) | **Gate POR CANAL**: el transporte real de WhatsApp (y el de Gmail y el de Telegram) no se construye salvo que el CÓDIGO declare la revisión firmada de C3 + AISIA de ese canal Y el entorno traiga `CLINICA_GATE_WHATSAPP` con ese id. La variable vieja (`CLINICA_C3_C4_FIRMADOS`) ya no abre nada; firmar Telegram no abre WhatsApp (probado) | Declarar la revisión en el código es un diff: lo revisa una persona, como un CDC |
| T-27 | **La cola del webhook guarda cuerpos crudos** (número y texto) | Se compacta tras procesar: lo procesado no se queda en disco (probado) | Lo PENDIENTE vive en disco hasta procesarse: en producción, cifrado en reposo |

**Separaciones que se preservan**: el asistente ve el texto y no mueve nada (los Flows los confirma la persona; el
asistente solo los MANDA); el número vinculado lo decide la persona desde su cuenta, nunca un mensaje; el audio de una
nota de voz no sale del servidor hacia nadie más (ya pasó por Meta: es inherente al canal); una foto no entra al sistema.

## Lo que falta para un número real (y no cubre esta revisión)

1. Firmar esta revisión **y** su AISIA (`clinica-dental-whatsapp-aisia.md`), y declarar el id en `REVISIONES_FIRMADAS`.
2. La app de Meta, el número y la verificación del negocio; el secreto de la app, la llave de los Flows y el token, en un
   gestor de secretos; las plantillas y los Flows **aprobados por Meta** (el texto es el de este goal: CDC).
3. Tope diario de mensajes de servicio por número (T-21) y cifrado en reposo de la cola (T-27).
4. El aviso de privacidad **vigente** (revisado por un abogado) con la sección de WhatsApp.
5. Medir con personas: la vinculación, la nota de voz con voces reales, y el silencio de 12 h con la recepción real.
