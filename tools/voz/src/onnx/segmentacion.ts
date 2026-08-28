/**
 * PyanNet (pyannote-segmentation) sobre un runtime ONNX inyectado.
 *
 * Circulan dos formatos de salida y este envoltorio los distingue **por la forma del tensor
 * que devuelve el modelo**, no por un numero de version que el archivo `.onnx` no lleva:
 *
 *   powerset   → `segmentation-3.0`. Las clases son COMBINACIONES de hablantes:
 *                (), (0), (1), (2), (0,1), (0,2), (1,2). Un marco elige UNA clase por
 *                argmax, y de ahi salen los hablantes simultaneos.
 *   multietiqueta → `segmentation` (2.x). Una sigmoide por hablante, independientes.
 *
 * Confundirlos no da error: da una diarizacion silenciosamente mala. Por eso se decide por
 * la dimension real de la salida y se puede forzar cuando el modelo sea raro.
 */

import type { ModeloSegmentacion, Muestras } from '../types.js';
import { datosFloat, type RuntimeOnnx, type SesionOnnx } from './tipos.js';

export type FormatoSalida = 'powerset' | 'multietiqueta';

export interface OpcionesSegmentacion {
  ort: RuntimeOnnx;
  modelo: string | ArrayBuffer | Uint8Array;
  frecuenciaHz?: number;
  /** Duracion de la ventana en segundos. pyannote 3.0 usa 10. */
  duracionVentanaS?: number;
  /** Se deduce de la salida; forzarlo solo si el modelo no encaja en los dos casos. */
  formato?: FormatoSalida;
  /**
   * Orden de las combinaciones powerset. El de por defecto es el de pyannote: primero el
   * silencio, luego los individuales, luego los pares, en orden lexicografico.
   */
  combinaciones?: readonly (readonly number[])[];
  nombreEntrada?: string;
  nombreSalida?: string;
}

/** Combinaciones de pyannote para 3 hablantes y hasta 2 simultaneos: 7 clases. */
const POWERSET_3_2: readonly (readonly number[])[] = [[], [0], [1], [2], [0, 1], [0, 2], [1, 2]];

/** Genera el powerset al estilo pyannote para cualquier numero de clases conocido. */
function combinacionesPara(clases: number): readonly (readonly number[])[] | null {
  if (clases === POWERSET_3_2.length) return POWERSET_3_2;
  // 2 hablantes, hasta 2 simultaneos: (), (0), (1), (0,1)
  if (clases === 4) return [[], [0], [1], [0, 1]];
  return null;
}

export async function creaModeloSegmentacion(
  opciones: OpcionesSegmentacion,
): Promise<ModeloSegmentacion> {
  const { ort, modelo } = opciones;
  const frecuenciaHz = opciones.frecuenciaHz ?? 16_000;
  const duracionVentanaS = opciones.duracionVentanaS ?? 10;
  const muestrasVentana = Math.round(duracionVentanaS * frecuenciaHz);

  const sesion: SesionOnnx = await ort.InferenceSession.create(modelo, undefined);
  const nombreEntrada = opciones.nombreEntrada ?? sesion.inputNames[0];
  const nombreSalida = opciones.nombreSalida ?? sesion.outputNames[0];
  if (!nombreEntrada || !nombreSalida) throw new Error('el modelo de segmentacion no declara entradas o salidas');

  // Una pasada en vacio para conocer la forma real de la salida. Cuesta una inferencia y
  // ahorra tener que creerse la ficha del modelo: aqui se mide.
  const sonda = await sesion.run({
    [nombreEntrada]: new ort.Tensor('float32', new Float32Array(muestrasVentana), [1, 1, muestrasVentana]),
  });
  const tensorSonda = sonda[nombreSalida];
  const dims = tensorSonda?.dims ?? [];
  if (dims.length !== 3) {
    throw new Error(`salida de segmentacion inesperada: dims [${dims.join(', ')}], se esperaba [1, marcos, clases]`);
  }
  const marcos = dims[1]!;
  const clases = dims[2]!;

  const combinaciones = opciones.combinaciones ?? combinacionesPara(clases);
  const formato: FormatoSalida =
    opciones.formato ?? (combinaciones !== null ? 'powerset' : 'multietiqueta');

  if (formato === 'powerset' && !combinaciones) {
    throw new Error(
      `no se conoce el powerset de ${clases} clases: pasa \`combinaciones\` o fuerza formato 'multietiqueta'`,
    );
  }

  const hablantesLocales =
    formato === 'powerset'
      ? Math.max(0, ...combinaciones!.flatMap((c) => c.map((i) => i + 1)))
      : clases;

  return {
    frecuenciaHz,
    muestrasVentana,
    hablantesLocales,
    async ventana(muestras: Muestras): Promise<Float32Array[]> {
      // La ultima ventana de una grabacion casi nunca cae justa. Se rellena con silencio en
      // vez de recortarla: PyanNet tiene entrada de tamano fijo y un tensor corto no falla
      // limpiamente, se interpreta como otra cosa.
      let entrada = muestras;
      if (entrada.length !== muestrasVentana) {
        const ajustada = new Float32Array(muestrasVentana);
        ajustada.set(entrada.subarray(0, Math.min(entrada.length, muestrasVentana)));
        entrada = ajustada;
      }

      const salida = await sesion.run({
        [nombreEntrada]: new ort.Tensor('float32', entrada, [1, 1, muestrasVentana]),
      });
      const plano = datosFloat(salida[nombreSalida], nombreSalida);

      const actividad: Float32Array[] = [];
      for (let m = 0; m < marcos; m++) {
        const marco = new Float32Array(hablantesLocales);
        if (formato === 'multietiqueta') {
          for (let k = 0; k < hablantesLocales; k++) marco[k] = plano[m * clases + k] ?? 0;
        } else {
          // Powerset: el marco pertenece a UNA combinacion, la del logit mas alto. Se
          // reparte a los hablantes de esa combinacion.
          let mejor = 0;
          let mejorValor = -Infinity;
          for (let c = 0; c < clases; c++) {
            const v = plano[m * clases + c] ?? -Infinity;
            if (v > mejorValor) {
              mejorValor = v;
              mejor = c;
            }
          }
          for (const hablante of combinaciones![mejor] ?? []) {
            if (hablante < hablantesLocales) marco[hablante] = 1;
          }
        }
        actividad.push(marco);
      }
      return actividad;
    },
    async cierra() {
      await sesion.release?.();
    },
  };
}
