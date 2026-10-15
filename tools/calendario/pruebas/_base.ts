/**
 * Banco comun: un simulador de Google, un espejo en memoria, la pluma y el lector, con un reloj que
 * controla la prueba (las esperas por 429 avanzan el reloj en vez de dormir).
 */
import { Lector, Pluma, type Calendario, type RefCalendario, type Reloj } from '../dist/index.js'
import { SimuladorGoogle } from '../dist/simulador/index.js'
import { AlmacenEnMemoria } from '../dist/almacenes/memoria.js'

export interface RelojDePrueba extends Reloj { avanza(ms: number): void; esperas: number[] }

export function relojDePrueba(inicio: string): RelojDePrueba {
  let t = Date.parse(inicio)
  const esperas: number[] = []
  return {
    ahora: () => t,
    espera: async (ms: number) => { esperas.push(ms); t += ms },
    avanza: (ms: number) => { t += ms },
    esperas,
  }
}

export const CUENTA = 'agenda@negocio.mx'
export const TRABAJO: RefCalendario = { cuenta: CUENTA, calendario: 'trabajo' }
export const PERSONAL: RefCalendario = { cuenta: CUENTA, calendario: 'personal' }
export const ZONA = 'America/Mexico_City'

export function calendario(ref: RefCalendario, nombre: string, extra: Partial<Calendario> = {}): Calendario {
  return { cuenta: ref.cuenta, id: ref.calendario, nombre, color: '#2f6fed', zona: ZONA, rol: 'propietario', principal: false, visible: true, ...extra }
}

export function banco(inicio = '2026-10-19T08:00:00-06:00') {
  const reloj = relojDePrueba(inicio)
  const sim = new SimuladorGoogle({ reloj })
  sim.agregaCalendario(calendario(TRABAJO, 'Trabajo'))
  sim.agregaCalendario(calendario(PERSONAL, 'Personal', { color: '#16a34a' }))
  const almacen = new AlmacenEnMemoria()
  const pluma = new Pluma({ proveedor: sim, almacen, reloj })
  const lector = new Lector({ almacen, reloj })
  return { reloj, sim, proveedor: sim, almacen, pluma, lector }
}

export const DIA = 86_400_000
export const HORA = 3_600_000

/** Hora local HH:MM de un instante en la zona dada. */
export function horaLocal(ms: number, zona = ZONA): string {
  return new Intl.DateTimeFormat('es-MX', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms))
}

/** Dia local AAAA-MM-DD de un instante en la zona dada. */
export function diaLocal(ms: number, zona = ZONA): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))
}
