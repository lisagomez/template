/**
 * Carga los motores LOCALES del reel desde donde los deja el instalador de `tools/dictado`
 * (`~/.dictado/runtime` y `~/.dictado/modelos`) y el detector de caras (`~/.reel/recursos`). Todo
 * pineado por versión y huella (ver tools/reel/LICENCIAS.md). La diarización es la de `@tu-scope/voz`.
 */
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { creaDiarizador } from '../../tools/voz/dist/index.js';
import { creaModeloHablante } from '../../tools/voz/dist/node/index.js';
import type { Diarizacion, ModuloSherpa, Motores } from '../../tools/reel/dist/node/index.js';

export const RUNTIME = process.env['DICTADO_RUNTIME'] ?? join(homedir(), '.dictado', 'runtime');
export const MODELOS = process.env['DICTADO_MODELOS'] ?? join(homedir(), '.dictado', 'modelos');
export const RECURSOS = process.env['REEL_RECURSOS'] ?? join(homedir(), '.reel', 'recursos');

const requiere = createRequire(join(RUNTIME, 'package.json'));
export const sherpa = requiere('sherpa-onnx-node') as ModuloSherpa & { OfflineTts: new (c: unknown) => { sampleRate: number; generate(o: { text: string; sid: number; speed: number }): { samples: Float32Array; sampleRate: number } } };
export const ort = requiere('onnxruntime-node') as unknown;

export const diarizacion = { creaModeloHablante, creaDiarizador } as unknown as Diarizacion;

export function motores(): Motores {
  return {
    sherpa, ort, diarizacion,
    parakeet: join(MODELOS, 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8'),
    hablante: join(MODELOS, 'embedding.onnx'),
    yunet: join(RECURSOS, 'face_detection_yunet_2022mar.onnx'),
  };
}

/** Voz sintética local (Piper por sherpa-onnx): el material de prueba es sintético, nadie grabó a nadie. */
export function voz(nombre: 'claude-high' | 'ald-medium') {
  const c = join(MODELOS, `vits-piper-es_MX-${nombre}`);
  const tts = new sherpa.OfflineTts({ model: { vits: { model: join(c, `es_MX-${nombre}.onnx`), tokens: join(c, 'tokens.txt'), dataDir: join(c, 'espeak-ng-data') }, numThreads: 4, provider: 'cpu', debug: 0 } });
  return (texto: string, velocidad = 0.9) => tts.generate({ text: texto, sid: 0, speed: velocidad });
}
