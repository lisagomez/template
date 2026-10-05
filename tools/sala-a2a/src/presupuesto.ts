/**
 * Guardia de presupuesto: todo saliente de agente que invoque modelo pasa por aquí ANTES de la
 * llamada, con tenant y clase de tarea. Sin fila de presupuesto, bloquea (fail-closed visible):
 * nunca degrada en silencio. La sala es la superficie donde un tenant dispara consumo escrito por
 * terceros, así que el techo va desde el día uno.
 */
export interface FilaPresupuesto {
  readonly tenant: string
  readonly claseTarea: string
  readonly tope: number
  readonly gastado: number
}

export type VeredictoPresupuesto =
  | { readonly permitido: true; readonly restante: number; readonly aviso: boolean }
  | { readonly permitido: false; readonly motivo: 'sin_presupuesto' | 'excedido'; readonly texto: string }

/** El aviso al 80 % avisa; qué hacer al tope lo decide quien llama (C4), pero aquí no se llama de más. */
export function guardiaPresupuesto(filas: readonly FilaPresupuesto[], tenant: string, claseTarea: string, costeEstimado: number): VeredictoPresupuesto {
  const f = filas.find((x) => x.tenant === tenant && x.claseTarea === claseTarea)
  if (!f) return { permitido: false, motivo: 'sin_presupuesto', texto: `sin fila de presupuesto para ${tenant}/${claseTarea}: no se llama al modelo` }
  if (f.gastado + costeEstimado > f.tope) return { permitido: false, motivo: 'excedido', texto: `el presupuesto de ${tenant}/${claseTarea} no alcanza` }
  const restante = f.tope - f.gastado - costeEstimado
  return { permitido: true, restante, aviso: (f.gastado + costeEstimado) / f.tope >= 0.8 }
}
