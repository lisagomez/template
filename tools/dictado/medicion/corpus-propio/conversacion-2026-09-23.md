# Conversación con el agente — medición 2026-09-23

## A · Envío por silencio (`envioMs`)

Sesión sintética de 10 turnos por `dictar --entrada` a tiempo real: cada turno es una frase partida por una pausa de pensamiento (2 turnos por pausa), con 6 s de cola. Voz es_MX-claude-high a 0.9, motor y respaldo por defecto, VAD a 1000 ms.

| pausa | turno | ¿la partió el VAD? | hueco pegado → voz nueva |
|---|---|---|---|
| 1000 ms | 1 | sí | -84 ms |
| 1000 ms | 2 | sí | 39 ms |
| 1500 ms | 3 | sí | 494 ms |
| 1500 ms | 4 | sí | 370 ms |
| 2000 ms | 5 | sí | 893 ms |
| 2000 ms | 6 | sí | 994 ms |
| 2500 ms | 7 | sí | 1507 ms |
| 2500 ms | 8 | sí | 1458 ms |
| 3000 ms | 9 | sí | 1885 ms |
| 3000 ms | 10 | sí | 1878 ms |

Hueco máximo con pausas ≤ 2 s: **994 ms**; margen 400 ms (p95 − p50 de la latencia del motor en la tabla de motores).

| envioMs | falsos envíos (pausa ≤ 2 s) | falsos (2,5-3 s) | turnos enviados | fin de habla → Enter p50 |
|---|---|---|---|---|
| 1000 | 0 | 4 | 10/10 | 1165 ms |
| 1500 | 0 | 2 | 10/10 | 1670 ms |
| 2000 | 0 | 0 | 10/10 | 2174 ms |

**Elegido: `envioMs` = 1500 ms** (el menor con 0 falsos envíos hasta 2 s, 10/10 turnos enviados y por encima del hueco máximo más el margen).

## B · Half-duplex: la puerta del micrófono cerrada mientras habla el agente

10 respuestas por el socket local por cada margen, micrófono de WSLg y altavoz de Windows reales. La captura no se para: se cierra la puerta lógica (nada entra al detector) y se reabre tras la voz más el margen. Fuga = texto transcrito tras reabrir.

| margen tras la voz | fugas (texto parecido a la frase del agente) | primer audio p50 desde la petición (desde que el hablante arranca) | reapertura p50 / máx | voz detectada tras reabrir (ms desde la reapertura; pico) |
|---|---|---|---|---|
| 0 ms | **0/10** de la voz del agente (2 textos ajenos de la sala: «No es importante.», «de los actores más importantes») | 5024 ms (64 ms) | 1 / 2 ms | 11 (3728 ms, 601 ms, 726 ms, 169 ms, 900 ms, 3303 ms, 8 ms, 513 ms, 373 ms, 2724 ms, 970 ms; -41.6 dBFS, -36.2 dBFS, -34.4 dBFS, -38.8 dBFS) |
| 50 ms | **0/10** de la voz del agente (1 texto ajeno de la sala: «¡Suscríbete!») | 5036 ms (68 ms) | 50 / 51 ms | 12 (415 ms, 2536 ms, 269 ms, 2468 ms, 909 ms, 406 ms, 3546 ms, 1916 ms, 3806 ms, 743 ms, 434 ms, 3426 ms; -50 dBFS, -34.7 dBFS, -38.8 dBFS) |
| 100 ms | **0/10** de la voz del agente (ningún texto ajeno) | 4067 ms (63 ms) | 100 / 101 ms | 8 (398 ms, 1038 ms, 695 ms, 301 ms, 1282 ms, 670 ms, 503 ms, 80 ms; -37.5 dBFS, -44 dBFS) |
| 150 ms | **0/10** de la voz del agente (ningún texto ajeno) | 5045 ms (60 ms) | 150 / 151 ms | 9 (801 ms, 1768 ms, 3755 ms, 530 ms, 419 ms, 1149 ms, 721 ms, 2870 ms, 662 ms; -39.7 dBFS) |

**Control** (misma voz por otro proceso, micrófono abierto, sin conversación): 0/10 respuestas transcritas como la frase del agente, 7 «sin voz» (el VAD abrió y el motor no sacó texto), pico p50 -37.6 dBFS. La sala **sí oye** el altavoz: los ceros de arriba son mérito del half-duplex.

**Corridas previas del mismo día (2026-09-23), con el código que aún paraba la captura:** micrófono `cerrado` (ffmpeg parado y rearrancado) frente a solo la puerta lógica, 10 respuestas cada uno, sala en silencio: fugas de la voz 0/10 y 0/10 (un texto ajeno, «Documental.»); primer audio p50 267 ms (esperando al cierre de ffmpeg; la síntesis ya se solapaba) frente a 56 ms; reapertura p50 249 ms frente a 151 ms; el VAD se abrió tras reabrir 1 vez frente a 0. Por eso la captura ya no se para.

La «voz detectada tras reabrir» que no coincide con la frase del agente y llega a instantes sueltos del hueco de 4 s es la sala (otra fuente sonando), no la cola de la voz: cuenta igual, porque con la sala sonando el agente espera al cierre de ese «turno» (RF-40, tope 5 s) antes de hablar, y eso es lo que infla el «primer audio desde la petición». Subir `umbralVozDb` es el mando para una sala con ruido.

## C · Hook `Stop`: el agente habla sin que se lo pidan

`scripts/habla-respuesta.sh` con el JSON del arnés por stdin, 10 veces por situación, contra un socket falso que tarda 4 s en «sonar» (sin audio). RF-43 exige < 100 ms sin dictado o con la conversación apagada; RF-42, que el texto llegue y el hook no espere a la voz.

| situación (saludo del dictado) | salida p50 / máx | textos recibidos | salidas ≠ 0 | con stdout |
|---|---|---|---|---|
| sin dictado | 3 / 5 ms | 0/10 | 0 | 0 |
| conversación apagada (off escuchando) | 3 / 4 ms | 0/10 | 0 | 0 |
| dictado inactivo (on inactivo) | 3 / 4 ms | 0/10 | 0 | 0 |
| conversación encendida (on escuchando) | 51 / 52 ms | 10/10 | 0 | 0 |
| encendida, a media frase (on transcribiendo) | 50 / 51 ms | 10/10 | 0 | 0 |

Lo que llega al socket con la respuesta de prueba (lista y pregunta final incluidas en el markdown): «Listo. El envío por silencio ya está medido y el valor por defecto sale de la medición. ¿Sigo con la siguiente fase?».
