/**
 * El caso conocido, del grafo a la sala: el par EJECUTOR → SUPERVISOR (el patrón del trío de
 * hermes-os-a2a como configuración sobre un par genérico; el trío no vive aquí). El ejecutor prepara
 * el plan desde la matriz y lo simula; el supervisor —otro agente, que no sella su propio trabajo— lo
 * re-verifica contra el simulador con SUS comprobaciones y emite el veredicto. Ninguno aprueba: el plan
 * va a la sala con la huella de lo que se aprueba, y lo decide una persona.
 *
 * Si la persona lo manda a revisión, el ejecutor lee el MOTIVO como dato (solo extrae de él los
 * parámetros que la regla declara) y propone una versión nueva, con otra huella.
 */
import { huellaDePlan } from './artefacto.js'
import type { AccionDeTriage } from './pricing.js'
import { extraeParametros, pasosDe, GRADOS_DE_PRODUCCION, type EntradaMatriz } from './matriz.js'
import { simula, reproduce, NoAplica, type SapSimulado, type PasoSolucion } from './simulador.js'

export interface Plan {
  readonly taskId: string
  readonly version: number
  readonly incidencia: string
  readonly regla: string
  readonly grado: EntradaMatriz['grado']
  readonly parametros: Readonly<Record<string, string>>
  readonly faltan: readonly string[]
  readonly pasos: readonly PasoSolucion[]
  /** La previsión de la simulación: qué cambiaría, paso por paso. `null` si no se pudo simular. */
  readonly prevision: ReadonlyArray<{ readonly antes: string; readonly despues: string }> | null
  readonly error: string | null
  readonly sha256: string
  readonly preparadoPor: string
  /** De dónde salió cada cambio respecto de la versión anterior (vacío en la primera). */
  readonly cambios: readonly string[]
}

const huella = huellaDePlan

/** El enjambre no corre sin el visto bueno del presupuesto del mes (PRP-010 H-18). */
export class SinPresupuesto extends Error {}

/**
 * El ejecutor prepara el plan: parámetros del texto (y los ajustes de una revisión), pasos y simulación. Preparar un
 * plan es lo que gasta modelo, así que exige la decisión del presupuesto (`accionAnteElPresupuesto`): si no es
 * «llama_modelo», no corre. Qué hacer entonces (una persona para P1 y P2, esperar para P3 y P4) lo hace quien llama.
 */
export function preparaPlan(o: {
  ejecutor: string; incidencia: string; taskId: string; entrada: EntradaMatriz; texto: string; sap: SapSimulado
  presupuesto: AccionDeTriage; version?: number; ajustes?: Readonly<Record<string, string>>; cambios?: readonly string[]
}): Plan {
  if (o.presupuesto.accion !== 'llama_modelo') throw new SinPresupuesto(`el enjambre no prepara el plan: ${o.presupuesto.aviso ?? o.presupuesto.accion}`)
  const extraidos = extraeParametros(o.entrada, o.texto)
  const parametros = { ...extraidos.parametros, ...(o.ajustes ?? {}) }
  const faltan = Object.keys(o.entrada.parametros).filter((k) => !parametros[k])
  const pasos = pasosDe(o.entrada, parametros)
  let prevision: Plan['prevision'] = null, error: string | null = null
  if (faltan.length) error = `faltan parámetros: ${faltan.join(', ')}`
  else {
    try { prevision = simula(o.sap, pasos).resultados.map((r) => ({ antes: r.antes, despues: r.despues })) }
    catch (e) { if (e instanceof NoAplica) error = e.message; else throw e }
  }
  const version = o.version ?? 1
  const base = { taskId: o.taskId, version, regla: o.entrada.regla, parametros, pasos }
  return { ...base, incidencia: o.incidencia, grado: o.entrada.grado, faltan, prevision, error, sha256: huella(base), preparadoPor: o.ejecutor, cambios: o.cambios ?? [] }
}

export interface ComprobacionSupervisor { readonly que: string; readonly ok: boolean; readonly detalle: string }
export interface VeredictoSupervisor {
  readonly supervisor: string
  readonly plan: string
  readonly resultado: 'a_la_sala' | 'a_revision'
  readonly comprobaciones: readonly ComprobacionSupervisor[]
}

/** El supervisor re-verifica el plan con el simulador. No confía en la previsión del ejecutor. */
export function supervisa(o: { supervisor: string; plan: Plan; entrada: EntradaMatriz; sap: SapSimulado }): VeredictoSupervisor {
  const { plan, entrada, sap } = o
  if (o.supervisor === plan.preparadoPor) throw new Error('el supervisor no sella su propio trabajo')
  const c: ComprobacionSupervisor[] = []
  const anota = (que: string, ok: boolean, detalle: string) => c.push({ que, ok, detalle })
  anota('el artefacto es el que se preparó', huella(plan) === plan.sha256, `sha256 ${plan.sha256.slice(0, 12)}`)
  anota('la regla tiene grado de producción', GRADOS_DE_PRODUCCION.includes(entrada.grado), `grado ${entrada.grado}`)
  anota('no falta ningún parámetro', plan.faltan.length === 0, plan.faltan.length ? `faltan: ${plan.faltan.join(', ')}` : Object.entries(plan.parametros).map(([k, v]) => `${k}=${v}`).join(', '))
  const sintoma = entrada.sintoma && plan.faltan.length === 0 ? entrada.sintoma(plan.parametros) : null
  anota('el error se reproduce ANTES en el simulador', sintoma !== null && reproduce(sap, sintoma), sintoma ? JSON.stringify(sintoma) : 'la regla no declara un síntoma verificable')
  let final: SapSimulado | null = null
  try { final = simula(sap, plan.pasos).final; anota('el plan aplica en simulación', true, `${plan.pasos.length} paso(s)`) }
  catch (e) { anota('el plan aplica en simulación', false, e instanceof Error ? e.message : String(e)) }
  anota('el error ya NO se reproduce DESPUÉS', sintoma !== null && final !== null && !reproduce(final, sintoma), final ? 'previsión del supervisor' : 'sin previsión')
  return { supervisor: o.supervisor, plan: plan.sha256, resultado: c.every((x) => x.ok) ? 'a_la_sala' : 'a_revision', comprobaciones: c }
}

/** El mensaje del plan para la sala: lo que se aprueba es ESTA huella, con sus tres acciones. */
export function mensajeDePlan(plan: Plan, v: VeredictoSupervisor) {
  const pasos = plan.pasos.map((p, i) => `${i + 1}. ${p.descripcion} (${Object.entries(p.parametros).map(([k, x]) => `${k}=${x}`).join(', ')})`).join('\n')
  const prevision = (plan.prevision ?? []).map((x) => `${x.antes} → ${x.despues}`).join('; ')
  return {
    cuerpo: `Plan v${plan.version} para ${plan.incidencia} (regla ${plan.regla}, grado ${plan.grado}):\n${pasos}\nPrevisión en el simulador: ${prevision || 'sin previsión'}\nSupervisor (${v.supervisor}): ${v.comprobaciones.filter((x) => x.ok).length}/${v.comprobaciones.length} comprobaciones en verde.${plan.cambios.length ? `\nCambios: ${plan.cambios.join('; ')}` : ''}`,
    bloques: [{ tipo: 'acciones' as const, acciones: ['aprobar', 'rechazar', 'a_revision'] as Array<'aprobar' | 'rechazar' | 'a_revision'>, sha256: plan.sha256, taskId: plan.taskId }],
  }
}

/**
 * «A revisión»: el ejecutor lee el motivo como DATO y solo toma de él los parámetros que la regla
 * declara (con los mismos patrones). Si el motivo no trae ninguno, no inventa: lo dice y pide aclarar.
 */
export function corrige(o: { ejecutor: string; plan: Plan; motivo: string; entrada: EntradaMatriz; texto: string; sap: SapSimulado; presupuesto: AccionDeTriage }): { plan: Plan | null; nota: string } {
  const delMotivo = extraeParametros(o.entrada, o.motivo).parametros
  const cambian = Object.entries(delMotivo).filter(([k, v]) => o.plan.parametros[k] !== v)
  if (!cambian.length) return { plan: null, nota: 'El motivo no trae un dato que cambie el plan; pido aclararlo en el hilo antes de volver a proponer.' }
  const cambios = cambian.map(([k, v]) => `${k}: ${o.plan.parametros[k] ?? '—'} → ${v} (del motivo de la revisión)`)
  const plan = preparaPlan({ ejecutor: o.ejecutor, incidencia: o.plan.incidencia, taskId: o.plan.taskId, entrada: o.entrada, texto: o.texto, sap: o.sap, presupuesto: o.presupuesto, version: o.plan.version + 1, ajustes: Object.fromEntries(cambian), cambios })
  return { plan, nota: `Corregido: ${cambios.join('; ')}.` }
}
