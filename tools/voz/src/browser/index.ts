/**
 * Punto de entrada del navegador: microfono → marcos a 16 kHz → detector.
 *
 * `onnxruntime-web` es peerDependency OPCIONAL y este archivo no lo importa: se lo pasas ya
 * importado a `creaModeloSilero`. Asi tu proyecto fija la version y su empaquetado (WASM,
 * WebGPU, rutas de los `.wasm`) sin que esta herramienta opine.
 */

export { creaModeloSilero, type OpcionesSilero } from '../onnx/silero.js';
export { creaModeloHablante, type OpcionesModeloHablante } from '../onnx/hablante.js';
export {
  creaModeloSegmentacion,
  type FormatoSalida,
  type OpcionesSegmentacion,
} from '../onnx/segmentacion.js';
export type { RuntimeOnnx, SesionOnnx, TensorOnnx } from '../onnx/tipos.js';

import { creaRemuestreador } from '../audio/remuestreo.js';
import type { Muestras } from '../types.js';

export interface OpcionesMicrofono {
  /** Frecuencia que espera el modelo. Silero: 16000. */
  frecuenciaHz: number;
  /** Se llama con audio mono ya remuestreado, listo para `detector.procesa`. */
  alRecibir(muestras: Muestras): void;
  /** Restricciones para getUserMedia. Por defecto se apagan los procesados del navegador. */
  restricciones?: MediaTrackConstraints;
  /** Un stream ya obtenido, si prefieres pedir permisos por tu cuenta. */
  stream?: MediaStream;
}

export interface CapturaMicrofono {
  /** Corta la captura y libera el microfono. */
  detiene(): Promise<void>;
  readonly frecuenciaEntradaHz: number;
}

/**
 * Codigo del AudioWorklet, como texto.
 *
 * Va embebido y se carga por Blob URL en vez de como archivo suelto porque un worklet es un
 * modulo separado que el navegador pide por URL: publicado como archivo, cada consumidor
 * tendria que copiarlo a su carpeta publica y mantener esa ruta. Es el tipo de paso manual
 * que se olvida y solo falla en produccion.
 */
const WORKLET = `
class CapturaVoz extends AudioWorkletProcessor {
  process(entradas) {
    const canal = entradas[0] && entradas[0][0];
    if (canal && canal.length > 0) this.port.postMessage(new Float32Array(canal));
    return true;
  }
}
registerProcessor('captura-voz', CapturaVoz);
`;

/**
 * Abre el microfono y entrega marcos mono a la frecuencia del modelo.
 *
 * Apaga por defecto `echoCancellation`, `noiseSuppression` y `autoGainControl`: son buenos
 * para una llamada y malos aqui. El supresor de ruido recorta los arranques de palabra —lo
 * que el VAD necesita para reaccionar rapido— y el control de ganancia mueve el suelo de
 * ruido, que es justo lo que un umbral de energia mide.
 */
export async function capturaMicrofono(opciones: OpcionesMicrofono): Promise<CapturaMicrofono> {
  const stream =
    opciones.stream ??
    (await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        ...opciones.restricciones,
      },
    }));

  const contexto = new AudioContext();
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
  try {
    await contexto.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }

  const remuestreador = creaRemuestreador(contexto.sampleRate, opciones.frecuenciaHz);
  const fuente = contexto.createMediaStreamSource(stream);
  const nodo = new AudioWorkletNode(contexto, 'captura-voz');
  nodo.port.onmessage = (evento: MessageEvent<Float32Array>) => {
    const remuestreado = remuestreador.procesa(evento.data);
    if (remuestreado.length > 0) opciones.alRecibir(remuestreado);
  };
  fuente.connect(nodo);
  // El worklet no produce salida, pero sin conectarlo a algo el grafo puede no arrancar en
  // algunos navegadores. Un destino mudo evita devolverle su propia voz al usuario.
  const mudo = contexto.createGain();
  mudo.gain.value = 0;
  nodo.connect(mudo).connect(contexto.destination);

  return {
    frecuenciaEntradaHz: contexto.sampleRate,
    async detiene() {
      nodo.port.onmessage = null;
      nodo.disconnect();
      fuente.disconnect();
      for (const pista of stream.getTracks()) pista.stop();
      await contexto.close();
    },
  };
}
