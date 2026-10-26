# Capa Arbrain · fase 5, nodo `voz`: la voz alineada y medida

**Fecha:** 2026-10-25. Worktree `capa-arbrain` (rama `capa/arbrain`, sobre `4b446fb`). Sin LLM real, sin red hacia
proveedores de voz, sin leer llaves (el token del dictado lo leen los guiones de medición en proceso, como el 16/10, y
nunca se imprime). El audio no sale de la máquina: Parakeet y Piper por el demonio local de `tools/dictado`
(127.0.0.1:47125, `"nube":"apagada"` en su arranque), Silero o la energía calibrada en el navegador.

Punto 8 del HECHO, uno por uno:

| Entregable | Estado | Dónde |
|---|---|---|
| `prueba:tools` de `voz`, `dictado` y `bucle-voz` | verde: 3 suites, 362 pruebas | §1 |
| Medición nueva con `mide.ts`, cerebro simulado, contra la base del 16/10 | 3 corridas. Acuse p50 ≤ 644 ms solo en una (630); **órdenes por encima de su base en p50 en las tres**; «para» 16/16 sin frases tardías y eco 0/6 en las tres, pero la reacción al «para» es **más lenta** que la base; con Silero, «para» encima del acuse falló 2 de 8 | §2 |
| Enrutador en un corpus nuevo nunca visto | **71.6 %** (48/67) contra 75.5 % del corpus C: **caída declarada**, 0 errores graves | §3 |
| Contrato del enchufe compatible con OpenAI contra el servicio de dictado | verde (8 pruebas de contrato) + prueba de humo contra el demonio real | §4 |
| Adaptadores de nube contra un proveedor simulado, «no medidos» | verde (10 pruebas), apagados por defecto, `medido: false` | §5 |
| Botón «Modo conversación»: capturas en secuencia + teclado | 11 capturas en secuencia, 0 errores de consola; Tab+Enter/Espacio y Alt+C con `aria-pressed`; pistas en `ended` al apagar | §6 |
| Ranura de voz dictando en Recepción | captura `producto/12-voz-dictando.png` | §7 |

## 1. Suites

`npm run prueba:tools -- voz dictado bucle-voz` (al retomar, 25/10 11:38 hora local, y otra vez al cerrar, 12:20; igual las dos veces):

```
> saas-factory-app@0.1.0 prueba:tools
> node scripts/prueba-tools.mjs voz dictado bucle-voz

▸ tools/bucle-voz $ npm run prueba
  ✓ 95 pruebas
▸ tools/dictado $ npm run prueba
  ✓ 169 pruebas
▸ tools/voz $ npm run prueba
  ✓ 98 pruebas

Herramientas en verde: 3 suite(s), 362 pruebas.
```

`npx tsc --noEmit`: 0 errores (al retomar y al cerrar). `npx eslint` sobre `src/shared/capa/modulos/voz.ts`,
`src/shared/capa/laboratorio.tsx` y `scripts/centro-de-mando/capturas-capa-voz.ts`: 0 avisos.

## 2. `mide.ts` contra la base del 16/10

`node scripts/centro-de-mando/mide.ts --salida …` contra el HUD del centro de mando (`/centro-de-mando`, ya dentro de la
capa), Chromium headless con micrófono falso, voces Piper, **cerebro simulado** (`CEREBRO_SIMULADO_MS=1500`: ninguna
llamada a un modelo; `mide.ts` se niega a medir si un turno no viene marcado «simulado»). Verdad de terreno: el fin
real de la voz inyectada → la primera subida por encima de −45 dBFS de lo que sale por los `<audio>` del HUD (cota
conservadora, como el 16/10). Ninguna muestra se quitó y la definición de cada cifra es la del 16/10; el «primer
sonido» de la conversación es el acuse cuando lo hubo (lo hubo en 12 de 12 en las tres corridas).

Tres corridas (el máximo pactado), todas en `docs/goals/capa-arbrain-evidencia/`:

- **Corrida 1** — `voz-latencias.json`, 16:13Z, del agente anterior. Detector **energía** (el de la base). Máquina
  CARGADA por otros agentes (loadavg1 hasta 8.9).
- **Corrida 2** — `voz-latencias-2.json`, 18:02Z. Arrancó tras esperar la calma (loadavg1 < 2.5 dos lecturas seguidas
  y ningún `docker build`): 1.32. Corrió con el detector POR DEFECTO del HUD, que desde el 17/10 es **Silero**: no
  pasé `--detector energia`. No es comparable con la base en el detector, pero es lo que hoy usa una persona en el HUD
  (y lo que usa el módulo de voz de la capa), así que se reporta entera.
- **Corrida 3** — `voz-latencias-3.json`, 18:19Z. Detector **energía**, como la base y la corrida 1. Arrancó en calma
  (0.41); otro proceso subió la carga a partir de la conversación (2.07) y en el eco (5.54).

| Del fin real del habla al primer audio que suena (ms) | Base 16/10 (energía, sin acuse) | Corrida 1 (energía, cargada) | Corrida 2 (**Silero**, calma) | Corrida 3 (energía, calma → carga) |
|---|---|---|---|---|
| Orden local, sin LLM: p50 · p95 (n=32) | **644 · 802** | 666 · 770 | 805 · 923 | 694 · 786 |
| — según el HUD (p50 · p95) | 550 · 676 | 567 · 657 | 616 · 677 | 611 · 693 |
| Conversación, **primer sonido** (el acuse): p50 · p95 (n=12). Meta p50 ≤ 644 | 1895 · 2644 (sin acuse; era la respuesta de un LLM real) | 646 · 803 | 741 · 888 | **630** · 820 |
| — según el HUD (p50 · p95) | 1788 · 2544 | 577 · 679 | 526 · 673 | 509 · 732 |
| Conversación, primer sonido de la **respuesta** (cerebro simulado de 1500 ms): p50 · p95 | — (no comparable: LLM real) | 2921 · 3404 | 2856 · 3275 | 3606 · 4213 |
| «Para» encima de la respuesta: callaron · reacción p50 · p95 · frases tardías | **16/16 · 208 · 268 · 0** | 16/16 · 240 · 295 · 0 | 16/16 · 295 · 314 · 0 | 16/16 · 319 · 368 · 0 |
| «Para» encima del acuse: limpios · reacción p50 · p95 · frases tardías | — (no había acuse) | 8/8 · 306 · 371 · 0 | **6/8**: 1 no calló, 1 calló a 1914 ms con 1 frase tardía · 317 · 1914 · 1 | 8/8 · 309 · 520 · 0 |
| Eco residual a −20 dB sin cancelación: auto-interrupciones | **0/6** | 0/6 | 0/6 | 0/6 |
| Preguntas con pausa de 400 ms partidas en dos | — | 1/8 | 0/8 | 0/8 |
| Desvío del fin real según el HUD contra la verdad (p50 · p95) | −24 · −8 | −36 · −18 | +66 · +114 | −39 · −13 |
| Carga, loadavg1: inicio · órdenes · conversación · interrupción · eco · pausas · fin | no anotada | 2.19 · 2.0 · 3.18 · 1.52 · 8.89 · 4.11 · 5.7 | 1.32 · 1.53 · 1.53 · 1.24 · 2.88 · 1.8 · 1.13 | 0.41 · 0.54 · 2.07 · 1.68 · 5.54 · 3.51 · 5.22 |

**Lo que dice, tal cual:**

- **Primer sonido de la conversación (meta p50 ≤ 644 ms):** se cumple en la corrida 3 (630 ms). En la corrida 1 queda
  2 ms por encima (646, con la máquina cargada). Con Silero (corrida 2) queda en 741 ms, **por encima**. Contra la base
  (1895 ms, la respuesta de un LLM real sin acuse), el primer sonido llega ~1,2 s antes en las tres; es un sonido de
  relleno sin contenido, no la respuesta.
- **Órdenes locales:** el p50 queda **por encima de su base** en las tres corridas (666, 805 y 694 contra 644). El p95
  queda por debajo con energía (770 y 786 contra 802) y por encima con Silero (923).
- **«Para»:** 16/16 y 0 frases tardías en las tres, como pide el HECHO. Pero la **reacción es más lenta que la base**
  en las tres (p50 240, 295 y 319 contra 208 ms). No se averiguó por qué; candidatos sin verificar: la carga, y que el
  HUD ahora corre dentro de la capa (más trabajo en la misma página).
- **Eco:** 0/6 en las tres.
- **Silero contra energía:** con Silero, las órdenes y el acuse llegan ~100 ms más tarde que con energía, con las dos
  corridas arrancadas en calma (805 contra 694; 741 contra 630), en línea con lo medido el 17/10 (cierre p50 714 contra 614 ms en limpio,
  `docs/goals/centro-de-mando-voz-medicion/detector.md`). Y con Silero, **«para» dicho encima del acuse falló 2 de 8**
  (1 no calló; 1 calló a los 1914 ms y sonó una frase del turno viejo); con energía, 8/8 en las dos corridas. Hipótesis
  SIN VERIFICAR: el acuse dura ~1,3-1,8 s y Silero confirma la voz más tarde; si el acuse ya terminó cuando se
  confirma, la máquina está callada esperando al cerebro y el «para» no corta un turno que no está sonando.
- **La respuesta** (segunda cifra de la conversación) no tiene meta y no es comparable con la base (cerebro simulado
  de 1500 ms fijo contra un LLM real). Empeoró en la corrida 3 (3606 ms) con la carga subiendo; no se investigó.
- **Una mejora que no se puede medir como mejora:** que el acuse haga sentir más rápida una conversación con un
  cerebro REAL. Sin LLM real en el HECHO, lo medido es solo que el primer sonido llega a la par de una orden.

## 3. El enrutador en un corpus nunca visto (corpus D)

- **Corpus:** `tools/bucle-voz/medicion/corpus-enrutador-d.json`, 67 frases en español con su etiqueta esperada
  (17 etiquetas: órdenes del bucle, lecturas, 15 de conversación, 6 escrituras y 2 «nada»).
- **Congelado ANTES de medir** (2026-10-25T16:11:07Z), con su huella y las del enrutador y su catálogo en ese instante
  (`docs/goals/capa-arbrain-evidencia/voz-enrutador.json`):
  - corpus `sha256:3c8d55c01ee1bfed9ea7a54eed43e9c7434d25e944be916b83267b123aebb461`
  - `tools/bucle-voz/src/enrutador.ts` `sha256:a4d856bf9e004b6d8624a75b5a6d4e7f7a6c60369ccc3b5d4af96daad059501e`
  - `tools/bucle-voz/src/catalogo.ts` `sha256:605cf6cd7dbf8a77cd9106d5b07b8b8b1e887c867ef55d94e34e3253176f349c`

  Re-verificadas al cerrar este documento: las tres coinciden (`sha256sum`), y `git diff HEAD` sobre el enrutador y
  el catálogo sale vacío. Nadie tocó el enrutador después de ver los fallos.

| Enrutador `local-reglas-0.3`, por texto | Acierto | Órdenes equivocadas | Conversación tomada por orden | Escrituras perdidas | Al cerebro |
|---|---|---|---|---|---|
| Corpus B (65), visto al ajustar la 0.3 | 75.4 % | 0 | 0 | 0 | 16 |
| Corpus C (53), nunca visto (16/10) | 75.5 % | 0 | 0 | 0 | 13 |
| **Corpus D (67), nunca visto (25/10)** | **71.6 %** (48/67) | **0** | **0** | **0** | 19 |

**Es una caída de 3.9 puntos y se declara.** Los 19 fallos van TODOS al cerebro (el lado seguro: una orden no
entendida se conversa; ninguna conversación se ejecuta como orden y ninguna escritura se pierde). Los fallos son
paráfrasis que las reglas no cubren: «oye, detente un segundo», «shh, silencio» (para); «no entendí lo que dijiste»,
«no alcancé a oír, repite» (repite); «acelérale un poco»; «hasta la próxima» (duerme); «sí, dale», «confirmo, hazlo»
(confirma); «no, déjalo», «olvídalo, ya no» (olvida); «¿a cuántos estamos?» (fecha); «¿hay algo en mi calendario hoy?»,
«¿con quién me reúno hoy?», «¿qué me toca mañana?» (agenda); dos de estado, una de gasto y dos de ayuda.

No se ajustó el enrutador para ganar en D ni se volvió a medir en D: sería entrenar sobre la prueba. Una mejora (las
paráfrasis de arriba) queda como **propuesta**, y se tendría que medir en un corpus E escrito y congelado antes.

## 4. El enchufe de motor compatible con OpenAI (`tools/dictado/servicio/openai.mjs`)

Las rutas, con el mismo Bearer que ya tenía el servicio (C3), en loopback:

- `POST /v1/audio/transcriptions` — multipart `file` (WAV PCM16), `model`, `language`, `prompt`,
  `response_format=json|text` → `{ "text": … }`. Quién contestó va en cabeceras (`x-motor`, `x-ms`, `x-local`), no en el
  cuerpo. mp3/webm → 415 con la razón (no hay decodificador: se dice, no se adivina); `srt`/`vtt` → 400.
- `POST /v1/audio/speech` — JSON `{ model, input, voice, response_format, speed }` → `audio/wav` entero (tamaños
  exactos) o `audio/pcm` en flujo con `x-frecuencia-hz`; `voice` por nombre o prefijo (`es_MX`). mp3/opus → 400.
- `GET /v1/models` — **probar la llave sin gastar cuota** (lo importado de `probarLlaveVoz`): 200 con el token bueno,
  401 en la forma de OpenAI sin él, y ningún motor se mueve.

Pruebas de contrato en `tools/dictado/pruebas/openai.ts` (contra el manejador REAL del servicio, `servicio/rutas.mjs`,
con motor y voz falsos): un cliente cualquiera con `fetch` + `FormData` como un SDK de OpenAI, **y el cliente de la
capa `creaClienteAudio` tal cual** (transcribe, sintetiza, prueba la llave); errores en la forma de OpenAI; la nube
detrás de la misma interfaz (apagada por defecto: pedirla se rechaza y al proveedor no le llega nada).

**Humo contra el demonio REAL** (Parakeet int8 y Piper en 127.0.0.1:47125, 25/10 12:20 hora local; guion de un solo uso
en el scratchpad, el token leído del `.env.local` y nunca impreso), con `creaClienteAudio` de `tools/capa/dist` tal cual:

```
token: presente, largo 32
GET /v1/models con el token bueno: {"ok":true,"estado":200}
GET /v1/models con otro token: {"ok":false,"estado":401}
GET /v1/models sin token: {"ok":false,"estado":401}
  modelos: ["sherpa:nemo-parakeet-tdt-0.6b-v3-int8","es_MX-claude-high","es_ES-davefx-medium","es_MX-ald-medium"]
POST /v1/audio/speech (creaClienteAudio, voice es_MX, wav): audio/wav, 178500 bytes, 402 ms
POST /v1/audio/transcriptions (creaClienteAudio, ese mismo WAV): {"texto":"Hola, esta es una prueba del enchufe compatible con OpenARI."} en 633 ms
  con fetch + FormData (model whisper-1): 200 {"text":"Hola, esta es una prueba del enchufe compatible con OpenARI."} · x-motor=sherpa:nemo-parakeet-tdt-0.6b-v3-int8 · x-local=1 · x-ms=631
  un mp3: 415 {"error":{"message":"formato no soportado: este servicio lee WAV PCM16 (p. ej. ffmpeg -i toma.webm -ar 16000 -ac 1 toma.wav)","type":"invalid_request_error","co…
  speech con model elevenlabs (nube apagada): 400 {"error":{"message":"elevenlabs está apagado en este servicio (DICTADO_NUBE)","type":"invalid_request_error","code":null}}
```

Ida y vuelta local: Piper dice la frase y Parakeet la lee («OpenARI» por «OpenAI»: el motor, no el enchufe).

## 5. Adaptadores de nube: opcionales, apagados y «no medidos»

`tools/dictado/src/nube.ts` (Groq STT, LemonFox STT y TTS, ElevenLabs TTS), detrás de la misma interfaz que el motor
local. Ninguno se crea solo: el servicio los enciende uno por uno con `DICTADO_NUBE`, cada uno con su llave y su C4.

| Adaptador | Qué sale de la máquina | A quién | Medido |
|---|---|---|---|
| `groq` (STT) | el AUDIO de cada toma | Groq (whisper-large-v3-turbo) | **no medido** |
| `lemonfox-stt` | el AUDIO de cada toma | LemonFox | **no medido** |
| `lemonfox-tts` | el TEXTO de cada respuesta | LemonFox | **no medido** |
| `elevenlabs` (TTS) | el TEXTO de cada frase (sin `previous_text`) | ElevenLabs (Flash v2.5) | **no medido** |

Probados contra un **proveedor simulado** (un servidor HTTP local falso, `tools/dictado/pruebas/proveedor-simulado.ts`;
pruebas en `pruebas/nube.ts` y las dos últimas de `pruebas/openai.ts`): qué recibe cada proveedor (eso es su C4
visto desde fuera), que el LOCAL va primero y si contesta la nube ni se toca, que **el STT no se apaga si falta un
proveedor opcional** (sin la llave de Groq contesta LemonFox; lo de Arbrain), que una llave rechazada pasa al
siguiente sin filtrar el cuerpo del proveedor, que un audio ilegible detiene la cadena, y que probar la llave no gasta
(Groq por `/models`; LemonFox, que no tiene ruta gratuita, lo dice en vez de gastar). Ninguna cifra de latencia o
calidad de estos adaptadores sale de aquí: contra el proveedor real **no se midió nada**. Nunca se encienden en un
producto con datos sensibles de terceros (lo aplica la capa, `decideRanuraVoz`; Recepción, que declara
`datosSensibles: true`, queda solo local). El C4 de los adaptadores es una propuesta del coordinador (punto 14 del HECHO).

## 6. El botón «Modo conversación», en secuencia (`/laboratorio-calendario`)

`CapaLaboratorio` ya recibe la voz (`voz={VOZ}`, con `VOZ = moduloDeVozLocal()` fuera del render). Guion:
`scripts/centro-de-mando/capturas-capa-voz.ts` (Chromium headless con el micrófono falso; cada `getUserMedia` da pistas
nuevas, como un micrófono de verdad, y la prueba cuenta cuántas veces se pidió). Datos de cada paso:
`docs/goals/capa-arbrain-capturas/voz/secuencia.json`. **0 errores de consola.** Lo que la app no pinta (lo que se oyó y
lo que se dijo en voz, las pistas del micrófono) va en una franja rotulada «Anotación de la prueba (no es parte de la
app)», sacada de la telemetría del bucle y del micrófono de la página, y se quita tras cada captura.

Rutas relativas a `docs/goals/capa-arbrain-capturas/`.

| Captura | Qué se ve | Estado · `aria-pressed` · micrófono · pistas · pedidos de micrófono |
|---|---|---|
| `voz/01-apagado.png` | el botón a la vista, apagado | apagado · false · cerrado · — · **0** (no se pide al cargar) |
| `voz/02-escuchando.png` | un clic: indicador rojo «Escuchando» | escuchando · true · abierto · `live` · **1** (al primer clic) |
| `voz/03-turno-respondido-en-voz.png` | «¿Qué tengo hoy en la agenda?» dicho; el turno se cerró al callar; la capa lo resolvió por intención (`calendario.consulta-hoy`) y la respuesta suena con Piper | hablando · true · abierto · `live` · 1 |
| `voz/04a-hablando.png` | una respuesta larga sonando | hablando · true · abierto · `live` · 1 |
| `voz/04b-interrupcion.png` | «Para.» dicho encima con otra voz: calló y volvió a escuchar en 257 ms (desde que empezó a sonar «Para.» en el micrófono, la frase incluida); el turno quedó `interrumpido` | escuchando · true · abierto · `live` · 1 |
| `voz/05a-freno-pide-su-clic.png` | «Cancela la cita de mañana.» dicho: la tarjeta del freno con la cita textual, «Espera tu clic» en el panel, y dicho en voz que el clic es de la persona | escuchando · true · abierto · `live` · 1 |
| `voz/05b-decirlo-no-basta.png` | «Sí, confírmalo.» dicho: contesta en voz «Eso no lo confirmo por voz…»; la tarjeta sigue (1 pendiente) y las 4 citas siguen | hablando · true · abierto · `live` · 1 |
| `voz/05c-el-clic-si.png` | el clic de la persona en «Confirmar»: ahora sí se canceló «Cita de seguimiento» (3 citas) | escuchando · true · abierto · `live` · 1 |
| `voz/06-apagado-otra-vez.png` | otro clic: apagado | apagado · false · cerrado · **`ended` al volver del clic** · 1 |
| `voz/07-teclado-enter.png` | 2 Tab desde el principio (anillo de foco en el botón) + Enter: encendido | escuchando · true · abierto · `live` · 2 |
| `voz/08-teclado-espacio-y-alt-c.png` | Espacio lo apaga; Alt+C lo enciende y lo apaga | apagado · false · cerrado · `ended` · 3 |

**Teclado** (de `secuencia.json`): Tab ×2 → foco en el botón; `Enter` → `aria-pressed=true`, escuchando, pistas `live`;
`Espacio` → `aria-pressed=false`, apagado, pistas `ended`; `Alt+C` → `true`, escuchando, `live`; `Alt+C` → `false`,
apagado, `ended`.

**Apagar cierra el micrófono al instante:** las pistas, leídas justo después del clic y sin espera
(`pistasAlVolverDelClic`), ya están en `ended`; `apaga()` las detiene de forma síncrona antes de volver. Si se apaga
mientras se pedía el permiso, la generación del encendido se invalida y las pistas que lleguen tarde se detienen: eso
está en el código (`src/shared/capa/modulos/voz.ts`), pero la secuencia no lo prueba.

**No salta el freno:** con una tarjeta del freno pendiente, una confirmación dicha («sí», «confírmalo», «hazlo»,
«adelante»…) no se manda a la conversación: el módulo de voz contesta que por voz no y la tarjeta queda igual. Y la
capa, por su lado, solo confirma con un clic humano (`esClicHumano`). Dos cerrojos, y el que se ve en la captura es el
del módulo de voz.

**El acuse en la capa:** con la capa local (intención sin LLM), la respuesta llega antes de 450 ms
(`MS_GRACIA_ACUSE`) y el acuse no suena (los turnos de la secuencia no lo registran). Suena cuando la capa tarda más.

## 7. Recepción: la ranura de voz dictando

`http://localhost:3011/recepcion` (compone `moduloDeVozLocal()` en su capa). El botón «Dictar» del compositor abre el
micrófono, graba hasta que la persona calla y transcribe en local:

- `docs/goals/capa-arbrain-capturas/voz/09-recepcion-grabando.png` — grabando («■ Parar», `aria-pressed=true`).
- `docs/goals/capa-arbrain-capturas/producto/12-voz-dictando.png` — dicho «Apunta que la señora Pérez llega diez
  minutos tarde.» → transcrito por Parakeet local «Apunta que la señora Pérez llega 10 minutos tarde.», en el
  compositor, sin enviarse solo.

## 8. Lo que se importó de Arbrain, con su procedencia

Todo de la etiqueta firmada `v0.2.10` (commit `829a9e99f0f6805325e24bd851eb5d1e88c3c67c`), con ruta, blob y qué cambió en
la cabecera de cada archivo:

- **El acuse inmediato** — `tools/bucle-voz/src/acuse.ts` (de `arbrain/server/src/live/capa-rapida.ts`): lo elige
  NUESTRO enrutador sin LLM (no Jev por OpenRouter), las frases se calientan en el sintetizador desde el arranque, va
  como frase 0 del turno y lo cortan la interrupción y «para» como a cualquier frase, con la misma puerta de eco.
  Pruebas: `tools/bucle-voz/pruebas/acuse.ts`.
- **La mejor voz LOCAL del dispositivo** — `tools/bucle-voz/src/navegador/voz-dispositivo.ts` (de
  `arbrain/src/features/chat/lib/chat-speech.ts › mejorVozEspanol`): solo `localService === true`; las voces de red
  («Online (Natural)», «Google …») no cuentan, y sin voz local no se habla con otra. Pruebas:
  `tools/bucle-voz/pruebas/voz-dispositivo.ts`.
- **Probar una llave sin gastar cuota** y **un STT que no se apaga porque falte un proveedor opcional** — §4 y §5.
- **Cerebro simulado** (nuestro, no de Arbrain) — `src/features/centro-de-mando/services/servidor/cerebro.ts`: con
  `CEREBRO_SIMULADO_MS` (nunca en producción) contesta un texto fijo sin datos tras el retardo, sin llave ni gasto, y la
  telemetría marca el turno «cerebro simulado». `mide.ts` se niega a medir si un turno no viene marcado así.

## 9. Lo «no medido» y las brechas

- **No medido:** los cuatro adaptadores de nube contra el proveedor real; la voz del dispositivo en un teléfono real
  (solo la elección, probada sin navegador); el Modo conversación con un micrófono y una sala reales (todo es Chromium
  headless con micrófono falso y voces Piper); el acuse con un cerebro real (con el simulado, retardo fijo de 1500 ms).
- **Brecha (enrutador):** 71.6 % en el corpus D, por debajo del 75.5 % del C. Declarada; la mejora queda como propuesta
  medible solo en un corpus nuevo.
- **Brecha (latencia):** el p50 de las órdenes queda por encima de la base (644) en las tres corridas; la reacción al
  «para» es más lenta que la base (208) en las tres; el acuse cumple la meta en una de tres (630), queda en 646 con la
  máquina cargada y en 741 con Silero. Con Silero, el detector por defecto del HUD y del módulo de voz de la capa,
  «para» encima del acuse falló 2 de 8 (hipótesis sin verificar en §2). Nada de esto se ajustó después de medir.
- **No medido:** la latencia del Modo conversación de la CAPA (el botón): `mide.ts` mide el HUD del centro de mando.
  El bucle es el mismo, pero el cerebro del turno es la intención de la capa, y el acuse solo suena si tarda más de
  450 ms.
- **Brecha (interfaz):** la respuesta del módulo de voz a «sí, confírmalo» solo se OYE: no queda en el hilo de la
  conversación, porque el `ModuloDeVoz` no tiene cómo añadir un aviso al hilo sin pasar por la intención (y mandarlo a
  la intención es justo lo que no se quiere). Propuesta para el dueño de la capa: un `avisa(texto)` en lo que
  `creaControl` recibe, que pinte el aviso en el hilo sin enrutarlo.
- **Brecha (preferencia):** el botón guarda la preferencia de cada persona (`ajustes:voz` en la memoria del producto),
  pero hoy nada la lee: al recargar no se enciende solo, y eso es a propósito (el permiso del micrófono es del clic).
  Es de la capa; queda anotado para su dueño.
- **Mesa del experto:** sin voz. Su composición (`productos/composiciones/soporte-sap.json`) declara `voz: { no: … }`
  con el motivo (1 GiB de instancia; Parakeet pide ~1,5 GB; la voz del navegador manda el audio fuera). No lo probé en
  pantalla: es del nodo de la mesa.

## 10. Cambios en archivos que no son de este nodo

- `src/shared/capa/laboratorio.tsx` (mi única línea autorizada, más su import y la constante fuera del render, que
  hace falta: un `moduloDeVozLocal()` dentro del JSX crearía un control nuevo en cada render y lo apagaría):

  ```diff
   import { manejadoresDeCalendario, PlanDelCalendario } from './modulos/calendario';
  +import { moduloDeVozLocal } from './modulos/voz';
  ...
  +/** La voz LOCAL de la ranura (Parakeet, Piper y Silero, por el demonio de tools/dictado): una sola instancia, fuera del render. */
  +const VOZ = moduloDeVozLocal();
  +
   export function CapaLaboratorio({ children }: { children: ReactNode }) {
  -  return <CapaApp composicion={laboratorio} manejadores={manejadoresDeCalendario} componentes={COMPONENTES}>{children}</CapaApp>;
  +  return <CapaApp composicion={laboratorio} manejadores={manejadoresDeCalendario} componentes={COMPONENTES} voz={VOZ}>{children}</CapaApp>;
   }
  ```
- La capa (`tools/capa/src/react/voz.tsx`, `contexto.tsx`): **no hizo falta tocarla.** El botón y la hidratación
  funcionaron tal cual. Lo único que falló fue mío: en desarrollo React llama dos veces al `useMemo` que crea el
  control y se queda con el primero, así que el control expuesto para la medición apuntaba al descartado; ahora se
  expone al encender (`src/shared/capa/modulos/voz.ts`).

## Control del coordinador: ¿la lentitud frente a la base es del código o de la máquina?

Merge del coordinador (2026-10-25, tras la entrega del agente de voz). Las tres corridas dan órdenes y «para» más
lentos que la base del 16/10. Para atribuirlo se corrió un **control que cambia una sola variable**: igual que C3
(detector de energía, cierre por defecto) pero **sin acuse** (`--acuse 0`), en el mismo servidor y el mismo demonio.
Un primer intento cambiaba también el cierre (`--cierre vad`); no era comparable con la base, que usa el cierre
anticipado, y se detuvo sin guardar.

| ms | Base 16/10 | C3 (con acuse) | Control (sin acuse) |
|---|---|---|---|
| Orden p50 · p95 | 644 · 802 | 694 · 786 | **1573 · 2906** |
| Primer sonido de la conversación p50 · p95 | 1895 · 2644 (LLM real) | 630 · 820 | 3064 · 4274 (sin acuse: es la respuesta) |
| «Para»: calla · p50 · p95 · tardías | 16/16 · 208 · 268 · 0 | 16/16 · 319 · 368 · 0 | 16/16 · 327 · 376 · 0 |
| Eco | 0/6 | 0/6 | 0/6 |
| loadavg1 al medir órdenes · interrupción | — | 0.54 · 1.68 | 2.33 · 3.82 |

Lo que se puede decir, y lo que no:

- **El acuse no hace más lento el «para»**: con y sin acuse, 319 y 327 ms. La diferencia contra la base (208 ms) no la
  explica el acuse.
- **Las órdenes no pasan por el acuse**, y con el mismo código fueron de 694 ms (C3) a 1573 ms (control) en menos de
  una hora, con la carga parecida. **En esta máquina, el estado (el demonio de dictado llevaba ~50 min arriba y se vio
  al 50 % de CPU sostenido) mueve las cifras más del doble entre corridas.** Con estas corridas no se puede atribuir al
  código la diferencia de las órdenes y del «para» contra la base: queda **declarada como no atribuida**, no como
  mejora ni como regresión del código.
- Lo que se sostiene en las cuatro corridas: «para» 16/16 sin frases tardías y eco 0/6. El acuse cumple la meta
  (≤ 644 ms) en la corrida comparable y en calma (C3, 630 ms) y no en la cargada (C1, 646 ms).
- Para atribuirlo de verdad hace falta una corrida de la base (`origin/main`) y de la rama, alternadas, en la misma
  sesión de la máquina y con el demonio recién levantado. El «para» encima de la respuesta necesita un cerebro, y en
  `main` el cerebro es OpenRouter (prohibido aquí): esa comparación pide el cerebro simulado también en la base. Queda
  como trabajo aparte.

Archivo: `docs/goals/capa-arbrain-evidencia/voz-latencias-control.json`.
