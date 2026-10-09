/**
 * El artefacto de un plan: lo que una persona aprueba en la sala y lo que el simulador ejecuta tienen que ser LO
 * MISMO, con la misma huella (PRP-010 H-11). La huella cubre la tarea, la versión, la regla, los parámetros y los
 * pasos; quien ejecuta la recalcula sobre lo que va a correr y la compara con la aprobada.
 */
import { canonico, sha256 } from './cadena.js'
import type { PasoSolucion } from './simulador.js'

export interface ArtefactoDePlan {
  readonly taskId: string
  readonly version: number
  readonly regla: string
  readonly parametros: Readonly<Record<string, string>>
  readonly pasos: readonly PasoSolucion[]
}

export const huellaDePlan = (p: ArtefactoDePlan): string =>
  sha256(canonico({ taskId: p.taskId, version: p.version, regla: p.regla, parametros: { ...p.parametros }, pasos: p.pasos.map((x) => ({ accion: x.accion, parametros: { ...x.parametros } })) }))
