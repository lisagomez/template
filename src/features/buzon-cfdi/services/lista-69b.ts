/**
 * El listado del artículo 69-B del SAT (spec 015, fase 5: RF-18, RF-19). Puro: decodificar, leer y decir qué se
 * muestra de un proveedor. Lo prueba `prueba:buzon`.
 *
 * Formato medido el 2026-10-07 sobre el listado real (14,234 filas): Latin-1; una línea de preámbulo con la fecha
 * («Información actualizada al 31 de diciembre de 2025; …»), otra con el título, y la cabecera
 * `No,RFC,Nombre del Contribuyente,Situación del contribuyente,…`. Hay filas cuyo «RFC» es relleno (letras sin
 * dígitos): se descartan y se cuentan, no se tiran en silencio.
 *
 * Decidido por el laboratorio el 2026-10-07: todas las situaciones se ven, tal cual las publica el SAT. «Presunto»
 * y «Definitivo» van resaltados; «Desvirtuado» y «Sentencia Favorable» van sin alerta y diciendo que el
 * contribuyente desmontó la presunción, para no señalar de más a quien salió limpio.
 */
import { RFC } from '../types/index.ts'

export const SITUACIONES = ['Presunto', 'Definitivo', 'Desvirtuado', 'Sentencia Favorable'] as const
export type Situacion = (typeof SITUACIONES)[number]
const LIMPIAN: readonly Situacion[] = ['Desvirtuado', 'Sentencia Favorable']

export interface FilaDelListado { readonly rfc: string; readonly situacion: Situacion }
export interface Descartada { readonly fila: number; readonly motivo: string }
export interface ListadoLeido {
  readonly actualizadaAl: string | null
  readonly filas: FilaDelListado[]
  readonly descartadas: Descartada[]
}

/** Lo que se ve de un proveedor. Sin campo de veredicto (RF-19): qué significa para un CFDI lo decide la persona. */
export interface BanderaSat {
  readonly rfc: string
  readonly situaciones: readonly Situacion[]
  readonly alerta: boolean
  readonly texto: string
  readonly fuente: string
  readonly actualizadaAl: string
}

/** UTF-8 si lo es; si no, Latin-1, que es como publica el SAT. */
export function decodifica(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('latin1').decode(bytes)
  }
}

function filasCsv(texto: string): string[][] {
  const filas: string[][] = []
  let fila: string[] = []
  let celda = ''
  let entreComillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') { celda += '"'; i++ } else if (c === '"') entreComillas = false
      else celda += c
    } else if (c === '"') entreComillas = true
    else if (c === ',') { fila.push(celda); celda = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      fila.push(celda); filas.push(fila); fila = []; celda = ''
    } else celda += c
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila) }
  return filas
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** «actualizada al 31 de diciembre de 2025» → «2025-12-31». */
export function fechaDelPreambulo(texto: string): string | null {
  const m = /actualizada al (\d{1,2}) de ([a-záéíóú]+) de (\d{4})/i.exec(texto)
  const mes = m ? MESES.indexOf(m[2].toLowerCase()) + 1 : 0
  if (!m || mes === 0) return null
  return `${m[3]}-${String(mes).padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

export function leeListado69B(texto: string): ListadoLeido {
  const filas = filasCsv(texto)
  const cabecera = filas.findIndex((f) => f.some((c) => c.trim() === 'RFC') && f.some((c) => /^Situaci[oó]n del contribuyente$/i.test(c.trim())))
  if (cabecera < 0) throw new Error('no es el listado 69-B del SAT: no encuentro las columnas «RFC» y «Situación del contribuyente»')
  const colRfc = filas[cabecera].findIndex((c) => c.trim() === 'RFC')
  const colSituacion = filas[cabecera].findIndex((c) => /^Situaci[oó]n del contribuyente$/i.test(c.trim()))
  const vistas = new Set<string>()
  const leidas: FilaDelListado[] = []
  const descartadas: Descartada[] = []
  filas.slice(cabecera + 1).forEach((f, i) => {
    const fila = cabecera + i + 2
    const rfc = (f[colRfc] ?? '').trim().toUpperCase()
    const situacion = (f[colSituacion] ?? '').trim()
    if (!rfc && !situacion) return
    if (!RFC.test(rfc)) return void descartadas.push({ fila, motivo: 'el RFC no tiene formato de RFC' })
    if (!(SITUACIONES as readonly string[]).includes(situacion)) return void descartadas.push({ fila, motivo: `situación desconocida: «${situacion}»` })
    const clave = `${rfc}|${situacion}`
    if (vistas.has(clave)) return
    vistas.add(clave)
    leidas.push({ rfc, situacion: situacion as Situacion })
  })
  return { actualizadaAl: fechaDelPreambulo(filas.slice(0, cabecera).flat().join(' ')), filas: leidas, descartadas }
}

const enumera = (xs: readonly string[]) => xs.map((x) => `«${x}»`).join(' y ')

/**
 * Lo que se muestra de un proveedor que aparece en el listado. Se resalta solo si ninguna de sus situaciones es
 * «Desvirtuado» o «Sentencia Favorable». El texto dice lo que publica el SAT, su fuente y su fecha, y nada más.
 */
export function bandera(rfc: string, situaciones: readonly Situacion[], lista: { fuente: string; actualizadaAl: string }): BanderaSat | null {
  if (situaciones.length === 0) return null
  const ordenadas = SITUACIONES.filter((s) => situaciones.includes(s))
  const limpio = ordenadas.some((s) => LIMPIAN.includes(s))
  const texto = `El RFC del emisor aparece en el listado del artículo 69-B del SAT con la situación ${enumera(ordenadas)}`
    + (limpio ? ', es decir, el contribuyente desmontó la presunción ante el SAT o en tribunales.' : '.')
    + ` Fuente: ${lista.fuente}, listado actualizado al ${lista.actualizadaAl}. No es un veredicto sobre el proveedor ni sobre este CFDI.`
  return { rfc, situaciones: ordenadas, alerta: !limpio, texto, fuente: lista.fuente, actualizadaAl: lista.actualizadaAl }
}
