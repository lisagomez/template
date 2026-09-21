/**
 * Sacar el historial en un archivo: Markdown (para leer), CSV (para una hoja de calculo; comillas y
 * saltos de linea dentro de un dictado van escapados segun RFC 4180) y JSON (tal cual). Puro.
 */
import { agrupaPorDia, etiquetaDia } from './busqueda.ts';
import type { Dictado } from './tipos.ts';

const horaLocal = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function aMarkdown(entradas: readonly Dictado[], hoy: string): string {
  const lineas = ['# Historial de dictado', '', `${entradas.length} dictados · exportado el ${hoy}`, ''];
  for (const g of agrupaPorDia(entradas)) {
    lineas.push(`## ${etiquetaDia(g.dia, hoy)} (${g.dia})`, '');
    for (const e of g.entradas) {
      const detalle = [e.motor, `${(e.duracionMs / 1000).toFixed(1)} s`, e.latenciaMs !== null ? `${e.latenciaMs} ms` : null].filter(Boolean).join(', ');
      lineas.push(`- **${horaLocal(e.fecha)}** ${e.texto.replace(/\r?\n/g, ' ')} _(${detalle})_`);
      if (e.textoCrudo) lineas.push(`  - antes de corregir: ${e.textoCrudo.replace(/\r?\n/g, ' ')}`);
    }
    lineas.push('');
  }
  return lineas.join('\n');
}

const campoCsv = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function aCsv(entradas: readonly Dictado[]): string {
  const filas = [['fecha', 'texto', 'texto_crudo', 'motor', 'duracion_ms', 'latencia_ms'].join(',')];
  for (const e of entradas) filas.push([e.fecha, e.texto, e.textoCrudo ?? '', e.motor, e.duracionMs, e.latenciaMs].map(campoCsv).join(','));
  return filas.join('\r\n') + '\r\n';
}

export const aJson = (entradas: readonly Dictado[]): string => JSON.stringify(entradas, null, 1);

export type Formato = 'md' | 'csv' | 'json';

export const TIPO_MIME: Record<Formato, string> = { md: 'text/markdown; charset=utf-8', csv: 'text/csv; charset=utf-8', json: 'application/json; charset=utf-8' };

export function exporta(entradas: readonly Dictado[], formato: Formato, hoy: string): string {
  if (formato === 'md') return aMarkdown(entradas, hoy);
  if (formato === 'csv') return aCsv(entradas);
  return aJson(entradas);
}
