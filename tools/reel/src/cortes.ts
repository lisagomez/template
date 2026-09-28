/**
 * Cortes por reglas (respuesta 4 firmada: v1 sin LLM). Del método de corte se conserva la idea, no el
 * código: se marca lo que se TIRA con su motivo, se deja respiro en las fronteras de frase y se buscan
 * retomas (el dueño repite una frase para decirla mejor: se queda la última toma).
 */
import type { Palabra, Tramo } from './tipos.js';
import { limpiaToken } from './texto.js';

/** `respiroAntes` 0.18 s: cubre el p90 del error medido de las marcas por palabra (140 ms, scripts/reel/mide-marcas.ts). */
export const REGLAS_DE_CORTE = { silencioMax: 0.7, respiroAntes: 0.18, respiroDespues: 0.18, inicioMax: 0.25, finalMax: 0.45, retomaMin: 3, retomaVentana: 14 } as const;

export interface Descarte extends Tramo { motivo: 'silencio' | 'retoma' | 'inicio' | 'final' | 'marca' }
export interface Edl { conservar: Tramo[]; descartes: Descarte[]; duracionOriginal: number }

/** El dueño retoma desde el INICIO de una frase: primera palabra, tras un punto o tras una pausa. */
const inicioDeFrase = (ps: readonly Palabra[], i: number): boolean => {
  const a = ps[i - 1], b = ps[i];
  return i === 0 || !a || !b || /[.!?,;:]$/.test(a.texto) || b.inicio - a.fin >= 0.25;
};

/** Retomas: una secuencia de ≥3 palabras que se repite poco después. Se tira desde la primera toma hasta la segunda. */
export function retomas(palabras: readonly Palabra[], r = REGLAS_DE_CORTE): Descarte[] {
  const n = palabras.map((p) => limpiaToken(p.texto));
  const salida: Descarte[] = [];
  for (let i = 0; i < n.length; i++) {
    for (let j = i + r.retomaMin; j <= Math.min(n.length - r.retomaMin, i + r.retomaVentana); j++) {
      let k = 0;
      while (j + k < n.length && i + k < j && n[i + k] === n[j + k]) k++;
      // Una retoma de verdad empieza justo donde acaba la toma repetida (a lo sumo 2 palabras en medio:
      // «perdón», «este»). Sin esto, «el pan de» en dos frases distintas se leía como retoma (medido).
      if (k >= r.retomaMin && j - (i + k) <= 2 && inicioDeFrase(palabras, i)) {
        const a = palabras[i], b = palabras[j];
        if (a && b) salida.push({ inicio: a.inicio, fin: b.inicio, motivo: 'retoma' });
        i = j - 1;
        break;
      }
    }
  }
  return salida;
}

export function silencios(palabras: readonly Palabra[], duracion: number, r = REGLAS_DE_CORTE): Descarte[] {
  const salida: Descarte[] = [];
  const primera = palabras[0], ultima = palabras[palabras.length - 1];
  if (!primera || !ultima) return [{ inicio: 0, fin: duracion, motivo: 'silencio' }];
  if (primera.inicio > r.inicioMax) salida.push({ inicio: 0, fin: primera.inicio - r.respiroAntes, motivo: 'inicio' });
  for (let i = 1; i < palabras.length; i++) {
    const a = palabras[i - 1], b = palabras[i];
    if (a && b && b.inicio - a.fin > r.silencioMax) salida.push({ inicio: a.fin + r.respiroDespues, fin: b.inicio - r.respiroAntes, motivo: 'silencio' });
  }
  if (duracion - ultima.fin > r.finalMax) salida.push({ inicio: ultima.fin + r.finalMax, fin: duracion, motivo: 'final' });
  return salida.filter((d) => d.fin - d.inicio > 0.05);
}

/** Une los descartes y devuelve lo que se conserva, en orden. */
export function edlDesde(descartes: readonly Descarte[], duracion: number): Edl {
  const orden = [...descartes].sort((a, b) => a.inicio - b.inicio);
  const unidos: Descarte[] = [];
  for (const d of orden) {
    const u = unidos[unidos.length - 1];
    if (u && d.inicio <= u.fin) u.fin = Math.max(u.fin, d.fin);
    else unidos.push({ ...d, inicio: Math.max(0, d.inicio), fin: Math.min(duracion, d.fin) });
  }
  const conservar: Tramo[] = [];
  let t = 0;
  for (const d of unidos) { if (d.inicio > t) conservar.push({ inicio: t, fin: d.inicio }); t = Math.max(t, d.fin); }
  if (t < duracion) conservar.push({ inicio: t, fin: duracion });
  return { conservar: conservar.map(redondea), descartes: unidos.map((d) => ({ ...redondea(d), motivo: d.motivo })), duracionOriginal: duracion };
}

const redondea = (x: Tramo): Tramo => ({ inicio: Math.round(x.inicio * 1000) / 1000, fin: Math.round(x.fin * 1000) / 1000 });

export function propone(palabras: readonly Palabra[], duracion: number): Edl {
  return edlDesde([...silencios(palabras, duracion), ...retomas(palabras)], duracion);
}

export const duracionEditada = (edl: Edl): number => edl.conservar.reduce((s, t) => s + (t.fin - t.inicio), 0);

/** Tiempo original → tiempo del reel editado; `null` si ese instante se cortó. */
export function aEditado(t: number, edl: Edl): number | null {
  let acumulado = 0;
  for (const c of edl.conservar) {
    if (t >= c.inicio && t <= c.fin) return acumulado + (t - c.inicio);
    acumulado += c.fin - c.inicio;
  }
  return null;
}

/** Tiempo del reel editado → tiempo original (para aplicar una marca de la sala). */
export function aOriginal(t: number, edl: Edl): number {
  let acumulado = 0;
  for (const c of edl.conservar) {
    const d = c.fin - c.inicio;
    if (t <= acumulado + d) return c.inicio + (t - acumulado);
    acumulado += d;
  }
  return edl.duracionOriginal;
}
