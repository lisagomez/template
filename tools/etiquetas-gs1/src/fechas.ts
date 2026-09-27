/**
 * Fechas GS1 de seis cifras (AAMMDD), con las dos reglas que casi todos implementan mal:
 *
 * - **Siglo** (GenSpecs §7.12, Figura 7-17): el año se interpreta dentro de una ventana de 49
 *   años atras y 50 adelante del año en curso. «49» en 2026 es 2049; «77» es 1977.
 * - **DD = 00** (GenSpecs §3.4, AIs 11-17): si solo se conoce año y mes, el dia va «00» y
 *   significa el ULTIMO dia de ese mes («130200» = 28/feb/2013, «160200» = 29/feb/2016).
 *   Ojo: desde 2025 la salud regulada ya no lo admite; aqui se acepta y se avisa.
 *
 * Todo se calcula en fechas de calendario (UTC a medianoche): un dia es un dia en cualquier
 * zona horaria del pais y los tests no dependen del reloj de la maquina.
 */

export interface FechaGs1 {
  readonly anio: number
  readonly mes: number
  readonly dia: number
  /** El valor traia DD=00 y el dia es el ultimo del mes. */
  readonly diaImplicito: boolean
}

export function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

export function anioConSiglo(aa: number, anioActual: number): number {
  const siglo = Math.floor(anioActual / 100) * 100
  const diferencia = aa - (anioActual % 100)
  if (diferencia >= 51) return siglo - 100 + aa
  if (diferencia <= -50) return siglo + 100 + aa
  return siglo + aa
}

export type ErrorFecha = 'no-numerica' | 'mes-invalido' | 'dia-invalido' | 'dia-cero-no-admitido'

/** `admiteDiaCero`: true para `yymmd0` (AIs 11-17), false para `yymmdd` (7006, 4326...). */
export function parseaFechaGs1(valor: string, anioActual: number, admiteDiaCero = true): FechaGs1 | ErrorFecha {
  if (!/^\d{6}$/.test(valor)) return 'no-numerica'
  const anio = anioConSiglo(Number(valor.slice(0, 2)), anioActual)
  const mes = Number(valor.slice(2, 4))
  const dd = Number(valor.slice(4, 6))
  if (mes < 1 || mes > 12) return 'mes-invalido'
  const ultimo = diasDelMes(anio, mes)
  if (dd === 0) return admiteDiaCero ? { anio, mes, dia: ultimo, diaImplicito: true } : 'dia-cero-no-admitido'
  if (dd > ultimo) return 'dia-invalido'
  return { anio, mes, dia: dd, diaImplicito: false }
}

export function esFecha(f: FechaGs1 | ErrorFecha): f is FechaGs1 {
  return typeof f !== 'string'
}

/** Dia de calendario como numero de dias desde 1970 (sin horas: sin zonas horarias). */
export function diaJuliano(anio: number, mes: number, dia: number): number {
  return Math.round(Date.UTC(anio, mes - 1, dia) / 86_400_000)
}

/** `hoy` en formato ISO `AAAA-MM-DD` (fecha local de quien consulta, sin hora). */
export function diasHasta(fecha: FechaGs1, hoyIso: string): number {
  const [a, m, d] = hoyIso.split('-').map(Number)
  return diaJuliano(fecha.anio, fecha.mes, fecha.dia) - diaJuliano(a ?? 1970, m ?? 1, d ?? 1)
}

export function fechaIso(f: FechaGs1): string {
  return `${f.anio}-${String(f.mes).padStart(2, '0')}-${String(f.dia).padStart(2, '0')}`
}

/** «30/10/2026», como se imprime en la etiqueta. */
export function fechaLegible(f: FechaGs1): string {
  return `${String(f.dia).padStart(2, '0')}/${String(f.mes).padStart(2, '0')}/${f.anio}`
}

/** De `AAAA-MM-DD` a AAMMDD. `diaCero`: codificar solo año y mes (DD=00). */
export function aAammdd(iso: string, diaCero = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new Error(`fecha ISO invalida: ${iso}`)
  return `${m[1]!.slice(2)}${m[2]}${diaCero ? '00' : m[3]}`
}

export function sumaDias(hoyIso: string, dias: number): string {
  const [a, m, d] = hoyIso.split('-').map(Number)
  const f = new Date(Date.UTC(a ?? 1970, (m ?? 1) - 1, (d ?? 1) + dias))
  return f.toISOString().slice(0, 10)
}

export const MENSAJE_FECHA: Readonly<Record<ErrorFecha, string>> = {
  'no-numerica': 'la fecha debe ser de seis cifras AAMMDD',
  'mes-invalido': 'el mes no existe (va de 01 a 12)',
  'dia-invalido': 'ese día no existe en ese mes',
  'dia-cero-no-admitido': 'este dato no admite día 00',
}
