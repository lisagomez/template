/**
 * Un solo tipo de error, con un codigo que el consumidor puede decidir sin leer el mensaje. Cuando el
 * arreglo depende de una persona (reautenticar, confirmar un envio), `destraba` dice quien y como:
 * un error que no dice quien lo destraba se queda sin destrabar.
 */
export type CodigoError =
  | 'validacion'
  | 'conflicto'
  | 'credencial'
  | 'no-encontrado'
  | 'limite'
  | 'red'
  | 'proveedor'
  | 'espejo'
  | 'recurrencia'
  | 'requiere-confirmacion'
  | 'solo-lectura'
  | 'token-invalido'
  | 'duplicado'
  | 'no-soportado'

export interface OpcionesError {
  destraba?: string | null
  detalle?: unknown
  reintentarEnMs?: number | null
  causa?: unknown
}

export class ErrorCalendario extends Error {
  readonly codigo: CodigoError
  readonly destraba: string | null
  readonly detalle: unknown
  readonly reintentarEnMs: number | null

  constructor(codigo: CodigoError, mensaje: string, opciones: OpcionesError = {}) {
    super(mensaje, opciones.causa === undefined ? undefined : { cause: opciones.causa })
    this.name = 'ErrorCalendario'
    this.codigo = codigo
    this.destraba = opciones.destraba ?? null
    this.detalle = opciones.detalle
    this.reintentarEnMs = opciones.reintentarEnMs ?? null
  }
}

export function esErrorCalendario(e: unknown, codigo?: CodigoError): e is ErrorCalendario {
  return e instanceof ErrorCalendario && (codigo === undefined || e.codigo === codigo)
}

/** Quien destraba una credencial caducada: solo quien administra la cuenta puede reautenticar. */
export const DESTRABA_CREDENCIAL = 'quien administra la cuenta de calendario: reautenticar el acceso (con gog: `gog auth add <cuenta>`)'
