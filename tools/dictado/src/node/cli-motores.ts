/**
 * De la configuracion a los objetos: cargar runtimes opcionales, elegir motor, montar el VAD.
 * Los runtimes se resuelven desde `DICTADO_RUNTIME` si esta (en este repo, `medicion/banco`)
 * y si no desde el `node_modules` que vea el paquete: son peers, el consumidor los aporta.
 */
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { RuntimeOnnx } from '@tu-scope/voz/node';
import type { Motor } from '../types.js';
import type { Configuracion } from './cli-config.js';
import { creaMotorPorProceso } from './motores/proceso.js';
import { creaMotorSherpa, type ModuloSherpa } from './motores/sherpa.js';
import { creaTranscriptorRemoto } from '../remoto/index.js';
import { creaDetectorSilero, type OpcionesDetectorSilero } from './vad.js';

const RAIZ_PAQUETE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function cargaRuntime<T>(nombre: string, config: Configuracion): Promise<T> {
  const raices = [config.runtime, RAIZ_PAQUETE, process.cwd()].filter((r): r is string => r !== undefined);
  for (const raiz of raices) {
    try {
      const ruta = createRequire(pathToFileURL(join(raiz, 'x.js'))).resolve(nombre);
      const modulo = (await import(pathToFileURL(ruta).href)) as { default?: T } & T;
      return (modulo.default ?? modulo) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') throw error;
    }
  }
  throw new Error(`no encuentro ${nombre}: instalalo (es peer opcional) o apunta DICTADO_RUNTIME a una carpeta cuyo node_modules lo tenga`);
}

export const MOTORES_SHERPA: Record<string, string> = {
  parakeet: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8',
  'whisper-turbo': 'sherpa-onnx-whisper-turbo',
  'whisper-base': 'sherpa-onnx-whisper-base',
  'whisper-small': 'sherpa-onnx-whisper-small',
};

/** Que hay instalado: para `dictado motores` y para un error util cuando falta uno. */
export function motoresDisponibles(config: Configuracion): string[] {
  const carpetas = existsSync(config.modelos) ? readdirSync(config.modelos) : [];
  const salida = Object.entries(MOTORES_SHERPA).filter(([, carpeta]) => carpetas.includes(carpeta)).map(([nombre]) => nombre);
  if (carpetas.includes('faster-whisper')) salida.push('faster-whisper:<small|large-v3-turbo|...>');
  if (config.remoto.url) salida.push('remoto');
  return salida;
}

export async function creaMotor(eleccion: string, config: Configuracion, idioma = 'es'): Promise<Motor> {
  if (eleccion === 'remoto') {
    if (!config.remoto.url || !config.remoto.token) throw new Error('el motor remoto necesita DICTADO_REMOTO_URL y DICTADO_REMOTO_TOKEN');
    return creaTranscriptorRemoto({ url: config.remoto.url, token: config.remoto.token });
  }
  if (eleccion.startsWith('faster-whisper')) {
    const modelo = eleccion.split(':')[1] ?? 'small';
    return creaMotorPorProceso({
      id: `faster-whisper-${modelo}-int8-cpu`,
      comando: config.python,
      argumentos: [join(RAIZ_PAQUETE, 'motores-locales', 'motor-faster-whisper.py'), '--modelo', modelo, '--dispositivo', 'cpu', '--hilos', String(config.hilos), '--raiz-modelos', join(config.modelos, 'faster-whisper')],
      admitePista: true,
    });
  }
  const carpeta = MOTORES_SHERPA[eleccion];
  if (!carpeta) throw new Error(`motor desconocido «${eleccion}». Disponibles: ${motoresDisponibles(config).join(', ') || '(ninguno: corre npm run mide o apunta DICTADO_MODELOS)'}`);
  const ruta = join(config.modelos, carpeta);
  if (!existsSync(ruta)) throw new Error(`falta el modelo ${carpeta} en ${config.modelos} (npm run mide lo descarga)`);
  const sherpa = await cargaRuntime<ModuloSherpa>('sherpa-onnx-node', config);
  return creaMotorSherpa({ sherpa, carpeta: ruta, hilos: config.hilos, idioma });
}

export async function creaDetector(config: Configuracion, ajustes: Partial<Omit<OpcionesDetectorSilero, 'ort' | 'rutaModelo'>> = {}) {
  const rutaModelo = join(config.modelos, 'silero_vad.onnx');
  if (!existsSync(rutaModelo)) throw new Error(`falta ${rutaModelo} (npm run mide lo descarga)`);
  const ort = await cargaRuntime<RuntimeOnnx>('onnxruntime-node', config);
  return creaDetectorSilero({ ort, rutaModelo, ...ajustes });
}

export async function cargaOrt(config: Configuracion): Promise<RuntimeOnnx> {
  return cargaRuntime<RuntimeOnnx>('onnxruntime-node', config);
}
