/**
 * Las clases de una transición `desde → hasta`, calculadas sobre Γ. La pertenencia a C_t es por
 * COMPRA (≥ 1 transacción en t), que es lo que el dueño entiende por «compró»; la clasificación de
 * los retenidos (expansión, contracción, estable) es por la métrica, con la banda de la spec.
 */
import { ANONIMO } from '../datos/gamma.js';
import type { Especificacion, Metrica } from '../ontologia/especificacion.js';
import { valorDeMetrica, type Indice } from './indice.js';
import type { Clase } from './terminos.js';

export interface Transicion { readonly desde: string; readonly hasta: string }

/** Miembros de cada clase (A se representa con el miembro `ANONIMO`). Ordenados. */
export type Particion = Readonly<Record<Clase, readonly string[]>>;

/** ¿|Δ| ≤ banda × R_desde? Con R_desde ≤ 0 solo es estable si Δ = 0. Entero, sin flotantes. */
export function esEstable(antes: number, delta: number, bandaPorMil: number): boolean {
  if (antes <= 0) return delta === 0;
  return Math.abs(delta) * 1000 <= bandaPorMil * antes;
}

export function clasesDe(ix: Indice, e: Especificacion, m: Metrica, t: Transicion, segmento?: string): Particion {
  const a0 = ix.actividad(t.desde);
  const a1 = ix.actividad(t.hasta);
  const entra = (c: string) => c !== ANONIMO && (segmento === undefined || ix.segmento(c) === segmento);
  const compro = (a: ReadonlyMap<string, { tx: number }>, c: string) => (a.get(c)?.tx ?? 0) > 0;
  const U = [...new Set([...a0.keys(), ...a1.keys()])].filter(entra).sort();
  const r: Record<Clase, string[]> = { T: [], U, A: [], N: [], L: [], K: [], K_exp: [], K_con: [], K_flat: [], Z: [] };
  for (const c of U) {
    const [antes, ahora] = [compro(a0, c), compro(a1, c)];
    if (ahora && !antes) r.N.push(c);
    else if (antes && !ahora) r.L.push(c);
    else if (!antes && !ahora) r.Z.push(c);
    else {
      r.K.push(c);
      const r0 = valorDeMetrica(a0.get(c), m);
      const d = valorDeMetrica(a1.get(c), m) - r0;
      if (esEstable(r0, d, e.estable.bandaPorMil)) r.K_flat.push(c);
      else (d > 0 ? r.K_exp : r.K_con).push(c);
    }
  }
  const hayAnonimo = segmento === undefined && (a0.has(ANONIMO) || a1.has(ANONIMO));
  r.A = hayAnonimo ? [ANONIMO] : [];
  r.T = [...U, ...r.A];
  return r;
}

/** R de un conjunto de miembros en un periodo. */
export function ingresoDe(ix: Indice, m: Metrica, periodo: string, miembros: readonly string[]): number {
  const a = ix.actividad(periodo);
  let total = 0;
  for (const c of miembros) total += valorDeMetrica(a.get(c), m);
  return total;
}

export function transaccionesDe(ix: Indice, periodo: string, miembros: readonly string[]): number {
  const a = ix.actividad(periodo);
  let total = 0;
  for (const c of miembros) total += a.get(c)?.tx ?? 0;
  return total;
}
