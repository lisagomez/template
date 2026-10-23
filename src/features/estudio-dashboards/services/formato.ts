/**
 * Formato del lienzo: presenta cifras que ya vinieron de la capa. No calcula ninguna: la variación de un KPI y la
 * participación de una métrica sumable las da el servidor o se derivan de dos cifras de la capa, a la vista.
 */
import type { MetricaListada } from '../types';

const miles = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
const uno = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dos = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function cifra(v: number | null | undefined, unidad: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (unidad === '%') return `${uno.format(v)} %`;
  if (unidad === 'proporción') return `${uno.format(v * 100)} %`;
  if (unidad === 'x') return `${dos.format(v)}×`;
  if (unidad === 'MXN') return Math.abs(v) >= 1e6 ? `${uno.format(v / 1e6)} M MXN` : `${miles.format(v)} MXN`;
  if (Math.abs(v) >= 1e6) return `${uno.format(v / 1e6)} M`;
  if (Math.abs(v) >= 100 || Number.isInteger(v)) return miles.format(v);
  return Math.abs(v) < 10 ? dos.format(v) : uno.format(v);
}

/** Cifra corta para ejes y etiquetas. */
export function corta(v: number | null | undefined, unidad: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (unidad === '%' || unidad === 'proporción') return `${uno.format(unidad === '%' ? v : v * 100)}%`;
  if (Math.abs(v) >= 1e6) return `${uno.format(v / 1e6)} M`;
  if (Math.abs(v) >= 1e3) return `${uno.format(v / 1e3)} k`;
  return Math.abs(v) < 10 && !Number.isInteger(v) ? dos.format(v) : miles.format(v);
}

export function variacion(v: number | null, tipo: '%' | 'pp' | null): string {
  if (v === null || tipo === null) return '—';
  const signo = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${signo}${uno.format(Math.abs(v))} ${tipo === 'pp' ? 'pp' : '%'}`;
}

export function etiqueta(cat: readonly MetricaListada[], nombre: string): string {
  return cat.find((m) => m.nombre === nombre)?.etiqueta ?? nombre;
}

export function unidad(cat: readonly MetricaListada[], nombre: string): string {
  return cat.find((m) => m.nombre === nombre)?.unidad ?? '';
}

const DIM: Record<string, string> = {
  tienda__region: 'región', tienda__tienda_nombre: 'tienda', tienda__estado: 'estado', linea__canal: 'canal', linea__categoria: 'categoría',
  linea__en_campana: 'en campaña', cliente__origen: 'origen', cliente_mes__origen: 'origen', cohorte__origen: 'origen', cliente__segmento: 'segmento',
  cliente__canal_adquisicion: 'canal de adquisición', cliente_mes__estado: 'estado del cliente', campana__campana_nombre: 'campaña', producto__producto_nombre: 'producto',
};
/** Nombre legible de una dimensión; si no está en la lista, el nombre de la capa sin el prefijo de entidad. */
export const dimension = (d: string): string => DIM[d] ?? d.split('__').pop()!.replace(/_/g, ' ');

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const mes = (x: string): string => `${MESES[Number(x.slice(5, 7)) - 1] ?? x} ${x.slice(2, 4)}`;

/** Colores categóricos en orden fijo (nunca ciclados): más de 8 series se pliegan en «otros». */
export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
