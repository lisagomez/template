/**
 * Los pesos y runtimes PINEADOS por URL y version exactas (C1): una sola lista para el
 * instalador, la medicion y el diagnostico. `latest` es anti-patron aqui igual que en el modelo.
 * Lo que un usuario necesita para dictar es `NECESARIOS`; el resto solo lo baja `npm run mide`.
 */
import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';

export interface PesoCarpeta {
  tipo: 'carpeta';
  carpeta: string;
  url: string;
  que: string;
  mb: number;
  /** Huella del `.tar.bz2` tal como se baja (`sha256:` + hex, la que publica el release); `null` si el release no la publica. */
  sha256: string | null;
}
export interface PesoArchivo {
  tipo: 'archivo';
  archivo: string;
  /** Referencia INMUTABLE (etiqueta o commit), nunca `master`/`main`. */
  url: string;
  que: string;
  mb: number;
  sha256: string;
}
export type Peso = PesoCarpeta | PesoArchivo;

export const PARAKEET: PesoCarpeta = { tipo: 'carpeta', carpeta: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8', url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2', que: 'NVIDIA Parakeet TDT 0.6B v3 (25 idiomas, es incluido), int8, ONNX', mb: 640, sha256: 'sha256:5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf' };
export const SILERO: PesoArchivo = { tipo: 'archivo', archivo: 'silero_vad.onnx', url: 'https://github.com/snakers4/silero-vad/raw/v6.2/src/silero_vad/data/silero_vad.onnx', que: 'Silero VAD v6.2 (la ficha decía v5: `master` se movió; ver `voz/src/node/pesos.ts`)', mb: 2, sha256: 'sha256:1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3' };
export const WESPEAKER: PesoArchivo = { tipo: 'archivo', archivo: 'embedding.onnx', url: 'https://huggingface.co/Wespeaker/wespeaker-voxceleb-resnet34-LM/resolve/f0c48c298fd835726c27956a5d617bad7115627e/voxceleb_resnet34_LM.onnx', que: 'WeSpeaker ResNet34-LM (quien habla, para `lote`)', mb: 26, sha256: 'sha256:7bb2f06e9df17cdf1ef14ee8a15ab08ed28e8d0ef5054ee135741560df2ec068' };
export const PIPER_ES_MX: PesoCarpeta = { tipo: 'carpeta', carpeta: 'vits-piper-es_MX-claude-high', url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-es_MX-claude-high.tar.bz2', que: 'Voz Piper es_MX «claude», calidad high (la maquina habla)', mb: 79, sha256: 'sha256:ec33fb689c248fe64810aab564cba97babf0f506672cfd404928d46e751a4721' };
export const WHISPER_TURBO: PesoCarpeta = { tipo: 'carpeta', carpeta: 'sherpa-onnx-whisper-turbo', url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-turbo.tar.bz2', que: 'OpenAI Whisper large-v3-turbo, int8, ONNX (solo medicion)', mb: 800, sha256: null };
export const WHISPER_BASE: PesoCarpeta = { tipo: 'carpeta', carpeta: 'sherpa-onnx-whisper-base', url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-base.tar.bz2', que: 'OpenAI Whisper base, int8, ONNX (solo medicion)', mb: 150, sha256: null };

/** Lo que hace falta para dictar, separar voces y hablar. Sin corpus ni motores de comparacion. */
export const NECESARIOS: Peso[] = [PARAKEET, SILERO, WESPEAKER, PIPER_ES_MX];
/** Lo que ademas baja `npm run mide` para comparar motores. */
export const DE_MEDICION: Peso[] = [WHISPER_TURBO, WHISPER_BASE];

export const RUNTIMES: Record<string, string> = { 'sherpa-onnx-node': '1.13.8', 'onnxruntime-node': '1.30.0' };

/**
 * Huellas: las de los `.tar.bz2` son las que publica el release de sherpa-onnx (campo `digest`);
 * los dos Whisper de comparación se subieron en 2024-10-02, antes de que GitHub las publicara, y
 * quedan en `null` (solo medición, no los usa ningún dictado). Las de los archivos sueltos se
 * comprobaron contra el banco y contra Hugging Face (oid LFS) el 2026-10-16.
 */
export const rutaDe = (carpeta: string, p: Peso): string => `${carpeta}/${p.tipo === 'carpeta' ? p.carpeta : p.archivo}`;
export const mbDe = (pesos: readonly Peso[]): number => pesos.reduce((s, p) => s + p.mb, 0);

/** `sha256:` + hex del contenido. */
export const huellaDe = (bytes: Uint8Array): string => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

/** Comprueba la huella de lo recién bajado; si no coincide, lo BORRA y lanza (un peso distinto del medido da cifras irreproducibles). */
export function verificaHuella(ruta: string, esperada: string | null): void {
  if (esperada === null) return;
  const real = huellaDe(readFileSync(ruta));
  if (real === esperada) return;
  rmSync(ruta, { force: true });
  throw new Error(`la huella de ${ruta} no coincide (esperada ${esperada.slice(0, 19)}…, bajada ${real.slice(0, 19)}…): se borró`);
}
