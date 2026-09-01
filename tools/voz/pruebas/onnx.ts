/**
 * Pruebas del CONVENIO DE LLAMADA de los envoltorios ONNX.
 *
 * Esta suite existe por un fallo real, encontrado el 2026-09-01 la primera vez que la
 * herramienta corrio contra pesos de verdad: `creaModeloSilero` le daba al modelo v5 marcos
 * de 512 muestras, y v5 espera las **64 ultimas del marco anterior pegadas delante** — 576.
 * El grafo declara la entrada con dimensiones dinamicas, asi que 512 no es un error: la
 * sesion corre y devuelve basura. Medido sobre 10,6 s de habla limpia, la probabilidad
 * maxima era **0,0013** y ningun marco pasaba de 0,5. El VAD entero estaba mudo.
 *
 * Ninguna prueba podia verlo, porque todas las demas usan `modeloEnergia` o modelos falsos
 * y ahi el convenio del `.onnx` no existe. Lo que se fija aqui es exactamente eso: QUE se le
 * pone al runtime en la mano. No sustituye a medir contra pesos reales —eso no cabe en una
 * suite que corre sin red— pero convierte el convenio en algo que se rompe con un fallo
 * rojo en vez de con un silencio.
 *
 *   node --test tools/voz/pruebas/onnx.ts   (requiere `npm run build` en tools/voz)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { creaModeloSilero } from '../dist/node/index.js';
import type { RuntimeOnnx, TensorOnnx } from '../dist/node/index.js';

interface Llamada {
  nombre: string;
  datos: Float32Array | BigInt64Array;
  dims: readonly number[];
}

/**
 * Runtime falso que apunta lo que recibe. No calcula nada: aqui no se mide si el VAD acierta
 * —para eso hace falta el modelo de verdad— sino con que se le llama.
 */
function runtimeEspia(firma: 'v5' | 'v4') {
  const llamadas: Llamada[][] = [];
  const dimEstado = firma === 'v5' ? 128 : 64;

  const ort: RuntimeOnnx = {
    Tensor: class {
      readonly dims: readonly number[];
      readonly data: unknown;
      constructor(_tipo: string, datos: Float32Array | BigInt64Array, dims: readonly number[]) {
        this.data = datos;
        this.dims = dims;
      }
    } as unknown as RuntimeOnnx['Tensor'],
    InferenceSession: {
      async create() {
        return {
          inputNames: firma === 'v5' ? ['input', 'state', 'sr'] : ['input', 'h', 'c', 'sr'],
          outputNames: firma === 'v5' ? ['output', 'stateN'] : ['output', 'hn', 'cn'],
          async run(entradas: Record<string, TensorOnnx>): Promise<Record<string, TensorOnnx>> {
            llamadas.push(
              Object.entries(entradas).map(([nombre, t]) => ({
                nombre,
                datos: t.data as Float32Array | BigInt64Array,
                dims: t.dims,
              })),
            );
            const estado = new Float32Array(2 * dimEstado);
            const salida: Record<string, TensorOnnx> = { output: fakeTensor(new Float32Array([0.87])) };
            if (firma === 'v5') salida.stateN = fakeTensor(estado);
            else {
              salida.hn = fakeTensor(estado);
              salida.cn = fakeTensor(estado);
            }
            return salida;
          },
        };
      },
    },
  };

  const fakeTensor = (datos: Float32Array): TensorOnnx => ({ dims: [datos.length], data: datos });
  const entradaAudio = (i: number) => llamadas[i]!.find((l) => l.nombre === 'input')!;
  return { ort, llamadas, entradaAudio };
}

const marcoDe = (valor: number, largo = 512) => new Float32Array(largo).fill(valor);

test('v5 recibe 576 muestras: las 64 del marco anterior delante de las 512 de este', async () => {
  const espia = runtimeEspia('v5');
  const modelo = await creaModeloSilero({ ort: espia.ort, modelo: 'falso.onnx' });
  assert.equal(modelo.tamMarco, 512, 'el marco que pide a quien llama sigue siendo 512');

  await modelo.probabilidad(marcoDe(0.5));
  const primera = espia.entradaAudio(0);
  assert.deepEqual(primera.dims, [1, 576], '64 de contexto + 512 de marco');
  const datos = primera.datos as Float32Array;
  assert.ok(datos.slice(0, 64).every((x) => x === 0), 'el primer marco no tiene pasado: contexto a cero');
  assert.ok(datos.slice(64).every((x) => x === 0.5), 'detras va el marco entero');

  await modelo.probabilidad(marcoDe(0.25));
  const segunda = espia.entradaAudio(1).datos as Float32Array;
  assert.ok(segunda.slice(0, 64).every((x) => x === 0.5), 'el contexto es la COLA del marco anterior');
  assert.ok(segunda.slice(64).every((x) => x === 0.25));
});

test('a 8 kHz el contexto son 32 muestras, no 64', async () => {
  const espia = runtimeEspia('v5');
  const modelo = await creaModeloSilero({ ort: espia.ort, modelo: 'falso.onnx', frecuenciaHz: 8000 });
  assert.equal(modelo.tamMarco, 256);
  await modelo.probabilidad(marcoDe(0.5, 256));
  assert.deepEqual(espia.entradaAudio(0).dims, [1, 288], '32 + 256');
});

test('v4 NO lleva contexto: su convenio es el marco a secas', async () => {
  const espia = runtimeEspia('v4');
  const modelo = await creaModeloSilero({ ort: espia.ort, modelo: 'falso.onnx' });
  await modelo.probabilidad(marcoDe(0.5));
  await modelo.probabilidad(marcoDe(0.25));
  assert.deepEqual(espia.entradaAudio(0).dims, [1, 512]);
  const segunda = espia.entradaAudio(1).datos as Float32Array;
  assert.ok(segunda.every((x) => x === 0.25), 'nada del marco anterior se cuela delante');
});

test('el contexto se COPIA: reutilizar el buffer del marco no lo corrompe', async () => {
  // El troceador reutiliza su buffer entre marcos. Si el contexto guardara una vista sobre
  // el, el contexto de este marco cambiaria solo al escribirse el siguiente — y el sintoma
  // seria una probabilidad ligeramente mala, que es la clase de fallo que nadie encuentra.
  const espia = runtimeEspia('v5');
  const modelo = await creaModeloSilero({ ort: espia.ort, modelo: 'falso.onnx' });
  const buffer = marcoDe(0.5);
  await modelo.probabilidad(buffer);
  buffer.fill(0.375); // quien llama reutiliza su buffer, como hace el troceador
  await modelo.probabilidad(marcoDe(0.75));
  const segunda = espia.entradaAudio(1).datos as Float32Array;
  assert.ok(segunda.slice(0, 64).every((x) => x === 0.5), 'el contexto conservo el valor de entonces');
});

test('reinicia() olvida el contexto, no solo el estado recurrente', async () => {
  // Arrastrarlo entre dos flujos le mete a uno 64 muestras del otro justo en el arranque,
  // que es donde el VAD decide si abre turno.
  const espia = runtimeEspia('v5');
  const modelo = await creaModeloSilero({ ort: espia.ort, modelo: 'falso.onnx' });
  await modelo.probabilidad(marcoDe(0.5));
  modelo.reinicia();
  await modelo.probabilidad(marcoDe(0.125));
  const tras = espia.entradaAudio(1).datos as Float32Array;
  assert.ok(tras.slice(0, 64).every((x) => x === 0), 'el flujo nuevo empieza sin pasado');
});

test('un modelo que no es Silero falla al crearlo, nombrando lo que esperaba', async () => {
  const raro: RuntimeOnnx = {
    Tensor: class {} as unknown as RuntimeOnnx['Tensor'],
    InferenceSession: {
      async create() {
        return { inputNames: ['x'], outputNames: ['y'], async run() { return {}; } };
      },
    },
  };
  await assert.rejects(() => creaModeloSilero({ ort: raro, modelo: 'falso.onnx' }), /no parece Silero/);
});
