# @tu-scope/bucle-voz

El bucle de un asistente de voz local: escucha, entiende, contesta en flujo y se calla cuando le hablas encima, con la latencia contada desde que de verdad dejas de hablar.

## Qué hace y qué no

| Hace | No hace |
|---|---|
| Lleva el turno entero con **identificador y cancelación**: abrir otro turno o interrumpir aborta transcripción, cerebro y voz en vuelo, y lo que llegue tarde se tira | **Oír ni hablar**: el micrófono y el detector los pone `@tu-scope/voz`; la transcripción y la voz, quien los inyecte (el demonio de `@tu-scope/dictado` en el template) |
| **Interrupción** con el micrófono abierto: atenúa al primer marco de voz, corta a los 120 ms de voz casi continua, y una **puerta de eco** evita que su propia voz la interrumpa | Cancelar el eco del todo: se apoya en la del navegador y pone su puerta encima |
| **Enrutador sin LLM**: las órdenes (callar, repetir, velocidad, hora, agenda…) se resuelven en local; la conversación y **lo dudoso** van al cerebro; lo que **escribiría** queda en dry-run | **Ejecutar escrituras**: ni con «confirmo». Las órdenes que ejecuta son de lectura o de control del propio bucle |
| **Separador de frases** para la voz en flujo: primer trozo pronto, sin partir decimales, miles, horas, abreviaturas ni iniciales | Elegir el modelo: el cerebro se inyecta y el modelo lo fija el routing de quien lo usa |
| **Especulación y corte por sentido**: transcribe y prepara la respuesta en la primera pausa; una orden segura cierra antes, una frase abierta («…y») espera | Corte por sentido con modelo: el juez por texto es la línea base; Smart Turn se enchufa en el mismo sitio (no medido aquí) |
| **Palabra de activación por texto local**, con acentos, ñ y límites Unicode | Detectar la palabra en el audio sin transcribir (no hay modelo local en español sin llave; ver la medición) |
| **Telemetría honesta**: del fin real del habla (con el cierre del VAD dentro) a la primera muestra que **suena** | Medir sola: las cifras salen de la medición del template (`scripts/centro-de-mando/mide.ts`) |
| Cerebro en flujo por cualquier API compatible con OpenAI (`./openrouter`), con costo por llamada y modelo pineado | Mandar audio a ningún sitio: el núcleo no hace red; el único que sale es el texto que el enrutador manda al cerebro |

## Casos de uso

- **Un centro de mando por voz** que contesta órdenes en menos de un segundo y piensa lo demás en flujo: el HUD
  `/centro-de-mando` del template, rehecho desde el command-center de business-os.
- **El laboratorio de voz** y cualquier pantalla que ya escucha con `voz`: el mismo turno, la misma interrupción y la
  misma telemetría, sin reescribir la contabilidad de cada uno.
- **Los productos que hablan** (el vendedor por WhatsApp con nota de voz, el asesor por voz): el separador, el
  enrutador y el cerebro en flujo sirven igual sin micrófono, con el audio que llegue.
- **Comparar enrutadores** (la línea base local contra Jev u otro): misma interfaz `Enrutador`, mismo corpus
  (`medicion/corpus-enrutador*.json`).

## Requerimientos de infraestructura

- **Runtime**: Node `>=22.18` (`engines`) o cualquier navegador moderno; el núcleo es TypeScript puro sin
  dependencias. `./navegador` necesita `<audio>`, `URL.createObjectURL` y `requestAnimationFrame`.
- **Dependencias del sistema**: ninguna. Lo que oye y habla se inyecta (`@tu-scope/voz` 0.6.0 y `@tu-scope/dictado`
  0.2.0 en el template; ninguna es dependencia del paquete).
- **CPU, GPU y memoria**: el núcleo no calcula nada pesado (no medido aparte); el costo está en los motores que se
  inyectan: medido en la medición de abajo, en un Ryzen 7 5700G sin GPU.
- **Servicios externos**: ninguno en el núcleo. Con `./openrouter`, la API de chat que se le dé (OpenRouter en el
  template), solo para la conversación.
- **Variables de entorno**: ninguna. La llave y el modelo se inyectan; el template lee `OPENROUTER_API_KEY` y
  `DICTADO_MOVIL_TOKEN` en su servidor, nunca aquí.
- **Almacenamiento**: nada. La telemetría y el historial viven en memoria; persistirlos es decisión de quien lo usa.
- **Salida del perímetro (C4)**: el audio nunca sale. El texto sale solo hacia el cerebro y solo si el enrutador lo
  manda (conversación o duda); las órdenes no salen. Qué proveedor y con qué decisión de flujo de datos es del
  proyecto que lo usa.

## Instalar

```bash
npm run empaqueta bucle-voz   # desde la raíz del template: contrato + build + tarball + proyecto limpio
npm install <ruta>/tools/bucle-voz/tu-scope-bucle-voz-0.1.0.tgz
```

En el consumidor, la versión va **exacta** (`"@tu-scope/bucle-voz": "0.1.0"`), nunca `^` ni `latest`.

| Subpath | Qué trae |
|---|---|
| `.` | `creaBucle`, `creaOido`, turnos, canal de voz, separador, enrutador y catálogo en español, activación, interrupción, corte por sentido, telemetría, reloj de audio, hora en letra, PCM/WAV |
| `./openrouter` | `creaCerebroCompat` (flujo SSE, costo, pineo) y `leeSse` |
| `./navegador` | `creaReproductorNavegador`: `<audio>` nativo, karaoke, atenuar, velocidad sin cambiar el tono |

## Uso

```ts
import { creaBucle, creaOido, creaEnrutadorLocal, creaActivacion, ORDENES_ES, nivelDb } from '@tu-scope/bucle-voz';
import { creaReproductorNavegador } from '@tu-scope/bucle-voz/navegador';
import { capturaMicrofono } from '@tu-scope/voz/browser';
import { creaDetectorVoz, modeloEnergia } from '@tu-scope/voz';

const reproductor = creaReproductorNavegador();
const bucle = creaBucle({
  modo: 'manos-libres',                     // o 'palabra' (con `activacion`) o 'toque'
  transcriptor, sintetizador, cerebro, lector, // tus puertos: el demonio local, tu cerebro, tus lecturas
  reproductor,
  enrutador: creaEnrutadorLocal({ ordenes: ORDENES_ES }),
  activacion: creaActivacion({ frases: ['oye mando'] }),
  reloj: () => performance.now(),
});
const detector = creaDetectorVoz({ modelo: modeloEnergia({ frecuenciaHz: 16_000, marcosCalibracion: 9 }), msSilencioParaCerrar: 600, conservaAudio: true });
const oido = creaOido({ bucle, hz: 16_000, msSilencioCierre: 600, maquinaHabla: () => reproductor.sonando, atenua: (a) => reproductor.atenua(a), nivelSalidaDb: () => reproductor.nivelDb() });
await capturaMicrofono({
  frecuenciaHz: 16_000,
  restricciones: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
  alRecibir: async (m) => { oido.alimenta(m, performance.now()); oido.procesa(await detector.procesa(m), nivelDb(m)); },
});
bucle.suscribe((e) => console.log(e));      // estado, oido, decision, frase, karaoke, interrumpido, aviso…
```

El montaje completo (puertos contra el demonio de `dictado`, el cerebro por OpenRouter, la interfaz) es
`src/features/centro-de-mando` del template.

## Cómo está hecho

Un turno, un identificador. Todo lo asíncrono del turno (transcripción, cerebro, cada frase de voz) recibe su
`AbortSignal`; abrir otro turno o interrumpir lo aborta, y lo que llega tarde se compara con `vigente(id)` y se tira.
El micrófono no se cierra nunca: escuchar es un estado lógico.

```
voz del micrófono ─▶ detector (voz) ─▶ oído ──pausa──▶ turno tentativo: transcribe ▶ enruta ▶ prepara (retenido)
                                          │                     │ la voz sigue → se aborta
                                          ├──cierre VAD/sentido─┴▶ confirma ▶ suena
                                          └──voz con la máquina hablando ─▶ interrupción (puerta de eco) ▶ aborta todo
```

Lo que se tomó de la fuente (business-os `command-center`, MIT, `LICENSE-FUENTE`) y lo que se rediseñó:

| De la fuente | Aquí |
|---|---|
| Voz por oración, pedida en paralelo y encolada en orden | Igual, con tope de concurrencia, reintento y aviso si una frase falla (allí se perdía sin aviso) |
| `<audio>` + `MediaElementSource` para la velocidad sin cambiar el tono | `<audio>` nativo con `preservesPitch`, sin pasar por Web Audio (Chrome no cancela el eco de Web Audio) |
| Separador ávido | Avanza por posición (allí «Sí.» al inicio bloqueaba todo) y no parte decimales ni abreviaturas |
| `\b` ASCII en la palabra de activación, Web Speech de Google | Límites Unicode, frase al inicio, filtro de eco, y el texto lo transcribe la máquina |
| Telemetría desde que el VAD decide hasta que se encola | Desde el fin real del habla hasta que suena, con el cierre del VAD dentro |
| Sin id de turno; el micrófono se cerraba al hablar (la interrupción por voz era código muerto) | Id de turno y cancelación; micrófono abierto, interrupción con puerta de eco |
| Re-anclar los relojes al volver a la pestaña | `creaRelojAudio().reinicia()` en `visibilitychange` |

## Los mandos que de verdad importan

| Mando | Qué pasa si te equivocas |
|---|---|
| `msSilencioCierre` del detector (600 ms en el HUD) | Corto: parte frases (500 ms parte el 17 %, 700 el 6,7 %; medición de `dictado`). Largo: cada respuesta espera ese silencio. Las órdenes seguras cierran antes por sentido |
| `msPausa` del oído (200 ms) | Bajo: especula en cada respiración y aborta mucho (barato en local, centavos con el cerebro preventivo). Alto: la especulación no llega antes del cierre |
| `msConfirmacion` de la interrupción (120 ms: cuatro marcos sobre la puerta de eco) | Bajo: una tos te calla la respuesta. Alto: un «¡para!» corto no corta (con 150 ms, uno de 230 ms no cortó 3 de 4 veces) |
| `margenDb` de la puerta de eco (6 dB) | Bajo: su propia voz por los altavoces la interrumpe. Alto: no oye a quien le habla bajito encima |
| La referencia de la puerta (`nivelReferenciaEcoDb`: máximo de lo que sonó en [−300, +200] ms) | Con el nivel del instante, el eco de la sílaba anterior pasa por voz en cada pausa (medido: 6 de 6 auto-interrupciones a −20 dB sin cancelación de eco; con la ventana, 0) |
| `umbralOrden` / `umbralDudoso` del enrutador (0,8 / 0,55) | Bajar el primero ejecuta órdenes equivocadas (el error caro); subirlo manda más órdenes al cerebro (el error barato) |
| `umbral` de la activación (0,8) | Ver el barrido de la medición: a 0,75 despierta con «Armando», a 0,9 se le escapa una de cada cuatro |
| `cerebroPreventivo` (encendido) | Apagado: el cerebro espera al cierre (más lento). Encendido: arranca en la pausa y se aborta si la voz sigue |

## Medición

<!-- MEDICION -->
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
<!-- /MEDICION -->

## Pruebas

```bash
npm run prueba        # en tools/bucle-voz: build + node --test pruebas/*.ts, sin red, sin audio y sin modelos
```

Cubren: un turno viejo nunca suena en el nuevo (transcripción, cerebro y voz que llegan tarde); interrumpir aborta
cerebro y voz en vuelo y el historial guarda solo lo oído; ESC durante la transcripción; frases en paralelo que suenan
en orden; fallo de voz avisado; orden sin cerebro, conversación y dudoso al cerebro, escritura en dry-run; especulación
reutilizada y abortada; cierre por sentido (orden segura y frase abierta); telemetría desde el fin real; eco que no
abre turno; modo palabra con ventana de seguimiento; separador (decimales, miles, horas, abreviaturas, iniciales,
suspensivos, URL, primer trozo, markdown); enrutador; activación con acentos y ñ; interrupción con puerta de eco;
oído (reloj de audio, pausa, reanudación, cierre); cerebro SSE (costo, errores sin llave, pineo); hora y PCM.

## Licencia

Porta ideas y parámetros del HUD `command-center` de `lisagomez/business-os-new` (commit `749d89e`), con licencia
MIT: el aviso va en `LICENSE-FUENTE` y viaja en el paquete.

## Cambios

- **0.1.0** (2026-10-16): primera versión, sin publicar.
