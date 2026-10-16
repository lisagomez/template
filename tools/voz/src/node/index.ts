/**
 * Punto de entrada de Node: PCM o WAV → marcos a 16 kHz → detector.
 *
 * `onnxruntime-node` es peerDependency OPCIONAL y este archivo no lo importa: se lo pasas ya
 * importado a `creaModeloSilero`. Este entry point no usa ningun modulo de Node tampoco
 * (nada de `fs` ni de `stream`): recibe los bytes que ya tengas. Con eso el mismo codigo
 * sirve en un worker, en una funcion sin sistema de archivos o en una prueba.
 */

export { creaModeloSilero, type OpcionesSilero } from '../onnx/silero.js';
export { creaModeloHablante, type OpcionesModeloHablante } from '../onnx/hablante.js';
export {
  creaModeloSegmentacion,
  type FormatoSalida,
  type OpcionesSegmentacion,
} from '../onnx/segmentacion.js';
export type { RuntimeOnnx, SesionOnnx, TensorOnnx } from '../onnx/tipos.js';
export { huellaDe, mbDe, PESOS, RUNTIMES, SEGMENTACION, SILERO, verificaHuella, WESPEAKER, type Peso } from './pesos.js';

import { aMono, creaRemuestreador } from '../audio/remuestreo.js';
import type { Muestras } from '../types.js';

export interface AudioLeido {
  canales: Muestras[];
  frecuenciaHz: number;
}

/**
 * Lee un WAV PCM (16, 24 o 32 bits enteros, o 32 bits flotante) y devuelve sus canales.
 *
 * Se recorren las cabeceras en vez de asumir que `data` empieza en el byte 44: los WAV que
 * salen de un navegador o de ffmpeg llevan bloques extra (`LIST`, `fact`) y el offset fijo
 * —que es lo que hace medio internet— produce audio corrido y ruido blanco al principio.
 */
export function leeWav(buffer: ArrayBuffer): AudioLeido {
  const vista = new DataView(buffer);
  const texto = (offset: number) =>
    String.fromCharCode(vista.getUint8(offset), vista.getUint8(offset + 1), vista.getUint8(offset + 2), vista.getUint8(offset + 3));
  if (texto(0) !== 'RIFF' || texto(8) !== 'WAVE') throw new Error('no es un archivo WAV');

  let formato = 1;
  let canales = 1;
  let frecuenciaHz = 16_000;
  let bits = 16;
  let datosOffset = -1;
  let datosLargo = 0;

  let pos = 12;
  while (pos + 8 <= vista.byteLength) {
    const id = texto(pos);
    const largo = vista.getUint32(pos + 4, true);
    const cuerpo = pos + 8;
    if (id === 'fmt ') {
      formato = vista.getUint16(cuerpo, true);
      canales = vista.getUint16(cuerpo + 2, true);
      frecuenciaHz = vista.getUint32(cuerpo + 4, true);
      bits = vista.getUint16(cuerpo + 14, true);
    } else if (id === 'data') {
      datosOffset = cuerpo;
      datosLargo = largo;
    }
    pos = cuerpo + largo + (largo % 2); // los bloques se alinean a par
  }
  if (datosOffset < 0) throw new Error('el WAV no tiene bloque `data`');

  const bytesPorMuestra = bits / 8;
  const total = Math.floor(datosLargo / bytesPorMuestra / canales);
  const salida: Muestras[] = Array.from({ length: canales }, () => new Float32Array(total));

  for (let i = 0; i < total; i++) {
    for (let c = 0; c < canales; c++) {
      const off = datosOffset + (i * canales + c) * bytesPorMuestra;
      let valor: number;
      if (formato === 3 && bits === 32) valor = vista.getFloat32(off, true);
      else if (bits === 16) valor = vista.getInt16(off, true) / 32768;
      else if (bits === 24) {
        const bruto = vista.getUint8(off) | (vista.getUint8(off + 1) << 8) | (vista.getUint8(off + 2) << 16);
        valor = ((bruto << 8) >> 8) / 8388608;
      } else if (bits === 32) valor = vista.getInt32(off, true) / 2147483648;
      else throw new Error(`profundidad de ${bits} bits no soportada`);
      salida[c]![i] = valor;
    }
  }
  return { canales: salida, frecuenciaHz };
}

/**
 * Deja el audio listo para el detector: a mono y a la frecuencia del modelo.
 *
 * Para diarizar por canal NO se usa esto: ahi cada canal va por su lado, que es justo la
 * informacion que mezclar a mono destruye.
 */
export function preparaParaModelo(audio: AudioLeido, frecuenciaModeloHz: number): Muestras {
  const mono = aMono(audio.canales);
  if (audio.frecuenciaHz === frecuenciaModeloHz) return mono;
  const remuestreador = creaRemuestreador(audio.frecuenciaHz, frecuenciaModeloHz);
  return remuestreador.procesa(mono);
}

/** Convierte PCM entero de 16 bits (lo que sale de casi cualquier microfono) a flotante. */
export function pcm16aFloat(bytes: Uint8Array): Muestras {
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const salida = new Float32Array(Math.floor(bytes.byteLength / 2));
  for (let i = 0; i < salida.length; i++) salida[i] = vista.getInt16(i * 2, true) / 32768;
  return salida;
}

/** La inversa de `pcm16aFloat`: flotante en [-1, 1] → PCM entero de 16 bits little-endian. Recorta lo que se pase. */
export function floatAPcm16(muestras: Muestras): Uint8Array {
  const salida = new Uint8Array(muestras.length * 2);
  const vista = new DataView(salida.buffer);
  for (let i = 0; i < muestras.length; i++) {
    // Escala simetrica (×32768, tope en 32767): la inversa exacta de `pcm16aFloat` (÷32768).
    vista.setInt16(i * 2, Math.max(-32768, Math.min(32767, Math.round(muestras[i]! * 32768))), true);
  }
  return salida;
}

/**
 * La inversa de `leeWav`: un WAV PCM16 mono, en bytes, listo para escribir o mandar. Sin `fs`
 * a proposito: los bytes valen igual en un archivo, en un Blob o en una respuesta HTTP.
 */
export function codificaWav(muestras: Muestras, frecuenciaHz: number): Uint8Array {
  const pcm = floatAPcm16(muestras);
  const salida = new Uint8Array(44 + pcm.length);
  const vista = new DataView(salida.buffer);
  const escribe = (offset: number, texto: string) => {
    for (let i = 0; i < texto.length; i++) salida[offset + i] = texto.charCodeAt(i);
  };
  escribe(0, 'RIFF');
  vista.setUint32(4, 36 + pcm.length, true);
  escribe(8, 'WAVE');
  escribe(12, 'fmt ');
  vista.setUint32(16, 16, true);
  vista.setUint16(20, 1, true); // PCM
  vista.setUint16(22, 1, true); // mono
  vista.setUint32(24, frecuenciaHz, true);
  vista.setUint32(28, frecuenciaHz * 2, true);
  vista.setUint16(32, 2, true);
  vista.setUint16(34, 16, true);
  escribe(36, 'data');
  vista.setUint32(40, pcm.length, true);
  salida.set(pcm, 44);
  return salida;
}
