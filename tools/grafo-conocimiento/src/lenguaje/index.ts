/**
 * Entrada `./lenguaje` (PRP-005 Fase 5): de una pregunta en lenguaje natural a una respuesta en
 * lenguaje natural. Parser (modelo inyectado, solo estructura) → motor (veredicto) → redactor
 * (plantillas). El modelo nunca decide el veredicto (RF-4).
 */
import type { Conocimiento, FalloSinVeredicto, Resultado } from '../contrato.js'
import { evaluaSeguro } from '../motor.js'
import { estructura, type OpcionesParser } from './parser.js'
import { redacta, redactaFallo } from './redacta.js'

export { estructura, esquemaDeSalida, instrucciones, LARGO_MAXIMO, type Estructurador, type OpcionesParser, type PeticionEstructura } from './parser.js'
export { redacta, redactaFallo } from './redacta.js'

export type Respuesta =
  | { tipo: 'resultado'; resultado: Resultado; texto: string }
  | { tipo: 'fallo'; fallo: FalloSinVeredicto; texto: string }

export interface OpcionesRespuesta extends OpcionesParser {
  /** Fecha de la consulta, para el hecho que no trae fecha (RF-13). */
  hoy?: string
}

export async function responde(pregunta: string, o: OpcionesRespuesta): Promise<Respuesta> {
  const p = await estructura(pregunta, o)
  if ('tipo' in p) return { tipo: 'fallo', fallo: p, texto: redactaFallo(p) }
  const r = evaluaSeguro(o.conocimiento satisfies Conocimiento, p, { hoy: o.hoy })
  if ('tipo' in r) return { tipo: 'fallo', fallo: r, texto: redactaFallo(r) }
  return { tipo: 'resultado', resultado: r, texto: redacta(r, o.conocimiento) }
}
