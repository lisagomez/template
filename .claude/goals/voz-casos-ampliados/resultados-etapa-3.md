# Voz: casos ampliados — resultados de la Etapa 3 (2026-09-20)

Ejecutada en un run sobre `main` tras la Etapa 2 (PR #133). Sin piloto con voz propia todavía:
**toda cifra de precisión es sintética** (voces Piper, ruido de ffmpeg) y se dice en cada tabla.
Mediciones sin otra carga en la máquina, con el demonio arriba; los guiones están en el repo y se
repiten con un comando. Algunos archivos de medición llevan fecha 2026-09-21 porque los nombra
la fecha UTC y la sesión pasó de las 18:00 hora local.

## 3.2 La máquina habla en tiempo real

**Qué cambió.** `POST /sintetizar` y `GET /voces` en el servicio/demonio (`servicio/servidor.mjs`,
`configuracion.mjs`): PCM16LE mono en flujo, una frase por trozo, mismo Bearer y semáforo; cortar
la conexión cancela la síntesis en sherpa (el callback de progreso devuelve `false`, medido). En
la app: `sintetizaEnFlujo()` en `transcriptor-local.ts` con caída al CLI (PCM por ffmpeg, nunca
WAV por tubería) y `x-via`; ruta `/api/laboratorio/sintetizar-flujo`; hook `use-voz-en-flujo.ts`
(AudioContext en el clic, `AudioBufferSourceNode` encadenados sin hueco, `msPrimerAudio`,
`detiene()`); decodificador PCM puro con resto impar (`services/pcm.ts`). Barge-in: máquina de
estados pura `services/interrupcion.ts` (calibración 300 ms, confirmación 150 ms de voz, desarme
a 300 ms de silencio) + `use-interrupcion.ts` con `capturaMicrofono` de `tools/voz` y el
detector por energía; `use-conversacion.ts` une escucha, transcripción y respuesta hablada.
FAQ (caso 12) y picking (caso 16) lo usan; `/api/laboratorio/sintetizar` sigue para locución y
muestras.

**Primer trozo por HTTP** (`scripts/laboratorio-voz/mide-voz-en-flujo.mjs --pasos http`, 10
textos, 48 s de voz en total):

| camino | primer trozo p50 | p95 | total p50 | p95 |
|---|---|---|---|---|
| demonio `/sintetizar` | 160 ms | 173 ms | 170 ms | 348 ms |
| app `/api/laboratorio/sintetizar-flujo` (vía demonio) | 159 ms | 174 ms | 173 ms | 295 ms |

Meta: p50 < 150 ms. **Queda en 160 ms y se explica**: el primer trozo es la primera FRASE, y su
tiempo crece con su largo (~50 ms fijos + ~30 ms por segundo de audio): 44–82 ms cuando el texto
empieza con una frase corta («Buenas tardes.», «No entendí una cantidad.»), 160–173 ms cuando la
primera frase dura 4 s. Con 4 hilos; 8 no mejora y 2 empeora (medido). Partir la primera frase
por comas bajaría a ~90 ms a costa de la entonación; no se hizo. La cifra que vive la persona
es la siguiente.

**En el navegador** (Chromium headless con micrófono falso, build de producción):

| medida | FAQ (caso 12) | picking (caso 16) | meta |
|---|---|---|---|
| primera frase audible desde el clic | 259 ms | 96 ms | < 300 ms vía demonio |
| vuelta: fin del habla de la persona → primer audio de la respuesta | 440 ms (transcribir 235 + primer audio 204) | 302 ms (188 + 114) | < 1 s |
| vía | demonio | demonio | |
| errores de consola | 0 | 0 | |

El picking llegó a la línea 2 con el micrófono falso diciendo «tres unidades» a los 4 s, e
interrumpió la lectura de la línea 1 (7,3 s de voz cortada a los 4 s). Capturas:
`capturas-laboratorio/20-faq-voz-en-flujo.png`, `22-picking-manos-libres.png`.

**Interrupción** (tres micrófonos falsos sin bucle; la voz del archivo empieza a los 2 s; la
máquina lee un texto de 14 s con la escucha encendida):

| micrófono falso | se calló | reacción desde el inicio real de la voz (marca 2 s) p50 / máx | desde que el detector abrió el turno p50 |
|---|---|---|---|
| silencio ×3 | 0/3 (0 falsas) | — | — |
| voz limpia ×10 | 10/10 | 222 / 236 ms | 328 ms |
| voz + ruido rosa continuo, SNR ≈ 18 dB ×10 | 10/10 | 256 / 267 ms | 328 ms |
| voz + ruido rosa continuo, SNR ≈ 8 dB ×10 | 10/10 | 460 / 490 ms | 488 ms |

Las dos cifras de reacción miden cosas distintas: «desde el inicio real» es lo que la persona
vive; «desde que el detector abrió» incluye los 200 ms de relleno que el detector pone ANTES
de la detección para no comerse la primera sílaba (por eso 328 = 200 + 128 de confirmación).
Meta cumplida: 0 falsas, ≥ 9/10 con voz limpia, reacción p50 < 300 ms.

**Lo que salió mal y se arregló**: en la primera tanda las dos condiciones con ruido dieron
0/10. Causa: el modelo por energía fijaba el suelo con el PRIMER marco (silencio digital) y el
ruido continuo abría un turno desde el arranque que nunca cerraba; la voz real ya no producía
un inicio nuevo. Arreglo en `tools/voz` (`modeloEnergia({ marcosCalibracion })`, prueba nueva,
92/92): los primeros 9 marcos (~300 ms) son ruido de fondo y el suelo sale de su potencia media
(lineal, para que un marco mudo no lo arrastre a −180 dB). Con eso, 10/10 en las dos
condiciones. **Límite escrito, sin promesa**: es ruido rosa estacionario; con voces de fondo
(babble) o un ruido que cambie de nivel no está medido, y con altavoces sin auriculares la
única defensa contra oírse a sí misma es la cancelación de eco del navegador. Por eso NO se
propone Silero en el navegador (CDC) todavía: la regla era proponerlo si falsas o perdidas
superaban 1/10 y no ocurrió.

## 3.3 Picking robusto

**Qué cambió.** Gramática única `tools/dictado/src/texto/numeros.ts` (`parseaCantidad` →
`{valor, unidad?, forma}`: cifras con separador es-MX, palabras hasta 999 999 con «mil»,
decimales dichos, colectivos, unidades capturadas sin consumir el número; «par» es unidad, no
colectivo); `primerNumero` del laboratorio y `numerosACifras` de `calibra.mjs` delegan en ella
(dos copias menos). `services/picking.ts`: veredictos `ok | no | cantidad-distinta |
unidad-distinta | repetir | no-entendi`, `creaSesionPicking` pura con tres intentos por línea,
paso «a mano», incidencias e historial; `PEDIDO_MUESTRA` a 20 líneas con unidades variadas;
panel con contador, incidencias, manos libres y segundo pase.

**Gramática**: 52 casos en verde (`tools/dictado/pruebas/numeros.ts`), más 3 pruebas de sesión
en el laboratorio (23/23). Un defecto que la prueba de sesión no cazaba y el navegador sí: el
objeto devuelto por `confirma()` llevaba el estado ANTERIOR al avance (orden de evaluación en el
literal); la prueba ahora lo exige.

**Confirmaciones sintéticas** (`scripts/laboratorio-voz/mide-picking.mjs`: 20 líneas × 8 formas
habladas × 2 voces Piper × 2 condiciones = 640 locuciones, todo por el demonio; la condición
`almacén` es voces de fondo a −18 dB + eco). Política, la misma que el panel: Parakeet primero y,
si no se entiende una cantidad, segundo pase con el respaldo (faster-whisper small con el idioma
forzado, `x-motor: respaldo`, nuevo en el demonio):

| condición | locuciones | **confirmaciones erróneas** | rechazos falsos (de las que debían confirmar) | segundo pase | motor p50 · respaldo p50 |
|---|---|---|---|---|---|
| limpio | 320 | **0** | 22/170 (12,9 %) | 25 % | 72 ms · 1 338 ms |
| almacén | 320 | **0** | 40/170 (23,5 %) | 38 % | 77 ms · 1 326 ms |

Por forma hablada, rechazos falsos en limpio / almacén: **número + unidad («tres unidades»)
0/46 / 1/46 · «son N» 1/40 / 5/40 · «sí, N» 9/40 / 15/40 · número a secas («tres») 10/32 /
16/32 · colectivo 2/12 / 3/12**. «no, faltan N» 40/40 bien en las dos. «sí» a secas: 0/80
confirmaciones (era el objetivo: ver abajo).

**Meta**: 0 confirmaciones erróneas ✓; rechazos falsos ≤ 5 % en limpio: **se cumple con
número + unidad (0 %) y «son N» (2,5 %), no con una palabra suelta (31 %) ni con «sí, N»
(22 %)**. La cifra agregada (12,9 %) no cumple y se dice.

**Lo que pasó por el camino, en orden**:
1. Primera tanda (sin respaldo): 0 erróneas pero 22 % de rechazos en limpio; casi todos «sí» y
   números sueltos que Parakeet oye en inglés («Sir», «Six», «Yes»). El respaldo por idioma del
   demonio, pedido por el cliente cuando la gramática no encuentra cantidad, los bajó a 10 %.
   Rellenar el audio corto con silencio no ayuda (probado con 16 clips: igual o peor).
2. Segunda tanda: **una confirmación errónea**: «52» dicho como «cincuenta y dos», oído
   «cincuenta dos» (sin la «y»), y la gramática leía 50 y aparte 2 → confirmó una línea de 50.
   Arreglo: la unidad suelta tras una decena SIEMPRE suma (prueba nueva; 56/56).
3. Tercera tanda: **cinco erróneas**, tres reales y dos del propio guion (el distractor de una
   línea de 1 era «uno»). Las reales: «seis» oído como «Sí» en los dos motores, y un «sí» a secas
   confirmaba. Decisión de diseño: **un «sí» sin cantidad ya no confirma** (`sin-cantidad`, la
   máquina pide la cantidad); «sí, tres» sí. El panel y la tarjeta lo dicen.
4. Cuarta tanda (la tabla): 0 erróneas en 640, «sí» a secas 0/80.

**Límite escrito**: un monosílabo sintético aislado no es un «sí» humano; el error se concentra
ahí y en la voz es_ES en el almacén. Se apunta para el piloto con voz propia: medir «tres» y
«sí, tres» dichos por una persona con casco. Y una mejora barata vista en los datos: el motor
escribe «treinta e seis»; la gramática podría aceptar «e» como «y» (no se cambió para no
re-medir). Tabla completa: `tools/dictado/medicion/corpus-propio/picking-2026-09-21.md`.
Paso Playwright: llega a la línea 2 con micrófono falso (arriba).

## 3.4 Educación: muletillas contra verdad de terreno

**Corpus**: 6 guiones (uno de control) con muletillas escritas en conteo conocido y dos pausas de
1,8 s en posiciones conocidas, leídos por las dos voces Piper (28–40 s cada uno;
`fabrica-corpus.mjs --muletillas`, verdad en `*.verdad.json`). Piper pronuncia «eh» y «este»
como palabras claras: **lo que se mide es si el motor las conserva**, no cómo suena un titubeo
real.

**Medición** (`scripts/laboratorio-voz/mide-competencias.mjs`, regla escrita antes: recall ≥ 80 %
y precisión ≥ 90 % sobre los guiones con muletillas):

| motor | recall | precisión | pausas largas detectadas | WER medio | proceso / duración | decisión |
|---|---|---|---|---|---|---|
| Parakeet (demonio) | 76 % | 100 % | 24/24 | 6,0 % | 0,07× | no conserva → «no medible» |
| faster-whisper small (ya en el banco) | 82 % | 100 % | 24/24 | 6,9 % | 0,34× | conserva → puede mostrar la cifra |

Lo que se pierde es sistemático: «eh» y «este» (6/10 y 6–8/14 en los dos motores); «o sea»,
«pues», «tipo», «literal» se conservan enteras. Las palabras por minuto medidas quedan a ±7 de
las del guion, y las 24 pausas largas se detectan las 24. Tabla completa:
`tools/dictado/medicion/corpus-propio/muletillas/medicion-2026-09-21.md`.

**Qué hace el laboratorio con eso**: `MOTORES_QUE_CONSERVAN_MULETILLAS = ['faster-whisper']`
(lista cerrada, la llena la medición); con Parakeet el panel muestra «no medible» y explica por
qué; la casilla «medir muletillas con el segundo motor» transcribe con `lote --motor
faster-whisper:small` (más lento, por proceso). Rúbrica orientativa por franjas (`rubrica()`,
nunca un número global, aviso «no es una calificación»). El caso 10 dice «adultos; menores
solo con AISIA firmada». Captura: `capturas-laboratorio/12-competencias-rubrica.png`.
Borradores para firma: `propuestas/AISIA-educacion-menores.md` (decisión: no ofrecer a menores
hasta firma) y `propuestas/bitacora-caso-10-segundo-motor.md`.

## 3.5 Campo: condiciones sintéticas con SNR declarado

**Corpus** (`fabrica-corpus.mjs --campo`, `condiciones.mjs` compartido con el picking): sobre
las 30 frases limpias, `calle` (brown grave con vaivén), `taller` (rosa + zumbido 50/100 Hz +
banda de 3 kHz intermitente), `almacen` (otras voces del corpus a −18 dB + eco de nave),
`reverb`, `snr20/10/05/00` (rosa con amplitud calculada desde el nivel medio de cada voz;
`amplitudPara` pura, constante medida: rosa a amplitud 1 = −14,4 dB), `flojo` (−24 dB) y
`fuerte` (+12 dB limitado); más `calle-sinvoz` y `taller-sinvoz`. 330 archivos + 2.

**WER por condición** (`calibra.mjs --corpus …/campo`, Parakeet en proceso, 30 frases cada una;
«cifras igualadas» = números en palabras y en cifras cuentan igual):

| condición | WER crudo | WER con cifras igualadas | CER | motor p50 |
|---|---|---|---|---|
| limpio | 10,9 % | 4,5 % | 8,0 % | 224 ms |
| calle (brown + vaivén, SNR ≈ 8 dB) | 10,1 % | 3,6 % | 7,8 % | 224 ms |
| taller (rosa + zumbido + banda intermitente) | 11,2 % | 5,1 % | 8,0 % | 350 ms* |
| almacén (otras voces a −18 dB + eco) | 9,8 % | 4,2 % | 7,1 % | 234 ms |
| reverberación | 12,1 % | 6,1 % | 8,1 % | 232 ms |
| rosa, SNR 20 dB | 11,2 % | 5,5 % | 7,6 % | 327 ms* |
| rosa, SNR 10 dB | 12,1 % | 6,1 % | 8,1 % | 334 ms* |
| rosa, SNR 5 dB | 13,9 % | 7,9 % | 8,9 % | 235 ms |
| rosa, SNR 0 dB | 18,1 % | 12,4 % | 11,1 % | 242 ms |
| flojo (−24 dB) | 8,9 % | 3,9 % | 6,2 % | 220 ms |
| fuerte (+12 dB limitado) | 11,2 % | 4,9 % | 8,1 % | 224 ms |

\* Tres condiciones se transcribieron mientras se reconstruía `tools/dictado` en paralelo: su
p50 va inflado y no se usa; el WER no depende de la carga.

**Umbral honesto, escrito antes de medir**: «usable con auriculares» si WER < 15 % a SNR 10;
«no usable» si > 25 %. **A SNR 10 da 6,1 %: usable**; ni siquiera a SNR 0 (12,4 %) cruza el
«no usable». Lo que eso significa y lo que no: Parakeet aguanta bien ruido rosa estacionario y
voces de fondo sintéticas a −18 dB; un taller real tiene golpes, no un zumbido estable, y una
calle real cambia de nivel. Las tarjetas 17 y 20 llevan estas cifras con la etiqueta
«sintético». La condición `ruido` de la Etapa 1 (rosa sin SNR declarado) queda superada por
este barrido.

**VAD en campo** (barrido cierre × relleno sobre limpio + almacén + snr10 + snr00): frases
partidas 0, sin voz 0, con palabras comidas 2/60 (3,3 %) en todas las combinaciones sobre
limpio + almacén (los mismos dos archivos, con cualquier cierre: es el corte de la frase, no el
umbral). **Fantasmas**: 0 turnos sobre `calle` y `taller` sin voz (pico −25 / −27 dBFS) y 0
sobre ruido rosa de −60 a −35 dBFS. Tabla: `…/campo/calibracion-2026-09-21.md`.

**Ganancia automática** (`scripts/laboratorio-voz/mide-ganancia.mjs`: 10 frases encadenadas por
condición, `dictar --entrada … --motor remoto` a tiempo real, ganancia 0 contra `auto`):

| condición | pico visto | ganancia auto aplicada | WER con 0 | WER con auto |
|---|---|---|---|---|
| flojo (−24 dB) | −39,8 dBFS | +12 dB | 6,0 % | 6,0 % |
| fuerte (+12 dB limitado) | −8,2 dBFS | 0 (en ventana) | 7,7 % | 7,7 % |
| limpio | −15,8 dBFS | 0 (en ventana) | 6,8 % | 6,8 % |
| snr10 | −15,7 dBFS | 0 (en ventana) | 10,3 % | 10,3 % |

Regla escrita antes: `auto` se propone por defecto solo si mejora ≥ 3 puntos en `flojo` sin
empeorar > 0,5 en el resto. **No se cumple: 0 puntos.** Parakeet normaliza el nivel y un
micrófono a −40 dBFS lo transcribe igual; el valor de la ganancia automática está en lo que ya
medía la Etapa 1 (evitar saturación y que la persona vea un pico sano), no en el WER. **No hay
propuesta de bitácora: el defecto no cambia.** Ninguna frase se descartó por energía ni salió
sin voz en las ocho corridas. Tarjetas 17 y 20 con las cifras sintéticas etiquetadas.

## 3.1 Llamadas en vivo: preparación gobernada, sin conectar nada

**Hecho que fija todo**: desde WSL solo se ve el micrófono (`RDPSource`) y lo que WSL
reproduce; el audio de Zoom, Teams o el teléfono en Windows no pasa por ahí. Capturar una
llamada exige un ayudante del lado Windows (dos flujos WASAPI) que no existe: es un PRP nuevo
y, si trae DLL, CDC. El caso 19 lo dice en «lo que se sabe hoy» y sigue en PUERTA HUMANA.

**Spike con audio propio** (`scripts/laboratorio-voz/spike-llamada.mjs`): las 12 líneas de
`r1-discovery` (dos voces Piper, 57,3 s) en dos pistas con los silencios de la verdad, un Silero
por canal (`creaDetectorPorCanal` de `tools/voz`) en bloques de 320 ms, cada fin de turno al
demonio y el asesor sobre lo acumulado.

| corrida | etiquetado | turnos detectados / verdad | descartados por sangrado | canal equivocado | WER | fin de turno → insight p50 / p95 |
|---|---|---|---|---|---|---|
| sangrado −20 dB, sin regla de dominancia (el hallazgo) | 50 % | 24 / 12 | 0 | 12 | 100,7 % | 238 / 316 ms |
| sangrado −20 dB, con dominancia | **100 %** | 12 / 12 | 12 | **0** | **2,7 %** | 266 / 326 ms |
| sangrado −60 dB (canales limpios), con dominancia | 100 % | 12 / 12 | 1 | 0 | 2,7 % | 240 / 324 ms |

A eso se suman los 500 ms fijos del cierre del VAD: **p50 ≈ 770 ms de fin de turno a insight**,
bajo la meta de 1,5 s. Proceso 0,07× la duración. Score del asesor 63 con 10 insights.

**El hallazgo que cambia el diseño del ayudante**: con un sangrado de −20 dB (un altavoz que
se cuela en el micrófono), un VAD por canal abre en el canal ajeno un turno espejo de cada
frase. La regla de dominancia (si durante el turno el otro canal sonó ≥ 6 dB más fuerte en más
del 60 % de los bloques, es sangrado) lo deja en 12/12 con 0 en el canal equivocado. Entra como
requisito del PRP del ayudante de Windows. Tablas: `…/reuniones/spike-llamada-2026-09-21.md` y
`-sin-dominancia.md`.

**Borradores para firma** en `propuestas/`: `modelo-amenazas-llamadas.md` (C3: activos,
fronteras, O2–O6, controles: indicador que no se oculta + tecla de corte, ayudante pineado por
hash, sin audio persistente, token y loopback, kill-switch probado), `AISIA-llamadas.md` (C4:
interlocutor que no consintió, terceros mencionados, vendedor; consentimiento de una o dos
partes según jurisdicción; decisión «no ofrecer hasta ayudante + firmas») y
`aviso-legal-grabacion.md` (texto del aviso hablado y los seis puntos para revisión jurídica).
Ninguno deja nada sin decidir: cada uno lleva una decisión propuesta y una línea de firma.

## Casos y piezas del laboratorio que cambiaron

| caso | antes | ahora |
|---|---|---|
| 12 · consultas frecuentes | POR REGLAS; respuesta como WAV entero al final | POR REGLAS; respuesta en flujo (primera frase a 259 ms), manos libres, se calla si le hablas |
| 16 · voz picking | LISTO; 3 líneas, solo «número igual»; cantidad de 0 a 999 | LISTO; 20 líneas, gramática completa, «sí/no/repite», tres intentos y «a mano», manos libres, segundo pase |
| 10 · competencias orales | POR REGLAS; muletillas contadas sin saber si el motor las oye | POR REGLAS; rúbrica por franjas, muletillas «no medible» con Parakeet, segundo motor opcional, aviso de menores |
| 17 · manos libres / EPI y 20 · campo | LISTO; «la precisión con ruido no está medida» | LISTO; cifras sintéticas por condición y SNR en la tarjeta, ganancia auto medida |
| 19 · Zoom y Meet | PUERTA HUMANA | PUERTA HUMANA, con «lo que se sabe hoy», el spike y los tres borradores |

Estados: siguen 13 LISTO, 5 POR REGLAS, 2 PUERTA HUMANA. Piezas nuevas en la máquina: el demonio
habla (`/voces`, `/sintetizar`) y tiene respaldo por idioma (`x-motor: respaldo`).

## Decisiones

- **Energía, no Silero, en el navegador**: cero pesos y cero runtime nuevos; el límite se escribe
  en pantalla y la medición con ruido dice hasta dónde llega. Silero sigue siendo un CDC
  propuesto solo si las cifras lo piden.
- **Cancelar la síntesis al cortar**: sherpa lo permite devolviendo `false` en el progreso; sin
  eso, «callarse» solo dejaba de sonar y el demonio seguía calculando.
- **Respaldo por idioma a petición del cliente** (`x-motor`), no automático: el demonio no
  adivina cuándo el texto está mal; quien tiene la gramática (picking) sí sabe cuándo no entendió.
- **Muletillas por lista cerrada de motores medidos**: la cifra solo aparece si el motor la
  merece; con el principal se dice «no medible».
- **Ganancia y umbrales no cambian**: ninguna regla escrita antes de medir se cumplió, así que no
  hay propuesta de bitácora por defaults; la de muletillas sí (activa el segundo motor).
- **Dominancia entre canales** en el spike: un VAD por canal no basta si el audio se cuela; la
  regla se probó en el spike y entra como requisito del PRP del ayudante.

## Formas en que esto podría estar mal, y qué se hizo

- *Las cifras son sintéticas*: voces Piper que no titubean, ruido de ffmpeg que no cambia de
  nivel, micrófono falso sin eco. Todas las tablas lo dicen; el piloto con voz propia sigue
  siendo la validación que falta.
- *La cancelación de eco no se probó*: el micrófono falso no oye los altavoces. El aviso está en
  pantalla y la prueba de verdad es con auriculares y sin ellos, a mano.
- *El primer trozo depende del largo de la primera frase*: se explica en vez de maquillarse;
  los textos de picking empiezan con una frase corta a propósito («Línea 1 de 20.»).
- *«no?» cuenta cualquier «no»*: el contador de muletillas también cuenta la negación; en los
  guiones entra igual en los dos lados y no cambia la decisión, pero se anota.
- *Una medición con otra carga*: la calibración de campo se repitió sola tras corregir el
  listado (las condiciones «snr» tienen dígitos en el nombre y el primer filtro las dejaba
  fuera); las tandas del navegador corrieron con la máquina en reposo.
- *Contar tarjetas por `data-estado`*: el indicador de escucha usó ese mismo atributo y sumó
  una tarjeta de más al conteo de 20 del script de capturas; se renombró y el script cuenta
  ahora por `data-prueba="caso-N"`.
- *El estado devuelto por la sesión de picking era el anterior*: lo cazó el navegador, no la
  prueba pura; la prueba ahora lo exige.

## Lo que queda fuera (y quién lo abre)

- Ayudante de Windows para llamadas (PRP; CDC si trae DLL) y las tres firmas.
- Menores en el caso 10: firma de la AISIA y las seis condiciones.
- Silero en el navegador: CDC, solo si el ruido real lo pide.
- Piloto con voz propia, `/new-app` y re-firma de `BUSINESS_LOGIC.md`, publicar: fuera del agente.
