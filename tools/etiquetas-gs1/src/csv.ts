/**
 * CSV segun RFC 4180, con lo que Excel hace en la practica: BOM al principio, `;` como
 * separador en configuracion regional de Mexico/Espana, y comillas dobles escapadas.
 */

export function detectaSeparador(texto: string): ',' | ';' | '\t' {
  const primera = texto.split(/\r?\n/, 1)[0] ?? ''
  const cuenta = (c: string) => primera.split(c).length - 1
  const opciones: [',' | ';' | '\t', number][] = [[',', cuenta(',')], [';', cuenta(';')], ['\t', cuenta('\t')]]
  return opciones.sort((a, b) => b[1] - a[1])[0]![0]
}

export function parseaCsv(texto: string, separador = detectaSeparador(texto)): string[][] {
  const s = texto.replace(/^﻿/, '')
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let comillas = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    if (comillas) {
      if (c === '"' && s[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') comillas = false
      else campo += c
    } else if (c === '"') comillas = true
    else if (c === separador) { fila.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      fila.push(campo); filas.push(fila); fila = []; campo = ''
    } else campo += c
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila) }
  return filas.filter((f) => f.some((x) => x.trim() !== ''))
}

/** Filas a registros con la primera fila como cabecera. */
export function aRegistros(filas: readonly (readonly string[])[]): Record<string, string>[] {
  const [cabecera, ...resto] = filas
  if (!cabecera) return []
  return resto.map((f) => Object.fromEntries(cabecera.map((c, i) => [c, f[i] ?? ''])))
}

function citaCampo(v: string, separador: string): string {
  return /["\r\n]/.test(v) || v.includes(separador) ? `"${v.replace(/"/g, '""')}"` : v
}

export function aCsv(filas: readonly (readonly (string | number)[])[], separador = ','): string {
  return '﻿' + filas.map((f) => f.map((v) => citaCampo(String(v), separador)).join(separador)).join('\r\n') + '\r\n'
}

/**
 * Filas de una hoja de Excel (celdas string/number/boolean/Date/null) a registros de texto.
 * Los numeros enteros se escriben sin exponente: un GTIN guardado como numero vuelve con sus
 * cifras (los ceros a la izquierda los repone `normalizaGtin`).
 */
export function registrosDeCeldas(filas: readonly (readonly unknown[])[]): Record<string, string>[] {
  const texto = (v: unknown): string => {
    if (v === null || v === undefined) return ''
    if (typeof v === 'number') return Number.isInteger(v) && Math.abs(v) < 1e21 ? v.toLocaleString('en-US', { useGrouping: false }) : String(v)
    if (v instanceof Date) return v.toISOString().slice(0, 10)
    if (typeof v === 'boolean') return v ? 'SI' : 'NO'
    return String(v)
  }
  return aRegistros(filas.map((f) => f.map(texto)))
}
