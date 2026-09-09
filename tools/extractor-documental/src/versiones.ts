/**
 * Correcciones sobre lo ya validado, como historial append-only.
 *
 * Lo validado NO se edita: una correccion INSERTA una version nueva y la anterior queda. Es lo
 * unico que permite responder "que decia esto en marzo?" seis meses despues.
 *
 * Y exige MOTIVO: sin el, la traza dice que cambio pero no por que, que es la mitad util.
 */
import type { Rol } from './roles.js'
import { exige } from './roles.js'

export interface VersionDeCampo {
  clave: string
  valor: string
  quien: string
  cuando: string
  /** `null` solo en la version original, que no corrige nada. */
  motivo: string | null
  version: number
}

export function versionInicial(clave: string, valor: string, quien: string, ahora: Date = new Date()): VersionDeCampo {
  return { clave, valor, quien, cuando: ahora.toISOString(), motivo: null, version: 1 }
}

/**
 * Anade una version. No pisa nada: devuelve el historial completo con la nueva al final.
 */
export function corrige(
  historial: readonly VersionDeCampo[],
  nuevoValor: string,
  quien: string,
  motivo: string,
  rol: Rol,
  ahora: Date = new Date(),
): readonly VersionDeCampo[] {
  exige(rol, 'corregir')
  if (historial.length === 0) throw new Error('No hay version inicial que corregir')
  if (motivo.trim().length === 0) {
    throw new Error('Una correccion sin motivo deja una traza que dice QUE cambio y no POR QUE')
  }
  const ultima = vigente(historial)
  return [
    ...historial,
    { clave: ultima.clave, valor: nuevoValor, quien, cuando: ahora.toISOString(), motivo: motivo.trim(), version: ultima.version + 1 },
  ]
}

/** La version actual: la de numero mas alto. Nunca se calcula por posicion en el array. */
export function vigente(historial: readonly VersionDeCampo[]): VersionDeCampo {
  if (historial.length === 0) throw new Error('Historial vacio: no hay version vigente')
  return historial.reduce((a, b) => (b.version > a.version ? b : a))
}

/** Quien tocó qué y por qué, de lo mas reciente a lo mas antiguo. */
export function historialLegible(historial: readonly VersionDeCampo[]): readonly VersionDeCampo[] {
  return historial.slice().sort((a, b) => b.version - a.version)
}
