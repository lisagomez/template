/**
 * Los pesos y runtimes PINEADOS por URL y version exactas: una sola lista para la medicion,
 * la demo y el diagnostico. No viajan en el paquete (el consumidor los baja y los inyecta), y
 * `latest` es anti-patron aqui igual que en un modelo de lenguaje: lo que no tiene version no
 * se puede volver a medir.
 */
import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';

export interface Peso {
  archivo: string;
  /** Referencia INMUTABLE: etiqueta o commit, nunca `master`/`main` (esas se mueven sin avisar). */
  url: string;
  que: string;
  /** Tamano aproximado, para decir cuanto va a bajar antes de bajarlo. */
  mb: number;
  /** Huella del archivo tal como se baja (`sha256:` + 64 hex). Lo que no coincide no se usa. */
  sha256: string;
}

/**
 * Hasta el 2026-10-16 se bajaba de `raw/master` y la ficha decía «v5». El archivo del banco, el que
 * corrieron las pruebas y la medición, resultó ser la **v6.2** (misma huella que la etiqueta `v6.2`,
 * misma interfaz de 512 + 64 muestras que la v5): `master` se había movido sin que nadie lo notara.
 * Por eso la URL va a la etiqueta y la huella se comprueba.
 */
export const SILERO: Peso = { archivo: 'silero_vad.onnx', url: 'https://github.com/snakers4/silero-vad/raw/v6.2/src/silero_vad/data/silero_vad.onnx', que: 'Silero VAD v6.2', mb: 2, sha256: 'sha256:1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3' };
export const WESPEAKER: Peso = { archivo: 'embedding.onnx', url: 'https://huggingface.co/Wespeaker/wespeaker-voxceleb-resnet34-LM/resolve/f0c48c298fd835726c27956a5d617bad7115627e/voxceleb_resnet34_LM.onnx', que: 'WeSpeaker ResNet34-LM (embeddings, come fbank de 80 bandas)', mb: 26, sha256: 'sha256:7bb2f06e9df17cdf1ef14ee8a15ab08ed28e8d0ef5054ee135741560df2ec068' };
export const SEGMENTACION: Peso = { archivo: 'segmentation-3.0.onnx', url: 'https://huggingface.co/onnx-community/pyannote-segmentation-3.0/resolve/733a93b6473d019a773298e08cefa686894b1854/onnx/model.onnx', que: 'pyannote segmentation-3.0 (mirror sin gate de onnx-community)', mb: 6, sha256: 'sha256:057ee564753071c0b09b5b611648b50ac188d50846bff5f01e9f7bbf1591ea25' };

/** Lo que bajan `npm run mide` y `npm run demo`. Barge-in solo con Silero (o con `modeloEnergia`, nada). */
export const PESOS: readonly Peso[] = [SILERO, WESPEAKER, SEGMENTACION];

/** Runtimes con los que se midio. Son peers opcionales: el consumidor pone el suyo, pineado. */
export const RUNTIMES: Readonly<Record<string, string>> = { 'onnxruntime-node': '1.30.0', 'onnxruntime-web': '1.29.0' };

export const mbDe = (pesos: readonly Peso[]): number => pesos.reduce((s, p) => s + p.mb, 0);

/** `sha256:` + hex del contenido. */
export const huellaDe = (bytes: Uint8Array): string => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

/**
 * Comprueba la huella de un archivo recién bajado. Si no coincide lo BORRA y lanza: un peso que no
 * es el medido da números que nadie puede reproducir, y en silencio.
 */
export function verificaHuella(ruta: string, esperada: string | null): void {
  if (esperada === null) return;
  const real = huellaDe(readFileSync(ruta));
  if (real === esperada) return;
  rmSync(ruta, { force: true });
  throw new Error(`la huella de ${ruta} no coincide (esperada ${esperada.slice(0, 19)}…, bajada ${real.slice(0, 19)}…): se borró; la referencia cambió o la descarga se corrompió`);
}
