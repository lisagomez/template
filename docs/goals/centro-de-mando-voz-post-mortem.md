# Post-mortem: centro de mando por voz (goal del 2026-10-16)

> Fricciones, huecos, fallas y lo que funcionó. Cada hallazgo, mapeado a una prueba, una regla o el spec. Lo que pide
> tocar `.claude/` o `AGENTS.md` va como propuesta en [`propuesta-cdc.md`](propuesta-cdc.md): aquí no se aplicó.

## Lo que falló y cómo se cazó

| # | Qué pasó | Cómo se cazó | Dónde queda |
|---|---|---|---|
| 1 | **El oído concatenaba su búfer entero de 30 s en cada trozo del micrófono** (~375 por segundo a 16 kHz). En cuanto el búfer se llenaba, el hilo principal se ahogaba: los turnos se confirmaban 13 s tarde y la medición parecía colgada. Las pruebas unitarias, de pocos segundos, nunca llegaban a llenarlo | La primera medición de punta a punta: los turnos de los primeros 30 s iban bien y los siguientes no; el volcado de eventos dio 14 s entre «confirmado» y «oído» con el servidor respondiendo en < 1 s | Cola de trozos O(1) y la prueba «alimentar es lineal: 2 minutos en trozos de 43 muestras en menos de un segundo» (`tools/bucle-voz/pruebas/oido.ts`) |
| 2 | **El token del emparejamiento por enlace se leía de `hash + search` concatenados**: con `?medicion=1` (o `?caso=6` en `/laboratorio-voz`) el token arrastraba la búsqueda y el emparejamiento fallaba con «ese token no es» | El HUD no emparejaba en Chromium; la captura lo enseñó | Arreglado en el HUD (`URLSearchParams` del hash); el mismo patrón vive en `laboratorio-voz/hooks/use-laboratorio.ts` y se arregló igual |
| 3 | **El Silero del banco no era el «v5» de la ficha: era la v6.2.** Se bajaba de `raw/master`, que se movió | Al pinear los pesos con huella: la del banco coincidía con la etiqueta `v6.2`, no con `v5.x` | Pesos a referencias inmutables con `sha256` comprobada al bajar; prueba «ninguna URL a master/main, toda huella con forma» en `voz` y `dictado` |
| 4 | **La conversión PCM16 asimétrica (×32767) seguía en `dictado/src/remoto`** aunque el aprendizaje del 2026-09-21 la había corregido en `voz/node` | El spec la listaba como cabo suelto | Misma escala que `voz` y la prueba «byte a byte igual que `floatAPcm16`» (`dictado/pruebas/node.ts`) |
| 5 | **Parakeet oye inglés en las órdenes cortas** («Para» → «But», «Más despacio» → «Must spacious»); el respaldo con idioma forzado tarda ~1,7 s | Medido con voces Piper el primer día | Anclaje de idioma: dos pasadas en paralelo, la directa y otra con «Escucha.» delante; el enrutador toma la orden más segura (`services/servidor/transcribe.ts`) |
| 6 | **El filtro de eco descartaba «confirmo» porque la máquina acababa de decir esa palabra** | Prueba del bucle en rojo | El eco solo puede EMPEZAR mientras suena o en los 250 ms siguientes (`inicioVoz`); la prueba exige un tiempo de reacción humano |
| 7 | **La toma de la medición no emitía «baja» cuando la pista capturada dejaba de entregar canales**: cada espera agotaba su tope | La medición de humo pasó de 15 min | Sin canales = silencio en el worklet (`scripts/centro-de-mando/microfono-falso.ts`) |
| 8 | **Volcar `inventario/activos.json` con `json.dumps` lo reformateó entero** (1 661 líneas de diff) | `git diff --stat` antes de seguir | Deshecho; el asiento se metió como texto. Regla para quien venga: los índices JSON del repo se editan como texto |
| 9 | **El enrutador generaliza poco a paráfrasis nunca vistas**: 89 % en el corpus con el que se ajustó, 75 % en uno escrito antes de ajustar | Protocolo de tres corpus (A, B contaminado, C nunca visto) | Las cifras van separadas en la medición; todos los fallos van al cerebro (el error barato), ninguna conversación se convierte en orden. Comparar con Jev u otro enrutador es la fase 1 de FUERA DEL HECHO |
| 10 | **«Oye, Armando» despierta a «oye mando»** (3 de 45 falsas, las tres esa frase) | Corpus de activación con confusables | Barrido del umbral publicado (0,9 → 0 falsas y 23/30); el defecto sigue en 0,8. Elegir una frase menos confusable es decisión del laboratorio |
| 11 | **Una orden cerrada por sentido que acababa antes que el VAD («Para.», que no dice nada) se atendía dos veces**: el cierre posterior del VAD abría otro turno con el mismo audio | La sonda de interrupción enseñó dos turnos «para» seguidos por cada «Para.» | El bucle recuerda el fin real ya atendido; prueba «no se repite cuando el VAD cierra» (`pruebas/bucle.ts`) |
| 12 | **Con eco residual a −20 dB y sin cancelación de eco, la máquina se interrumpía sola 6 de 6 veces.** Tres causas juntas: el nivel del micrófono era el de trozos de 2,7 ms; la pérdida de eco se «aprendía» de marcos con el micrófono en el suelo de ruido (subió a 34 dB); y el eco llegaba antes o después de lo que marcaba `currentTime` | Medición de punta a punta con eco inyectado; luego, el registro marco a marco de lo que veía la puerta (`scripts/centro-de-mando/depura-eco.ts`) | Nivel por marco del detector, aprendizaje solo de marcos con sonido y seguimiento del mínimo, referencia = máximo en [−300, +200] ms, confirmación con voz casi continua. Pruebas de eco desalineado, de suelo de ruido y de eco intermitente (`pruebas/interrupcion.ts`) |
| 13 | **La primera frase de cada respuesta del cerebro esperaba 200-500 ms antes de sonar** aunque fuera corta: la ruta de voz del laboratorio lanza un proceso para listar voces cada vez que caduca su caché de 10 s | El desglose por etapa de la telemetría («primera frase» → «voz lista») | Ruta `/api/centro-de-mando/voz` con lista cerrada de voces (80-90 ms por frase corta) |
| 14 | **El modelo ignoraba «empieza con una frase corta»**: primera frase de 60 caracteres de mediana y respuestas de 46-52 palabras, una cortada por el tope de tokens a media frase | Lectura de las respuestas reales | Tres redacciones medidas contra el modelo (US$0.00087); la elegida da 24 caracteres y ~42 palabras. Es CDC: va en la propuesta |
| 15 | **La confirmación de la interrupción subida a 200 ms sin medir** dejó de cortar con un «Para.» de 240 ms (5 marcos con voz). La medición final dio n = 0 en la fase de interrupción | Registro marco a marco (`scripts/centro-de-mando/depura-corte.ts`) | Vuelta a 150 ms, el valor que había medido el laboratorio de voz; prueba «un ¡Para! corto corta» |
| 16 | **Con 150 ms tampoco bastaba con la puerta de eco encima**: el laboratorio midió ese valor con el micrófono cerrado, y aquí el arranque y la cola de un «Para.» de 230 ms quedan por debajo de la puerta; quedaban 4 marcos encima (128 ms) y no cortó 3 de 4 veces. La captura de «interrupción después» lo enseñó: la máquina seguía hablando | La captura 06, y luego la sonda repetida (`depura-corte.ts`, 4 corridas) | 120 ms (cuatro marcos); la sonda pasó a 8 de 9, la medición de corte y eco se repitió entera; prueba con los marcos tal cual se midieron (`pruebas/interrupcion.ts`) |
| 17 | **Dos activos nuevos de clase PRODUCTO en beta sin fila en el índice del portafolio** (`BUSINESS_LOGIC.md`): el inventario se actualizó, el índice no | El `validate` tras el commit (`verify:gobernanza`, 1 de 169) | Fila «Centro de mando por voz» en el §1 como **pendiente con «falta:»**: si es producto propio o solo la referencia para business-os lo decide el laboratorio |

## Lo que funcionó

- **Medir desde fuera del HUD** (verdad de terreno en el micrófono falso, toma de lo que suena) en vez de fiarse de su
  telemetría: cazó el atasco 1 y da la cota conservadora de cada cifra; la telemetría del HUD queda contrastada (su fin
  real va ~40-60 ms por delante de la verdad: mide de más, nunca de menos).
- **La especulación + caché caliente**: transcribir y preparar en la pausa, cerrar antes las órdenes seguras y tener ya
  sintetizada la primera frase de las lecturas probables bajó las órdenes de ~900 a ~600 ms sin tocar ningún motor.
- **Primer token antes de elegir modelo**: haiku-5.5 resultó 200 ms más rápido y 10 veces más barato que el modelo del
  nivel `ligero`.

## Huecos que quedan (no se resuelven aquí)

- Sala real, voz real y la del laboratorio: todo lo medido es con voces Piper inyectadas (fase 2 de FUERA DEL HECHO).
- Corte por sentido con modelo (Smart Turn v3, ~90 % en español según su autor) en vez del juez por texto: sin medir.
- Silero en el navegador para salas con ruido: es un CDC (punto 4 de la propuesta).
- La interrupción en el dictado de escritorio WSL2 (sin cancelación de eco en WSLg) sigue fuera.
