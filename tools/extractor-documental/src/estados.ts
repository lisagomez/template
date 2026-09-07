/**
 * Maquina de estados del documento. Funciones puras: se prueban sin red, sin base y sin reloj.
 *
 * El grafo esta declarado como dato y no como una cadena de `if`, para que anadir un estado sea
 * anadir una fila y no revisar cinco condicionales que nadie recuerda por que estaban ahi.
 */
import type { EstadoDocumento } from './tipos.js'

const TRANSICIONES: Readonly<Record<EstadoDocumento, readonly EstadoDocumento[]>> = {
  pendiente: ['en_cola', 'rechazado'],
  en_cola: ['procesando', 'rechazado'],
  procesando: ['extraido', 'fallido'],
  extraido: ['en_revision', 'revision_humana', 'fallido'],
  en_revision: ['validado', 'rechazado', 'revision_humana'],
  // Es una salida NORMAL, no un callejon: de aqui se sale a validado o a rechazado.
  revision_humana: ['validado', 'rechazado'],
  validado: [],
  rechazado: [],
  // Un fallo tecnico se reintenta; por eso vuelve a la cola y no muere aqui.
  fallido: ['en_cola'],
}

export const ESTADO_INICIAL: EstadoDocumento = 'pendiente'

/** Los estados de los que ya no se sale. `fallido` NO es uno: se reintenta. */
export const ESTADOS_TERMINALES: readonly EstadoDocumento[] = ['validado', 'rechazado']

export function esTerminal(estado: EstadoDocumento): boolean {
  return ESTADOS_TERMINALES.includes(estado)
}

/**
 * `revision_humana` no cuenta como fallo, y esa es toda la razon de que esta funcion exista en vez
 * de que cada pantalla decida por su cuenta. El unico fallo es el tecnico.
 */
export function esFallo(estado: EstadoDocumento): boolean {
  return estado === 'fallido'
}

/** Un documento que espera a una persona. Es lo que dimensiona la cola de revision. */
export function esperaHumano(estado: EstadoDocumento): boolean {
  return estado === 'revision_humana' || estado === 'en_revision'
}

export function puedeTransitar(desde: EstadoDocumento, hacia: EstadoDocumento): boolean {
  return TRANSICIONES[desde].includes(hacia)
}

/**
 * Transicion o error. Devolver el estado anterior en silencio ante una transicion invalida
 * convierte un bug en un documento atascado que nadie encuentra.
 */
export function transita(desde: EstadoDocumento, hacia: EstadoDocumento): EstadoDocumento {
  if (!puedeTransitar(desde, hacia)) {
    throw new Error(`Transicion invalida: de "${desde}" no se puede pasar a "${hacia}"`)
  }
  return hacia
}

/** Los destinos legales desde un estado. Lo usa la UI para no ofrecer botones imposibles. */
export function siguientes(desde: EstadoDocumento): readonly EstadoDocumento[] {
  return TRANSICIONES[desde]
}
