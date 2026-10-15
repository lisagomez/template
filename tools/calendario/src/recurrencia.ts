/**
 * Recurrencias RFC 5545 (RRULE + EXDATE), expandidas en HORA LOCAL de la zona del evento: una junta
 * de las 9:00 sigue a las 9:00 despues del cambio de horario, aunque su instante UTC se mueva.
 *
 * Soportado: FREQ DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, COUNT, UNTIL, BYDAY (con ordinal en
 * MONTHLY y en YEARLY con BYMONTH), BYMONTHDAY (tambien negativo), BYMONTH, BYSETPOS y WKST.
 * Lo que no se soporta (BYHOUR, BYWEEKNO, BYYEARDAY, RDATE, frecuencias por debajo del dia) se
 * RECHAZA con un error tipado: una recurrencia mal pintada es peor que una que no se acepta.
 */
import { ErrorCalendario } from './errores.js'
import {
  type FechaLocal, comparaFechas, diaSemana, diasEnMes, esTextoFecha, instanteDesdeLocal, inicioDelDia,
  leeFecha, partesEnZona, sumaDias, sumaMeses, textoFecha, fechaEnZona,
} from './tiempo.js'

export type Frecuencia = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
export interface DiaRegla { dia: number; ordinal: number | null }

export interface Regla {
  frecuencia: Frecuencia
  intervalo: number
  cuenta: number | null
  /** UNTIL: instante (eventos con hora) o fecha (todo el dia). */
  hasta: { ms: number } | { fecha: FechaLocal } | null
  porDia: DiaRegla[] | null
  porDiaDelMes: number[] | null
  porMes: number[] | null
  porPosicion: number[] | null
  inicioSemana: number
}

export interface Recurrencia {
  regla: Regla
  /** Claves de las ocurrencias excluidas: instante ISO (con hora) o AAAA-MM-DD (todo el dia). */
  excluidas: Set<string>
}

export interface Ocurrencia { clave: string; inicioMs: number }

const DIAS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const SOPORTADAS = new Set(['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'BYSETPOS', 'WKST'])
const MAX_PERIODOS = 20_000

const rechaza = (motivo: string): never => {
  throw new ErrorCalendario('recurrencia', `recurrencia no soportada: ${motivo}`)
}

function enteros(valor: string, min: number, max: number, nombre: string): number[] {
  return valor.split(',').map((v) => {
    const n = Number(v)
    if (!Number.isInteger(n) || n === 0 || n < min || n > max) rechaza(`${nombre}=${valor}`)
    return n
  })
}

function leeDias(valor: string): DiaRegla[] {
  return valor.split(',').map((v) => {
    const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(v)
    if (!m) return rechaza(`BYDAY=${valor}`)
    const ordinal = m[1] ? Number(m[1]) : null
    if (ordinal !== null && (ordinal === 0 || Math.abs(ordinal) > 53)) rechaza(`BYDAY=${valor}`)
    return { dia: DIAS.indexOf(m[2] as string), ordinal }
  })
}

/** `20261021T150000Z` (UTC), `20261021T090000` (local en la zona) o `20261021` (fecha). */
export function leeMarca(valor: string, zona: string): { ms: number } | { fecha: FechaLocal } {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(valor)
  if (!m) return rechaza(`fecha ${valor}`)
  const fecha = { anio: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) }
  if (m[4] === undefined) return { fecha }
  const h = { ...fecha, hora: Number(m[4]), minuto: Number(m[5]), segundo: Number(m[6]) }
  if (m[7]) return { ms: Date.UTC(h.anio, h.mes - 1, h.dia, h.hora, h.minuto, h.segundo) }
  return { ms: instanteDesdeLocal(h, zona) as number }
}

function leeRegla(texto: string, zona: string): Regla {
  const partes = new Map<string, string>()
  for (const par of texto.split(';')) {
    const [k, v] = par.split('=')
    if (!k || v === undefined || v === '') rechaza(`parte vacia en ${texto}`)
    if (!SOPORTADAS.has(k as string)) rechaza(k as string)
    partes.set(k as string, v as string)
  }
  const frecuencia = partes.get('FREQ')
  if (frecuencia !== 'DAILY' && frecuencia !== 'WEEKLY' && frecuencia !== 'MONTHLY' && frecuencia !== 'YEARLY') return rechaza(`FREQ=${frecuencia ?? '(falta)'}`)
  if (partes.has('COUNT') && partes.has('UNTIL')) rechaza('COUNT y UNTIL juntos')
  const porDia = partes.has('BYDAY') ? leeDias(partes.get('BYDAY') as string) : null
  const conOrdinal = porDia?.some((d) => d.ordinal !== null) ?? false
  if (conOrdinal && (frecuencia === 'DAILY' || frecuencia === 'WEEKLY')) rechaza('BYDAY con ordinal fuera de MONTHLY/YEARLY')
  if (conOrdinal && frecuencia === 'YEARLY' && !partes.has('BYMONTH')) rechaza('BYDAY con ordinal anual sin BYMONTH')
  const intervalo = partes.has('INTERVAL') ? Number(partes.get('INTERVAL')) : 1
  if (!Number.isInteger(intervalo) || intervalo < 1 || intervalo > 1000) rechaza(`INTERVAL=${partes.get('INTERVAL')}`)
  const cuenta = partes.has('COUNT') ? Number(partes.get('COUNT')) : null
  if (cuenta !== null && (!Number.isInteger(cuenta) || cuenta < 1 || cuenta > 10_000)) rechaza(`COUNT=${partes.get('COUNT')}`)
  const wkst = partes.get('WKST')
  return {
    frecuencia, intervalo, cuenta, porDia,
    hasta: partes.has('UNTIL') ? leeMarca(partes.get('UNTIL') as string, zona) : null,
    porDiaDelMes: partes.has('BYMONTHDAY') ? enteros(partes.get('BYMONTHDAY') as string, -31, 31, 'BYMONTHDAY') : null,
    porMes: partes.has('BYMONTH') ? enteros(partes.get('BYMONTH') as string, 1, 12, 'BYMONTH') : null,
    porPosicion: partes.has('BYSETPOS') ? enteros(partes.get('BYSETPOS') as string, -366, 366, 'BYSETPOS') : null,
    inicioSemana: wkst ? (DIAS.indexOf(wkst) >= 0 ? DIAS.indexOf(wkst) : rechaza(`WKST=${wkst}`)) : 1,
  }
}

const claveDeMarca = (m: { ms: number } | { fecha: FechaLocal }): string =>
  'ms' in m ? new Date(m.ms).toISOString() : textoFecha(m.fecha)

/** Lee las lineas `RRULE:` y `EXDATE` de un evento. Exactamente una RRULE. */
export function parseaRecurrencia(lineas: readonly string[], zona: string): Recurrencia {
  let regla: Regla | null = null
  const excluidas = new Set<string>()
  for (const linea of lineas) {
    const dosPuntos = linea.indexOf(':')
    if (dosPuntos < 0) rechaza(`linea sin ':' (${linea})`)
    const cabeza = linea.slice(0, dosPuntos)
    const valor = linea.slice(dosPuntos + 1).trim()
    const nombre = cabeza.split(';')[0]?.toUpperCase()
    if (nombre === 'RRULE') {
      if (regla) rechaza('mas de una RRULE')
      regla = leeRegla(valor.toUpperCase(), zona)
    } else if (nombre === 'EXDATE') {
      const zonaExdate = /;TZID=([^;]+)/i.exec(cabeza)?.[1] ?? zona
      for (const v of valor.split(',')) excluidas.add(claveDeMarca(leeMarca(v.trim(), zonaExdate)))
    } else {
      rechaza(nombre ?? linea)
    }
  }
  if (!regla) return rechaza('falta RRULE')
  return { regla, excluidas }
}

function diasDelMes(r: Regla, anio: number, mes: number, diaBase: number): number[] {
  const total = diasEnMes(anio, mes)
  let porNumero: number[] | null = null
  if (r.porDiaDelMes) porNumero = r.porDiaDelMes.map((n) => (n > 0 ? n : total + n + 1)).filter((n) => n >= 1 && n <= total)
  let porSemana: number[] | null = null
  if (r.porDia) {
    porSemana = []
    for (const { dia, ordinal } of r.porDia) {
      const todos: number[] = []
      for (let d = 1; d <= total; d++) if (diaSemana({ anio, mes, dia: d }) === dia) todos.push(d)
      if (ordinal === null) porSemana.push(...todos)
      else {
        const elegido = ordinal > 0 ? todos[ordinal - 1] : todos[todos.length + ordinal]
        if (elegido !== undefined) porSemana.push(elegido)
      }
    }
  }
  let dias: number[]
  if (porNumero && porSemana) dias = porNumero.filter((d) => porSemana.includes(d))
  else dias = porNumero ?? porSemana ?? (diaBase <= total ? [diaBase] : [])
  return [...new Set(dias)].sort((a, b) => a - b)
}

function aplicaPosicion(r: Regla, fechas: FechaLocal[]): FechaLocal[] {
  if (!r.porPosicion) return fechas
  const elegidas = r.porPosicion.map((p) => (p > 0 ? fechas[p - 1] : fechas[fechas.length + p]))
  return [...new Set(elegidas.filter((f): f is FechaLocal => f !== undefined))].sort(comparaFechas)
}

function* periodosDiarios(r: Regla, f0: FechaLocal): Generator<FechaLocal[]> {
  for (let k = 0; k < MAX_PERIODOS; k++) {
    const f = sumaDias(f0, k * r.intervalo)
    const pasa = (!r.porMes || r.porMes.includes(f.mes))
      && (!r.porDia || r.porDia.some((d) => d.dia === diaSemana(f)))
      && (!r.porDiaDelMes || diasDelMes({ ...r, porDia: null }, f.anio, f.mes, f.dia).includes(f.dia))
    yield pasa ? [f] : []
  }
}

function* periodosSemanales(r: Regla, f0: FechaLocal): Generator<FechaLocal[]> {
  const desplaza = (dia: number) => (dia - r.inicioSemana + 7) % 7
  const semana0 = sumaDias(f0, -desplaza(diaSemana(f0)))
  const dias = (r.porDia?.map((d) => d.dia) ?? [diaSemana(f0)]).map(desplaza).sort((a, b) => a - b)
  for (let k = 0; k < MAX_PERIODOS; k++) {
    const inicio = sumaDias(semana0, 7 * k * r.intervalo)
    const fechas = [...new Set(dias)].map((d) => sumaDias(inicio, d)).filter((f) => !r.porMes || r.porMes.includes(f.mes))
    yield aplicaPosicion(r, fechas)
  }
}

function* periodosMensuales(r: Regla, f0: FechaLocal): Generator<FechaLocal[]> {
  for (let k = 0; k < MAX_PERIODOS; k++) {
    const { anio, mes } = sumaMeses(f0.anio, f0.mes, k * r.intervalo)
    if (r.porMes && !r.porMes.includes(mes)) { yield []; continue }
    yield aplicaPosicion(r, diasDelMes(r, anio, mes, f0.dia).map((dia) => ({ anio, mes, dia })))
  }
}

function* periodosAnuales(r: Regla, f0: FechaLocal): Generator<FechaLocal[]> {
  for (let k = 0; k < MAX_PERIODOS; k++) {
    const anio = f0.anio + k * r.intervalo
    const fechas: FechaLocal[] = []
    for (const mes of r.porMes ?? [f0.mes]) {
      fechas.push(...diasDelMes(r, anio, mes, f0.dia).map((dia) => ({ anio, mes, dia })))
    }
    yield aplicaPosicion(r, fechas.sort(comparaFechas))
  }
}

function periodos(r: Regla, f0: FechaLocal): Generator<FechaLocal[]> {
  if (r.frecuencia === 'DAILY') return periodosDiarios(r, f0)
  if (r.frecuencia === 'WEEKLY') return periodosSemanales(r, f0)
  if (r.frecuencia === 'MONTHLY') return periodosMensuales(r, f0)
  return periodosAnuales(r, f0)
}

export interface Serie {
  /** Inicio de la serie: instante ISO con hora, o AAAA-MM-DD si es de todo el dia. */
  inicio: string
  todoElDia: boolean
  zona: string
}

/**
 * Recorre las ocurrencias en orden. DTSTART cuenta siempre como la primera (RFC 5545 §3.8.5.3) y
 * COUNT se cuenta ANTES de quitar las EXDATE. `visita` devuelve false para parar.
 */
export function recorre(rec: Recurrencia, serie: Serie, visita: (o: Ocurrencia, excluida: boolean) => boolean): void {
  const local = serie.todoElDia ? null : partesEnZona(Date.parse(serie.inicio), serie.zona)
  const f0 = serie.todoElDia ? leeFecha(serie.inicio) : fechaEnZona(Date.parse(serie.inicio), serie.zona)
  const aOcurrencia = (f: FechaLocal): Ocurrencia => {
    if (!local) return { clave: textoFecha(f), inicioMs: inicioDelDia(f, serie.zona) }
    const ms = instanteDesdeLocal({ ...f, hora: local.hora, minuto: local.minuto, segundo: local.segundo }, serie.zona) as number
    return { clave: new Date(ms).toISOString(), inicioMs: ms }
  }
  const { hasta, cuenta } = rec.regla
  const pasada = (f: FechaLocal, o: Ocurrencia) =>
    hasta !== null && ('ms' in hasta ? o.inicioMs > hasta.ms : comparaFechas(f, hasta.fecha) > 0)
  let n = 0
  const emite = (f: FechaLocal): boolean => {
    const o = aOcurrencia(f)
    if (n > 0 && pasada(f, o)) return false
    n++
    if (cuenta !== null && n > cuenta) return false
    return visita(o, rec.excluidas.has(o.clave))
  }
  if (!emite(f0)) return
  let vacios = 0
  for (const fechas of periodos(rec.regla, f0)) {
    vacios = fechas.length ? 0 : vacios + 1
    if (vacios > 4000) return
    for (const f of fechas) {
      if (comparaFechas(f, f0) <= 0) continue
      if (!emite(f)) return
    }
  }
}

/** Ocurrencias que se solapan con [desde, hasta). */
export function expande(rec: Recurrencia, serie: Serie, duracionMs: number, desde: number, hasta: number, limite = 2000): Ocurrencia[] {
  const fuera: Ocurrencia[] = []
  recorre(rec, serie, (o, excluida) => {
    if (o.inicioMs >= hasta || fuera.length >= limite) return false
    if (!excluida && o.inicioMs + Math.max(duracionMs, 1) > desde) fuera.push(o)
    return true
  })
  return fuera
}

/** ¿Es `clave` una ocurrencia de la serie? (Para validar una instancia que llega de fuera.) */
export function esOcurrencia(rec: Recurrencia, serie: Serie, clave: string): boolean {
  const objetivo = esTextoFecha(clave) ? inicioDelDia(leeFecha(clave), serie.zona) : Date.parse(clave)
  let hallada = false
  recorre(rec, serie, (o) => {
    if (o.clave === clave) hallada = true
    return !hallada && o.inicioMs <= objetivo
  })
  return hallada
}

/** Cuantas ocurrencias (incluidas las excluidas: COUNT las cuenta) caen antes de `clave`. */
export function cuentaAntes(rec: Recurrencia, serie: Serie, clave: string): number {
  const objetivo = esTextoFecha(clave) ? inicioDelDia(leeFecha(clave), serie.zona) : Date.parse(clave)
  let n = 0
  recorre(rec, serie, (o) => {
    if (o.inicioMs >= objetivo) return false
    n++
    return true
  })
  return n
}

const marcaUtc = (ms: number): string => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const marcaFecha = (f: FechaLocal): string => textoFecha(f).replace(/-/g, '')

function reescribeRegla(lineas: readonly string[], cambia: (partes: Map<string, string>) => void): string[] {
  return lineas.map((linea) => {
    if (!linea.toUpperCase().startsWith('RRULE:')) return linea
    const partes = new Map(linea.slice(6).split(';').map((p) => p.split('=') as [string, string]))
    cambia(partes)
    return `RRULE:${[...partes].map(([k, v]) => `${k}=${v}`).join(';')}`
  })
}

/** La serie termina justo antes de `clave` (corte de «este y los siguientes»). */
export function terminaAntes(lineas: readonly string[], clave: string): string[] {
  return reescribeRegla(lineas, (p) => {
    p.delete('COUNT')
    p.set('UNTIL', esTextoFecha(clave) ? marcaFecha(sumaDias(leeFecha(clave), -1)) : marcaUtc(Date.parse(clave) - 1000))
  })
}

/** La misma regla con COUNT = n (la cola de una serie partida que contaba ocurrencias). */
export function conCuenta(lineas: readonly string[], n: number): string[] {
  return reescribeRegla(lineas, (p) => { p.delete('UNTIL'); p.set('COUNT', String(n)) })
}

/** Quita de las EXDATE lo que cae antes (`antes`) o desde (`!antes`) el corte. */
export function filtraExcluidas(lineas: readonly string[], clave: string, antes: boolean, zona: string): string[] {
  const corte = esTextoFecha(clave) ? inicioDelDia(leeFecha(clave), zona) : Date.parse(clave)
  return lineas.flatMap((linea) => {
    if (!linea.toUpperCase().startsWith('EXDATE')) return [linea]
    const dosPuntos = linea.indexOf(':')
    const tz = /TZID=([^;:]+)/.exec(linea.slice(0, dosPuntos))?.[1] ?? zona
    const quedan = linea.slice(dosPuntos + 1).split(',').filter((v) => {
      const m = leeMarca(v.trim(), tz)
      const t = 'ms' in m ? m.ms : inicioDelDia(m.fecha, zona)
      return antes ? t < corte : t >= corte
    })
    return quedan.length ? [`${linea.slice(0, dosPuntos)}:${quedan.join(',')}`] : []
  })
}
