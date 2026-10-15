/**
 * Tiempo con zona horaria IANA, sin dependencias: solo `Intl`. Todo lo que el calendario calcula en
 * hora local (recurrencias, horario laboral, cron) pasa por aqui, para que el horario de verano se
 * resuelva en un solo sitio.
 *
 * Convencion: un instante es un numero (ms UTC); una fecha local es { anio, mes 1-12, dia }; una hora
 * local añade hora, minuto y segundo. `diaSemana` es 0 = domingo, como `Date#getUTCDay`.
 */
export interface FechaLocal { anio: number; mes: number; dia: number }
export interface HoraLocal extends FechaLocal { hora: number; minuto: number; segundo: number }

export const MINUTO = 60_000
export const HORA = 3_600_000
export const DIA = 86_400_000

const DIAS_CORTOS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const formateadores = new Map<string, Intl.DateTimeFormat>()

function formateador(zona: string): Intl.DateTimeFormat {
  let f = formateadores.get(zona)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zona, hourCycle: 'h23', weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    formateadores.set(zona, f)
  }
  return f
}

export function esZonaValida(zona: string): boolean {
  try { formateador(zona); return true } catch { return false }
}

export function partesEnZona(ms: number, zona: string): HoraLocal & { diaSemana: number } {
  const p: Record<string, string> = {}
  for (const x of formateador(zona).formatToParts(new Date(ms))) p[x.type] = x.value
  return {
    anio: Number(p.year), mes: Number(p.month), dia: Number(p.day),
    hora: Number(p.hour) % 24, minuto: Number(p.minute), segundo: Number(p.second),
    diaSemana: DIAS_CORTOS.indexOf(p.weekday ?? ''),
  }
}

/** Diferencia (ms) entre la hora local de `zona` y UTC en el instante dado. */
export function desfase(ms: number, zona: string): number {
  const base = Math.floor(ms / 1000) * 1000
  const p = partesEnZona(base, zona)
  return Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo) - base
}

const coincide = (ms: number, h: HoraLocal, zona: string): boolean => {
  const p = partesEnZona(ms, zona)
  return p.anio === h.anio && p.mes === h.mes && p.dia === h.dia && p.hora === h.hora && p.minuto === h.minuto
}

/**
 * El instante de una hora local. En el cambio de horario:
 * - hora repetida (otoño): devuelve la PRIMERA;
 * - hora inexistente (primavera): `adelanta` usa el desfase de antes del salto (RFC 5545 §3.3.5: 02:30
 *   en Nueva York el día del salto es 03:30 EDT); `omite` devuelve null (lo que hace cron).
 */
export function instanteDesdeLocal(h: HoraLocal, zona: string, hueco: 'adelanta' | 'omite' = 'adelanta'): number | null {
  const comoUtc = Date.UTC(h.anio, h.mes - 1, h.dia, h.hora, h.minuto, h.segundo)
  const antes = comoUtc - desfase(comoUtc - DIA, zona)
  const despues = comoUtc - desfase(comoUtc + DIA, zona)
  const validos = [antes, despues].filter((t) => coincide(t, h, zona))
  if (validos.length) return Math.min(...validos)
  return hueco === 'adelanta' ? antes : null
}

export function inicioDelDia(f: FechaLocal, zona: string): number {
  return instanteDesdeLocal({ ...f, hora: 0, minuto: 0, segundo: 0 }, zona) as number
}

export function fechaEnZona(ms: number, zona: string): FechaLocal {
  const p = partesEnZona(ms, zona)
  return { anio: p.anio, mes: p.mes, dia: p.dia }
}

export function sumaDias(f: FechaLocal, n: number): FechaLocal {
  const d = new Date(Date.UTC(f.anio, f.mes - 1, f.dia + n))
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() }
}

export function sumaMeses(anio: number, mes: number, n: number): { anio: number; mes: number } {
  const total = anio * 12 + (mes - 1) + n
  return { anio: Math.floor(total / 12), mes: (total % 12) + 1 }
}

export const diaSemana = (f: FechaLocal): number => new Date(Date.UTC(f.anio, f.mes - 1, f.dia)).getUTCDay()
export const diasEnMes = (anio: number, mes: number): number => new Date(Date.UTC(anio, mes, 0)).getUTCDate()
export const ordinalFecha = (f: FechaLocal): number => Date.UTC(f.anio, f.mes - 1, f.dia) / DIA
export const comparaFechas = (a: FechaLocal, b: FechaLocal): number => ordinalFecha(a) - ordinalFecha(b)

const dos = (n: number): string => String(n).padStart(2, '0')
export const textoFecha = (f: FechaLocal): string => `${String(f.anio).padStart(4, '0')}-${dos(f.mes)}-${dos(f.dia)}`

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/
export const esTextoFecha = (s: string): boolean => RE_FECHA.test(s)

export function leeFecha(s: string): FechaLocal {
  const m = RE_FECHA.exec(s)
  if (!m) throw new RangeError(`fecha invalida (se espera AAAA-MM-DD): ${s}`)
  return { anio: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) }
}

export const iso = (ms: number): string => new Date(ms).toISOString()

export function aMs(s: string): number {
  const t = Date.parse(s)
  if (Number.isNaN(t)) throw new RangeError(`instante invalido: ${s}`)
  return t
}

/**
 * Mueve `baseMs` lo mismo que se movio `desdeMs` → `haciaMs`, medido en HORA LOCAL (dias + minutos):
 * pasar una serie de las 9:00 a las 11:00 la deja a las 11:00 aunque su primera ocurrencia caiga en
 * otro horario (verano/invierno). Sumar milisegundos la correria una hora.
 */
export function desplazaLocal(baseMs: number, desdeMs: number, haciaMs: number, zona: string): number {
  const d = partesEnZona(desdeMs, zona)
  const h = partesEnZona(haciaMs, zona)
  const b = partesEnZona(baseMs, zona)
  const minutos = b.hora * 60 + b.minuto + (h.hora * 60 + h.minuto) - (d.hora * 60 + d.minuto)
  const dias = ordinalFecha(h) - ordinalFecha(d) + Math.floor(minutos / 1440)
  const resto = ((minutos % 1440) + 1440) % 1440
  const f = sumaDias(b, dias)
  return instanteDesdeLocal({ ...f, hora: Math.floor(resto / 60), minuto: resto % 60, segundo: b.segundo }, zona) as number
}

/** `HH:MM` → minutos desde medianoche. */
export function leeHora(s: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(s)
  if (!m || Number(m[1]) > 24 || Number(m[2]) > 59) throw new RangeError(`hora invalida (se espera HH:MM): ${s}`)
  return Number(m[1]) * 60 + Number(m[2])
}

/** Formato legible para una persona, en SU zona (la de quien reserva, no la del negocio). */
export function formatoLocal(ms: number, zona: string, idioma = 'es-MX', opciones?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(idioma, { ...(opciones ?? { dateStyle: 'medium', timeStyle: 'short' }), timeZone: zona }).format(new Date(ms))
}
