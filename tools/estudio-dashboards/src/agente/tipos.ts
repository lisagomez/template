/** Lo que el agente necesita de un modelo: se inyecta (OpenRouter en el laboratorio, un doble en las pruebas). */
export interface Mensaje { readonly role: 'user' | 'assistant'; readonly content: string }

export interface UsoModelo { readonly entrada: number; readonly salida: number; readonly cacheados: number }

export interface RespuestaModelo {
  readonly texto: string
  /** `null` si el proveedor no lo reportó: se registra así, no como cero. */
  readonly uso: UsoModelo | null
  readonly costoUsd: number | null
  readonly truncada: boolean
  readonly ms: number
}

export interface ModeloEstudio {
  readonly id: string
  completa(p: { sistema: string; mensajes: readonly Mensaje[]; maxTokens: number }): Promise<RespuestaModelo>
}

/** Una llamada registrada (contabilidad de tokens): el que inyecta el agente decide dónde vive. */
export interface LlamadaModelo { readonly modelo: string; readonly uso: UsoModelo | null; readonly costoUsd: number | null; readonly ms: number; readonly intento: number; readonly cuando: string }
export type Registrador = (l: LlamadaModelo) => Promise<void> | void

/**
 * Un modelo con RESERVA: contesta el primario y, solo si su respuesta salió truncada (el razonamiento del proveedor se
 * comió el tope), repite con la reserva (el mismo modelo con espacio de razonamiento propio). Uso, costo y tiempo
 * suman las dos llamadas; si alguna no reportó costo, el costo es `null`.
 */
export function conReserva(primario: ModeloEstudio, reserva: ModeloEstudio): ModeloEstudio {
  return {
    id: primario.id,
    async completa(p) {
      const a = await primario.completa(p)
      if (!a.truncada) return a
      const b = await reserva.completa(p)
      const uso = a.uso && b.uso ? { entrada: a.uso.entrada + b.uso.entrada, salida: a.uso.salida + b.uso.salida, cacheados: a.uso.cacheados + b.uso.cacheados } : null
      return { ...b, uso, costoUsd: a.costoUsd === null || b.costoUsd === null ? null : a.costoUsd + b.costoUsd, ms: a.ms + b.ms }
    },
  }
}
