/**
 * El token de una tarea: de qué consultora es y con qué rol corre. Lo FIRMA quien encola la tarea
 * (el orquestador, que no corre ningún modelo) y lo VERIFICA la pasarela antes de fijar el alcance
 * en la base (`request.jwt.claims`, que es lo que lee `ss_priv.consultora_de_tarea()`). El proceso
 * que corre el modelo nunca fija su propio alcance: solo presenta el token que recibió.
 *
 * Corrección de la revisión independiente del C3 (2026-10-04): antes el alcance era una variable
 * de sesión que el mismo agente fijaba, y con una tarea de A podía poner B.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export type RolDeServicio = 'soporte_sap_agente' | 'soporte_sap_ingesta' | 'soporte_sap_plataforma' | 'soporte_sap_metricas'

export interface ClaimsTarea {
  readonly consultora: string
  readonly tarea: string
  readonly rol: RolDeServicio
  /** Vencimiento, en milisegundos desde la época. */
  readonly exp: number
}

const ROLES: readonly RolDeServicio[] = ['soporte_sap_agente', 'soporte_sap_ingesta', 'soporte_sap_plataforma', 'soporte_sap_metricas']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64url')
const firma = (secreto: string, cuerpo: string): string => createHmac('sha256', secreto).update(cuerpo).digest('base64url')

export function emiteTokenDeTarea(secreto: string, claims: ClaimsTarea): string {
  if (secreto.length < 32) throw new Error('el secreto de firma de tareas debe tener al menos 32 caracteres')
  if (!UUID.test(claims.consultora)) throw new Error('la consultora de una tarea es un uuid')
  if (!ROLES.includes(claims.rol)) throw new Error(`rol de servicio desconocido: ${claims.rol}`)
  const cuerpo = b64(JSON.stringify(claims))
  return `${cuerpo}.${firma(secreto, cuerpo)}`
}

/** Verifica firma, forma y vencimiento. Lanza si algo no cuadra: sin token válido no hay alcance. */
export function verificaTokenDeTarea(secreto: string, token: string, ahora: number): ClaimsTarea {
  const [cuerpo, sello, ...resto] = token.split('.')
  if (!cuerpo || !sello || resto.length) throw new Error('token de tarea mal formado')
  const esperado = Buffer.from(firma(secreto, cuerpo))
  const recibido = Buffer.from(sello)
  if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) throw new Error('la firma del token de tarea no es válida')
  const c = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as Partial<ClaimsTarea>
  if (typeof c.consultora !== 'string' || !UUID.test(c.consultora)) throw new Error('el token no trae una consultora válida')
  if (typeof c.tarea !== 'string' || !c.tarea) throw new Error('el token no trae la tarea')
  if (!c.rol || !ROLES.includes(c.rol)) throw new Error('el token no trae un rol de servicio válido')
  if (typeof c.exp !== 'number' || c.exp <= ahora) throw new Error('el token de tarea venció')
  return { consultora: c.consultora, tarea: c.tarea, rol: c.rol, exp: c.exp }
}
