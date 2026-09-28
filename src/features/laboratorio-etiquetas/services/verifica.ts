import type { ResultadoDeCaso } from './tipos.ts';

/**
 * Convierte comprobaciones en un resultado: pasa solo si TODAS se cumplen; si no, la evidencia dice
 * cuáles fallaron. `veredicto` explica en una línea qué demuestra el caso. (El mismo criterio que
 * `laboratorio-pymes/services/verifica.ts`.)
 */
export function verifica(comprobaciones: readonly (readonly [boolean, string])[], evidencia: readonly string[], veredicto: string, visual: Pick<ResultadoDeCaso, 'pieza' | 'referencia'> = {}): ResultadoDeCaso {
  const fallas = comprobaciones.filter(([ok]) => !ok).map(([, que]) => `✗ ${que}`);
  const base = { evidencia: [...evidencia, ...fallas], ...visual };
  return fallas.length === 0 ? { ...base, estado: 'pasa', veredicto } : { ...base, estado: 'falla', veredicto: `No cumple: ${fallas.length} comprobación(es) falló(aron)` };
}

export const noMedido = (motivo: string): ResultadoDeCaso => ({ estado: 'no-medido', evidencia: [motivo], veredicto: 'Sin medir en esta máquina: no cuenta como aprobado.' });
