/**
 * El calendario hábil de un contrato: zona (desfase fijo; la Ciudad de México no tiene horario de
 * verano desde 2022), días, horario y feriados. Con él se cuentan los minutos hábiles entre dos
 * instantes y se suma un número de minutos hábiles a un instante. Un calendario `continuo` (24×7)
 * cuenta todos los minutos, como un P1 que se atiende de noche.
 */

export interface Calendario {
  readonly zona: string
  /** Minutos que hay que SUMAR a UTC para tener la hora local (Ciudad de México: −360). */
  readonly desfaseMin: number
  /** Días hábiles, 1 = lunes … 7 = domingo. */
  readonly dias: readonly number[]
  /** `HH:MM` local. */
  readonly inicio: string
  readonly fin: string
  /** Fechas locales `AAAA-MM-DD`. */
  readonly feriados: readonly string[]
  readonly continuo: boolean
}

export const CALENDARIO_CDMX: Calendario = {
  zona: 'America/Mexico_City', desfaseMin: -360, dias: [1, 2, 3, 4, 5], inicio: '09:00', fin: '18:00',
  feriados: ['2026-01-01', '2026-02-02', '2026-03-16', '2026-05-01', '2026-09-16', '2026-11-16', '2026-12-25'], continuo: false,
}

export const continuo = (c: Calendario): Calendario => ({ ...c, continuo: true })

const MIN = 60_000
const DIA = 24 * 60

const hhmm = (s: string): number => {
  const [h, m] = s.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Minutos locales desde la época (para recorrer días locales sin librerías de zona). */
const local = (c: Calendario, t: number): number => Math.floor(t / MIN) + c.desfaseMin

function esHabil(c: Calendario, diaLocal: number): boolean {
  const fecha = new Date(diaLocal * DIA * MIN)
  const iso = fecha.toISOString().slice(0, 10)
  const dow = ((fecha.getUTCDay() + 6) % 7) + 1
  return c.dias.includes(dow) && !c.feriados.includes(iso)
}

/** Minutos hábiles entre dos instantes (ms desde la época). Negativo si `hasta` < `desde`. */
export function minutosHabiles(c: Calendario, desde: number, hasta: number): number {
  if (hasta < desde) return -minutosHabiles(c, hasta, desde)
  if (c.continuo) return Math.floor((hasta - desde) / MIN)
  const a = local(c, desde), b = local(c, hasta)
  const ini = hhmm(c.inicio), fin = hhmm(c.fin)
  let total = 0
  for (let dia = Math.floor(a / DIA); dia <= Math.floor(b / DIA); dia++) {
    if (!esHabil(c, dia)) continue
    const abre = Math.max(a, dia * DIA + ini), cierra = Math.min(b, dia * DIA + fin)
    if (cierra > abre) total += cierra - abre
  }
  return total
}

/** El instante (ms) al que se llega sumando `minutos` hábiles a `desde`. */
export function sumaMinutosHabiles(c: Calendario, desde: number, minutos: number): number {
  if (c.continuo) return desde + minutos * MIN
  const ini = hhmm(c.inicio), fin = hhmm(c.fin)
  let resto = minutos
  let t = local(c, desde)
  for (let guarda = 0; guarda < 3650; guarda++) {
    const dia = Math.floor(t / DIA)
    if (esHabil(c, dia)) {
      const abre = Math.max(t, dia * DIA + ini), cierra = dia * DIA + fin
      if (cierra > abre) {
        if (resto <= cierra - abre) return (abre + resto - c.desfaseMin) * MIN
        resto -= cierra - abre
      }
    }
    t = (dia + 1) * DIA
  }
  throw new Error('el calendario no tiene días hábiles en diez años')
}
