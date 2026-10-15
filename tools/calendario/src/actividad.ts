/**
 * La capa de actividad programada (la «Cron Lens» de la fuente, sin atarla a un demonio concreto):
 * proyecta las proximas corridas de cualquier scheduler inyectado sobre la rejilla.
 *
 * Cron de 5 campos (minuto hora dia-del-mes mes dia-de-la-semana) con `*`, listas, rangos, pasos y
 * nombres (JAN, MON…), y los alias @hourly/@daily/@weekly/@monthly/@yearly. Si dia-del-mes y
 * dia-de-la-semana estan restringidos los dos, basta con que coincida uno (como en cron).
 * Se evalua en la zona DEL TRABAJO: en el salto de primavera la hora inexistente no corre y en el de
 * otoño la hora repetida corre una vez.
 */
import { ErrorCalendario } from './errores.js'
import type { OrigenDeTrabajos, TrabajoProgramado } from './puertos.js'
import { comparaFechas, diaSemana, fechaEnZona, instanteDesdeLocal, sumaDias, MINUTO, type FechaLocal } from './tiempo.js'

export interface Cron {
  minutos: number[]
  horas: number[]
  diasMes: Set<number>
  meses: Set<number>
  diasSemana: Set<number>
  diaMesLibre: boolean
  diaSemanaLibre: boolean
}

export interface BloqueDeActividad {
  trabajo: string
  nombre: string
  grupo: string | null
  inicioMs: number
  finMs: number
  pausado: boolean
}

const MESES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const DIAS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const ALIAS: Record<string, string> = { '@hourly': '0 * * * *', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@weekly': '0 0 * * 0', '@monthly': '0 0 1 * *', '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *' }

function valor(texto: string, nombres: string[] | null, base: number): number {
  const i = nombres ? nombres.indexOf(texto.toUpperCase()) : -1
  if (i >= 0) return i + base
  if (!/^\d+$/.test(texto)) throw new ErrorCalendario('validacion', `valor de cron invalido: ${texto}`)
  return Number(texto)
}

function campo(texto: string, min: number, max: number, nombres: string[] | null = null, base = min): Set<number> {
  const fuera = new Set<number>()
  for (const parte of texto.split(',')) {
    const [rango = '', pasoTexto] = parte.split('/')
    const paso = pasoTexto === undefined ? 1 : valor(pasoTexto, null, 0)
    if (paso < 1) throw new ErrorCalendario('validacion', `paso de cron invalido: ${parte}`)
    let [a, b] = [min, max]
    if (rango !== '*') {
      const [x, y] = rango.split('-')
      a = valor(x ?? '', nombres, base)
      b = y !== undefined ? valor(y, nombres, base) : pasoTexto !== undefined ? max : a
    }
    if (a < min || b > max || a > b) throw new ErrorCalendario('validacion', `rango de cron fuera de limites: ${parte}`)
    for (let v = a; v <= b; v += paso) fuera.add(v)
  }
  return fuera
}

export function parseaCron(expresion: string): Cron {
  const texto = ALIAS[expresion.trim().toLowerCase()] ?? expresion.trim()
  const partes = texto.split(/\s+/)
  if (partes.length !== 5) throw new ErrorCalendario('validacion', `cron de 5 campos: «${expresion}» tiene ${partes.length}`)
  const [mi, ho, dm, me, ds] = partes as [string, string, string, string, string]
  const diasSemana = campo(ds, 0, 7, DIAS, 0)
  if (diasSemana.has(7)) { diasSemana.delete(7); diasSemana.add(0) }
  return {
    minutos: [...campo(mi, 0, 59)].sort((a, b) => a - b),
    horas: [...campo(ho, 0, 23)].sort((a, b) => a - b),
    diasMes: campo(dm, 1, 31),
    meses: campo(me, 1, 12, MESES, 1),
    diasSemana,
    diaMesLibre: dm === '*' || dm === '?',
    diaSemanaLibre: ds === '*' || ds === '?',
  }
}

function coincideDia(c: Cron, f: FechaLocal): boolean {
  if (!c.meses.has(f.mes)) return false
  const porMes = c.diasMes.has(f.dia)
  const porSemana = c.diasSemana.has(diaSemana(f))
  if (c.diaMesLibre && c.diaSemanaLibre) return true
  if (c.diaMesLibre) return porSemana
  if (c.diaSemanaLibre) return porMes
  return porMes || porSemana
}

/** Corridas (ms) de `expresion` en [desde, hasta), en la zona dada, hasta `maximo`. */
export function corridas(expresion: string, zona: string, desde: number, hasta: number, maximo = 200): number[] {
  const c = parseaCron(expresion)
  const fuera: number[] = []
  const ultimo = fechaEnZona(hasta, zona)
  for (let f = fechaEnZona(desde, zona); comparaFechas(f, ultimo) <= 0 && fuera.length < maximo; f = sumaDias(f, 1)) {
    if (!coincideDia(c, f)) continue
    for (const hora of c.horas) {
      for (const minuto of c.minutos) {
        const t = instanteDesdeLocal({ ...f, hora, minuto, segundo: 0 }, zona, 'omite')
        if (t !== null && t >= desde && t < hasta && fuera.length < maximo) fuera.push(t)
      }
    }
  }
  return fuera.sort((a, b) => a - b)
}

export interface Proyeccion { bloques: BloqueDeActividad[]; invalidos: Array<{ trabajo: string; motivo: string }> }

/** Proyecta los trabajos (los pausados, solo si se piden) sobre [desde, hasta). Un cron invalido no rompe el resto. */
export function proyecta(trabajos: readonly TrabajoProgramado[], op: { desde: number; hasta: number; ahora?: number; incluirPausados?: boolean; maximoPorTrabajo?: number }): Proyeccion {
  const bloques: BloqueDeActividad[] = []
  const invalidos: Proyeccion['invalidos'] = []
  const desde = Math.max(op.desde, op.ahora ?? op.desde)
  for (const t of trabajos) {
    if (t.pausado && !op.incluirPausados) continue
    try {
      for (const inicio of corridas(t.expresion, t.zona, desde, op.hasta, op.maximoPorTrabajo ?? 200)) {
        bloques.push({ trabajo: t.id, nombre: t.nombre, grupo: t.grupo, inicioMs: inicio, finMs: inicio + Math.max(1, t.duracionMin) * MINUTO, pausado: t.pausado })
      }
    } catch (e) {
      invalidos.push({ trabajo: t.id, motivo: e instanceof Error ? e.message : String(e) })
    }
  }
  return { bloques: bloques.sort((a, b) => a.inicioMs - b.inicioMs), invalidos }
}

/** Corridas por dia (exactas, sobre una semana): para ordenar por «los que mas corren». */
export function corridasPorDia(expresion: string, zona = 'UTC'): number {
  const lunes = Date.UTC(2026, 0, 5)
  return corridas(expresion, zona, lunes, lunes + 7 * 86_400_000, 20_000).length / 7
}

/** Un origen fijo: util para pruebas y para un scheduler que se lee de un archivo. */
export function origenFijo(trabajos: TrabajoProgramado[]): OrigenDeTrabajos {
  return { trabajos: async () => trabajos }
}
