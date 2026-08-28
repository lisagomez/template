/**
 * Embeddings de hablante sobre un runtime ONNX inyectado.
 *
 * A diferencia del VAD, aqui NO hay un modelo canonico: WeSpeaker, 3D-Speaker, ECAPA y
 * compania tienen entradas distintas —unos comen forma de onda cruda, la mayoria comen
 * fbank— y nombres de tensor distintos. Por eso esto es configurable en vez de cableado.
 *
 * El fallo tipico con estos modelos es SILENCIOSO: si les das el formato equivocado no
 * lanzan error, devuelven vectores que parecen validos y la diarizacion se equivoca sin
 * decir por que. Contrasta la ficha del modelo antes de fiarte del resultado.
 */

import { fbank, type OpcionesFbank } from '../audio/fbank.js';
import type { ModeloHablante, Muestras } from '../types.js';
import { datosFloat, type RuntimeOnnx, type SesionOnnx, type TensorOnnx } from './tipos.js';

export interface OpcionesModeloHablante {
  ort: RuntimeOnnx;
  modelo: string | ArrayBuffer | Uint8Array;
  frecuenciaHz?: number;
  /** `fbank` (lo normal) o `onda` para los modelos que comen la senal cruda. */
  entrada?: 'fbank' | 'onda';
  /** Nombre del tensor de entrada. Si no se da, se usa el primero que declare el modelo. */
  nombreEntrada?: string;
  /** Nombre del tensor de salida. Si no se da, se usa el primero que declare el modelo. */
  nombreSalida?: string;
  fbank?: OpcionesFbank;
}

export async function creaModeloHablante(opciones: OpcionesModeloHablante): Promise<ModeloHablante> {
  const { ort, modelo } = opciones;
  const frecuenciaHz = opciones.frecuenciaHz ?? 16_000;
  const tipoEntrada = opciones.entrada ?? 'fbank';
  const sesion: SesionOnnx = await ort.InferenceSession.create(modelo, undefined);
  const nombreEntrada = opciones.nombreEntrada ?? sesion.inputNames[0];
  const nombreSalida = opciones.nombreSalida ?? sesion.outputNames[0];
  if (!nombreEntrada || !nombreSalida) throw new Error('el modelo no declara entradas o salidas');

  return {
    frecuenciaHz,
    async vector(muestras: Muestras): Promise<Float32Array> {
      let tensor: TensorOnnx;
      if (tipoEntrada === 'onda') {
        tensor = new ort.Tensor('float32', muestras, [1, muestras.length]);
      } else {
        const marcos = fbank(muestras, { frecuenciaHz, ...opciones.fbank });
        if (marcos.length === 0) {
          throw new Error('fragmento demasiado corto para extraer fbank: sube `msMinimo` del diarizador');
        }
        const numMel = marcos[0]!.length;
        const plano = new Float32Array(marcos.length * numMel);
        marcos.forEach((marco, i) => plano.set(marco, i * numMel));
        tensor = new ort.Tensor('float32', plano, [1, marcos.length, numMel]);
      }

      const salida = await sesion.run({ [nombreEntrada]: tensor });
      const bruto = datosFloat(salida[nombreSalida], nombreSalida);
      // L2: el agrupamiento usa distancia coseno, y normalizar aqui una vez evita que cada
      // llamada a `distanciaCoseno` repita la misma raiz cuadrada por cada par comparado.
      let norma = 0;
      for (let i = 0; i < bruto.length; i++) norma += bruto[i]! * bruto[i]!;
      norma = Math.sqrt(norma) || 1;
      const normalizado = new Float32Array(bruto.length);
      for (let i = 0; i < bruto.length; i++) normalizado[i] = bruto[i]! / norma;
      return normalizado;
    },
    async cierra() {
      await sesion.release?.();
    },
  };
}
