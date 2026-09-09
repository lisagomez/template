/**
 * Las decisiones de las tres pantallas que faltaban: lotes (TAR-46), coste y exportacion (TAR-47)
 * y supresion (TAR-48).
 *
 * Ninguna toca React ni el DOM: son funciones puras sobre lo que el nucleo ya resuelve. Estan en
 * `./react` porque solo las usa la UI, pero se prueban con `node --test` — que es lo que permite
 * que una pantalla que decide sobre un borrado irreversible tenga pruebas de verdad y no capturas.
 */
import type { Lote, ResumenParaTitulo } from '../registros.js'
import { tituloSugerido } from '../registros.js'
import type { Estimacion } from '../costes.js'
import { sumaEstimaciones } from '../costes.js'
import type { Rol } from '../roles.js'
import { puede } from '../roles.js'
import type { CriteriosDeBusqueda } from '../busqueda.js'
import { estanVacios, normalizaCriterios } from '../busqueda.js'

// --- TAR-46: crear, titular, buscar y recuperar ---------------------------------------------------

export interface BorradorDeLote {
  /** Lo que se propone. El usuario puede cambiarlo entero: es una sugerencia, no una imposicion. */
  titulo: string
  /** `true` mientras el titulo sea el sugerido sin tocar. Sirve para no pisar lo que alguien escribio. */
  esSugerido: boolean
}

/**
 * Propone un titulo a partir del contenido, editable.
 *
 * `esSugerido` existe para un caso concreto: si llegan mas documentos DESPUES de que alguien haya
 * escrito su propio titulo, el sugerido no puede pisarlo. Sin esa marca, la UI tendria que elegir
 * entre no actualizar nunca —y dejar un titulo que ya no describe el lote— o pisar lo que una
 * persona escribio a mano, que es peor.
 */
export function borradorDeLote(resumen: ResumenParaTitulo): BorradorDeLote {
  return { titulo: tituloSugerido(resumen), esSugerido: true }
}

export function editaTitulo(borrador: BorradorDeLote, titulo: string): BorradorDeLote {
  return { titulo, esSugerido: false }
}

export function refrescaSugerencia(borrador: BorradorDeLote, resumen: ResumenParaTitulo): BorradorDeLote {
  return borrador.esSugerido ? { titulo: tituloSugerido(resumen), esSugerido: true } : borrador
}

/** Un titulo en blanco no vale: es obligatorio. Pero NO es unico (§2.14). */
export function tituloValido(titulo: string): boolean {
  return titulo.trim().length > 0
}

export type MotivoSinBusqueda = 'sin_criterios'

/**
 * Si los criterios sirven para buscar. Devuelve el motivo en vez de un booleano pelado, para que
 * la pantalla pueda decir POR QUE no busca en lugar de quedarse quieta sin explicacion.
 */
export function puedeBuscar(criterios: CriteriosDeBusqueda): { puede: true } | { puede: false; motivo: MotivoSinBusqueda } {
  return estanVacios(criterios) ? { puede: false, motivo: 'sin_criterios' } : { puede: true }
}

export { normalizaCriterios }

// --- TAR-47: el coste se ve ANTES de gastarlo ------------------------------------------------------

export interface ConfirmacionDeCoste {
  estimacion: Estimacion
  /** `true` solo si la persona vio la cifra y acepto. No se deriva de nada mas. */
  aceptado: boolean
}

/**
 * Si el lote puede lanzarse. Cubre RF-78.
 *
 * Dos reglas, y la segunda es la que suele faltar:
 *   1. Sin aceptacion explicita, no se lanza. Ver la cifra no es aceptarla.
 *   2. **Un total desconocido NO bloquea, pero se marca.** `costes.ts` devuelve `null` cuando falta
 *      una tarifa, nunca cero. Bloquear por no saber dejaria la herramienta inservible en cuanto un
 *      motor no declare precio; lanzar en silencio seria gastar sin avisar. Se lanza, y quien lo
 *      lanza sabe que la cifra es incompleta.
 */
export function puedeLanzar(confirmacion: ConfirmacionDeCoste): { puede: boolean; avisoDeCosteDesconocido: boolean } {
  const desconocido = confirmacion.estimacion.costeUsd === null
  return { puede: confirmacion.aceptado, avisoDeCosteDesconocido: desconocido }
}

/** El total del lote, con el hueco propagado: una suma con un `null` dentro es un total desconocido. */
export function totalDelLote(estimaciones: readonly Estimacion[]): Estimacion {
  return sumaEstimaciones(estimaciones)
}

/**
 * Texto de la cifra para la pantalla. `null` se enseña como «no se sabe», nunca como «0,00 USD».
 *
 * Es la misma regla que la contabilidad de tokens y que la estimacion de purga: un cero inventado
 * se lee como «no cuesta nada», que es la conclusion contraria a la verdadera.
 */
export function costeLegible(estimacion: Estimacion): string {
  if (estimacion.costeUsd === null) return 'coste desconocido: falta declarar la tarifa del motor'
  return `${estimacion.costeUsd.toFixed(2)} USD`
}

// --- TAR-48: suprimir es irreversible, y se nota ----------------------------------------------------

export interface PeticionDeSupresion {
  rol: Rol
  motivo: string
  /** La casilla que la persona marca. No se deduce de haber pulsado el boton. */
  confirmado: boolean
}

export type ImpedimentoDeSupresion = 'sin_permiso' | 'sin_motivo' | 'sin_confirmar'

/**
 * Las tres condiciones de RF-75, comprobadas por separado para poder decir cual falta.
 *
 * Devolver «no puedes» sin decir por que obliga a adivinar, y quien adivina prueba combinaciones
 * hasta que una funciona — que es justo lo que no quieres que pase con un borrado.
 */
export function impedimentosParaSuprimir(peticion: PeticionDeSupresion): readonly ImpedimentoDeSupresion[] {
  const faltan: ImpedimentoDeSupresion[] = []
  if (!puede(peticion.rol, 'suprimir')) faltan.push('sin_permiso')
  if (peticion.motivo.trim().length === 0) faltan.push('sin_motivo')
  if (!peticion.confirmado) faltan.push('sin_confirmar')
  return faltan
}

export function puedeSuprimir(peticion: PeticionDeSupresion): boolean {
  return impedimentosParaSuprimir(peticion).length === 0
}

export interface CandidatoAVencer {
  id: string
  venceEn: string
}

/**
 * Lo que ha vencido su retencion: una LISTA, no un borrado.
 *
 * RF-63 es explicito: vencer no borra. Esta funcion existe para que la pantalla pueda enseñar
 * candidatos y que una persona decida uno por uno; devolver una accion aqui —o llamarla desde un
 * cron— convertiria una fecha en una perdida de evidencia sin que nadie mire.
 */
export function candidatosPorRetencion(
  registros: readonly CandidatoAVencer[],
  ahora: Date,
): readonly CandidatoAVencer[] {
  const limite = ahora.getTime()
  return registros.filter((r) => {
    const vence = Date.parse(r.venceEn)
    // Una fecha ilegible NO se trata como vencida: ante la duda, no se propone borrar nada.
    return Number.isFinite(vence) && vence <= limite
  })
}

/** Si un lote admite que se le añadan documentos. Se re-expone para que la pantalla no razone. */
export function admiteMasDocumentos(lote: Lote): boolean {
  return lote.estado === 'abierto'
}
