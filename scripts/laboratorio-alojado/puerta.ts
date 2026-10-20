/**
 * La puerta del laboratorio alojado: el Worker de Cloudflare que está delante del contenedor. Cloudflare Access ya pidió
 * el correo y el PIN; aquí se verifica OTRA VEZ el JWT que manda Access (firma, emisor, audiencia y vigencia) y el rol de
 * las listas del laboratorio, y solo pasan las rutas de la mesa. Lo demás responde como si no existiera. El contenedor
 * vuelve a verificar el JWT por su cuenta: si un día esta puerta fallara, él no abre.
 *
 * Solo APIs web estándar (corre en el Worker y en las pruebas de Node). La entrada del Worker es `entrada.mjs`.
 */
import { CABECERA_ACCESO, configDeAcceso, identidadDeLaPeticion, llavesDeAccess, type Llaves } from '../../src/features/soporte-sap/mesa/services/acceso.ts'

type Entorno = Readonly<Record<string, string | undefined>>
export const INICIO = '/mesa/soporte-sap'
/** Lo único que existe detrás de la puerta: las páginas y la API de la mesa, y los estáticos que esas páginas cargan. */
export const RUTAS_DE_LA_MESA = /^\/(?:mesa\/soporte-sap(?:\/(?:kit|laboratorio))?|api\/mesa\/soporte-sap|_next\/static\/[A-Za-z0-9._~/-]+|_next\/image|favicon\.ico|manifest\.json|sw\.js|icons\/[a-z0-9.-]+)$/
export const CUERPO_MAXIMO = 64_000
/** Lo que no pasa al contenedor: credenciales de Access (el secreto de un token de servicio) y lo que nadie le pidió. */
const NO_PASAN = ['cookie', 'authorization', 'cf-access-client-id', 'cf-access-client-secret', 'cf-connecting-ip', 'x-forwarded-for', 'true-client-ip']

const nada = (): Response => new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } })
const g = globalThis as { __puertaLlaves?: { url: string; llaves: Llaves } }
const llavesDe = (url: string): Llaves => {
  if (g.__puertaLlaves?.url !== url) g.__puertaLlaves = { url, llaves: llavesDeAccess(url) }
  return g.__puertaLlaves.llaves
}

/** Las cabeceras que el contenedor recibe: las de la petición menos las credenciales, con el JWT que él volverá a verificar. */
export function cabecerasParaElLaboratorio(req: Request): Headers {
  const h = new Headers()
  req.headers.forEach((v, k) => { if (!NO_PASAN.includes(k.toLowerCase())) h.set(k, v) })
  return h
}

/**
 * Atiende una petición. `alLaboratorio` la manda al contenedor (en el Worker, la instancia única del Durable Object).
 * `llaves` solo lo cambian las pruebas.
 */
export async function atiende(req: Request, env: Entorno, alLaboratorio: (r: Request) => Promise<Response>, llaves?: Llaves): Promise<Response> {
  const url = new URL(req.url)
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'POST') return nada()
  const c = configDeAcceso(env)
  if (typeof c === 'string') return nada()
  const id = await identidadDeLaPeticion(req, c, llaves ?? llavesDe(c.certs))
  if (!id) return nada()
  if (url.pathname === '/' || url.pathname === '/mesa') return Response.redirect(new URL(INICIO, url), 302)
  if (!RUTAS_DE_LA_MESA.test(url.pathname)) return nada()
  if (req.method === 'POST') {
    if ((req.headers.get('content-type') ?? '').startsWith('multipart/')) return Response.json({ error: 'aquí no se suben archivos: la evidencia son las muestras sintéticas del laboratorio' }, { status: 415 })
    if (Number(req.headers.get('content-length') ?? 0) > CUERPO_MAXIMO) return Response.json({ error: 'la acción es demasiado grande' }, { status: 413 })
  }
  const cuerpo = req.method === 'POST' ? await req.arrayBuffer() : undefined
  if (cuerpo && cuerpo.byteLength > CUERPO_MAXIMO) return Response.json({ error: 'la acción es demasiado grande' }, { status: 413 })
  const h = cabecerasParaElLaboratorio(req)
  if (!h.get(CABECERA_ACCESO)) return nada()
  return alLaboratorio(new Request(`http://laboratorio${url.pathname}${url.search}`, { method: req.method, headers: h, body: cuerpo, redirect: 'manual' }))
}
