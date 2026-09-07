# @tu-scope/voz

Deteccion de voz (VAD) en tiempo real y diarizacion local, en vivo y por lotes.

**El nucleo es TypeScript puro y no tiene dependencias.** No importa `onnxruntime`, ni React,
ni nada del navegador: habla con dos interfaces (`ModeloVoz`, `ModeloHablante`) y cada punto
de entrada le inyecta su runtime. Por eso el mismo algoritmo corre en el navegador y en Node,
y por eso se puede probar entero sin descargar un solo MB de modelos.

## Que hace y que no

| Hace | No hace |
|---|---|
| Detectar donde empieza y acaba el habla | **Transcribir**. Define el enchufe (`Transcriptor`) y se aparta |
| Repartir hablantes **por canal**, sin modelos | Traer los pesos de los modelos: los configuras tu |
| Diarizar **por lotes**, con o sin habla solapada | Decir quien habla ANTES de que el turno cierre |
| Diarizar **en vivo**, corrigiendose hacia atras | Reaccionar al instante por el camino con solape: eso pide un VAD |
| Diarizar **en vivo con solape**, turnos que se pisan | Transcribir, ya dicho arriba |
| Reconocer a la misma persona **en la reunion de manana** | Enrolar por ti: los vectores de referencia los eliges tu |

## Instalar

```bash
npm install <ruta>/tools/voz/tu-scope-voz-0.4.0.tgz
```

El runtime de ONNX es **peerDependency opcional**: instala `onnxruntime-web` (navegador) u
`onnxruntime-node` (servidor) solo si vas a usar Silero. Con `modeloEnergia()` no hace falta.

## Los cinco usos

### 1. Barge-in — solo VAD, ~2 MB

```ts
import { creaDetectorVoz } from '@tu-scope/voz';
import { capturaMicrofono, creaModeloSilero } from '@tu-scope/voz/browser';
import * as ort from 'onnxruntime-web';

const modelo = await creaModeloSilero({ ort, modelo: '/modelos/silero_vad.onnx' });
const detector = creaDetectorVoz({ modelo, msSilencioParaCerrar: 300 });

await capturaMicrofono({
  frecuenciaHz: modelo.frecuenciaHz,
  async alRecibir(muestras) {
    for (const evento of await detector.procesa(muestras)) {
      if (evento.tipo === 'inicioHabla') pararAlBot();
    }
  },
});
```

Sin modelos: `creaDetectorVoz({ modelo: modeloEnergia() })`. Vale con auriculares y audio
limpio; en una sala con ruido, falla — usa Silero.

### 2. Dos canales — hablante sin diarizar

```ts
import { creaDetectorPorCanal } from '@tu-scope/voz';

const d = creaDetectorPorCanal({
  etiquetas: ['agente', 'cliente'],
  modelos: [await creaModeloSilero({ ort, modelo: ruta }), await creaModeloSilero({ ort, modelo: ruta })],
});
for (const { canal, evento } of await d.procesa([izquierdo, derecho])) { /* ... */ }
```

Un modelo por canal, no uno compartido: Silero tiene estado recurrente y compartirlo mezcla
el contexto de dos personas.

### 3. Reunion — diarizacion por lotes

Hay **dos caminos**, y la diferencia no es de calidad sino de lo que pueden representar:

| | `creaDiarizador` (VAD) | `creaDiarizadorPorSegmentacion` (PyanNet) |
|---|---|---|
| Modelos | VAD + embeddings | **Segmentacion** + embeddings |
| Habla solapada | **No la ve.** Dos voces a la vez dan un turno con un embedding promedio y una etiqueta que no es de ninguno | La representa: los turnos se **pisan** |
| Fronteras | Las del VAD | Por marco (~17 ms en pyannote 3.0) |
| Cuando usarlo | Entrevista, dictado, cualquier audio con turnos limpios | Reunion real, mesa redonda, cualquier sitio donde la gente se interrumpe |


**Camino PyanNet** (el que aguanta el solape):

```ts
import { creaDiarizadorPorSegmentacion, tramosSolapados } from '@tu-scope/voz';
import { creaModeloHablante, creaModeloSegmentacion, leeWav, preparaParaModelo } from '@tu-scope/voz/node';

const segmentacion = await creaModeloSegmentacion({ ort, modelo: '/modelos/segmentation-3.0.onnx' });
const turnos = await creaDiarizadorPorSegmentacion({
  segmentacion,
  hablante: await creaModeloHablante({ ort, modelo: '/modelos/embedding.onnx' }),
  hablantes: 3, // si lo sabes, dilo
}).diariza(preparaParaModelo(leeWav(bytes), segmentacion.frecuenciaHz));

// Donde se pisaron: es la pregunta que el camino por VAD no puede responder.
for (const t of tramosSolapados(turnos)) console.log(t.inicioMs, t.finMs, t.hablantes);
```

El formato de salida (**powerset** de `segmentation-3.0` o **multietiqueta** de las 2.x) se
deduce de la forma real del tensor con una inferencia de sonda al crear el modelo, no de la
ficha. Un modelo con salida inesperada falla ahi, no en el marco 4000.

**Camino VAD** (mas barato, sin solape):

```ts
import { creaDetectorVoz, creaDiarizador, fusionaTurnos } from '@tu-scope/voz';
import { creaModeloHablante, leeWav, preparaParaModelo } from '@tu-scope/voz/node';

const audio = leeWav(bytes);
const detector = creaDetectorVoz({ modelo: vad, conservaAudio: true });
const eventos = [
  ...(await detector.procesa(preparaParaModelo(audio, vad.frecuenciaHz))),
  ...(await detector.cierra()),
];
const turnos = eventos.flatMap((e) => (e.tipo === 'finHabla' ? [e.turno] : []));

const diarizador = creaDiarizador({
  modelo: await creaModeloHablante({ ort, modelo: '/modelos/embedding.onnx' }),
  hablantes: 3, // si lo sabes, dilo: es el dato mas util y mas barato
});
const acta = fusionaTurnos(await diarizador.asigna(turnos));
```

### 4. En vivo — diarizacion en streaming

Pone hablante a cada turno en cuanto cierra, y se corrige cuando la evidencia posterior la
contradice. Por lotes se ven todos los turnos a la vez y las etiquetas salen estables de una;
aqui hay que decidir con lo que se lleva oido, y eso cambia la promesa. La promesa entera son
tres eventos, y el tercero es el que falta en casi todas las implementaciones:

| Evento | Que dice | Que hace la interfaz |
|---|---|---|
| `turno` | "esto es del Hablante 2", con `confianza` y `provisional` | Pintarlo YA, marcado como provisional |
| `correccion` | "lo que dije antes estaba mal": `cambios` re-etiqueta turnos por id | Reescribir esos turnos |
| `firme` | "estos ids salieron de la ventana: no los toco mas" | Quitarles la marca de provisional |

```ts
import { creaDetectorVoz, creaDiarizadorEnVivo } from '@tu-scope/voz';

const enVivo = creaDiarizadorEnVivo({
  detector: creaDetectorVoz({ modelo: vad, conservaAudio: true }), // sin audio no hay a quien identificar
  modelo: await creaModeloHablante({ ort, modelo: '/modelos/embedding.onnx' }),
  hablantes: 2,                // si lo sabes, dilo: aqui vale aun mas que en el lote
  msVentanaCorreccion: 30_000, // cuanto pasado se puede reescribir
});

const { voz, diarizacion } = await enVivo.procesa(muestras);
for (const e of voz) if (e.tipo === 'inicioHabla') pararAlBot(); // reaccion inmediata, sin esperar al nombre
for (const e of diarizacion) {
  if (e.tipo === 'turno') pinta(e.id, e.turno, { provisional: e.provisional });
  if (e.tipo === 'correccion') for (const c of e.cambios) reetiqueta(c.id, c.hablante);
  if (e.tipo === 'firme') for (const id of e.ids) confirma(id);
}
```

Tambien suelto (`creaDiarizadorStreaming`) si los turnos te llegan de otro sitio: `empuja(turno)`
devuelve los mismos eventos.

**Lo que no da, y conviene saber antes de prometerlo:**

- **El hablante llega cuando el turno CIERRA**, no mientras se habla: el VAD necesita el
  silencio de cierre para saber que termino. Por eso `procesa` devuelve dos corrientes y no
  una: `voz` sirve para reaccionar ya, `diarizacion` llega despues. Mezclarlas es prometer un
  hablante en tiempo real que nadie puede dar.
- **No ve solape.** Es el camino VAD, con la misma limitacion que `creaDiarizador`: dos voces
  a la vez dan un turno con un embedding promedio. Para solape en vivo, el punto 5.
- **Una fusion puede llegar tarde.** Si los turnos del hablante absorbido ya salieron de la
  ventana, se quedan con la etiqueta vieja para siempre. El evento lo dice en `fuera` en vez
  de disimularlo; que hacer con eso —avisar, ignorar— lo decide tu app.
- **Los numeros no se reciclan.** Tras una fusion, "Hablante 2" desaparece y el siguiente
  nuevo es el 3. Reutilizar un nombre que el usuario ya leyo confunde mas que un hueco.

### 5. En vivo CON solape — segmentacion en streaming

Lo mismo que el punto 4, pero la fuente de turnos es PyanNet en vez del VAD: dos personas
hablando a la vez salen como **dos turnos que se pisan**, cada uno con su etiqueta.

```ts
import { creaDiarizadorSolapeEnVivo, tramosSolapados } from '@tu-scope/voz';

const vivo = creaDiarizadorSolapeEnVivo({
  segmentacion: await creaModeloSegmentacion({ ort, modelo: '/modelos/segmentation-3.0.onnx' }),
  hablante: await creaModeloHablante({ ort, modelo: '/modelos/embedding.onnx' }),
  hablantes: 3,
});

for (const e of await vivo.procesa(muestras)) {
  if (e.tipo === 'turno') pinta(e.id, e.turno, { provisional: e.provisional });
  if (e.tipo === 'correccion') for (const c of e.cambios) reetiqueta(c.id, c.hablante);
  if (e.tipo === 'firme') for (const id of e.ids) confirma(id);
}
```

Los tres eventos son **los mismos** del punto 4, y no por parecido: es la misma pieza. La
identidad global —confianza, provisional, correccion, fusion, firme— nunca supo de donde
venian los turnos, asi que el solape se resolvio cambiando la **fuente**, no la identidad.
Si los turnos te llegan de otro sitio, `creaSegmentadorStreaming` entrega solo la corriente
de turnos solapables y te dejas la identidad a ti.

**El precio, que es real y no se ajusta:**

| | Punto 4 (VAD) | Punto 5 (PyanNet) |
|---|---|---|
| Cierra un turno cuando | oye el silencio: ~300 ms | la ventana avanza: **~5 s** con 10 s y medio solape |
| Solape | no lo ve | lo representa |
| `inicioHabla` para barge-in | si | **no**: la actividad solo se sabe con la ventana vista |
| Modelos | VAD + embeddings | segmentacion + embeddings |

Quien necesite las dos cosas —parar al bot YA y ver el solape— corre un `creaDetectorVoz`
en paralelo: son dos preguntas distintas y solo una de las dos es barata.

**Dos capas de identidad, que no son la misma.** Las etiquetas de PyanNet son locales a la
ventana, y coserlas pide identidad; es tentador pensar que es la misma que la global. No lo
es. Una **pista** vive segundos y solo dice "esta voz viene sonando"; un **hablante** vive la
reunion entera. La misma persona que calla treinta segundos y vuelve genera dos pistas, y es
la capa de arriba la que las junta. Hacer que la pista dure toda la sesion es rehacer la capa
de arriba, peor y por duplicado.

## Ponerle nombre: voces que sobreviven a la sesion

Todo lo de arriba es anonimo, y no por descuido. "Hablante 1" significa *quien hablo primero*,
y manana volvera a ser "Hablante 1" aunque sea otra persona. Para un acta suelta basta. Para
cualquier cosa que ACUMULE —cuanto habla cada uno a lo largo del trimestre, quien ya pregunto
esto el mes pasado, o simplemente poner "Ana" donde pone "Hablante 2"— no basta, porque la
etiqueta anonima no se refiere a nadie fuera de su propia sesion.

Cruzar esa linea no pide un modelo mas. Son los MISMOS vectores del `ModeloHablante`, guardados
una vez junto a un nombre que pusiste tu:

```ts
import { creaRegistroHablantes, importaRegistro } from '@tu-scope/voz';

const registro = creaRegistroHablantes({ umbral: 0.4 });
registro.registra('ana',  [await hablante.vector(audioDeAna1), await hablante.vector(audioDeAna2)]);
registro.registra('luis', [await hablante.vector(audioDeLuis)]);

// Se enchufa igual en los tres caminos: lote, en vivo y en vivo con solape.
creaDiarizadorEnVivo({ detector, modelo: hablante, registro });
creaDiarizador({ modelo: hablante, registro });
creaDiarizadorSolapeEnVivo({ segmentacion, hablante, registro });

// Y sobrevive a la sesion, que es de lo que va todo esto:
await guarda(JSON.stringify(registro.exporta()));
const deAyer = importaRegistro(JSON.parse(await lee()));
```

Quien se reconoce sale con su nombre; quien no, sigue siendo `Hablante N`. **Los numeros no se
recorren para tapar el hueco**: si Ana hablo primero, el siguiente anonimo es el 2, porque
"Hablante 2" quiere decir *la segunda persona que hablo* y dos actas del mismo audio —una con
registro y otra sin el— tienen que numerar igual a las mismas personas.

**En vivo hay un cuarto caso**, y se dice con los tres eventos de siempre: un anonimo puede
RESULTAR ser alguien conocido cuando su centroide madura. Llega como `correccion` con
`motivo: 'identificacion'`, y la interfaz lo pinta como cualquier otra correccion — reescribir
unas filas. Si esos turnos ya salieron de la ventana, se quedan con el numero y el acta queda
partida entre "Hablante 3" y "Ana": el evento lo cuenta en `fuera` en vez de disimularlo.

**Cuando el registro y la sesion se contradicen, manda el registro.** Es la decision de diseno
que hay que conocer antes de usar esto. `identifica` solo contesta si la voz cabe holgada y
ademas le saca margen a la segunda candidata, y cuando contesta lo hace sobre un centroide que
etiquetaste tu. La continuidad de la sesion es un liston mas bajo. Al reves —continuidad
primero— dos personas registradas que suenan parecido se fundirian en el primer turno y la
segunda no llegaria a abrirse nunca, que es justo el caso para el que uno registra a alguien.
Por lo mismo, **dos voces con nombres distintos no se funden jamas**, por muy juntos que
acaben sus centroides.

**Lo que NO hace, y es deliberado:**

- **No aprende solo.** Nada se realimenta de su propia salida. El turno de Luis que se
  identifico mal como Ana arrastraria el centroide de Ana hacia Luis, y el error siguiente
  seria mas probable que el anterior; la deriva no avisa, solo se nota cuando el acta lleva
  semanas mintiendo. Anadir evidencia es una llamada explicita a `registra`, con vectores que
  elegiste tu.
- **No decide cuando duda.** Dos voces registradas casi a la misma distancia devuelven `null`.
  Un "Hablante 3" se arregla mirandolo; un "Ana" que era Luis no se arregla, porque nadie va a
  ir a comprobarlo.
- **No protege a un desconocido que se parece a un conocido.** Si alguien sin registrar cae
  dentro del umbral de Ana, se ira bajo el nombre de Ana. El mando contra eso son `umbral` y
  `margen`, y se calibran con `calibraUmbral` sobre voces tuyas.
- **No sabe de que modelo salio un vector.** Un registro hecho con un modelo de embeddings y
  cargado con otro no da error por si solo: da nombres mal puestos, en silencio. Ponle etiqueta
  al modelo (`creaRegistroHablantes({ modelo: 'embedding@sha256:...' })`) y entonces importar
  con otra falla en vez de mentir.

**Medido** (`npm run mide`, 2026-09-01, mismo montaje: 4 voces enroladas con 3 tomas cada
una, una quinta persona NO registrada haciendo de impostor, 36 tomas de prueba):

| umbral | acierta | se equivoca de nombre | se abstiene | al impostor le pone nombre |
|---|---|---|---|---|
| 0,30 | 33 | 0 | 3 | 0 / 12 |
| **0,45** (defecto) | 35 | **0** | 1 | **0 / 12** |
| 0,60 | 36 | 0 | 0 | 0 / 12 |
| 0,70 | 36 | 0 | 0 | **4 / 12** |

Lo que dice la tabla: el defecto de 0,45 cuesta **una abstencion de 36** y no pone ni un
nombre mal, ni a los enrolados ni al impostor. Subirlo a 0,60 recupera esa abstencion y aqui
todavia aguanta; a 0,70 el impostor se lleva un nombre ajeno **un tercio de las veces**. Por
eso el defecto es el conservador: la abstencion se ve y se arregla, el nombre ajeno se queda.
Y el **margen** no lo mide este montaje —cuatro hablantes de LibriSpeech no se parecen entre
si lo bastante— asi que ahi el defecto sigue sin respaldo: es el mando que importa cuando
registras a dos personas con voces parecidas, que es justo cuando nadie te va a avisar.

Un ultimo dato que cambia que camino elegir, medido en el banco del navegador
(`npm run demo`, caso 6): **por lotes el registro aguanta umbrales mucho mas laxos que en
vivo**. Con una persona no registrada delante, el camino en vivo empieza a ponerle un nombre
ajeno a partir de 0,70; el de lotes no lo hace ni con 0,90. Mismo registro y mismo umbral — lo
que cambia es la evidencia debajo de cada decision: por lotes se pregunta una vez por el
centroide de todo el grupo, y en vivo turno a turno, donde uno ronco basta para equivocarse.

Y el umbral del registro **no es el del agrupamiento**, aunque los dos se llamen umbral y midan
coseno. Aquel responde "¿estos dos turnos son la misma persona?" —mismo microfono, misma sala,
mismos cinco minutos—; este responde "¿esta voz es la de quien registre, quiza otro dia y con
otro cacharro?". El defecto es mas estricto a proposito, porque no reconocer a Ana cuesta un
anonimo y llamar Ana a Luis cuesta el acta.

## Los mandos que de verdad importan

| Opcion | Que pasa si te equivocas |
|---|---|
| `msRelleno` | Con 0, el turno empieza cortado y se pierde la primera consonante — la que el transcriptor necesita |
| `msSilencioParaCerrar` | Corto: cortas a quien respira a mitad de frase. Largo: el bot tarda en contestar |
| `umbralEntrada` / `umbralSalida` | Si los igualas pierdes la histeresis y una senal en el limite abre y cierra turnos sin parar |
| `msMinimoHabla` | Bajo: cada tos es un turno, y en diarizacion, un hablante fantasma |
| `umbral` (diarizacion) | Bajo parte a una persona en dos; alto funde a dos en una. **Calibralo con `calibraUmbral`** |
| `msVentanaCorreccion` (en vivo) | Con 0 nunca rectificas; muy alto, se reescribe lo que el usuario ya leyo |
| `margenCorreccion` (en vivo) | Bajo: dos hablantes parecidos se roban turnos en cada empuje y la interfaz parpadea |
| `umbralFusion` (en vivo) | Alto funde a dos personas distintas, y lo que salio de la ventana ya no se arregla |
| `solape` (segmentacion) | Es la latencia: mas solape cierra antes, a cambio de correr el modelo mas veces |
| `umbralPista` (solape en vivo) | Alto cose dos voces en un turno; bajo parte a una en trozos de ventana. Se equivoca barato: la capa global vuelve a unir |
| `umbral` (registro) | Alto pone el nombre de un conocido a un desconocido que se le parece, y eso se queda en el acta. Bajo no reconoce a nadie y todo vuelve a ser anonimo |
| `margen` (registro) | Bajo, dos voces registradas parecidas se alternan el nombre segun el ruido de cada turno |

## El umbral de diarizacion no se adivina

```ts
const { umbral, acierto } = calibraUmbral(vectores, ['ana', 'ana', 'luis']);
```

Se le da audio etiquetado a mano y devuelve el umbral que mas acierta, medido por pares. Sin
esto el umbral es superstici­on heredada de un tutorial.

**Y esto es lo que salio al medirlo de verdad** (`npm run mide`, 2026-09-01 · WeSpeaker
ResNet34-LM · LibriSpeech dev-clean, 5 hablantes x 12 tomas · dos sorteos independientes de
hablantes dieron lo mismo):

| | distancia coseno |
|---|---|
| Mismo hablante | p50 **0,15–0,25** · p95 **0,46–0,50** · max 0,83 |
| Hablantes distintos | min **0,61–0,63** · p50 0,91 |

`calibraUmbral` devuelve **0,55 con 100 % de acierto por pares**, que es exactamente el
defecto de `agrupa()`. Con 0,55 salen 5 grupos para 5 hablantes; con 0,40, ocho o diez. El
defecto estaba bien — pero hasta el 2026-09-01 eso era una creencia, no un dato, y **sigue
siendo de ESTE modelo con ESTE tipo de audio**: lectura limpia de estudio. Con voces por
telefono o en una sala con ruido, se vuelve a medir.

## Avisos que ahorran una tarde

- **Silero v5 quiere 576 muestras, no 512.** El modelo recibe las **64 ultimas del marco
  anterior pegadas delante** del marco actual (32 a 8 kHz). El grafo tiene dimensiones
  dinamicas, asi que darle 512 no da error: la sesion corre y devuelve numeros. Medido el
  2026-09-01 sobre 10,6 s de habla limpia, esos numeros eran **0,0006 de media y cero marcos
  por encima de 0,5** — el VAD entero mudo, sin una sola queja. Aqui ya esta resuelto
  (`creaModeloSilero` lleva el contexto por dentro); esta escrito porque el mismo fallo espera
  a cualquiera que llame al `.onnx` a mano.
- **Los modelos de embedding fallan en silencio.** Casi todos comen `fbank`, no forma de
  onda. Si le das el formato equivocado no hay error: hay vectores malos y una diarizacion
  que se equivoca sin decir por que. Contrasta la ficha del modelo.
- **Los pesos no viajan en el paquete.** Un `.tgz` no es sitio para 55 MB. Se configuran por
  ruta o URL, y se **pinean**: `latest` aqui es el mismo anti-patron que en todo lo demas.
- **La diarizacion local no iguala a Deepgram o AssemblyAI.** Es el precio de que el audio no
  salga de tu maquina. Mide con `calibraUmbral` sobre audio tuyo antes de prometer nada.

## Pruebas

```bash
npm run build && npm run prueba   # 90 pruebas, sin red y sin modelos
```

Corren contra `dist/`, no contra `src/`: se prueba el artefacto que se instala.

**Y aparte, la medicion contra pesos reales:**

```bash
npm run mide     # baja modelos y audio la primera vez (~35 MB + ~15 MB), luego mide
```

**Y para probarlo a mano, con microfono:**

```bash
npm run demo     # http://localhost:4321 — los seis casos, con instrucciones en cada uno
```

Usa los mismos pesos y el mismo audio que `npm run mide`, sirve el `dist/` recien construido
y trae la verdad al lado: como el nombre de cada archivo lleva el hablante real, el acta se
puntua sola. Es donde se ve lo que un numero no cuenta — un turno entrando provisional, la
correccion reescribiendolo, y el `firme` que dice que ya no se toca mas.

No son la misma cosa y no se sustituyen. Las 90 pruebas miden la CONTABILIDAD del algoritmo
—cuando se abre un hablante, quien se funde con quien, que se puede corregir— y por eso usan
modelos falsos y corren en 200 ms sin red. `npm run mide` mide lo unico que un modelo falso no
puede tener: el convenio de llamada del `.onnx` de verdad, y los umbrales sobre voces de
verdad. La primera vez que se corrio, el 2026-09-01, encontro que el VAD llevaba mudo desde el
primer dia. **Lo que no ha pasado por ahi no esta aprobado: esta sin medir.**
