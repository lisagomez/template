/**
 * Los pesos y runtimes PINEADOS por URL y version exactas (C1): una sola lista para el
 * instalador, la medicion y el diagnostico. `latest` es anti-patron aqui igual que en el modelo.
 * Lo que un usuario necesita para dictar es `NECESARIOS`; el resto solo lo baja `npm run mide`.
 */
export interface PesoCarpeta {
  tipo: 'carpeta';
  carpeta: string;
  url: string;
  que: string;
  mb: number;
}
export interface PesoArchivo {
  tipo: 'archivo';
  archivo: string;
  url: string;
  que: string;
  mb: number;
}
export type Peso = PesoCarpeta | PesoArchivo;

export const PARAKEET: PesoCarpeta = { tipo: 'carpeta', carpeta: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8', url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2', que: 'NVIDIA Parakeet TDT 0.6B v3 (25 idiomas, es incluido), int8, ONNX', mb: 640 };
export const SILERO: PesoArchivo = { tipo: 'archivo', archivo: 'silero_vad.onnx', url: 'https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx', que: 'Silero VAD v5', mb: 2 };
export const WESPEAKER: PesoArchivo = { tipo: 'archivo', archivo: 'embedding.onnx', url: 'https://huggingface.co/Wespeaker/wespeaker-voxceleb-resnet34-LM/resolve/main/voxceleb_resnet34_LM.onnx', que: 'WeSpeaker ResNet34-LM (quien habla, para `lote`)', mb: 26 };
export const PIPER_ES_MX: PesoCarpeta = { tipo: 'carpeta', carpeta: 'vits-piper-es_MX-claude-high', url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-es_MX-claude-high.tar.bz2', que: 'Voz Piper es_MX «claude», calidad high (la maquina habla)', mb: 79 };
export const WHISPER_TURBO: PesoCarpeta = { tipo: 'carpeta', carpeta: 'sherpa-onnx-whisper-turbo', url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-turbo.tar.bz2', que: 'OpenAI Whisper large-v3-turbo, int8, ONNX (solo medicion)', mb: 800 };
export const WHISPER_BASE: PesoCarpeta = { tipo: 'carpeta', carpeta: 'sherpa-onnx-whisper-base', url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-base.tar.bz2', que: 'OpenAI Whisper base, int8, ONNX (solo medicion)', mb: 150 };

/** Lo que hace falta para dictar, separar voces y hablar. Sin corpus ni motores de comparacion. */
export const NECESARIOS: Peso[] = [PARAKEET, SILERO, WESPEAKER, PIPER_ES_MX];
/** Lo que ademas baja `npm run mide` para comparar motores. */
export const DE_MEDICION: Peso[] = [WHISPER_TURBO, WHISPER_BASE];

export const RUNTIMES: Record<string, string> = { 'sherpa-onnx-node': '1.13.8', 'onnxruntime-node': '1.30.0' };

export const rutaDe = (carpeta: string, p: Peso): string => `${carpeta}/${p.tipo === 'carpeta' ? p.carpeta : p.archivo}`;
export const mbDe = (pesos: readonly Peso[]): number => pesos.reduce((s, p) => s + p.mb, 0);
