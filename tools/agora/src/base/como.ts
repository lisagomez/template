/**
 * `como(base, principal, fn)`: abre una transacción y fija quién habla. Es la ÚNICA manera en que el núcleo toca
 * la base fuera de la migración: así ninguna superficie de negocio habla como servicio (C7).
 */
import { traduce, type Base, type Principal, type Sesion } from './tipos.js'

export async function como<T>(base: Base, p: Principal, fn: (s: Sesion) => Promise<T>): Promise<T> {
  try {
    return await base.transaccion(async (s) => {
      if (p.tipo === 'persona') {
        await s.consulta(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('role', 'authenticated', true)`,
          [JSON.stringify({ sub: p.id, role: 'authenticated' }), p.id])
      } else if (p.tipo === 'agente') {
        await s.consulta(`select set_config('agora.tarea', $1, true), set_config('role', 'agora_agente', true)`, [p.token])
      } else if (p.tipo === 'puerta') {
        await s.consulta(`select set_config('role', 'agora_puerta', true)`)
      }
      return fn(s)
    })
  } catch (e) {
    throw traduce(e)
  }
}
