/**
 * Pruebas del camino PyanNet: decodificacion powerset, cosido entre ventanas y solape.
 *
 * Lo que se ejercita aqui es justo lo que el camino por VAD no puede representar: dos
 * personas hablando a la vez.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  creaDiarizadorPorSegmentacion,
  tramosSolapados,
  type ModeloHablante,
  type ModeloSegmentacion,
  type Turno,
} from '../dist/index.js';
import { creaModeloSegmentacion, type RuntimeOnnx } from '../dist/node/index.js';

const HZ = 16_000;

/** Runtime ONNX falso: devuelve siempre la misma salida, con las dimensiones que se le den. */
function ortFalso(datos: Float32Array, dims: number[]): RuntimeOnnx {
  return {
    // Sin propiedades de parametro en el constructor: Node solo ELIMINA tipos al ejecutar
    // .ts, no los transforma, y `constructor(public x)` necesita transformacion.
    Tensor: class {
      tipo: string;
      data: unknown;
      dims: readonly number[];
      constructor(tipo: string, data: unknown, dims: readonly number[]) {
        this.tipo = tipo;
        this.data = data;
        this.dims = dims;
      }
    },
    InferenceSession: {
      async create() {
        return {
          inputNames: ['entrada'],
          outputNames: ['salida'],
          async run() {
            return { salida: { dims, data: datos } };
          },
        };
      },
    },
  } as unknown as RuntimeOnnx;
}

test('powerset: un marco con la clase (0,1) da DOS hablantes simultaneos', async () => {
  // 2 marcos x 7 clases. Marco 0 → clase 4 = (0,1). Marco 1 → clase 0 = silencio.
  const logits = Float32Array.from([
    0, 0, 0, 0, 9, 0, 0,
    9, 0, 0, 0, 0, 0, 0,
  ]);
  const modelo = await creaModeloSegmentacion({
    ort: ortFalso(logits, [1, 2, 7]),
    modelo: 'falso.onnx',
    duracionVentanaS: 1,
  });
  assert.equal(modelo.hablantesLocales, 3);
  const actividad = await modelo.ventana(new Float32Array(HZ));
  assert.deepEqual(Array.from(actividad[0]!), [1, 1, 0]);
  assert.deepEqual(Array.from(actividad[1]!), [0, 0, 0]);
});

test('multietiqueta: una salida sin powerset conocido se trata como sigmoides', async () => {
  // 1 marco x 5 clases: no hay powerset de 5, asi que son 5 hablantes independientes.
  const salida = Float32Array.from([0.9, 0.1, 0.8, 0.0, 0.7]);
  const modelo = await creaModeloSegmentacion({
    ort: ortFalso(salida, [1, 1, 5]),
    modelo: 'falso.onnx',
    duracionVentanaS: 1,
  });
  assert.equal(modelo.hablantesLocales, 5);
  const marco = Array.from((await modelo.ventana(new Float32Array(HZ)))[0]!);
  // Con tolerancia: los valores viajan como float32 y 0.9 no es exactamente 0.9.
  [0.9, 0.1, 0.8, 0, 0.7].forEach((esperado, i) => {
    assert.ok(Math.abs(marco[i]! - esperado) < 1e-6, `clase ${i}: ${marco[i]} != ${esperado}`);
  });
});

test('una salida con forma inesperada falla al construir, no en el marco 4000', async () => {
  await assert.rejects(
    () => creaModeloSegmentacion({ ort: ortFalso(Float32Array.from([1, 2]), [1, 2]), modelo: 'x' }),
    /forma|dims|inesperada/i,
  );
});

// --- El escenario completo: A y B se pisan medio segundo -----------------------

const A_DESDE = 0;
const A_HASTA = 2.0;
const B_DESDE = 1.5;
const B_HASTA = 3.5;
const DURACION_S = 4;

/** Audio marcado por amplitud: solo A = 0.3, solo B = 0.7, los dos = 0.5. */
function audioEscenario(): Float32Array {
  const x = new Float32Array(DURACION_S * HZ);
  for (let i = 0; i < x.length; i++) {
    const t = i / HZ;
    const a = t >= A_DESDE && t < A_HASTA;
    const b = t >= B_DESDE && t < B_HASTA;
    x[i] = a && b ? 0.5 : a ? 0.3 : b ? 0.7 : 0;
  }
  return x;
}

/**
 * Segmentacion falsa que responde por TIEMPO ABSOLUTO, como haria un modelo real, y que
 * INTERCAMBIA los indices locales en las ventanas impares. Ese intercambio es el caso que
 * obliga a coser por embeddings: si el diarizador se fiara del indice local, aqui saldrian
 * cuatro hablantes en vez de dos.
 */
function segmentacionFalsa(): ModeloSegmentacion {
  const muestrasVentana = 2 * HZ;
  const marcos = 20;
  let llamada = 0;
  return {
    frecuenciaHz: HZ,
    muestrasVentana,
    hablantesLocales: 2,
    async ventana() {
      const inicioS = llamada * 1; // salto de 1 s (solape 0.5)
      const invertido = llamada % 2 === 1;
      llamada++;
      const salida: Float32Array[] = [];
      for (let m = 0; m < marcos; m++) {
        const t = inicioS + (m * 2) / marcos;
        const a = t >= A_DESDE && t < A_HASTA ? 1 : 0;
        const b = t >= B_DESDE && t < B_HASTA ? 1 : 0;
        salida.push(Float32Array.from(invertido ? [b, a] : [a, b]));
      }
      return salida;
    },
  };
}

/** Embeddings por amplitud: identifica a la persona sin saber nada de indices locales. */
const hablantePorAmplitud: ModeloHablante = {
  frecuenciaHz: HZ,
  async vector(muestras) {
    let suma = 0;
    for (let i = 0; i < muestras.length; i++) suma += Math.abs(muestras[i]!);
    const media = suma / Math.max(1, muestras.length);
    return media < 0.4 ? Float32Array.from([1, 0]) : Float32Array.from([0, 1]);
  },
};

async function diariza(): Promise<Turno[]> {
  return creaDiarizadorPorSegmentacion({
    segmentacion: segmentacionFalsa(),
    hablante: hablantePorAmplitud,
    umbral: 0.5,
  }).diariza(audioEscenario());
}

test('el cosido por embeddings sobrevive a que los indices locales se intercambien', async () => {
  const turnos = await diariza();
  const hablantes = new Set(turnos.map((t) => t.hablante));
  assert.equal(hablantes.size, 2, `se esperaban 2 hablantes globales, salieron ${hablantes.size}`);
});

test('los turnos se PISAN: el solape se representa de verdad', async () => {
  const turnos = await diariza();
  const hayCruce = turnos.some((a) =>
    turnos.some((b) => a !== b && a.hablante !== b.hablante && a.inicioMs < b.finMs && b.inicioMs < a.finMs),
  );
  assert.ok(hayCruce, 'sin turnos que se pisen no se ha representado el habla solapada');
});

test('tramosSolapados encuentra el medio segundo en que hablan los dos', async () => {
  const solapes = tramosSolapados(await diariza());
  assert.ok(solapes.length > 0, 'no se detecto ningun tramo solapado');
  const total = solapes.reduce((s, t) => s + (t.finMs - t.inicioMs), 0);
  // El solape real son 500 ms; con marcos de 100 ms se admite un marco de holgura por lado.
  assert.ok(total >= 300 && total <= 700, `solape total fuera de rango: ${total} ms`);
  assert.equal(solapes[0]!.hablantes.length, 2);
});

test('las fronteras caen donde deben, con la holgura de un marco', async () => {
  const turnos = await diariza();
  const inicios = turnos.map((t) => t.inicioMs).sort((a, b) => a - b);
  const finales = turnos.map((t) => t.finMs).sort((a, b) => a - b);
  assert.ok(Math.abs(inicios[0]! - A_DESDE * 1000) <= 150, `primer inicio: ${inicios[0]}`);
  assert.ok(Math.abs(finales[finales.length - 1]! - B_HASTA * 1000) <= 150, `ultimo fin: ${finales.at(-1)}`);
});

test('tramosSolapados no inventa solape cuando los turnos no se tocan', () => {
  const turnos: Turno[] = [
    { inicioMs: 0, finMs: 1000, hablante: 'Hablante 1' },
    { inicioMs: 1000, finMs: 2000, hablante: 'Hablante 2' },
  ];
  assert.deepEqual(tramosSolapados(turnos), []);
});

test('un solape sin agrupar no se cuela: hace falta mas de un hablante distinto', () => {
  const turnos: Turno[] = [
    { inicioMs: 0, finMs: 1000, hablante: 'Hablante 1' },
    { inicioMs: 500, finMs: 1500, hablante: 'Hablante 1' },
  ];
  assert.deepEqual(tramosSolapados(turnos), []);
});

test('solape fuera de [0,1) se rechaza al construir', () => {
  assert.throws(
    () => creaDiarizadorPorSegmentacion({ segmentacion: segmentacionFalsa(), hablante: hablantePorAmplitud, solape: 1 }),
    /solape/,
  );
});
