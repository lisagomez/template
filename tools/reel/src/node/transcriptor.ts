/**
 * Parakeet TDT (sherpa-onnx) con marcas por palabra, LOCAL (respuesta 3: la transcripción remota nunca
 * por defecto). sherpa-onnx-node se inyecta: el paquete no lo arrastra.
 */
import { join } from 'node:path';
import type { Palabra, Transcripcion, TranscriptorConPalabras } from '../tipos.js';

interface ResultadoSherpa { text: string; tokens: string[]; timestamps?: number[]; durations?: number[] }
interface FlujoSherpa { acceptWaveform(o: { samples: Float32Array; sampleRate: number }): void }
interface ReconocedorSherpa { createStream(): FlujoSherpa; decode(f: FlujoSherpa): void; getResult(f: FlujoSherpa): ResultadoSherpa }
export interface ModuloSherpa { OfflineRecognizer: new (config: unknown) => ReconocedorSherpa }

/** Tokens de SentencePiece → palabras: un token que empieza con espacio abre palabra nueva. */
export function palabrasDeTokens(r: ResultadoSherpa): Palabra[] {
  const ts = r.timestamps ?? [], ds = r.durations ?? [];
  const salida: Palabra[] = [];
  r.tokens.forEach((tok, i) => {
    const inicio = ts[i] ?? 0, fin = inicio + (ds[i] ?? 0.08);
    const u = salida[salida.length - 1];
    if (!u || /^\s/.test(tok)) salida.push({ texto: tok.trim(), inicio, fin });
    else { u.texto += tok; u.fin = fin; }
  });
  return salida.filter((p) => p.texto.length > 0).map((p) => ({ ...p, inicio: Math.round(p.inicio * 1000) / 1000, fin: Math.round(p.fin * 1000) / 1000 }));
}

export function creaTranscriptorParakeet(o: { sherpa: ModuloSherpa; carpeta: string; hilos?: number }): TranscriptorConPalabras {
  const rec = new o.sherpa.OfflineRecognizer({
    featConfig: { sampleRate: 16_000, featureDim: 80 },
    modelConfig: {
      transducer: { encoder: join(o.carpeta, 'encoder.int8.onnx'), decoder: join(o.carpeta, 'decoder.int8.onnx'), joiner: join(o.carpeta, 'joiner.int8.onnx') },
      tokens: join(o.carpeta, 'tokens.txt'), numThreads: o.hilos ?? 4, provider: 'cpu', modelType: 'nemo_transducer', debug: 0,
    },
    decodingMethod: 'greedy_search',
  });
  return {
    async transcribe(muestras: Float32Array, hz: number): Promise<Transcripcion> {
      const t0 = performance.now();
      const f = rec.createStream();
      f.acceptWaveform({ samples: muestras, sampleRate: hz });
      rec.decode(f);
      const r = rec.getResult(f);
      return { texto: r.text.trim(), palabras: palabrasDeTokens(r), idioma: 'es', ms: Math.round(performance.now() - t0) };
    },
  };
}
