/** Utilidades de texto compartidas por las reglas: normalizar, partir en frases, numeros dichos. */
import { parseaCantidad } from '../../../../tools/dictado/dist/index.js';

export const quitaAcentos = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export const normaliza = (s: string): string => quitaAcentos(s.toLowerCase()).replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();

export const tokeniza = (s: string): string[] => normaliza(s).split(' ').filter((t) => t.length > 0);

/** Parte un texto en frases por puntuacion fuerte o salto de linea; sin frases vacias. */
export function parteEnFrases(texto: string): string[] {
  return texto
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

/**
 * Primer numero que aparece en un texto, en cifras («12») o en palabras («doce», «treinta y
 * cinco», «tres mil», «dos y medio»). `undefined` si no hay ninguno. Es la gramatica unica de
 * cantidades de `tools/dictado` (`texto/numeros.ts`); aqui vivia una copia que llegaba a 999.
 */
export const primerNumero = (texto: string): number | undefined => parseaCantidad(texto)?.valor;

export const formateaMs = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 100)) / 10;
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};
