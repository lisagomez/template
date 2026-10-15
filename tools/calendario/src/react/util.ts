/** Utilidades de la UI sin JSX: colores, minutos locales y titulos. */
import { claveCalendario, inicioDelDia, instanteDesdeLocal, leeFecha, partesEnZona, sumaDias, textoFecha, type Calendario, type Instancia, type Vista } from '../index.js'

export const ALTO_HORA = 48

export function colorDe(calendarios: readonly Calendario[], i: Pick<Instancia, 'cuenta' | 'calendario' | 'color'>): string {
  const c = calendarios.find((x) => claveCalendario({ cuenta: x.cuenta, calendario: x.id }) === claveCalendario(i))
  return (i.color && i.color.startsWith('#') ? i.color : null) ?? c?.color ?? '#6366f1'
}

export function minutosLocales(ms: number, zona: string): number {
  const p = partesEnZona(ms, zona)
  return p.hora * 60 + p.minuto
}

/** El instante de `fecha` a los `minutos` locales (se admite pasar de 1440: es el dia siguiente). */
export function instanteLocal(fecha: string, minutos: number, zona: string): number {
  const f = sumaDias(leeFecha(fecha), Math.floor(minutos / 1440))
  const m = ((minutos % 1440) + 1440) % 1440
  return instanteDesdeLocal({ ...f, hora: Math.floor(m / 60), minuto: m % 60, segundo: 0 }, zona) as number
}

export const limitesDelDia = (fecha: string, zona: string) => ({
  desde: inicioDelDia(leeFecha(fecha), zona),
  hasta: inicioDelDia(sumaDias(leeFecha(fecha), 1), zona),
})

export const hoyEn = (ms: number, zona: string): string => {
  const p = partesEnZona(ms, zona)
  return textoFecha(p)
}

export function hora(ms: number, zona: string): string {
  return new Intl.DateTimeFormat('es-MX', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms))
}

export function fechaLarga(fecha: string, opciones: Intl.DateTimeFormatOptions): string {
  const f = leeFecha(fecha)
  return new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', ...opciones }).format(new Date(Date.UTC(f.anio, f.mes - 1, f.dia, 12)))
}

export function tituloDeVista(vista: Vista, dias: readonly string[], fecha: string): string {
  const primero = dias[0] ?? fecha
  const ultimo = dias[dias.length - 1] ?? fecha
  if (vista === 'dia') return fechaLarga(fecha, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  if (vista === 'mes') return fechaLarga(fecha, { month: 'long', year: 'numeric' })
  const a = fechaLarga(primero, { day: 'numeric', month: 'short' })
  const b = fechaLarga(ultimo, { day: 'numeric', month: 'short', year: 'numeric' })
  return `${a} – ${b}`
}

/** ¿Cubre la instancia de todo el dia la fecha `dia`? (`fin` es exclusivo.) */
export const cubreDia = (i: Instancia, dia: string): boolean => i.todoElDia && i.inicio <= dia && dia < i.fin
