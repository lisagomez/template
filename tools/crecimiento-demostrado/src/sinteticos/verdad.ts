/**
 * La VERDAD PLANTADA, calculada del libro por RFC y sin ningún módulo del sistema. Solo la leen
 * las pruebas y el laboratorio; el núcleo (`src/` fuera de `sinteticos/` y `laboratorio/`) no la
 * importa, y una prueba lo comprueba leyendo los imports.
 */
import type { Libro } from './libro.js';

type Metrica = 'facturado' | 'neto' | 'cobrado';
interface Act { facturado: number; notas: number; cobrado: number; tx: number }
const ANON = '(público en general)';

function periodo(dia: string, granularidad: 'trimestre' | 'mes'): string {
  const mes = Number(dia.slice(5, 7));
  return granularidad === 'mes' ? dia.slice(0, 7) : `${dia.slice(0, 4)}-${Math.ceil(mes / 3)}T`;
}

function actividad(libro: Libro, p: string): Map<string, Act> {
  const g = p.includes('T') ? 'trimestre' : 'mes';
  const m = new Map<string, Act>();
  const de = (k: string) => { if (!m.has(k)) m.set(k, { facturado: 0, notas: 0, cobrado: 0, tx: 0 }); return m.get(k)!; };
  const ventaPorUuid = new Map(libro.ventas.map((v) => [v.uuid, v] as const));
  if (libro.modelo === 'b2b') {
    for (const v of libro.ventas) {
      if (v.cancelada || periodo(v.dia, g) !== p) continue;
      const a = de(v.anonimo ? ANON : v.rfc);
      a.facturado += v.netoMxn; a.tx += 1;
      if (v.metodo === 'PUE') a.cobrado += v.totalMxn;
    }
    for (const pg of libro.pagos) if (periodo(pg.dia, g) === p) for (const d of pg.documentos) de(ventaPorUuid.get(d.uuid)!.rfc).cobrado += d.pagado;
  } else {
    for (const t of libro.tickets) {
      if (periodo(t.dia, g) !== p) continue;
      const a = de(t.rfc ?? ANON);
      a.facturado += t.importe; a.tx += 1; a.cobrado += t.total;
    }
  }
  for (const n of libro.notas) if (periodo(n.dia, g) === p) de(n.rfc).notas += n.netoMxn;
  return m;
}

const valor = (a: Act | undefined, m: Metrica) => (!a ? 0 : m === 'facturado' ? a.facturado : m === 'neto' ? a.facturado - a.notas : a.cobrado);

export interface VerdadDelPuente {
  readonly desde: string;
  readonly hasta: string;
  readonly metrica: Metrica;
  /** ΔR por clase y cuántos miembros tiene. A = público en general. */
  readonly delta: Readonly<Record<'N' | 'K_exp' | 'K_con' | 'K_flat' | 'L' | 'Z' | 'A' | 'T', number>>;
  readonly miembros: Readonly<Record<'N' | 'K_exp' | 'K_con' | 'K_flat' | 'L' | 'Z', number>>;
  readonly R: { readonly desde: number; readonly hasta: number };
  /** R_desde(N), R_hasta(L): las hipótesis de la forma clásica. */
  readonly hipotesis: { readonly RdesdeN: number; readonly RhastaL: number; readonly deltaZ: number };
  /** Identificados: ingreso, clientes que compraron y transacciones, por periodo. */
  readonly nft: { readonly desde: { R: number; N: number; tx: number }; readonly hasta: { R: number; N: number; tx: number } };
}

export function verdadDelPuente(libro: Libro, metrica: Metrica, desde: string, hasta: string, bandaPorMil: number): VerdadDelPuente {
  const [a0, a1] = [actividad(libro, desde), actividad(libro, hasta)];
  const delta = { N: 0, K_exp: 0, K_con: 0, K_flat: 0, L: 0, Z: 0, A: 0, T: 0 };
  const miembros = { N: 0, K_exp: 0, K_con: 0, K_flat: 0, L: 0, Z: 0 };
  const hip = { RdesdeN: 0, RhastaL: 0, deltaZ: 0 };
  const quienes = new Set([...a0.keys(), ...a1.keys()]);
  for (const c of quienes) {
    const [r0, r1] = [valor(a0.get(c), metrica), valor(a1.get(c), metrica)];
    if (c === ANON) { delta.A += r1 - r0; continue; }
    const [antes, ahora] = [(a0.get(c)?.tx ?? 0) > 0, (a1.get(c)?.tx ?? 0) > 0];
    const d = r1 - r0;
    let k: keyof typeof miembros;
    if (ahora && !antes) { k = 'N'; hip.RdesdeN += r0; } else if (antes && !ahora) { k = 'L'; hip.RhastaL += r1; } else if (!antes && !ahora) { k = 'Z'; hip.deltaZ += d; } else {
      const estable = r0 <= 0 ? d === 0 : Math.abs(d) * 1000 <= bandaPorMil * r0;
      k = estable ? 'K_flat' : d > 0 ? 'K_exp' : 'K_con';
    }
    delta[k] += d; miembros[k] += 1;
  }
  const total = (a: Map<string, Act>) => [...a.values()].reduce((s, x) => s + valor(x, metrica), 0);
  delta.T = total(a1) - total(a0);
  const ident = (a: Map<string, Act>) => {
    const ids = [...a.entries()].filter(([c]) => c !== ANON);
    return { R: ids.reduce((s, [, x]) => s + valor(x, metrica), 0), N: ids.filter(([, x]) => x.tx > 0).length, tx: ids.reduce((s, [, x]) => s + x.tx, 0) };
  };
  return { desde, hasta, metrica, delta, miembros, R: { desde: total(a0), hasta: total(a1) }, hipotesis: hip, nft: { desde: ident(a0), hasta: ident(a1) } };
}
