/**
 * El valor de un término sobre Γ. Determinista y entero: centavos, conteos, fracciones de enteros,
 * y el resultado de una prueba con su semilla. Es lo único que «calcula» en todo el sistema; el
 * kernel lo vuelve a llamar para cada hecho citado, en vez de creerle al proponente.
 */
import { anterior } from '../comun/periodos.js';
import type { Gamma } from '../datos/gamma.js';
import type { Especificacion, Metrica } from '../ontologia/especificacion.js';
import { clasesDe, ingresoDe, transaccionesDe, type Particion, type Transicion } from './clases.js';
import { pruebaDosMuestras, pruebaPareada, type ResultadoDePrueba } from './estadistica.js';
import { indiceDe, valorDeMetrica, type Indice } from './indice.js';
import { aportesLmdi } from './lmdi.js';
import type { Clase, Termino } from './terminos.js';

export type Valor =
  | { readonly tipo: 'centavos'; readonly v: number }
  | { readonly tipo: 'conteo'; readonly v: number }
  | { readonly tipo: 'fraccion'; readonly num: number; readonly den: number }
  | { readonly tipo: 'prueba'; readonly r: ResultadoDePrueba }
  | { readonly tipo: 'lista'; readonly items: readonly { readonly cliente: string; readonly centavos: number }[] }
  | { readonly tipo: 'no_aplica'; readonly motivo: string };

const cacheClases = new WeakMap<Indice, Map<string, Particion>>();

export function particionDe(ix: Indice, e: Especificacion, m: Metrica, t: Transicion, segmento?: string): Particion {
  let porClave = cacheClases.get(ix);
  if (!porClave) { porClave = new Map(); cacheClases.set(ix, porClave); }
  const clave = `${m}|${t.desde}|${t.hasta}|${segmento ?? ''}`;
  let p = porClave.get(clave);
  if (!p) { p = clasesDe(ix, e, m, t, segmento); porClave.set(clave, p); }
  return p;
}

function miembros(ix: Indice, e: Especificacion, t: Termino & { clase: Clase }, m: Metrica): readonly string[] {
  const todos = particionDe(ix, e, m, t, 'segmento' in t ? t.segmento : undefined)[t.clase];
  return 'cliente' in t && t.cliente ? todos.filter((c) => c === t.cliente) : todos;
}

function prueba(ix: Indice, e: Especificacion, t: Extract<Termino, { m: 'prueba' }>): Valor {
  const { iteraciones, semilla } = e.inferencia;
  if (t.diseno === 'dos_muestras') {
    const montos = (p: string) => ix.transacciones(p).map((x) => x.centavos);
    return { tipo: 'prueba', r: pruebaDosMuestras(montos(t.desde), montos(t.hasta), iteraciones, semilla) };
  }
  const p = particionDe(ix, e, 'neto', t, t.segmento);
  const [a0, a1] = [ix.actividad(t.desde), ix.actividad(t.hasta)];
  const de = (a: typeof a0, c: string) => (t.variable === 'frecuencia' ? (a.get(c)?.tx ?? 0) : valorDeMetrica(a.get(c), 'neto'));
  const diferencias = p.U.map((c) => de(a1, c) - de(a0, c));
  return { tipo: 'prueba', r: pruebaPareada(diferencias, iteraciones, semilla) };
}

function nft(ix: Indice, e: Especificacion, t: Extract<Termino, { m: 'nft' }>): Valor {
  const identificados = t.alcance === 'identificados';
  const existe = identificados ? t.factor !== 'Tx' : t.factor === 'Tx' || t.factor === 'T';
  if (!existe) return { tipo: 'no_aplica', motivo: `el factor ${t.factor} no existe con alcance ${t.alcance}` };
  const factores = (en: 'desde' | 'hasta') => {
    const p = particionDe(ix, e, t.metrica, t);
    const periodo = en === 'desde' ? t.desde : t.hasta;
    const universo = identificados ? p.U : p.T;
    const compradores = universo.filter((c) => (ix.actividad(periodo).get(c)?.tx ?? 0) > 0);
    return { R: ingresoDe(ix, t.metrica, periodo, universo), N: compradores.length, tx: transaccionesDe(ix, periodo, universo) };
  };
  const r = aportesLmdi(factores('desde'), factores('hasta'), identificados);
  if (!r.aplica) return { tipo: 'no_aplica', motivo: r.motivo };
  const orden = identificados ? ['N', 'F', 'T'] : ['Tx', 'T'];
  return { tipo: 'centavos', v: r.aportes[orden.indexOf(t.factor)]! };
}

function top(ix: Indice, e: Especificacion, t: Extract<Termino, { m: 'top' }>): Valor {
  const items = particionDe(ix, e, t.metrica, t)[t.clase]
    .map((cliente) => ({ cliente, centavos: ingresoDe(ix, t.metrica, t.hasta, [cliente]) - ingresoDe(ix, t.metrica, t.desde, [cliente]) }))
    .sort((a, b) => Math.abs(b.centavos) - Math.abs(a.centavos) || (a.cliente < b.cliente ? -1 : 1))
    .slice(0, t.k);
  return { tipo: 'lista', items };
}

export function valorDe(g: Gamma, e: Especificacion, t: Termino): Valor {
  const ix = indiceDe(g);
  switch (t.m) {
    case 'R': return { tipo: 'centavos', v: ingresoDe(ix, t.metrica, t.en === 'desde' ? t.desde : t.hasta, miembros(ix, e, t, t.metrica)) };
    case 'dR': {
      const quien = miembros(ix, e, t, t.metrica);
      return { tipo: 'centavos', v: ingresoDe(ix, t.metrica, t.hasta, quien) - ingresoDe(ix, t.metrica, t.desde, quien) };
    }
    case 'n': return { tipo: 'conteo', v: miembros(ix, e, t, t.metrica).length };
    case 'tx': return { tipo: 'conteo', v: transaccionesDe(ix, t.en === 'desde' ? t.desde : t.hasta, miembros(ix, e, t, t.metrica)) };
    case 'ticket': {
      const periodo = t.en === 'desde' ? t.desde : t.hasta;
      const quien = miembros(ix, e, t, t.metrica);
      const tx = transaccionesDe(ix, periodo, quien);
      return tx === 0 ? { tipo: 'no_aplica', motivo: 'sin transacciones: el ticket promedio no existe' } : { tipo: 'fraccion', num: ingresoDe(ix, t.metrica, periodo, quien), den: tx };
    }
    case 'nft': return nft(ix, e, t);
    case 'prueba': return prueba(ix, e, t);
    case 'top': return top(ix, e, t);
  }
}

/** La transición por omisión: el último periodo del horizonte contra el anterior. */
export const ultimaTransicion = (e: Especificacion): Transicion => ({ desde: anterior(e.horizonte.hasta), hasta: e.horizonte.hasta });
