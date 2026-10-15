/**
 * Lo puro de pintar un calendario, sin React: que dias abarca cada vista, como se navega y como se
 * reparten en columnas los eventos que se solapan. Asi se prueba sin navegador.
 */
import { comparaFechas, diaSemana, inicioDelDia, leeFecha, sumaDias, sumaMeses, textoFecha } from './tiempo.js'

export type Vista = 'dia' | 'semana' | 'mes' | 'agenda'

export interface RangoDeVista { dias: string[]; desde: number; hasta: number }

/** 0 = domingo; por defecto la semana empieza en lunes. */
export function inicioDeSemana(fecha: string, inicioSemana = 1): string {
  const f = leeFecha(fecha)
  return textoFecha(sumaDias(f, -((diaSemana(f) - inicioSemana + 7) % 7)))
}

export function rangoDeVista(vista: Vista, fecha: string, zona: string, inicioSemana = 1): RangoDeVista {
  let primero = leeFecha(fecha)
  let n = 1
  if (vista === 'semana') { primero = leeFecha(inicioDeSemana(fecha, inicioSemana)); n = 7 }
  if (vista === 'agenda') n = 14
  if (vista === 'mes') {
    const f = leeFecha(fecha)
    primero = leeFecha(inicioDeSemana(textoFecha({ anio: f.anio, mes: f.mes, dia: 1 }), inicioSemana))
    n = 42
  }
  const dias = Array.from({ length: n }, (_, i) => textoFecha(sumaDias(primero, i)))
  return { dias, desde: inicioDelDia(primero, zona), hasta: inicioDelDia(sumaDias(primero, n), zona) }
}

export function navega(vista: Vista, fecha: string, paso: number): string {
  const f = leeFecha(fecha)
  if (vista === 'mes') {
    const m = sumaMeses(f.anio, f.mes, paso)
    return textoFecha({ ...m, dia: 1 })
  }
  return textoFecha(sumaDias(f, paso * (vista === 'semana' ? 7 : vista === 'agenda' ? 14 : 1)))
}

export const mismoDia = (a: string, b: string): boolean => comparaFechas(leeFecha(a), leeFecha(b)) === 0

export interface Colocable { clave: string; inicioMs: number; finMs: number }
export interface Colocacion { columna: number; columnas: number }

/** Columnas para los que se solapan: cada grupo de solapados comparte el ancho a partes iguales. */
export function disponColumnas(items: readonly Colocable[]): Map<string, Colocacion> {
  const orden = [...items].sort((a, b) => a.inicioMs - b.inicioMs || b.finMs - a.finMs)
  const fuera = new Map<string, Colocacion>()
  let grupo: Colocable[] = []
  let finGrupo = -Infinity
  const columnas: number[] = []
  const cierra = () => {
    const total = Math.max(1, ...grupo.map((g) => (fuera.get(g.clave)?.columna ?? 0) + 1))
    for (const g of grupo) fuera.set(g.clave, { columna: fuera.get(g.clave)?.columna ?? 0, columnas: total })
    grupo = []
    columnas.length = 0
  }
  for (const it of orden) {
    if (it.inicioMs >= finGrupo && grupo.length) cierra()
    let col = columnas.findIndex((fin) => fin <= it.inicioMs)
    if (col < 0) { col = columnas.length; columnas.push(it.finMs) } else columnas[col] = it.finMs
    fuera.set(it.clave, { columna: col, columnas: 1 })
    grupo.push(it)
    finGrupo = Math.max(finGrupo === -Infinity ? it.finMs : finGrupo, it.finMs)
  }
  if (grupo.length) cierra()
  return fuera
}
