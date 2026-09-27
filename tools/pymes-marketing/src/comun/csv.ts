/**
 * Lector de CSV tolerante con lo que exportan Excel, Meta, Google y las cajas de cobro en
 * México: separador `,` `;` o tabulador (se detecta), comillas, BOM y saltos CRLF. Una fila rota
 * **no se descarta en silencio**: sale en `rechazadas` con su número de línea y el motivo.
 */
export interface FilaCsv {
  readonly linea: number;
  readonly celdas: readonly string[];
}

export interface TablaCsv {
  readonly encabezados: readonly string[];
  readonly filas: readonly FilaCsv[];
  readonly separador: string;
  readonly rechazadas: readonly { readonly linea: number; readonly motivo: string }[];
}

function detectaSeparador(primera: string): string {
  const cuenta = (s: string) => primera.split(s).length - 1;
  return [',', ';', '\t'].reduce((mejor, s) => (cuenta(s) > cuenta(mejor) ? s : mejor), ',');
}

function partes(texto: string, sep: string): { celdas: string[]; linea: number }[] {
  const filas: { celdas: string[]; linea: number }[] = [];
  let celda = '', fila: string[] = [], comillas = false, linea = 1, inicio = 1;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') comillas = false;
      else { if (c === '\n') linea++; celda += c; }
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(celda); celda = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(celda); filas.push({ celdas: fila, linea: inicio });
      fila = []; celda = ''; linea++; inicio = linea;
    } else celda += c;
  }
  if (celda !== '' || fila.length > 0) { fila.push(celda); filas.push({ celdas: fila, linea: inicio }); }
  return filas;
}

export function leeCsv(crudo: string): TablaCsv {
  const texto = crudo.replace(/^﻿/, '');
  const primera = texto.split(/\r?\n/, 1)[0] ?? '';
  const separador = detectaSeparador(primera);
  const todas = partes(texto, separador).filter((f) => f.celdas.some((c) => c.trim() !== ''));
  const [cabeza, ...resto] = todas;
  const encabezados = (cabeza?.celdas ?? []).map((c) => c.trim());
  const filas: FilaCsv[] = [];
  const rechazadas: { linea: number; motivo: string }[] = [];
  for (const f of resto) {
    if (f.celdas.length !== encabezados.length) {
      rechazadas.push({ linea: f.linea, motivo: `trae ${f.celdas.length} columnas y el encabezado ${encabezados.length}` });
    } else filas.push({ linea: f.linea, celdas: f.celdas.map((c) => c.trim()) });
  }
  return { encabezados, filas, separador, rechazadas };
}

/** Índice de la primera columna cuyo encabezado (normalizado) coincide con algún sinónimo. */
export function columna(encabezados: readonly string[], sinonimos: readonly string[]): number {
  const limpio = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const lista = encabezados.map(limpio);
  for (const s of sinonimos) {
    const i = lista.findIndex((e) => e === s || e.startsWith(`${s} `) || e.endsWith(` ${s}`));
    if (i >= 0) return i;
  }
  return -1;
}
