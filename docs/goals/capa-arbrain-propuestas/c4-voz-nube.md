# C4 de la voz en la nube, BORRADOR — los adaptadores opcionales de la ranura de voz

> Fecha: 2026-10-25 · Estado: **borrador, sin firma** · Goal `docs/goals/capa-arbrain.md` (nodo `voz`, arista
> `e-gob-voz`). **Propuesta, no registro**: la firma la escribe el laboratorio.
>
> **Qué decide este documento.** Los adaptadores de voz en la nube (los proveedores que usa Arbrain) existen en el código
> detrás de la misma interfaz que nuestros motores locales, **apagados por defecto**. Este C4 dice qué sale de la máquina
> con cada uno, a quién y bajo qué condiciones un producto podría encenderlo. Firmarlo **no enciende nada**: encender un
> adaptador es una decisión por producto, con la revisión de la AISIA de ese producto.

## Lo que ya garantiza el código (probado)

- **La ranura de voz no se llena sola con la nube.** Sin un motor local declarado, el botón no aparece y la ranura dice
  por qué (`decideRanuraVoz`, `tools/capa/src/voz.ts`; pruebas «voz: la ranura no se llena sola con la nube…» y «sin
  motor local la ranura de voz no pinta el botón»).
- **Un adaptador de nube solo cuenta si el producto lo enciende** en su composición (`voz.nube`), y **nunca** si el
  producto declara `datosSensibles: true` (pacientes, lo que escribe el experto de Soporte SAP, clientes de una pyme).
- **El reconocimiento de voz del navegador cuenta como nube**: en Chrome manda el audio a Google. No es un motor local.
- **La mejor voz del dispositivo** (respaldo donde no hay Piper) se usa solo si es local (`localService === true`): las
  voces de red del navegador (por ejemplo, las «Natural» de Edge) mandan el TEXTO fuera y no cuentan como locales.
- **Cada adaptador está declarado «no medido»**: se probó contra un proveedor simulado, nunca contra el real.

## Los adaptadores, uno por uno

| Adaptador | Para qué | Qué sale de la máquina | A quién | Medido aquí | Encenderlo exige |
|---|---|---|---|---|---|
| Groq (`whisper-large-v3-turbo`) | dictar y transcribir el turno | **el audio de cada toma** (voz de la persona, con todo lo que se oiga alrededor) | Groq (EE. UU.) | no | producto sin datos sensibles + revisión de su AISIA + llave propia; retención y uso del proveedor revisados por escrito |
| LemonFox (STT) | lo mismo, de pago | **el audio de cada toma** | LemonFox | no | igual que Groq |
| LemonFox (TTS) | leer respuestas en voz alta | **el texto de cada respuesta** que se lee | LemonFox | no | producto sin datos sensibles + revisión de su AISIA; ~1,6 s por oración según Arbrain (cifra del autor, no medida) |
| ElevenLabs (Flash v2.5) | leer respuestas con poca latencia | **el texto de cada respuesta**, más el contexto previo que pida su API (Arbrain manda los últimos ~300 caracteres) | ElevenLabs | no | igual que LemonFox TTS; ~400–700 ms según Arbrain (no medido) |
| Reconocimiento del navegador | dictar sin servicio local | **el audio** | el proveedor del navegador (en Chrome, Google) | no | no se ofrece: no hay forma de que el producto controle a dónde va |

**Lo que no entra**: «Jev» (la capa rápida de Arbrain por OpenRouter, que clasifica lo hablado). Nuestro acuse se elige con
el enrutador local sin LLM: ningún texto hablado sale para clasificarlo.

## Daños que este C4 vigila

1. **La voz de una persona en un tercero** (STT en la nube): la voz es un dato biométrico en potencia y el audio arrastra
   lo que se oiga alrededor (otra persona, un nombre, un dato de salud). Por eso: apagado por defecto, nunca con datos
   sensibles, y la persona ve en Ajustes › Voz qué motor la escucha y qué sale.
2. **El texto de una respuesta en un tercero** (TTS en la nube): la respuesta puede citar datos del producto (una cita, un
   caso). Por eso el mismo límite.
3. **Una llave con gasto** (Groq gratis con límite; LemonFox y ElevenLabs de pago): «probar una llave sin gastar cuota»
   (`GET /v1/models`) y la contabilidad del template (C8) cuando se encienda.
4. **Dependencia**: si el proveedor cae, el STT no se apaga (sigue el local) y el TTS cae a Piper o a la voz local del
   dispositivo.

## Lo que firmar este documento NO abre

- Encender un adaptador en un producto: pide la revisión de la AISIA de ese producto y su entrada de CDC.
- Medir los proveedores con llaves reales (FUERA DEL HECHO §4 del spec): solo con audio sintético, sobre el mismo corpus.
- Apuntar la voz del Arbrain personal a nuestro servicio local (`KOKORO_TTS_URL`): **la edición cliente de Arbrain no lee
  esa variable** (lo verificó el mapa de adopción, `tools/capa/MAPA.md`), así que no aplica sin un cambio del autor;
  proponérselo es una acción hacia fuera que decide el laboratorio.
