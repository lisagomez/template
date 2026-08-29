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
| Repartir hablantes **por canal**, sin modelos | Representar **solape en vivo**: el streaming es el camino VAD |
| Diarizar **por lotes**, con o sin habla solapada | Traer los pesos de los modelos: los configuras tu |
| Diarizar **en vivo**, corrigiendose hacia atras | Decir quien habla ANTES de que el turno cierre |

## Instalar

```bash
npm install <ruta>/tools/voz/tu-scope-voz-0.2.0.tgz
```

El runtime de ONNX es **peerDependency opcional**: instala `onnxruntime-web` (navegador) u
`onnxruntime-node` (servidor) solo si vas a usar Silero. Con `modeloEnergia()` no hace falta.

## Los cuatro usos

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
  a la vez dan un turno con un embedding promedio. Para solape, el camino PyanNet, por lotes.
- **Una fusion puede llegar tarde.** Si los turnos del hablante absorbido ya salieron de la
  ventana, se quedan con la etiqueta vieja para siempre. El evento lo dice en `fuera` en vez
  de disimularlo; que hacer con eso —avisar, ignorar— lo decide tu app.
- **Los numeros no se reciclan.** Tras una fusion, "Hablante 2" desaparece y el siguiente
  nuevo es el 3. Reutilizar un nombre que el usuario ya leyo confunde mas que un hueco.

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

## El umbral de diarizacion no se adivina

```ts
const { umbral, acierto } = calibraUmbral(vectores, ['ana', 'ana', 'luis']);
```

Se le da audio etiquetado a mano y devuelve el umbral que mas acierta, medido por pares. Sin
esto el umbral es superstici­on heredada de un tutorial.

## Avisos que ahorran una tarde

- **Los modelos de embedding fallan en silencio.** Casi todos comen `fbank`, no forma de
  onda. Si le das el formato equivocado no hay error: hay vectores malos y una diarizacion
  que se equivoca sin decir por que. Contrasta la ficha del modelo.
- **Los pesos no viajan en el paquete.** Un `.tgz` no es sitio para 55 MB. Se configuran por
  ruta o URL, y se **pinean**: `latest` aqui es el mismo anti-patron que en todo lo demas.
- **La diarizacion local no iguala a Deepgram o AssemblyAI.** Es el precio de que el audio no
  salga de tu maquina. Mide con `calibraUmbral` sobre audio tuyo antes de prometer nada.

## Pruebas

```bash
npm run build && npm run prueba   # 50 pruebas, sin red y sin modelos
```

Corren contra `dist/`, no contra `src/`: se prueba el artefacto que se instala.
