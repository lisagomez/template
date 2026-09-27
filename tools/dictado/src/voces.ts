/**
 * Las voces sinteticas conocidas, pineadas por URL exacta (C1). Viven aqui, sin dependencias,
 * para que el esquema de ajustes (`ajustes.ts`, puro) pueda ofrecerlas como eleccion. La de
 * defecto es la que se midio el 2026-09-16 y la que el laboratorio eligio de oido entre las tres el
 * 2026-09-22.
 */
export interface VozConocida {
  carpeta: string;
  url: string;
  que: string;
}

export const VOZ_POR_DEFECTO = 'es_MX-claude-high';

export const VOCES: Readonly<Record<string, VozConocida>> = {
  'es_MX-claude-high': { carpeta: 'vits-piper-es_MX-claude-high', url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-es_MX-claude-high.tar.bz2', que: 'Piper es_MX «claude», calidad high, 79 MB' },
  'es_ES-davefx-medium': { carpeta: 'vits-piper-es_ES-davefx-medium', url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-es_ES-davefx-medium.tar.bz2', que: 'Piper es_ES «davefx», calidad medium, 64 MB' },
  'es_MX-ald-medium': { carpeta: 'vits-piper-es_MX-ald-medium', url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-es_MX-ald-medium.tar.bz2', que: 'Piper es_MX «ald», calidad medium, 64 MB' },
};

/** 0,9: elegida de oido por el laboratorio el 2026-09-22 (frente a 1, con frases cortas y puntuadas). */
export const VELOCIDAD_POR_DEFECTO = 0.9;
