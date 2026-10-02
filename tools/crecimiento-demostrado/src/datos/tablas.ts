/**
 * Las tablas que la pyme entrega además de sus CFDI: los tickets de su caja, su catálogo de
 * clientes (con el segmento que ella misma les da) y la lista de cancelados (el estatus ante el
 * SAT no viene en el XML). CSV con encabezado; las comillas dobles escapan comas.
 */
import { diaDe, type Dia } from '../comun/periodos.js';

export interface Ticket {
  readonly ticket: string;
  readonly dia: Dia | null;
  readonly importe: string;
  readonly total: string;
  /** UUID de la factura nominativa del ticket; vacío = venta a público en general. */
  readonly uuidFactura: string;
  readonly linea: number;
}

export interface FilaDeCatalogo { readonly rfc: string; readonly segmento: string; readonly linea: number }

function celdas(linea: string): string[] {
  const fuera: string[] = [];
  let actual = '';
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]!;
    if (c === '"' && comillas && linea[i + 1] === '"') { actual += '"'; i++; continue; }
    if (c === '"') { comillas = !comillas; continue; }
    if (c === ',' && !comillas) { fuera.push(actual.trim()); actual = ''; continue; }
    actual += c;
  }
  fuera.push(actual.trim());
  return fuera;
}

/** Filas como objetos por nombre de columna (en minúsculas). Las líneas vacías no cuentan. */
export function leeCsv(texto: string): { columnas: string[]; filas: { valores: Record<string, string>; linea: number }[] } {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/);
  const columnas = celdas(lineas[0] ?? '').map((c) => c.toLowerCase());
  const filas = lineas.slice(1).flatMap((l, i) => {
    if (l.trim() === '') return [];
    const v = celdas(l);
    return [{ valores: Object.fromEntries(columnas.map((c, j) => [c, v[j] ?? ''])), linea: i + 2 }];
  });
  return { columnas, filas };
}

function exige(columnas: readonly string[], requeridas: readonly string[], que: string): void {
  const faltan = requeridas.filter((r) => !columnas.includes(r));
  if (faltan.length) throw new Error(`${que}: faltan columnas ${faltan.join(', ')}`);
}

export function leeTickets(texto: string): Ticket[] {
  const { columnas, filas } = leeCsv(texto);
  exige(columnas, ['ticket', 'fecha', 'importe', 'total', 'uuid_factura'], 'caja');
  return filas.map(({ valores: v, linea }) => ({
    ticket: v.ticket ?? '', dia: diaDe(v.fecha ?? ''), importe: v.importe ?? '', total: v.total ?? '',
    uuidFactura: (v.uuid_factura ?? '').toUpperCase(), linea,
  }));
}

export function leeCatalogo(texto: string): FilaDeCatalogo[] {
  const { columnas, filas } = leeCsv(texto);
  exige(columnas, ['rfc', 'segmento'], 'catálogo de clientes');
  return filas.map(({ valores: v, linea }) => ({ rfc: (v.rfc ?? '').toUpperCase(), segmento: v.segmento ?? '', linea }));
}

export function leeCancelados(texto: string): string[] {
  const { columnas, filas } = leeCsv(texto);
  exige(columnas, ['uuid'], 'lista de cancelados');
  return filas.map((f) => (f.valores.uuid ?? '').toUpperCase()).filter(Boolean);
}
