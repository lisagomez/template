/**
 * La matriz problema-solución, sobre el motor determinista del grafo de conocimiento
 * (`TPL-grafo-conocimiento`). Cada entrada es un CASO: el patrón que lo reconoce (keywords del
 * motor), la solución en pasos contra el simulador, su grado y su fuente. La matriz se traduce a
 * conocimiento del grafo y el VEREDICTO lo da el motor: el agente no lo decide (RF-4 de la spec
 * 004). Sin regla, el motor no afirma nada y la incidencia va al sandbox.
 *
 * El motor se INYECTA (puerto `MotorReglas`): el núcleo no importa la herramienta del grafo.
 * Las entradas de laboratorio son SINTÉTICAS: sus fuentes son notas del laboratorio en un dominio
 * `.invalid`, nunca notas de SAP. La siembra real va a `tools/conocimiento` como propuesta firmada.
 */
import type { AccionSimulador, PasoSolucion, Sintoma, Sistema } from './simulador.js'

export type Grado = 'validada' | 'probable' | 'experimental'

export interface EntradaMatriz {
  /** Clave de la regla en el grafo. */
  readonly regla: string
  /** Clave de la categoría en el grafo. */
  readonly categoria: string
  readonly titulo: string
  readonly modulo: string
  readonly componente: string
  readonly transacciones: readonly string[]
  readonly keywords: readonly string[]
  readonly exclusiones: readonly string[]
  readonly sistemas: readonly Sistema[]
  readonly grado: Grado
  readonly complejidad: 'baja' | 'media' | 'alta'
  readonly solucion: {
    readonly resumen: string
    /** Pasos con parámetros por nombre; el valor sale de la incidencia (`parametros`). */
    readonly pasos: ReadonlyArray<{ readonly accion: AccionSimulador; readonly descripcion: string }>
  }
  /** Cómo sacar cada parámetro del texto de la incidencia (regex con un grupo). */
  readonly parametros: Readonly<Record<string, string>>
  /** El síntoma que el simulador debe reproducir antes y dejar de reproducir después. */
  readonly sintoma: ((p: Readonly<Record<string, string>>) => Sintoma) | null
  readonly fuente: { readonly cita: string; readonly url: string }
}

export const DIMENSION = 'soporte_sap'
export const VEREDICTOS = { conocida: 'solucion_conocida', experto: 'escalar_al_experto' } as const

/** Qué grado basta para preparar la solución en producción. «experimental» va al experto. */
export const GRADOS_DE_PRODUCCION: readonly Grado[] = ['validada', 'probable']

interface Conocimiento {
  readonly version: string
  readonly procedencia: string
  readonly jurisdicciones: ReadonlyArray<{ codigo: string; nombre: string }>
  readonly dimensiones: ReadonlyArray<{ codigo: string; nombre: string; vocabulario: string[]; frases: Record<string, string> }>
  readonly dominios: ReadonlyArray<Record<string, unknown>>
  readonly categorias: ReadonlyArray<Record<string, unknown>>
  readonly reglas: ReadonlyArray<Record<string, unknown>>
}

/** Traduce la matriz a conocimiento del grafo (la forma que valida `validaConocimiento`). */
export function conocimientoDeMatriz(matriz: readonly EntradaMatriz[], corte: string, version = '0.1.0'): Conocimiento {
  return {
    version,
    procedencia: 'SINTÉTICO del laboratorio de Soporte SAP (goal soporte-sap, corrida A): casos y notas inventados para probar el producto. No describe notas de SAP ni se distribuye como conocimiento.',
    jurisdicciones: [{ codigo: 'MX', nombre: 'México' }],
    dimensiones: [{
      codigo: DIMENSION, nombre: 'Soporte SAP', vocabulario: [VEREDICTOS.conocida, VEREDICTOS.experto],
      frases: { [VEREDICTOS.conocida]: 'hay una solución conocida con su fuente', [VEREDICTOS.experto]: 'el caso es conocido pero su solución es experimental: decide el experto' },
    }],
    dominios: [{ clave: 'sap-soporte-laboratorio', nombre: 'Soporte SAP (laboratorio)', jurisdiccion: 'MX', dimension: DIMENSION, cita: 'interna', corte, procedencia: 'casos sintéticos del sandbox del laboratorio', categorias: matriz.map((e) => e.categoria) }],
    categorias: matriz.map((e) => ({ clave: e.categoria, nombre: e.titulo, descripcion: `${e.modulo} · ${e.componente}`, keywords: [...e.keywords], exclusiones: [...e.exclusiones] })),
    reglas: matriz.map((e) => ({
      clave: e.regla, jurisdiccion: 'MX', dimension: DIMENSION, titulo: e.titulo, texto_resumen: e.solucion.resumen,
      fuente_cita: e.fuente.cita, fuente_url: e.fuente.url, vigente_desde: '2026-01-01', vigente_hasta: null,
      impactos: e.sistemas.map((s) => ({
        categoria: e.categoria, regimen: s, veredicto_base: e.grado === 'experimental' ? VEREDICTOS.experto : VEREDICTOS.conocida,
        requisitos: e.solucion.pasos.map((p) => p.descripcion), banderas: [], parametros: { grado: e.grado },
      })),
    })),
  }
}

/** Lo que el núcleo necesita del motor. La app le pasa `evaluaSeguro` del grafo con este conocimiento. */
export interface ConceptoDelMotor {
  readonly categoria: string | null
  readonly motivo: string
  readonly veredicto: string | null
  readonly razon: string
  readonly fuente: { readonly clave: string; readonly cita: string; readonly url: string } | null
}
export type MotorReglas = (pregunta: {
  contexto: { jurisdiccion: 'MX'; dimension: string; regimen: string }
  conceptos: Array<{ descripcion: string }>
}) => { conceptos: readonly ConceptoDelMotor[] } | { tipo: string; detalle: string }

export type ConsultaMatriz =
  | { readonly tipo: 'solucion'; readonly entrada: EntradaMatriz; readonly fuente: NonNullable<ConceptoDelMotor['fuente']>; readonly razon: string }
  | { readonly tipo: 'grado_insuficiente'; readonly entrada: EntradaMatriz; readonly fuente: NonNullable<ConceptoDelMotor['fuente']>; readonly razon: string }
  | { readonly tipo: 'sin_solucion'; readonly motivo: string; readonly razon: string }

/** Consulta el grafo por una incidencia. Solo el motor da el veredicto; esto lo traduce a la matriz. */
export function consultaMatriz(motor: MotorReglas, matriz: readonly EntradaMatriz[], texto: string, sistema: Sistema): ConsultaMatriz {
  const r = motor({ contexto: { jurisdiccion: 'MX', dimension: DIMENSION, regimen: sistema }, conceptos: [{ descripcion: texto.slice(0, 4000) }] })
  if (!('conceptos' in r)) return { tipo: 'sin_solucion', motivo: r.tipo, razon: r.detalle }
  const c = r.conceptos[0]
  if (!c || c.motivo !== 'regla' || !c.fuente || !c.veredicto) return { tipo: 'sin_solucion', motivo: c?.motivo ?? 'sin_concepto', razon: c?.razon ?? 'el motor no devolvió concepto' }
  const entrada = matriz.find((e) => e.regla === c.fuente!.clave)
  if (!entrada) return { tipo: 'sin_solucion', motivo: 'regla_sin_caso', razon: `la regla ${c.fuente.clave} no tiene caso en la matriz` }
  if (c.veredicto === VEREDICTOS.experto || !GRADOS_DE_PRODUCCION.includes(entrada.grado)) return { tipo: 'grado_insuficiente', entrada, fuente: c.fuente, razon: c.razon }
  return { tipo: 'solucion', entrada, fuente: c.fuente, razon: c.razon }
}

/** Saca los parámetros de la solución del texto de la incidencia. Lo que falte, falta: no se inventa. */
export function extraeParametros(e: EntradaMatriz, texto: string): { parametros: Record<string, string>; faltan: string[] } {
  const parametros: Record<string, string> = {}
  const faltan: string[] = []
  for (const [nombre, patron] of Object.entries(e.parametros)) {
    const m = new RegExp(patron, 'i').exec(texto)
    const v = m?.slice(1).find((g) => g !== undefined)
    if (v) parametros[nombre] = v
    else faltan.push(nombre)
  }
  return { parametros, faltan }
}

/** Los pasos de la solución con sus parámetros puestos. */
export function pasosDe(e: EntradaMatriz, parametros: Readonly<Record<string, string>>): PasoSolucion[] {
  return e.solucion.pasos.map((p) => ({ accion: p.accion, descripcion: p.descripcion, parametros }))
}
