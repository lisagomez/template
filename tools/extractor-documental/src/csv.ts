/**
 * Exportacion a CSV del lote validado. Puro.
 *
 * Dos detalles que no son cosmeticos y que deciden si el CSV sirve o hace dano:
 *
 *   1. **BOM UTF-8**, o Excel destroza los acentos y el usuario concluye que la herramienta
 *      corrompe sus datos.
 *   2. **Inyeccion de formulas**: una celda que empieza por `=`, `+`, `-` o `@` la EJECUTA Excel al
 *      abrirla. Los valores vienen de documentos que un atacante puede fabricar — el mismo vector
 *      de la pegatina del §2.11 —, asi que es el remate del ataque: cuela el texto en un documento
 *      y espera a que alguien exporte.
 */

export const BOM_UTF8 = '﻿'

const PELIGROSOS = /^[=+\-@\t\r]/

/**
 * Neutraliza una celda que Excel interpretaria como formula, anteponiendo un apostrofe.
 * Se conserva el valor legible; lo que se pierde es la ejecucion.
 */
export function neutralizaFormula(valor: string): string {
  return PELIGROSOS.test(valor) ? `'${valor}` : valor
}

function escapa(valor: string): string {
  const seguro = neutralizaFormula(valor)
  return /[",\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro
}

export interface ColumnaCsv {
  clave: string
  etiqueta: string
}

/**
 * Genera el CSV. Las columnas y su orden los da la plantilla de revision: se exporta lo que la
 * persona decidio ver, no todo lo que se extrajo.
 */
export function aCsv(
  filas: readonly Readonly<Record<string, string>>[],
  columnas: readonly ColumnaCsv[],
  conBom = true,
): string {
  if (columnas.length === 0) throw new Error('Un CSV sin columnas no es un CSV')
  const cabecera = columnas.map((c) => escapa(c.etiqueta)).join(',')
  const cuerpo = filas.map((fila) => columnas.map((c) => escapa(fila[c.clave] ?? '')).join(','))
  return (conBom ? BOM_UTF8 : '') + [cabecera, ...cuerpo].join('\r\n')
}

export interface RegistroDeExportacion {
  quien: string
  cuando: string
  formato: 'csv'
  filas: number
}

/**
 * Una exportacion SACA datos de terceros del sistema, asi que queda registrada. No es burocracia:
 * es lo unico que permite responder "quien se llevo esto y cuando".
 */
export function registraExportacion(quien: string, filas: number, ahora: Date = new Date()): RegistroDeExportacion {
  return { quien, cuando: ahora.toISOString(), formato: 'csv', filas }
}
