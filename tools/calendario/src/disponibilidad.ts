/**
 * Huecos para reservar: horario laboral en la zona del NEGOCIO, duracion, intervalo entre inicios,
 * margenes antes y despues, aviso minimo, horizonte, fechas bloqueadas y tope por dia (los limites
 * de Cal.com). Se recorre en minutos LOCALES, asi el horario de verano no corre los huecos.
 *
 * Si no hay ninguno, el resultado es `sin-hueco` con su motivo. Jamas se inventa un hueco.
 */
import { z } from 'zod'
import { esquemaZona, type Instancia } from './tipos.js'
import { comparaFechas, diaSemana, esTextoFecha, fechaEnZona, formatoLocal, instanteDesdeLocal, leeHora, sumaDias, textoFecha, DIA, MINUTO, type FechaLocal } from './tiempo.js'

const hora = z.string().regex(/^([01]\d|2[0-4]):[0-5]\d$/, 'hora HH:MM')

export const esquemaReglas = z.object({
  zona: esquemaZona,
  horario: z.array(z.object({ dia: z.number().int().min(0).max(6), desde: hora, hasta: hora }))
    .min(1).max(50)
    .refine((fs) => fs.every((f) => leeHora(f.hasta) > leeHora(f.desde)), 'cada franja termina despues de empezar'),
  duracionMin: z.number().int().min(5).max(1_440),
  intervaloMin: z.number().int().min(5).max(1_440).optional(),
  margenAntesMin: z.number().int().min(0).max(1_440).default(0),
  margenDespuesMin: z.number().int().min(0).max(1_440).default(0),
  avisoMinimoMin: z.number().int().min(0).max(86_400).default(0),
  horizonteDias: z.number().int().min(1).max(366).default(30),
  fechasBloqueadas: z.array(z.string().refine(esTextoFecha, 'AAAA-MM-DD')).max(500).default([]),
  maxPorDia: z.number().int().min(1).max(500).nullable().default(null),
})

export type EntradaReglas = z.input<typeof esquemaReglas>
export type ReglasDeDisponibilidad = z.output<typeof esquemaReglas>

export interface Intervalo { desde: number; hasta: number }
export interface Hueco { inicio: string; fin: string; inicioMs: number; finMs: number }

export type ResultadoHuecos =
  | { tipo: 'huecos'; huecos: Hueco[] }
  | { tipo: 'sin-hueco'; motivo: 'agenda-llena' | 'sin-horario'; detalle: string; revisadoHasta: string }

export interface EntradaHuecos {
  ocupados: Intervalo[]
  /** Reservas vigentes, YA con sus margenes. */
  bloques: Intervalo[]
  /** Reservas vigentes por fecha local (AAAA-MM-DD), para el tope por dia. */
  porDia?: Map<string, number>
  ahora: number
  desde?: number
  hasta?: number
  maximo?: number
}

/** Lo que ocupa: ni cancelados ni marcados como libres. Fusionado y ordenado. */
export function ocupados(instancias: readonly Instancia[]): Intervalo[] {
  return fusiona(instancias.filter((i) => i.estado !== 'cancelado' && i.transparencia === 'ocupado').map((i) => ({ desde: i.inicioMs, hasta: i.finMs })))
}

export function fusiona(xs: readonly Intervalo[]): Intervalo[] {
  const orden = [...xs].filter((x) => x.hasta > x.desde).sort((a, b) => a.desde - b.desde)
  const fuera: Intervalo[] = []
  for (const x of orden) {
    const ultimo = fuera[fuera.length - 1]
    if (ultimo && x.desde <= ultimo.hasta) ultimo.hasta = Math.max(ultimo.hasta, x.hasta)
    else fuera.push({ ...x })
  }
  return fuera
}

const choca = (xs: readonly Intervalo[], a: number, b: number): boolean => xs.some((x) => x.desde < b && x.hasta > a)

interface Recorrido { huecos: Hueco[]; franjas: number }

function huecosDelDia(r: ReglasDeDisponibilidad, dia: FechaLocal, e: EntradaHuecos, limites: Intervalo, acc: Recorrido, maximo: number): void {
  const paso = r.intervaloMin ?? r.duracionMin
  const tope = r.maxPorDia ?? Infinity
  let delDia = e.porDia?.get(textoFecha(dia)) ?? 0
  for (const franja of r.horario.filter((f) => f.dia === diaSemana(dia))) {
    acc.franjas++
    const fin = leeHora(franja.hasta)
    for (let m = leeHora(franja.desde); m + r.duracionMin <= fin; m += paso) {
      if (delDia >= tope || acc.huecos.length >= maximo) return
      const d = m >= 1_440 ? sumaDias(dia, 1) : dia
      const s = instanteDesdeLocal({ ...d, hora: Math.floor((m % 1_440) / 60), minuto: m % 60, segundo: 0 }, r.zona, 'omite')
      if (s === null) continue
      const f = s + r.duracionMin * MINUTO
      if (s < limites.desde || f > limites.hasta) continue
      const a = s - r.margenAntesMin * MINUTO
      const b = f + r.margenDespuesMin * MINUTO
      if (choca(e.ocupados, a, b) || choca(e.bloques, a, b)) continue
      acc.huecos.push({ inicio: new Date(s).toISOString(), fin: new Date(f).toISOString(), inicioMs: s, finMs: f })
      delDia++
    }
  }
}

export function calculaHuecos(entradaReglas: EntradaReglas | ReglasDeDisponibilidad, e: EntradaHuecos): ResultadoHuecos {
  const r = esquemaReglas.parse(entradaReglas)
  const desde = Math.max(e.desde ?? e.ahora, e.ahora + r.avisoMinimoMin * MINUTO)
  const hasta = Math.min(e.hasta ?? Infinity, e.ahora + r.horizonteDias * DIA)
  const maximo = e.maximo ?? 500
  const acc: Recorrido = { huecos: [], franjas: 0 }
  const bloqueadas = new Set(r.fechasBloqueadas)
  if (hasta > desde) {
    const ultimo = fechaEnZona(hasta, r.zona)
    for (let dia = fechaEnZona(desde, r.zona); comparaFechas(dia, ultimo) <= 0; dia = sumaDias(dia, 1)) {
      if (!bloqueadas.has(textoFecha(dia))) huecosDelDia(r, dia, e, { desde, hasta }, acc, maximo)
      if (acc.huecos.length >= maximo) break
    }
  }
  if (acc.huecos.length) return { tipo: 'huecos', huecos: acc.huecos }
  const revisadoHasta = new Date(Number.isFinite(hasta) ? hasta : desde).toISOString()
  return acc.franjas
    ? { tipo: 'sin-hueco', motivo: 'agenda-llena', detalle: 'Hay horario, pero todo esta ocupado o fuera del aviso minimo en el periodo revisado.', revisadoHasta }
    : { tipo: 'sin-hueco', motivo: 'sin-horario', detalle: 'No hay horario de atencion en el periodo revisado.', revisadoHasta }
}

/** Un hueco dicho en la zona de QUIEN RESERVA (no la del negocio). */
export function huecoEnZona(h: Hueco, zona: string, idioma = 'es-MX'): string {
  const dia = formatoLocal(h.inicioMs, zona, idioma, { weekday: 'long', day: 'numeric', month: 'long' })
  const de = formatoLocal(h.inicioMs, zona, idioma, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const a = formatoLocal(h.finMs, zona, idioma, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short' })
  return `${dia}, ${de}–${a}`
}
