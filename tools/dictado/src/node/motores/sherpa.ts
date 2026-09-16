/**
 * Motores en proceso por `sherpa-onnx-node`: Parakeet TDT (NeMo, transductor) y Whisper.
 *
 * `sherpa` llega importado por el consumidor (peer opcional). El tipo de modelo se DEDUCE de
 * los archivos de la carpeta —`encoder/decoder/joiner.int8.onnx` es un transductor,
 * `<prefijo>-encoder.int8.onnx` es Whisper— y no de un nombre: una carpeta con los archivos
 * mal puestos falla al crear el motor, no en la frase 40.
 *
 * Se prefiere `decodeAsync` cuando existe: `decode` bloquea el bucle de eventos y, mientras
 * Whisper turbo tarda 2,6 s (medido), el pipe de ffmpeg se llena y se pierde audio.
 */
import { existsSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Motor, Muestras, Transcripcion } from '../../types.js';

export interface FlujoSherpa {
  acceptWaveform(onda: { samples: Float32Array; sampleRate: number }): void;
}

export interface ReconocedorSherpa {
  createStream(): FlujoSherpa;
  decode(flujo: FlujoSherpa): void;
  decodeAsync?(flujo: FlujoSherpa): Promise<unknown>;
  getResult(flujo: FlujoSherpa): { text: string; lang?: string };
}

/** Lo que este modulo usa de `sherpa-onnx-node`. Se declara aqui para no depender de sus tipos. */
export interface ModuloSherpa {
  OfflineRecognizer: new (config: Record<string, unknown>) => ReconocedorSherpa;
}

export interface OpcionesMotorSherpa {
  sherpa: ModuloSherpa;
  /** Carpeta del modelo tal como la deja el tarball de sherpa-onnx. */
  carpeta: string;
  hilos?: number;
  /** Solo Whisper: idioma fijo. Parakeet v3 detecta el suyo. */
  idioma?: string;
  /** Solo Whisper: cuantizacion, `int8` (por defecto) o `fp32`. */
  cuantizacion?: 'int8' | 'fp32';
}

interface Forma {
  tipo: 'parakeet' | 'whisper';
  config: Record<string, unknown>;
  id: string;
}

function detectaForma(opciones: OpcionesMotorSherpa): Forma {
  const { carpeta } = opciones;
  const hilos = opciones.hilos ?? 8;
  const sufijo = (opciones.cuantizacion ?? 'int8') === 'int8' ? '.int8.onnx' : '.onnx';
  // `sherpa-onnx-whisper-turbo` → `sherpa:whisper-turbo`: el prefijo de la carpeta ya lo dice el runtime.
  const nombre = basename(carpeta).replace(/^sherpa-onnx-/, '');
  if (existsSync(join(carpeta, `joiner${sufijo}`))) {
    return {
      tipo: 'parakeet',
      id: `sherpa:${nombre}`,
      config: {
        featConfig: { sampleRate: 16_000, featureDim: 80 },
        modelConfig: {
          transducer: { encoder: join(carpeta, `encoder${sufijo}`), decoder: join(carpeta, `decoder${sufijo}`), joiner: join(carpeta, `joiner${sufijo}`) },
          tokens: join(carpeta, 'tokens.txt'),
          numThreads: hilos,
          provider: 'cpu',
          modelType: 'nemo_transducer',
          debug: 0,
        },
        decodingMethod: 'greedy_search',
      },
    };
  }
  const prefijo = readdirSync(carpeta).map((f) => /^(.+)-encoder\.int8\.onnx$/.exec(f)?.[1]).find((p): p is string => p !== undefined);
  if (prefijo === undefined) throw new Error(`${carpeta}: no parece un modelo de sherpa-onnx (ni transductor ni whisper)`);
  return {
    tipo: 'whisper',
    id: `sherpa:${nombre}-${opciones.cuantizacion ?? 'int8'}`,
    config: {
      featConfig: { sampleRate: 16_000, featureDim: 80 },
      modelConfig: {
        whisper: { encoder: join(carpeta, `${prefijo}-encoder${sufijo}`), decoder: join(carpeta, `${prefijo}-decoder${sufijo}`), language: opciones.idioma ?? 'es', task: 'transcribe', tailPaddings: -1 },
        tokens: join(carpeta, `${prefijo}-tokens.txt`),
        numThreads: hilos,
        provider: 'cpu',
        debug: 0,
      },
    },
  };
}

export function creaMotorSherpa(opciones: OpcionesMotorSherpa): Motor & { tipo: Forma['tipo']; calienta(): Promise<void> } {
  const forma = detectaForma(opciones);
  const reconocedor = new opciones.sherpa.OfflineRecognizer(forma.config);
  let cola: Promise<unknown> = Promise.resolve();

  const transcribe = async (muestras: Muestras, frecuenciaHz: number): Promise<Transcripcion> => {
    const t0 = performance.now();
    const flujo = reconocedor.createStream();
    flujo.acceptWaveform({ samples: muestras, sampleRate: frecuenciaHz });
    if (reconocedor.decodeAsync) await reconocedor.decodeAsync(flujo);
    else reconocedor.decode(flujo);
    const resultado = reconocedor.getResult(flujo);
    return { texto: resultado.text.trim(), ...(resultado.lang ? { idioma: resultado.lang.replace(/[<>|]/g, '') } : {}), ms: performance.now() - t0 };
  };

  return {
    id: forma.id,
    tipo: forma.tipo,
    // Whisper lo admitiria por prompt, pero sherpa-onnx no lo expone; se declara lo que se honra.
    admitePista: false,
    // En serie: una segunda decodificacion concurrente compite por los mismos hilos y sale mas lenta que esperar.
    transcribe(muestras: Muestras, frecuenciaHz: number) {
      const turno = cola.then(() => transcribe(muestras, frecuenciaHz));
      cola = turno.catch(() => undefined);
      return turno;
    },
    async calienta() {
      await transcribe(new Float32Array(16_000), 16_000);
    },
  };
}
