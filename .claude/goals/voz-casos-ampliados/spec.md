# Voz: casos ampliados — Spec (Etapa 3)

Compilado por `/goal-compiler` el 2026-09-20 desde el plan de producto aprobado. Forma: **LOOP**.
Lo que se pega en `/goal` es `goal.txt`, NO este archivo. Sigue a `voz-lista-para-usuarios`
(Etapas 0 y 1, PRs #129-#131) y `voz-terceros` (Etapa 2, PR #133): sus `resultados-*.md` y
`post-mortem.md` se leen antes de empezar.

## MISION

Que la voz pase de «lista para terceros» a «casos ampliados»: la máquina habla en tiempo real
(voz en flujo frase a frase desde el demonio) y se calla si le hablas; el voz picking aguanta
cantidades, unidades, reintentos y un «no»; la educación mide muletillas y pausas contra una
verdad de terreno y dice cuándo no puede medir; el campo tiene condiciones de ruido con SNR
declarado, y la ganancia automática está medida; y las llamadas en vivo quedan preparadas con
gobierno: un spike con audio propio y los tres borradores para firma, sin conectar nada real.
Horizonte (fuera de este goal): el ayudante de Windows para capturar llamadas, Silero en el
navegador si el detector por energía no basta, y el piloto con voz propia.

## LIBERTAD TECNICA

Tú eliges el formato del flujo de audio, cómo suena en el navegador, la máquina de estados de
la interrupción, la gramática de cantidades y los filtros de ruido. `tools/voz`,
`tools/dictado`, `tools/asesor-ventas`, el laboratorio y `scripts/laboratorio-voz/*` se
extienden con prueba, no se reescriben. Las propuestas de cada mejora (abajo) son el punto de
partida razonado; si mides algo mejor, hazlo y explícalo.

## INVESTIGA ANTES DE CONSTRUIR

Lee `tools/dictado/src/node/habla.ts`, `tools/dictado/servicio/servidor.mjs` y
`configuracion.mjs`, `tools/dictado/scripts/demonio.mjs`, `tools/voz/src/index.ts`,
`tools/voz/src/browser/index.ts`, `tools/voz/src/canales/por-canal.ts`,
`src/shared/lib/transcriptor-local.ts`, los paneles de FAQ, picking, competencias y puerta,
`services/picking.ts`, `services/texto.ts`, `services/competencias.ts`,
`tools/dictado/medicion/fabrica-corpus.mjs` y `calibra.mjs`, y
`.claude/gobernanza/plantillas/modelo-amenazas.md` y `aisia.md`. Corre las piezas a mano
antes de diseñar. Reafirma el objetivo en una línea antes de cada edición grande.

## DEFINICION DE HECHO (evidencia visible en la conversacion)

- Último output del comando de validación pegado, en verde; `npm run validate` en verde al final.
- Tabla p50/p95 del primer trozo de voz por HTTP (10 textos al demonio) y capturas Playwright
  de FAQ y picking con la primera frase audible desde el clic, la vuelta pregunta → respuesta
  hablada (meta < 1 s) y la vía (demonio o CLI).
- Interrupción medida con tres micrófonos falsos: 0 falsas con silencio, ≥ 9/10 detectadas con
  voz limpia, reacción p50 < 300 ms; la condición con ruido reportada sin promesa.
- Gramática de cantidades con ≥ 40 casos en verde y la tabla de picking con ~480 confirmaciones
  sintéticas (dos voces, limpio y almacén): 0 confirmaciones erróneas, rechazos falsos ≤ 5 %.
- Tabla de muletillas (recall y precisión por motor y voz) con la decisión escrita según la
  regla, y captura del caso 10 con rúbrica orientativa y aviso de menores.
- Tabla de campo: WER por condición y SNR, VAD (partidas, comidas, fantasmas) y ganancia
  automática, con el umbral honesto escrito y la propuesta de bitácora para todo defecto que
  cambie (fuera del registro).
- Spike de dos canales con audio propio: etiquetado, WER, latencia fin de turno → insight; y
  los tres borradores de llamadas (modelo de amenazas, AISIA, aviso legal) sin «pendiente».
- Tabla de casos y piezas del laboratorio que cambiaron de estado; reporte de decisiones; lista
  de formas en que podría estar mal, resueltas.

## COMANDO DE VALIDACION

`npm run typecheck && npm run lint && (cd tools/dictado && npm run prueba) && npm run prueba:laboratorio`
tras cada cambio grande, con el output pegado. `npm run validate` antes de cerrar. Mediciones
sin otra carga en la máquina (una calibración en paralelo infló una latencia el 2026-09-20).
Para capturas: `npm run build && npx next start -H 0.0.0.0 -p 3000`.

## RESTRICCIONES REALES

- Nada sale de la máquina (C4). Ningún LLM.
- Ningún modelo nuevo ni Silero en el navegador sin CDC aprobado: el detector de interrupción
  va por energía; Silero en navegador se PROPONE si las cifras lo piden.
- Ninguna llamada de terceros, ni Zoom/Meet/Teams, ni el ayudante de Windows: solo el spike con
  audio propio y los borradores.
- Menores solo tras AISIA firmada: el caso 10 lo dice y no detecta edades.
- Secretos jamás en pantalla; los borradores de gobernanza van en `propuestas/` de esta carpeta,
  nunca en los registros, y nunca con la palabra «pendiente» dentro de una bitácora.
- No se tocan `settings.json`, skills ni prompts. Cambiar un defecto (ganancia, umbrales) es
  propuesta de bitácora para firma.
- Todo lo que lee una persona, en español sin jerga. Probar con build de producción.

---

# El plan de la Etapa 3 que este spec compila

Forma: **LOOP**, un ejecutor. Orden sugerido por dependencias: 3.2 → 3.5 (solo el corpus) →
3.3 → 3.4 → 3.1 → cierre. Todo se mide con el demonio arriba y sin otra carga en la máquina.
Regla transversal: el agente no escribe en `.claude/gobernanza/*`; toda entrada de bitácora,
AISIA o modelo de amenazas se redacta en `.claude/goals/voz-casos-ampliados/propuestas/` y se
pega tras la firma. Sin piloto con voz propia todavía: las cifras de precisión siguen siendo
sintéticas y se etiquetan así.

## Hechos que fijan el diseño

- `voz.sintetiza(texto, alTrozo)` en `tools/dictado/src/node/habla.ts` ya entrega cada frase como
  `Float32Array` por callback sin altavoz (`maxNumSentences: 1`); `floatAPcm16` está exportado.
  El servicio HTTP solo tiene `/health` y `/transcribir`; `configuracion.mjs` ya carga
  `sherpa-onnx-node` y el dist de dictado, pero no las voces Piper (están en el banco).
- `@tu-scope/voz` exporta `creaDetectorVoz` y `modeloEnergia` (sin modelo ni onnxruntime);
  `@tu-scope/voz/browser` exporta `capturaMicrofono` con AudioWorklet y remuestreo. Silero en
  navegador exigiría `onnxruntime-web` (no instalado) y el peso en `public/`: CDC.
- PulseAudio de WSLg solo expone `RDPSource` (micrófono) y `RDPSink.monitor` (lo que WSL
  reproduce): el audio de Zoom/Teams en Windows no pasa por ahí. Capturar una llamada exige un
  ayudante del lado Windows que no existe. `creaDetectorPorCanal` de `voz` existe pero pide los
  canales ya separados.
- `primerNumero` cubre 0–999 (centenas hasta «quinientos»), sin decimales ni colectivos, y está
  duplicado en `calibra.mjs`. `evaluaConfirmacion` no entiende «no» ni limita reintentos.
- `competencias.ts` cuenta muletillas sobre la transcripción; Parakeet tiende a omitirlas y no
  hay verdad de terreno. `faster-whisper:small` ya está en el banco (no es modelo nuevo).
- El corpus tiene `limpio`, `ruido` (rosa, sin SNR declarado: dio menos WER que limpio, señal
  de que es demasiado bajo) y `celular`; nada de calle, taller, almacén ni reverberación.

## Plan por mejora (problema → propuesta → criterio → gate → tamaño · quién)

**3.2 La máquina habla en tiempo real.** Hoy `/api/laboratorio/sintetizar` arranca el CLI, hace
el WAV entero y el navegador no oye nada hasta la última frase (> 3 s por respuesta).
→ `POST /sintetizar` en el demonio (`servicio/servidor.mjs`, mismo Bearer y semáforo): JSON
`{texto ≤ 2000, voz?, velocidad?}`, respuesta chunked PCM16LE mono con `x-frecuencia-hz`,
`x-voz`; cada frase de `alTrozo` sale al instante; `GET /voces`; `configuracion.mjs` carga
`DICTADO_VOCES` desde `DICTADO_MODELOS/vits-piper-*` solo si existen (jamás descarga);
`demonio.mjs` pasa las voces del banco. En la app, `transcriptor-local.ts` gana
`sintetizaEnFlujo()` y una ruta `sintetizar-flujo` que hace proxy del stream y cae al CLI
(PCM por ffmpeg `-f s16le`, nunca WAV por tubería) con `x-via`. En el navegador, `AudioContext`
creado en el clic y `AudioBufferSourceNode` encadenados frase a frase; hook
`use-voz-en-flujo.ts` con `msPrimerAudio` desde el clic, `via` y `detiene()`. FAQ y picking lo
usan; `/api/laboratorio/sintetizar` se queda para locución y muestras.
Barge-in: `hooks/use-interrupcion.ts` + `services/interrupcion.ts` (máquina de estados pura):
mientras la máquina habla, `capturaMicrofono` de `voz/browser` con `echoCancellation: true` y
`creaDetectorVoz({modelo: modeloEnergia(), msMinimoHabla: 150, msSilencioParaCerrar: 700})`;
calibración de suelo 300 ms con la máquina sonando; al `inicioHabla` se arma 150 ms y solo si
sigue hablando se llama `detiene()`; al `finHabla` el turno (16 kHz → `escribeWavPcm16`) va a
`stt.corre` y la conversación sigue manos libres. Aviso honesto: detector por energía, para
auriculares o micrófono cercano. Límite escrito: si con ruido las falsas o perdidas superan
1/10, se propone Silero en navegador como CDC.
Medición `scripts/laboratorio-voz/mide-voz-en-flujo.mjs`: 10 textos al demonio (p50/p95 del
primer trozo) y tres Chromium con micrófono falso sin bucle (silencio, voz limpia a los 2 s,
voz + ruido rosa) leyendo `data-prueba="metricas-voz" | "vuelta" | "interrupcion"`.
Criterio: primer trozo p50 < 150 ms por HTTP; primera frase audible p50 < 300 ms vía demonio;
vuelta p50 < 1 s; 0/3 falsas en silencio, ≥ 9/10 detectadas con voz limpia, reacción p50
< 300 ms; ruido reportado sin promesa; pruebas puras (PCM con resto impar, máquina de estados
con reloj falso). Gate: ninguno (loopback, mismo Bearer). **L · Agente.**

**3.3 Picking robusto.** → Gramática única `tools/dictado/src/texto/numeros.ts`
(`parseaCantidad → {valor, unidad?, forma}`): unidades, decenas con y sin «y», centenas
completas, «mil»/«N mil» hasta 9 999, cifras con separador es-MX, decimales («coma cinco», «y
medio», «y cuarto»), colectivos (media docena, docena, par, decena, ciento, millar) y unidades
habituales capturadas sin consumir el número; `primerNumero` delega y `calibra.mjs` deja su
copia. `services/picking.ts`: veredictos `ok` (cantidad igual o «sí» a solas), `no` (con
cantidad parcial), `cantidad-distinta`, `unidad-distinta`, `repetir`, `no-entendi`;
`creaSesionPicking(pedido)` pura con 3 intentos por línea y paso a «a mano», incidencias e
historial; `PEDIDO_MUESTRA` a 20 líneas con cantidades y unidades variadas; panel con
contador, incidencias y manos libres por barge-in. Medición `mide-picking.mjs`: por línea,
formas habladas (canónica, con unidad, colectivo, «son N», «sí», «no, faltan», distractor N±2)
con las dos voces en `limpio` y `almacen` → demonio → `evaluaConfirmacion` → matriz esperado ×
obtenido. Criterio: ≥ 40 casos de gramática en verde; **0 confirmaciones erróneas** en ~480
locuciones; rechazos falsos ≤ 5 % en limpio; paso Playwright que llega a la línea 2 con
micrófono falso. Queda a mano: SKUs reales, > 9 999, multiplicativos, WMS (irreversible). Gate:
ninguno. **M · Agente.**

**3.4 Educación.** → `fabrica-corpus.mjs --muletillas`: 6 guiones de ~45 s (uno de control)
con muletillas insertadas en conteo conocido y pausas de 1,8 s → WAV por voz + verdad.
`mide-competencias.mjs`: `lote --hablantes 1` con el demonio y segundo pase con
`faster-whisper:small` (ya en el banco) → recall y precisión por muletilla, pausas, ppm; la
decisión escrita: recall ≥ 80 % y precisión ≥ 90 % → se muestra con ese motor; solo Whisper →
opción «medir con el segundo motor» (lista cerrada en `transcribeConTiempos`); ninguno →
`muletillas: 'no-medible'` y el panel lo dice. Rúbrica orientativa por franjas, «no es
calificación», nunca un número global. Caso 10: «adultos; menores solo con AISIA firmada».
Borrador `propuestas/AISIA-educacion-menores.md` con decisión «no ofrecer a menores hasta
firma». Criterio: tabla por motor y voz con la línea de decisión; pruebas de rúbrica y de
«no medible»; captura del caso 10; borrador listo. Gate: firma de la AISIA; bitácora si el
caso 10 activa el segundo motor. **M · Agente redacta, humano firma.**

**3.5 Campo.** → `fabrica-corpus.mjs --campo` con ffmpeg sobre `limpio-NN.wav`: `calle`
(brown grave + tremolo lento), `taller` (rosa + zumbido 50/100 Hz + banda de 3 kHz
intermitente), `almacen` (babble de otras voces del corpus a −18 dB + `aecho` de nave),
`reverb`, barrido `snr20/10/05/00` para rosa y babble con amplitud calculada desde el RMS de
la voz (`amplitudPara(snrDb, vozDb)` pura), y variantes `flojo` (−24 dB) y `fuerte` (+12 dB
limitado) para la ganancia. `calibra.mjs`: WER por condición sale sola; barrido del VAD
acotado a `limpio`, `snr10`, `snr00`, `almacen`; fantasmas sobre `calle` y `taller` sin voz.
`mide-ganancia.mjs`: `dictar --entrada <wav> --motor remoto` con ganancia 0 y `auto` sobre
`flojo`, `fuerte`, `limpio`, `snr10`. Tarjetas 17 y 20 con las cifras sintéticas etiquetadas.
Criterio: tabla WER × condición × SNR, VAD y ganancia; umbral honesto escrito: «usable con
auriculares» si WER < 15 % a SNR 10, «no usable» si > 25 %; fantasmas 0 sin voz; partidas
< 5 %; la ganancia auto solo se propone por defecto si mejora ≥ 3 puntos en `flojo` sin
empeorar > 0,5 en el resto. Gate: cambiar defaults o umbrales = propuesta de bitácora → firma.
**M · Agente; firma para defaults.**

**3.1 Llamadas en vivo, preparación gobernada.** No se conecta nada real. → Spike
`spike-llamada.mjs` con audio propio: las líneas por lado de `r1-discovery` montadas en dos
pistas con los silencios de la verdad → `leeAudio` → `creaDetectorPorCanal` con dos Silero (ort
del banco) en bloques de 320 ms → cada `finHabla` al demonio → `analizaTurnos`; mide latencia
fin de turno → insight, WER, etiquetado y turnos en el canal equivocado. Borradores en
`propuestas/`: `modelo-amenazas-llamadas.md` (C3: activos, fronteras, atacante O2–O6,
controles: indicador visible + tecla de corte, hash pineado, sin audio persistente, token,
kill-switch), `AISIA-llamadas.md` (C4: interlocutor que no consintió, terceros mencionados,
vendedor; consentimiento de una o dos partes según jurisdicción; decisión «no ofrecer hasta
ayudante + firmas»), `aviso-legal-grabacion.md` (revisión jurídica humana). Caso 19 del
laboratorio: «lo que se sabe hoy» (el hallazgo de WSLg) y enlace al spike; sigue PUERTA. El
ayudante de Windows (dos flujos WASAPI, DLL pineada por hash o ayudante compilado) es un PRP
nuevo y, si trae DLL, CDC. Criterio: spike con etiquetado 100 %, WER < 10 %, insight p50
< 1,5 s, 0 turnos en canal equivocado; tres borradores sin «pendiente». Gate: C3 + C4 + aviso
legal + decisión del ayudante. **S + S · Agente redacta y mide; humanos firman.**

## Mediciones de esta etapa

| Métrica | Cómo se captura | Umbral |
|---|---|---|
| Primer trozo de voz por HTTP | `mide-voz-en-flujo.mjs`, 10 textos | p50 < 150 ms |
| Primera frase audible desde el clic (FAQ, picking) | Playwright, `metricas-voz` | p50 < 300 ms vía demonio |
| Vuelta pregunta → respuesta hablada | `vuelta`, FAQ y picking con micrófono falso | p50 < 1 s |
| Interrupción: reacción, falsas, perdidas | `interrupcion`, 3 micrófonos falsos | < 300 ms; 0/3 falsas; ≥ 9/10 con voz limpia |
| Gramática de cantidades | `node --test` | 100 % de ≥ 40 casos |
| Confirmaciones erróneas de picking | `mide-picking.mjs`, ~480 locuciones | 0; rechazos falsos ≤ 5 % limpio |
| Muletillas: recall y precisión por motor | `mide-competencias.mjs` | ≥ 80 % / ≥ 90 % para mostrar |
| WER por condición de campo y SNR | `calibra.mjs --campo` | usable < 15 % a SNR 10; > 25 % no usable |
| VAD y ganancia en campo | `calibra.mjs`, `mide-ganancia.mjs` | fantasmas 0; partidas < 5 %; +3 pt en flojo |
| Spike de dos canales | `spike-llamada.mjs` | etiquetado 100 %, WER < 10 %, insight < 1,5 s |

## Firmas, riesgos y lo que no se hará

**Firmas** (ninguna bloquea el código de 3.2 y 3.3): AISIA de menores · bitácora si el caso 10
usa el segundo motor · bitácora por defaults de ganancia o umbrales · modelo de amenazas,
AISIA y aviso legal de llamadas · CDC solo si se decide Silero en navegador · publicar.

**Riesgos:** la cancelación de eco de Chromium puede no cubrir la salida de Web Audio y la
máquina se interrumpiría sola (calibración de suelo, confirmación de 150 ms, tres micrófonos
falsos, aviso de auriculares); autoplay en headless; sherpa no cancela una síntesis en curso
(textos acotados); dos voces + Parakeet residentes ~1,5 GB; Piper no titubea, así que la
verdad de muletillas mide si el motor conserva la palabra; ruido sintético ≠ campo real, y
todas las tablas lo dicen; tamaño del chunk del cliente al importar `voz/dist/browser`.

**No se hará:** Zoom/Meet/Teams en vivo ni el ayudante de Windows (solo diseño y firmas);
ningún LLM; menores sin AISIA; macOS; GPU; Silero en navegador sin CDC; descargar pesos desde
una ruta web; cambiar umbrales sin bitácora firmada; publicar.

## Verificación de la Etapa 3 una vez ejecutada

- `npm run validate` en verde con las pruebas nuevas (gramática, PCM, interrupción, rúbrica).
- Las cinco tablas (`mide-voz-en-flujo`, `mide-picking`, `mide-competencias`, `calibra --campo`
  + `mide-ganancia`, `spike-llamada`) en `resultados-etapa-3.md` con sus umbrales.
- Capturas Playwright con micrófono falso de FAQ, picking y el caso 10.
- Tres borradores de llamadas y uno de menores en `propuestas/`, sin la palabra «pendiente».

## Archivos críticos de la Etapa 3

- `tools/dictado/servicio/servidor.mjs`, `configuracion.mjs`, `scripts/demonio.mjs` — `/sintetizar` en flujo y `/voces`
- `src/shared/lib/transcriptor-local.ts` y una ruta `sintetizar-flujo` — puente en flujo con caída al CLI
- `src/features/laboratorio-voz/hooks/use-voz-en-flujo.ts`, `use-interrupcion.ts`, `services/interrupcion.ts`, `services/pcm.ts` — reproducción frase a frase y barge-in
- `src/features/laboratorio-voz/components/paneles/panel-picking.tsx`, `panel-faq.tsx`, `panel-competencias.tsx`, `panel-puerta.tsx` — los casos que cambian
- `tools/dictado/src/texto/numeros.ts` (nuevo), `services/picking.ts`, `services/texto.ts`, `services/competencias.ts` — gramática, sesión y rúbrica
- `tools/dictado/medicion/fabrica-corpus.mjs`, `calibra.mjs`, `mide-ganancia.mjs` (nuevo) — corpus de campo y muletillas
- `scripts/laboratorio-voz/mide-voz-en-flujo.mjs`, `mide-picking.mjs`, `mide-competencias.mjs`, `spike-llamada.mjs` (nuevos) — las mediciones
- `tools/voz/dist/index.js` y `dist/browser/index.js` — `creaDetectorVoz`, `modeloEnergia`, `capturaMicrofono`, `creaDetectorPorCanal`, que se reutilizan
