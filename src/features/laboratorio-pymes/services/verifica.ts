import type { ResultadoDeCaso } from './tipos.ts';

/**
 * Convierte comprobaciones en un resultado: pasa solo si TODAS se cumplen; si no, la evidencia
 * dice cuáles fallaron. `veredicto` explica en una línea qué demuestra el caso.
 */
export function verifica(comprobaciones: readonly (readonly [boolean, string])[], evidencia: readonly string[], veredicto: string, pieza?: string, extra: Pick<ResultadoDeCaso, 'referencia' | 'video'> = {}): ResultadoDeCaso {
  const fallas = comprobaciones.filter(([ok]) => !ok).map(([, que]) => `✗ ${que}`);
  const base = { evidencia: [...evidencia, ...fallas], pieza, ...extra };
  return fallas.length === 0 ? { ...base, estado: 'pasa', veredicto } : { ...base, estado: 'falla', veredicto: `No cumple: ${fallas.length} comprobación(es) falló(aron)` };
}

export function palabras(t: string): number {
  return t.split(/\s+/).filter(Boolean).length;
}
