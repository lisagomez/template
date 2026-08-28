/**
 * Silero VAD sobre un runtime ONNX inyectado.
 *
 * Silero es la eleccion por defecto de esta herramienta: ~2 MB, multilingue, y trabaja en
 * marcos de 512 muestras a 16 kHz (~32 ms), que es el grano que necesita un barge-in. Pero
 * el nucleo no lo conoce: aqui solo se traduce entre su firma ONNX y la interfaz
 * `ModeloVoz`, asi que cambiarlo por otro modelo es escribir otro archivo como este.
 *
 * Soporta las dos firmas que circulan:
 *   v5  → entradas `input`, `state`, `sr`   · salidas `output`, `stateN`
 *   v4  → entradas `input`, `h`, `c`, `sr`  · salidas `output`, `hn`, `cn`
 * Se detecta por los nombres de entrada, no por un numero de version que el archivo no
 * lleva. Un modelo desconocido falla al crear la sesion y no en el marco 4000.
 */

import type { ModeloVoz, Muestras } from '../types.js';
import { datosFloat, type RuntimeOnnx, type SesionOnnx, type TensorOnnx } from './tipos.js';

export interface OpcionesSilero {
  /** El modulo `onnxruntime-web` u `onnxruntime-node` ya importado por el consumidor. */
  ort: RuntimeOnnx;
  /** Ruta, URL o bytes del `.onnx`. Los pesos NO viajan en este paquete. */
  modelo: string | ArrayBuffer | Uint8Array;
  /** Silero esta entrenado a 16 kHz (tambien admite 8 kHz). */
  frecuenciaHz?: 8000 | 16000;
  opcionesSesion?: unknown;
}

export async function creaModeloSilero(opciones: OpcionesSilero): Promise<ModeloVoz> {
  const { ort, modelo } = opciones;
  const frecuenciaHz = opciones.frecuenciaHz ?? 16_000;
  const tamMarco = frecuenciaHz === 16_000 ? 512 : 256;

  const sesion: SesionOnnx = await ort.InferenceSession.create(modelo, opciones.opcionesSesion);
  const entradas = new Set(sesion.inputNames);
  const esV5 = entradas.has('state');
  const esV4 = entradas.has('h') && entradas.has('c');
  if (!esV5 && !esV4) {
    throw new Error(
      `el modelo no parece Silero VAD: entradas ${sesion.inputNames.join(', ')}. ` +
        'Se esperaba `state` (v5) o `h`/`c` (v4).',
    );
  }

  const dimEstado = esV5 ? 128 : 64;
  const nuevoEstado = () => new Float32Array(2 * 1 * dimEstado);
  let estado = nuevoEstado();
  let estadoC = nuevoEstado();
  const sr = new BigInt64Array([BigInt(frecuenciaHz)]);

  return {
    tamMarco,
    frecuenciaHz,
    async probabilidad(marco: Muestras): Promise<number> {
      if (marco.length !== tamMarco) {
        throw new Error(`Silero espera marcos de ${tamMarco} muestras y recibio ${marco.length}`);
      }
      const entrada: Record<string, TensorOnnx> = {
        input: new ort.Tensor('float32', marco, [1, tamMarco]),
        sr: new ort.Tensor('int64', sr, [1]),
      };
      if (esV5) {
        entrada.state = new ort.Tensor('float32', estado, [2, 1, dimEstado]);
      } else {
        entrada.h = new ort.Tensor('float32', estado, [2, 1, dimEstado]);
        entrada.c = new ort.Tensor('float32', estadoC, [2, 1, dimEstado]);
      }

      const salida = await sesion.run(entrada);
      // Se copia el estado en vez de guardar el tensor del runtime: onnxruntime puede
      // reutilizar sus buffers de salida entre llamadas, y quedarse la referencia haria
      // que el estado del marco anterior cambiara sola al ejecutar el siguiente.
      if (esV5) {
        estado = new Float32Array(datosFloat(salida.stateN, 'stateN'));
      } else {
        estado = new Float32Array(datosFloat(salida.hn, 'hn'));
        estadoC = new Float32Array(datosFloat(salida.cn, 'cn'));
      }
      return datosFloat(salida.output, 'output')[0] ?? 0;
    },
    reinicia() {
      estado = nuevoEstado();
      estadoC = nuevoEstado();
    },
    async cierra() {
      await sesion.release?.();
    },
  };
}
