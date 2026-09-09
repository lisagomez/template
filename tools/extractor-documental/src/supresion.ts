/**
 * Supresion a peticion del titular, contra la inmutabilidad. Las dos reglas chocan y aqui se
 * resuelven a proposito.
 *
 * Se borra el CONTENIDO —el original del bucket, los valores, las entradas del indice— y queda
 * constancia de que el registro existio. Sin esa lapida, una auditoria no distingue "nunca
 * existio" de "se borro", y el historial de versiones queda con huecos que parecen corrupcion.
 *
 * Y suprimir NO es corregir: una correccion anade version, una supresion retira contenido.
 * Distinta operacion, distinta autoridad, e irreversible — gate humano, nunca automatica.
 */
import type { Rol } from './roles.js'
import { exige } from './roles.js'

export interface Lapida {
  registroId: string
  organizacionId: string
  quienPidio: string
  quienEjecuto: string
  motivo: string
  suprimidoEn: string
}

export interface OrdenDeSupresion {
  lapida: Lapida
  /** Rutas de objetos a borrar del bucket. El borrado real lo hace el adaptador. */
  objetosABorrar: readonly string[]
  /** Claves del indice a retirar, para que el registro deje de ser encontrable. */
  entradasDeIndiceARetirar: readonly string[]
}

export interface RegistroASuprimir {
  id: string
  organizacionId: string
  rutasDeOriginales: readonly string[]
  clavesDeIndice: readonly string[]
}

export function suprime(
  registro: RegistroASuprimir,
  quienPidio: string,
  quienEjecuto: string,
  motivo: string,
  rol: Rol,
  ahora: Date = new Date(),
): OrdenDeSupresion {
  exige(rol, 'suprimir')
  if (motivo.trim().length === 0) {
    throw new Error('Una supresion sin motivo no se puede justificar ante quien la audite')
  }
  if (quienPidio.trim().length === 0) {
    throw new Error('Hay que registrar quien pidio la supresion: es lo que la hace legitima')
  }
  return {
    lapida: {
      registroId: registro.id,
      organizacionId: registro.organizacionId,
      quienPidio,
      quienEjecuto,
      motivo: motivo.trim(),
      suprimidoEn: ahora.toISOString(),
    },
    objetosABorrar: registro.rutasDeOriginales,
    entradasDeIndiceARetirar: registro.clavesDeIndice,
  }
}

/** Distingue "se borro" de "nunca existio". Es para lo que sirve la lapida. */
export function esSuprimido(lapidas: readonly Lapida[], registroId: string): boolean {
  return lapidas.some((l) => l.registroId === registroId)
}
