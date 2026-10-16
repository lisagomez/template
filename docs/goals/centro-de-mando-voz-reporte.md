# Reporte del goal: centro de mando por voz (2026-10-16)

> Del spec [`centro-de-mando-voz.md`](centro-de-mando-voz.md). Medición: [`centro-de-mando-voz-medicion/`](centro-de-mando-voz-medicion/);
> capturas: [`centro-de-mando-voz-capturas/`](centro-de-mando-voz-capturas/); propuestas:
> [business-os](propuesta-business-os.md) y [CDC](propuesta-cdc.md); [post-mortem](centro-de-mando-voz-post-mortem.md).

## Decisiones

| Decisión | Por qué | Alternativa descartada |
|---|---|---|
| **Herramienta nueva `tools/bucle-voz`** para el núcleo (turnos, interrupción, separador, enrutador, activación, corte por sentido, telemetría, cerebro en flujo, reproductor) | Tres consumidores reales (HUD de business-os, laboratorio de voz, productos que hablan) y ninguna de las dos herramientas existentes era su casa: `voz` detecta y no conversa; `dictado` transcribe y pega | Extender `dictado` (lo habría convertido en un asistente; su núcleo sigue siendo «hablar y pegar») |
| **Núcleo sin dependencias, todo inyectado** (transcriptor, cerebro, sintetizador, reproductor, lector, reloj) | Se prueba entero con reloj falso y puertos falsos; corre igual en navegador y Node | Hooks de React con la lógica dentro (lo de la fuente: imposible de probar sin navegador) |
| **Un turno, un identificador, un `AbortController`** | Los cinco síntomas del defecto 2 de la fuente vienen de no numerar turnos | Banderas booleanas por estado (lo de la fuente) |
| **Micrófono abierto siempre; escuchar es un estado lógico** | Interrumpir exige oír mientras la máquina habla; un `getUserMedia` por turno es latencia y reentrancia | Cerrar el micrófono al hablar (la fuente: interrupción muerta) |
| **Interrupción con puerta de eco propia** sobre la cancelación del navegador | Chrome no cancela lo que suena por Web Audio, y la cancelación nunca es perfecta | Confiar solo en `echoCancellation` |
| **Voz por `<audio>` nativo**, dos elementos reutilizados, nivel desde el PCM | Mantiene la referencia de la cancelación de eco, `preservesPitch`, y el desbloqueo de iOS | `MediaElementSource` + Web Audio (la fuente) |
| **Especulación en la pausa y cierre por sentido** | Esconde la transcripción (~230 ms) dentro del silencio que hay que esperar; las órdenes seguras no esperan los 600 ms del VAD | Esperar siempre el cierre del VAD |
| **Anclaje de idioma** (dos pasadas, la segunda con «Escucha.» delante) | Parakeet oye inglés en órdenes cortas; el respaldo con idioma forzado tarda ~1,7 s | faster-whisper de respaldo en el camino rápido |
| **Enrutador por reglas + parecido**, catálogo en español, escritura detectada por verbo | Línea base local, medible, sin red; lo dudoso va al cerebro (el error barato) | Clasificar con el LLM (latencia, costo y el texto de las órdenes saldría) |
| **Palabra de activación por texto local** (el mismo motor transcribe lo dicho en reposo) | No hay modelo de activación local en español sin llave (Porcupine cerró su capa gratuita; sherpa-onnx solo chino/inglés); medible con el mismo corpus | Web Speech (manda el audio a Google), un modelo propietario |
| **Cerebro `anthropic/claude-haiku-5.5-20261007`** en un nivel `voz` del routing | Primer token 752 ms p50 (haiku-4.5: 956) y 10 veces más barato; pineado con fecha | Meterlo en `ligero` (más lento y caro) o cambiar `ligero` (mueve seis clases sin medir) |
| **Prompt v3**, elegido entre tres redacciones medidas | La primera frase corta es latencia (24 caracteres frente a 60) | Recortar por código a mitad de frase |
| **Caché caliente de lecturas** (hora del minuto, fecha, agenda) y de frases fijas | La voz de la respuesta ya está hecha cuando se pide | Sintetizar siempre al vuelo |
| **Agenda por el `Lector` de `tools/calendario`** sobre un espejo local con datos sintéticos | Lectura real por la herramienta del repo, sin red, sin pluma | Una lista fija en el código |
| **Tope de gasto en el servidor**, libro JSONL con la contabilidad del repo | Tope duro del laboratorio; una llamada abortada se anota con coste `null` | Confiar en el tope de la llave de OpenRouter |

## Qué se tomó de la fuente y qué se rediseñó

Ver la tabla de [`tools/bucle-voz/README.md`](../../tools/bucle-voz/README.md) («Cómo está hecho») y §2 de la
[propuesta para business-os](propuesta-business-os.md).

## Qué podría estar mal, y qué se hizo con cada cosa

| Riesgo | Qué se hizo | Qué queda |
|---|---|---|
| **Todo lo medido es con voces sintéticas** (Piper, 2-3 voces) inyectadas por un micrófono falso | Dos y tres voces distintas, corpus nunca visto al ajustar (C), verdad de terreno fuera del HUD | La cifra con la voz del laboratorio y en una sala real: fase 2 de FUERA DEL HECHO |
| **La toma de salida suma ~100-150 ms** (`captureStream`) | Se reporta la cota conservadora y, al lado, lo que dice el HUD; el desvío del fin real del HUD contra la verdad se mide (va por delante: mide de más) | — |
| **Sin cancelación de eco real**: Chromium headless con micrófono falso no la tiene | Peor caso a propósito: eco inyectado a −20 dB y la puerta propia; auto-interrupciones medidas | Altavoz y micrófono reales, con `echoCancellation` del navegador |
| **La confirmación de la interrupción es un umbral** (120 ms): baja, una tos corta te calla; alta, un «¡para!» corto no corta | Se midió en los dos sentidos: cortes del «Para.» y auto-interrupciones con eco; el valor y por qué, en el README | Toses y golpes reales: sin medir |
| **Enrutador: 75,5 % en el corpus nunca visto** (89 % en el que se ajustó) | Lo que falla cae al cerebro (el error barato): 0 órdenes equivocadas, 0 conversación tomada por orden, 0 escrituras perdidas en los tres corpus de texto | Ampliar sinónimos con frases reales, no con las mías |
| **Por audio, 5 de 220 escrituras se pierden en el oído** («Bora, el evento…», «Para la factura…», «Envían la factura…», «Agenda con el contador…») y 2 lecturas salen como otra lectura | Ninguna se ejecuta: no hay pluma, y el cerebro no tiene herramientas; van al cerebro o a una lectura de agenda | La persona no oye el aviso de dry-run en esos casos; «agenda con…» como verbo merece regla (requiere volver a medir los cuatro corpus) |
| **Palabra de activación por texto**: 3 falsas de 45 frases, las tres «Oye, Armando» | Umbral 0,8 elegido por barrido; el barrido está en la medición | Falsos disparos por hora en una sala: no medido (no hay horas de audio de fondo) |
| **El primer token de OpenRouter manda en la conversación** (~750 ms de los ~1,9 s) | Modelo elegido por primer token medido, primera frase corta en el prompt, voz por frases en flujo | Un proveedor más cerca o un modelo local: decisión de flujo de datos (C4), no de este goal |
| **`creaBucle` es una fábrica de más de 50 líneas** (cierres sobre el estado del turno) | Las piezas con lógica propia están fuera y probadas aparte (turnos, interrupción, separador, enrutador, cierre, canal de voz, telemetría) | Partirla en un objeto de estado explícito si crece |
| **Medido contra `next dev`**, no contra `next build` | El validate construye la app; las rutas son las mismas | Repetir la medición sobre el build |
| **El cerebro y el routing eran CDC** | Entraron en la rama porque sin ellos el gate rechaza la llamada, con su [propuesta](propuesta-cdc.md); el laboratorio firmó los puntos 1 y 2 el 2026-10-16 (entrada en `.claude/gobernanza/BITACORA-CDC.md`) y se mergearon en #268 | Los puntos 3 a 6 de la propuesta, cada uno en su propia entrada |
| **Silero en el navegador no se activó** (el detector del HUD es por energía) | Los pesos ya están pineados con su sha256 (era v6.2, no v5) | Activarlo es un CDC (punto 4 de la propuesta) |
