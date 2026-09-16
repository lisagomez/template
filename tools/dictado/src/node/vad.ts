/**
 * El VAD lo pone `@tu-scope/voz` (Silero por `onnxruntime-node`). Este archivo solo junta las
 * dos piezas con los valores por defecto que este paquete MIDE en `medicion/mide.mjs`; los de
 * `voz` son para barge-in y aqui el mando que importa es cuanto silencio cierra una frase.
 *
 * `ort` llega importado por el consumidor, como exige `voz`: `onnxruntime-node` es peer
 * opcional y este modulo no lo importa.
 */
import { creaDetectorVoz, type DetectorVoz, type OpcionesDetector } from '@tu-scope/voz';
import { creaModeloSilero, type RuntimeOnnx } from '@tu-scope/voz/node';

export interface OpcionesDetectorSilero extends Partial<Omit<OpcionesDetector, 'modelo'>> {
  ort: RuntimeOnnx;
  /** Ruta al `silero_vad.onnx` (pineado por URL en `medicion/mide.mjs`). */
  rutaModelo: string;
}

/**
 * Valores por defecto para DICTAR, no para barge-in. El cierre por silencio sale de la medicion
 * del 2026-09-15 sobre 150 frases leidas de FLEURS es_419 (README §medicion): con 700 ms el VAD
 * parte el 6,7 % de las frases, con 1000 ms el 0,7 %, con 1500 ms ninguna. Se toma el minimo
 * que no parte mas del 1 %: en manos libres cada corte es un pegado a medias, y en los otros
 * modos este mando no anade latencia (los turnos se juntan al terminar). Se conserva el audio,
 * que es lo que come el motor.
 */
export const DEFECTOS_DICTADO = {
  msSilencioParaCerrar: 1000,
  msMinimoHabla: 200,
  msRelleno: 250,
  umbralEntrada: 0.5,
  umbralSalida: 0.35,
} as const;

export async function creaDetectorSilero(opciones: OpcionesDetectorSilero): Promise<DetectorVoz & { frecuenciaHz: number }> {
  const modelo = await creaModeloSilero({ ort: opciones.ort, modelo: opciones.rutaModelo });
  const detector = creaDetectorVoz({ ...DEFECTOS_DICTADO, ...opciones, modelo, conservaAudio: true });
  return Object.assign(detector, { frecuenciaHz: modelo.frecuenciaHz });
}
