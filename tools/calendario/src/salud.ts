/**
 * La salud del espejo, para pintarla y para decidir: `fresco` / `rancio` / `error`, con su edad, su
 * causa y QUIEN lo destraba. Una credencial caducada deja leer (el espejo sigue ahi) y bloquea escribir.
 */
import type { EstadoSync } from './puertos.js'
import type { RefCalendario } from './tipos.js'

export type EstadoSalud = 'fresco' | 'rancio' | 'error'

export interface SaludCalendario extends RefCalendario {
  estado: EstadoSalud
  edadMs: number | null
  causa: string
}

export interface Salud {
  estado: EstadoSalud
  /** Edad de la sincronizacion MAS VIEJA entre los calendarios mirados. */
  edadMs: number | null
  ultimaSync: string | null
  causa: string
  destraba: string | null
  escritura: 'permitida' | 'bloqueada'
  reparacionesPendientes: number
  porCalendario: SaludCalendario[]
}

/** Por defecto, rancio a las 6 h: lo que usaba la fuente para refrescar sola. */
export const UMBRAL_RANCIO_MS = 6 * 3_600_000

const ORDEN: Record<EstadoSalud, number> = { fresco: 0, rancio: 1, error: 2 }

function deUno(ref: RefCalendario, e: EstadoSync | null, ahora: number, umbralMs: number): SaludCalendario {
  if (e?.error) return { ...ref, estado: 'error', edadMs: e.ultimaSync === null ? null : ahora - e.ultimaSync, causa: e.error.mensaje }
  if (!e || e.ultimaSync === null) return { ...ref, estado: 'rancio', edadMs: null, causa: 'nunca se ha sincronizado' }
  const edad = ahora - e.ultimaSync
  return edad > umbralMs
    ? { ...ref, estado: 'rancio', edadMs: edad, causa: `ultima sincronizacion hace ${Math.round(edad / 60_000)} min` }
    : { ...ref, estado: 'fresco', edadMs: edad, causa: 'al dia' }
}

export function calculaSalud(
  estados: Array<{ ref: RefCalendario; estado: EstadoSync | null }>,
  ahora: number,
  opciones: { umbralMs?: number; reparacionesPendientes?: number } = {},
): Salud {
  const umbral = opciones.umbralMs ?? UMBRAL_RANCIO_MS
  const porCalendario = estados.map((x) => deUno(x.ref, x.estado, ahora, umbral))
  const peor = porCalendario.reduce<SaludCalendario | null>((a, b) => (!a || ORDEN[b.estado] > ORDEN[a.estado] ? b : a), null)
  const credencial = estados.find((x) => x.estado?.error?.codigo === 'credencial')?.estado?.error ?? null
  const edades = porCalendario.map((c) => c.edadMs).filter((x): x is number => x !== null)
  const masVieja = estados.map((x) => x.estado?.ultimaSync).filter((x): x is number => typeof x === 'number').sort((a, b) => a - b)[0]
  const pendientes = opciones.reparacionesPendientes ?? 0
  return {
    estado: peor?.estado ?? 'rancio',
    edadMs: edades.length ? Math.max(...edades) : null,
    ultimaSync: masVieja === undefined ? null : new Date(masVieja).toISOString(),
    causa: credencial?.mensaje ?? (pendientes ? `${pendientes} escritura(s) por asentar en el espejo` : peor?.causa ?? 'sin calendarios'),
    destraba: credencial?.destraba ?? estados.find((x) => x.estado?.error)?.estado?.error?.destraba ?? null,
    escritura: credencial ? 'bloqueada' : 'permitida',
    reparacionesPendientes: pendientes,
    porCalendario,
  }
}
