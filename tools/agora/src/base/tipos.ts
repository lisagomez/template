/**
 * El puerto de la base: Ágora no depende de un driver. Dos adaptadores: `./pg` (Postgres real, node-postgres) y
 * `./pglite` (Postgres en proceso, para el validate). Las reglas viven en la base (RLS forzada, disparadores,
 * funciones `security definer`); aquí solo se dice QUIÉN habla (`como`) y se traducen sus negativas.
 */

export interface Sesion {
  consulta<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T[]>
}

export interface Base extends Sesion {
  readonly motor: 'postgres' | 'pglite'
  /** Una transacción: todo o nada. Los disparadores diferidos (partida doble, topes) se comprueban al cerrar. */
  transaccion<T>(fn: (s: Sesion) => Promise<T>): Promise<T>
  /** Ejecuta un script SQL entero (migraciones y siembra). */
  ejecuta(sql: string): Promise<void>
  cierra(): Promise<void>
}

/**
 * Quién habla con la base. Una persona es su sesión (`auth.uid()`); un agente, su token de tarea firmado (la base
 * lo verifica); la Puerta solo llama a sus tres funciones; el servicio es la migración y la siembra de datos
 * ficticios del laboratorio (C7: job declarado, nunca una superficie de negocio).
 */
export type Principal =
  | { tipo: 'persona'; id: string }
  | { tipo: 'agente'; token: string }
  | { tipo: 'puerta' }
  | { tipo: 'servicio' }

export type CodigoAgora = 'invalido' | 'prohibido' | 'no-existe' | 'conflicto' | 'descuadre' | 'cuota' | 'base'

/** Una negativa de la base, con su motivo tal como lo dijo la base. */
export class NegativaDeLaBase extends Error {
  readonly codigo: CodigoAgora
  readonly sqlstate: string
  /** Segundos para reintentar (solo cuota). */
  readonly reintentaEn: number | null
  constructor(codigo: CodigoAgora, mensaje: string, sqlstate: string, reintentaEn: number | null = null) {
    super(mensaje)
    this.name = 'NegativaDeLaBase'
    this.codigo = codigo
    this.sqlstate = sqlstate
    this.reintentaEn = reintentaEn
  }
}

const CODIGOS: Readonly<Record<string, CodigoAgora>> = {
  AG400: 'invalido', AG403: 'prohibido', AG404: 'no-existe', AG409: 'conflicto', AG422: 'descuadre', AG429: 'cuota',
  '42501': 'prohibido', '23505': 'conflicto', '23514': 'invalido', '23502': 'invalido', '23503': 'invalido', '22P02': 'invalido',
}

/** Traduce el error de cualquier driver a una negativa con código. Lo que no es de la base se deja pasar. */
export function traduce(e: unknown): unknown {
  const x = e as { code?: unknown; message?: unknown; detail?: unknown }
  if (!x || typeof x.code !== 'string' || typeof x.message !== 'string') return e
  const codigo = CODIGOS[x.code] ?? (/row-level security|permission denied/i.test(x.message) ? 'prohibido' : 'base')
  const reintenta = x.code === 'AG429' && typeof x.detail === 'string' && /^\d+$/.test(x.detail) ? Number(x.detail) : null
  return new NegativaDeLaBase(codigo, x.message, x.code, reintenta)
}
