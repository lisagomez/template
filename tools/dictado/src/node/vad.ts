/**
 * El VAD lo pone `@tu-scope/voz` (Silero por `onnxruntime-node`). Este archivo solo junta las
 * dos piezas con el perfil `dictado` de `voz` —los valores que este paquete MIDIO en
 * `medicion/mide.mjs` y que desde voz 0.5.0 viven alli con su nombre y su medicion—; los de
 * barge-in son otro perfil y aqui el mando que importa es cuanto silencio cierra una frase.
 *
 * `ort` llega importado por el consumidor, como exige `voz`: `onnxruntime-node` es peer
 * opcional y este modulo no lo importa.
 */
import { creaDetectorVoz, PERFILES_DETECTOR, type DetectorVoz, type OpcionesDetector } from '@tu-scope/voz';
import { creaModeloSilero, type RuntimeOnnx } from '@tu-scope/voz/node';

export interface OpcionesDetectorSilero extends Partial<Omit<OpcionesDetector, 'modelo'>> {
  ort: RuntimeOnnx;
  /** Ruta al `silero_vad.onnx` (pineado por URL en `pesos.ts`). */
  rutaModelo: string;
}

/**
 * Los valores por defecto para DICTAR: el perfil `dictado` de `voz` (medido aqui el 2026-09-15
 * sobre 150 frases de FLEURS es_419: 700 ms parte el 6,7 % de las frases, 1000 ms el 0,7 %).
 * Se conserva el nombre para quien ya lo importaba; el dueno es `PERFILES_DETECTOR.dictado`.
 */
export const DEFECTOS_DICTADO = PERFILES_DETECTOR.dictado;

export async function creaDetectorSilero(opciones: OpcionesDetectorSilero): Promise<DetectorVoz & { frecuenciaHz: number }> {
  const modelo = await creaModeloSilero({ ort: opciones.ort, modelo: opciones.rutaModelo });
  const detector = creaDetectorVoz({ perfil: 'dictado', ...opciones, modelo, conservaAudio: true });
  return Object.assign(detector, { frecuenciaHz: modelo.frecuenciaHz });
}
