import type { EstadoBucle } from '../../../../tools/bucle-voz/dist/index.js';

/** El color de cada estado (los de la fuente, business-os `Orb.tsx`, MIT), en RGB. */
export const COLOR_ESTADO: Record<EstadoBucle | 'error', [number, number, number]> = {
  reposo: [104, 58, 204],
  escuchando: [56, 189, 248],
  transcribiendo: [99, 140, 246],
  pensando: [139, 92, 246],
  hablando: [255, 145, 1],
  error: [239, 68, 68],
};

export const NOMBRE_ESTADO: Record<EstadoBucle, string> = {
  reposo: 'En reposo',
  escuchando: 'Escuchando',
  transcribiendo: 'Transcribiendo',
  pensando: 'Pensando',
  hablando: 'Hablando',
};

export const rgb = ([r, g, b]: readonly number[], a = 1) => `rgba(${r}, ${g}, ${b}, ${a})`;

/** dBFS → 0..1 para pintar (−60 dB = 0, −12 dB = 1). */
export const nivelVisual = (db: number) => Math.max(0, Math.min(1, (db + 60) / 48));
