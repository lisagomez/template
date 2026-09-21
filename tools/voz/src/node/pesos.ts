/**
 * Los pesos y runtimes PINEADOS por URL y version exactas: una sola lista para la medicion,
 * la demo y el diagnostico. No viajan en el paquete (el consumidor los baja y los inyecta), y
 * `latest` es anti-patron aqui igual que en un modelo de lenguaje: lo que no tiene version no
 * se puede volver a medir.
 */
export interface Peso {
  archivo: string;
  url: string;
  que: string;
  /** Tamano aproximado, para decir cuanto va a bajar antes de bajarlo. */
  mb: number;
}

export const SILERO: Peso = { archivo: 'silero_vad.onnx', url: 'https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx', que: 'Silero VAD v5', mb: 2 };
export const WESPEAKER: Peso = { archivo: 'embedding.onnx', url: 'https://huggingface.co/Wespeaker/wespeaker-voxceleb-resnet34-LM/resolve/main/voxceleb_resnet34_LM.onnx', que: 'WeSpeaker ResNet34-LM (embeddings, come fbank de 80 bandas)', mb: 26 };
export const SEGMENTACION: Peso = { archivo: 'segmentation-3.0.onnx', url: 'https://huggingface.co/onnx-community/pyannote-segmentation-3.0/resolve/main/onnx/model.onnx', que: 'pyannote segmentation-3.0 (mirror sin gate de onnx-community)', mb: 6 };

/** Lo que bajan `npm run mide` y `npm run demo`. Barge-in solo con Silero (o con `modeloEnergia`, nada). */
export const PESOS: readonly Peso[] = [SILERO, WESPEAKER, SEGMENTACION];

/** Runtimes con los que se midio. Son peers opcionales: el consumidor pone el suyo, pineado. */
export const RUNTIMES: Readonly<Record<string, string>> = { 'onnxruntime-node': '1.30.0', 'onnxruntime-web': '1.29.0' };

export const mbDe = (pesos: readonly Peso[]): number => pesos.reduce((s, p) => s + p.mb, 0);
