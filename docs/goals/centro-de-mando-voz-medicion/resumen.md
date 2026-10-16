# Medición del centro de mando por voz

**Medido el 2026-10-16** (WSL2, Ryzen 7 5700G, sin GPU; Chromium headless 1243 con micrófono falso). Tres corridas con el código final de cada camino. Órdenes y conversación: la primera. Interrupción y eco: la tercera, tras bajar la confirmación de la interrupción de 150 a 120 ms (con 150, un «Para.» de 230 ms con la puerta de eco encima no cortó 3 de 4 veces en la sonda); eso solo toca la interrupción y el eco, así que esas dos fases se repitieron (16 cortes y 6 turnos con eco) y las órdenes y la conversación se conservan. Verdad de terreno: el fin de la voz inyectada en el micrófono falso; «suena»: la primera subida por encima de −45 dBFS de lo que sale por los `<audio>` del HUD, tomada por `captureStream` (cota conservadora: esa tubería añade unos 100-150 ms). «HUD» es lo que dice su propia telemetría (evento `playing` + silencio inicial).

| Del fin real del habla al primer audio que suena | n | p50 | p95 | rango | según el HUD (p50 · p95) |
|---|---|---|---|---|---|
| Orden local, sin LLM | 32 | **644 ms** | **802 ms** | 583 ms – 1085 ms | 550 ms · 676 ms |
| Conversación con el cerebro | 12 | **1895 ms** | **2644 ms** | 1737 ms – 2644 ms | 1788 ms · 2544 ms |

| Interrupción | Medido |
|---|---|
| «Para.» dicho encima: cortes que callaron la salida | **16 de 16** |
| Reacción (primera muestra de «Para.» → la salida calla) | p50 **208 ms** · p95 268 ms |
| Frases del turno INTERRUMPIDO que empezaron a sonar después de callar (atribuidas por turno) | **0** |
| Respuestas nuevas tras un «para» mal oído («But», «Lara.»): la regla «interrupción corta que no se entiende = para» | **0** |
| Auto-interrupciones con eco residual a -20 dB y SIN cancelación de eco | **0 de 6** respuestas |
| Desvío del fin real según el HUD contra la verdad (p50 · p95) | -24 ms · -8 ms |

| Enrutador (`local-reglas-0.3`) | Acierto | Órdenes equivocadas | Conversación tomada por orden | Escrituras perdidas |
|---|---|---|---|---|
| Texto, corpus A (110) | 89.1 % | 0 | 0 | 0 |
| Texto, corpus B (65), visto al ajustar la 0.3 | 75.4 % | 0 | 0 | 0 |
| Texto, corpus C (53), **nunca visto al ajustar** | 75.5 % | 0 | 0 | 0 |
| Audio (voz Piper → motor local → enrutador), corpus A, 2 voces (220) | 81.4 % | 2 | 0 | 5 |

Palabra de activación «oye mando» por audio (3 voces Piper, motor local, umbral 0,8): **26/30 detectadas** y **3/45 falsas** en 86 s de habla sin la frase. Barrido del umbral (detectadas · falsas): 0.75 → 29 · 11; 0.8 → 26 · 3; 0.85 → 26 · 3; 0.9 → 23 · 0. Falsos disparos por hora en una sala real: **no medido** (no hay horas de audio de fondo).

Gasto de OpenRouter de todo el goal: **US$0.0266** de un tope de US$1 (el mayor de dos cuentas). Libro del HUD, 214 llamadas con el coste que informa el proveedor: US$0.0266 (1 abortada con coste `null`, no cero). Contador de la llave, antes → después: US$11.7008 → US$11.7176 = US$0.0168 (OpenRouter lo actualiza con retraso). Saldo de la cuenta US$2.59 → US$2.57.
