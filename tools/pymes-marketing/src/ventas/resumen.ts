/**
 * Resumen de ventas para decidir contenido (fichas de `content-strategy` y la vista de producto de
 * `growth-pulse`): los últimos 90 días (o todo si hay menos), lo que más vende y lo que menos, y lo
 * que se movió más de 25 % en los últimos 30 días contra los 30 anteriores. Todo en PESOS: otra
 * moneda sin tipo de cambio se reporta aparte, jamás sumada. «Hoy» es el último día con datos
 * (no el reloj): el mismo archivo da el mismo resumen.
 */
import { ok, sinDatos, type Dato } from '../comun/dato.js';
import { diasEntre, lunesDe, sumaDias, type Dia } from '../comun/fechas.js';
import type { LineaDeVenta, VentasNormalizadas } from './tipos.js';

export const PERIODO_DIAS = 90;
export const VENTANA_DIAS = 30;
/** Movimiento que se nombra siempre, en cualquier dirección (`growth-pulse/reference/thresholds.md`). */
export const UMBRAL_MOVIMIENTO = 0.25;

export type Metrica = 'ingreso' | 'unidades';

export interface ResumenDeProducto {
  readonly clave: string;
  readonly producto: string;
  readonly unidades: number;
  readonly importe: number;
  readonly recientes: number;
  readonly previos: number;
  /** Cambio relativo de los últimos 30 días contra los 30 anteriores; `null` si antes no vendía. */
  readonly tendencia: number | null;
  readonly participacion: number;
  readonly ultimaVenta: Dia;
  /** Último precio unitario visto en los datos (centavos). En CFDI es SIN IVA. */
  readonly precioUnitario: number | null;
}

export interface ResumenDeVentas {
  readonly desde: Dia;
  readonly hasta: Dia;
  readonly dias: number;
  readonly metrica: Metrica;
  readonly totalPesos: number;
  readonly notasDeCredito: number;
  readonly netoPesos: number;
  readonly lineas: number;
  readonly enOtraMoneda: readonly { readonly moneda: string; readonly centavos: number }[];
  readonly productos: readonly ResumenDeProducto[];
  readonly top: readonly ResumenDeProducto[];
  readonly lentos: readonly ResumenDeProducto[];
  readonly subiendo: readonly ResumenDeProducto[];
  readonly bajando: readonly ResumenDeProducto[];
  readonly concentracionTop: number;
  readonly porCanal: readonly { readonly canal: string; readonly centavos: number }[];
  readonly porSemana: readonly { readonly lunes: Dia; readonly centavos: number }[];
  /** Con menos de 60 días no hay 30 contra 30: no se afirman tendencias. */
  readonly comparable: boolean;
}

interface Acumulado { producto: string; unidades: number; importe: number; recientes: number; previos: number; ultima: Dia; precio: number | null }

function acumula(lineas: readonly LineaDeVenta[], hasta: Dia): ResumenDeProducto[] {
  const inicioReciente = sumaDias(hasta, -(VENTANA_DIAS - 1)), inicioPrevio = sumaDias(inicioReciente, -VENTANA_DIAS);
  const mapa = new Map<string, Acumulado>();
  for (const l of [...lineas].sort((a, b) => a.dia.localeCompare(b.dia))) {
    const p = mapa.get(l.clave) ?? { producto: l.producto, unidades: 0, importe: 0, recientes: 0, previos: 0, ultima: l.dia, precio: null };
    p.unidades += l.cantidad;
    p.importe += l.importe.centavos;
    if (l.dia >= inicioReciente) p.recientes += l.importe.centavos;
    else if (l.dia >= inicioPrevio) p.previos += l.importe.centavos;
    p.ultima = l.dia;
    if (l.cantidad > 0) p.precio = Math.round(l.importe.centavos / l.cantidad);
    mapa.set(l.clave, p);
  }
  const total = [...mapa.values()].reduce((s, p) => s + p.importe, 0) || 1;
  return [...mapa].map(([clave, p]) => ({
    clave, producto: p.producto, unidades: p.unidades, importe: p.importe, recientes: p.recientes, previos: p.previos,
    tendencia: p.previos > 0 ? (p.recientes - p.previos) / p.previos : null, participacion: p.importe / total,
    ultimaVenta: p.ultima, precioUnitario: p.precio,
  }));
}

function agrupa(lineas: readonly LineaDeVenta[], clave: (l: LineaDeVenta) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lineas) m.set(clave(l), (m.get(clave(l)) ?? 0) + l.importe.centavos);
  return m;
}

function ordena(productos: readonly ResumenDeProducto[], metrica: Metrica): ResumenDeProducto[] {
  const valor = (p: ResumenDeProducto) => (metrica === 'ingreso' ? p.importe : p.unidades);
  return [...productos].sort((a, b) => valor(b) - valor(a) || a.clave.localeCompare(b.clave));
}

export function resumeVentas(ventas: VentasNormalizadas, metrica: Metrica = 'ingreso'): Dato<ResumenDeVentas> {
  const pesos = ventas.lineas.filter((l) => l.importe.moneda === 'MXN');
  if (pesos.length === 0) return sinDatos(ventas.lineas.length ? 'hay ventas, pero ninguna en pesos' : 'no hay ventas cargadas');
  const hasta = pesos.reduce((m, l) => (l.dia > m ? l.dia : m), pesos[0]!.dia);
  const enPeriodo = pesos.filter((l) => l.dia > sumaDias(hasta, -PERIODO_DIAS));
  const desde = enPeriodo.reduce((m, l) => (l.dia < m ? l.dia : m), hasta);
  const productos = ordena(acumula(enPeriodo, hasta), metrica);
  const periodo = diasEntre(desde, hasta) + 1;
  const comparable = periodo >= VENTANA_DIAS * 2;
  const movidos = comparable ? productos.filter((p) => p.tendencia !== null) : [];
  const total = productos.reduce((s, p) => s + p.importe, 0);
  const notas = ventas.notasDeCredito?.centavos ?? 0;
  const n = productos.length >= 10 ? 5 : 3;
  return ok({
    desde, hasta, dias: periodo, metrica, totalPesos: total, notasDeCredito: notas, netoPesos: total - notas, lineas: enPeriodo.length,
    enOtraMoneda: [...agrupa(ventas.lineas.filter((l) => l.importe.moneda !== 'MXN'), (l) => l.importe.moneda)].map(([moneda, centavos]) => ({ moneda, centavos })),
    productos,
    top: productos.slice(0, n),
    lentos: productos.length > n ? productos.slice(-n).reverse() : [],
    subiendo: movidos.filter((p) => p.tendencia! >= UMBRAL_MOVIMIENTO).sort((a, b) => b.tendencia! - a.tendencia!),
    bajando: movidos.filter((p) => p.tendencia! <= -UMBRAL_MOVIMIENTO).sort((a, b) => a.tendencia! - b.tendencia!),
    concentracionTop: productos[0] ? productos[0].importe / (total || 1) : 0,
    porCanal: [...agrupa(enPeriodo, (l) => l.canal)].map(([canal, centavos]) => ({ canal, centavos })).sort((a, b) => b.centavos - a.centavos),
    porSemana: [...agrupa(enPeriodo, (l) => lunesDe(l.dia))].map(([lunes, centavos]) => ({ lunes, centavos })).sort((a, b) => a.lunes.localeCompare(b.lunes)),
    comparable,
  });
}
