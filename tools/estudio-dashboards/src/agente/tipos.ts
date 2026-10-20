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
