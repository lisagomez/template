/**
 * El índice de un Γ: actividad por cliente y periodo, calculada una vez y en caché por objeto.
 * Todo entero. Es parte de la base de confianza (junto con el kernel): si aquí se suma mal, el
 * kernel certifica mal. Por eso las pruebas lo cruzan contra la verdad plantada, que se calcula
 * por otro camino.
 */
import { contiene, granularidadDe, periodoDe, type Periodo } from '../comun/periodos.js';
import { ANONIMO, type Gamma, type Transaccion } from '../datos/gamma.js';
import type { Metrica } from '../ontologia/especificacion.js';

export interface Actividad {
  facturado: number;
  notas: number;
  cobrado: number;
  tx: number;
}

export interface Indice {
  readonly gamma: Gamma;
  actividad(p: Periodo): ReadonlyMap<string, Actividad>;
  transacciones(p: Periodo): readonly Transaccion[];
  segmento(cliente: string): string | null;
}

const vacia = (): Actividad => ({ facturado: 0, notas: 0, cobrado: 0, tx: 0 });

export function valorDeMetrica(a: Actividad | undefined, m: Metrica): number {
  if (!a) return 0;
  return m === 'facturado' ? a.facturado : m === 'neto' ? a.facturado - a.notas : a.cobrado;
}

function actividadDe(g: Gamma, p: Periodo): Map<string, Actividad> {
  const gr = granularidadDe(p);
  const fuera = new Map<string, Actividad>();
  const de = (c: string) => { let a = fuera.get(c); if (!a) { a = vacia(); fuera.set(c, a); } return a; };
  const clientePorDocumento = new Map(g.contenido.transacciones.map((t) => [t.id, t.cliente] as const));
  for (const t of g.contenido.transacciones) {
    if (periodoDe(t.dia, gr) !== p) continue;
    const a = de(t.cliente);
    a.facturado += t.centavos;
    a.tx += 1;
    if (t.metodo === 'PUE') a.cobrado += t.totalCentavos;
  }
  for (const n of g.contenido.notas) if (periodoDe(n.dia, gr) === p) de(n.cliente).notas += n.centavos;
  for (const pg of g.contenido.pagos) {
    if (periodoDe(pg.dia, gr) !== p) continue;
    de(clientePorDocumento.get(pg.documento) ?? ANONIMO).cobrado += pg.centavos;
  }
  return fuera;
}

const cache = new WeakMap<Gamma, Indice>();

export function indiceDe(g: Gamma): Indice {
  const hecho = cache.get(g);
  if (hecho) return hecho;
  const porPeriodo = new Map<Periodo, Map<string, Actividad>>();
  const segmentos = new Map(g.contenido.segmentos.map((s) => [s.cliente, s.segmento] as const));
  const indice: Indice = {
    gamma: g,
    actividad(p) {
      let a = porPeriodo.get(p);
      if (!a) { a = actividadDe(g, p); porPeriodo.set(p, a); }
      return a;
    },
    transacciones: (p) => g.contenido.transacciones.filter((t) => contiene(p, t.dia)),
    segmento: (c) => segmentos.get(c) ?? null,
  };
  cache.set(g, indice);
  return indice;
}
