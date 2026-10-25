/**
 * La puerta de la mesa en el servidor del laboratorio: quién es (el JWT de Access, verificado aquí también) y dónde se
 * guarda. Falla cerrada: sin `SOPORTE_SAP_LABORATORIO=1`, sin la configuración de Access o sin un JWT válido, la mesa no
 * existe (404, igual que una ruta que no existe); sin almacén, lo dice, porque guardar es su razón de ser.
 */
import { configDeAcceso, identidadDeLaPeticion, llavesDeAccess, type IdentidadMesa, type Llaves } from './acceso'
import { almacenDeEntorno, type Almacen } from './almacen'
import { encendido } from '../../services/runtime'

const g = globalThis as { __mesaLlaves?: Map<string, Llaves>; __mesaAviso?: string }
const llavesDe = (url: string): Llaves => {
  const mapa = (g.__mesaLlaves ??= new Map())
  let l = mapa.get(url)
  if (!l) { l = llavesDeAccess(url); mapa.set(url, l) }
  return l
}
/** El motivo de una mesa mal configurada se dice una vez en el log del servidor, nunca a quien llega. */
const avisaUnaVez = (m: string) => { if (g.__mesaAviso !== m) { g.__mesaAviso = m; console.error(`mesa del experto: ${m}`) } }

export type Contexto = { readonly id: IdentidadMesa; readonly almacen: Almacen; readonly retencionDias: number | null; readonly version: string }
export const NO_EXISTE = 'no-existe' as const
export type SinMesa = typeof NO_EXISTE | { readonly sinAlmacen: string }

/** La identidad de la petición, o `null`: la usan la página (para su 404) y la ruta. */
export async function identidadDe(req: Request): Promise<IdentidadMesa | null> {
  if (!encendido()) return null
  const c = configDeAcceso(process.env)
  if (typeof c === 'string') { avisaUnaVez(c); return null }
  return identidadDeLaPeticion(req, c, llavesDe(c.certs))
}

export async function contextoDe(req: Request): Promise<Contexto | SinMesa> {
  const id = await identidadDe(req)
  if (!id) return NO_EXISTE
  const almacen = almacenDeEntorno(process.env)
  if (typeof almacen === 'string') { avisaUnaVez(almacen); return { sinAlmacen: 'la mesa no tiene dónde guardar tu retroalimentación, y no abre sin eso: avisa al laboratorio' } }
  const dias = Number(process.env['MESA_RETENCION_DIAS'])
  return { id, almacen, retencionDias: Number.isInteger(dias) && dias > 0 ? dias : null, version: process.env['MESA_VERSION'] ?? 'local' }
}
