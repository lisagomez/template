/**
 * El portero de la sección en vivo. Corre en la máquina del laboratorio, escucha solo en 127.0.0.1, y es lo ÚNICO a lo
 * que apunta el túnel: el laboratorio de Soporte SAP sigue en su puerto, sin tocar, y nunca se expone.
 *
 * Lo que deja pasar, y solo eso:
 *   · `GET` y `POST` a `/api/soporte-sap`, con `rol` y `export` validados; cualquier otra ruta no existe;
 *   · con la firma de Vercel de ESA petición (`firma.ts`): sin ella, o vieja, o repetida, responde como si no existiera;
 *   · acciones en JSON. Adjuntos, no: quien levanta elige documentos de muestra y el portero los lee de este disco.
 *
 * Uso: node --env-file=$HOME/.soporte-sap-en-vivo.env src/features/soporte-sap/vitrina/en-vivo/portero.ts
 * (EN_VIVO_SECRETO; opcionales EN_VIVO_LABORATORIO, por defecto http://localhost:3011, y EN_VIVO_PUERTO, 8787).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { CABECERA_FIRMA, verifica, secretoValido } from './firma.ts'
import { esMuestra } from './muestras.ts'
import { RUTA_DEL_LABORATORIO as RUTA, CUERPO_MAXIMO, consultaValida } from './contrato.ts'

const MUESTRAS_POR_INCIDENCIA = 3

export interface ConfigPortero {
  readonly secreto: string
  /** Dónde corre el laboratorio, en esta máquina. */
  readonly laboratorio: string
  /** De dónde se leen los documentos de muestra. */
  readonly documentos: string
  readonly reenvia?: typeof fetch
  readonly ahora?: () => number
}

/** La misma respuesta para todo lo que no viene de Vercel: no se distingue de una ruta que no existe. */
const nada = (): Response => new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } })
const json = (status: number, datos: object): Response => Response.json(datos, { status })

/** La respuesta del laboratorio, con solo las cabeceras que la pantalla necesita. */
async function pasa(r: Response): Promise<Response> {
  const cabeceras = new Headers()
  for (const k of ['content-type', 'content-disposition']) { const v = r.headers.get(k); if (v) cabeceras.set(k, v) }
  return new Response(await r.arrayBuffer(), { status: r.status, headers: cabeceras })
}

interface Levanta { readonly titulo: string; readonly descripcion: string; readonly muestras: readonly string[] }
function levantaDe(accion: unknown): Levanta | null | 'invalida' {
  if (typeof accion !== 'object' || accion === null || !('levanta' in accion)) return null
  const l = (accion as { levanta: unknown }).levanta as Partial<Levanta> | null
  const muestras = Array.isArray(l?.muestras) ? l.muestras : null
  if (typeof l?.titulo !== 'string' || typeof l.descripcion !== 'string' || !muestras) return 'invalida'
  if (muestras.length > MUESTRAS_POR_INCIDENCIA || new Set(muestras).size !== muestras.length || !muestras.every(esMuestra)) return 'invalida'
  return { titulo: l.titulo, descripcion: l.descripcion, muestras }
}

/** El multipart que espera la ruta del laboratorio, con los documentos de muestra leídos de este disco. */
async function multipartDe(l: Levanta, documentos: string): Promise<{ cuerpo: Uint8Array<ArrayBuffer>; tipo: string }> {
  const f = new FormData()
  f.set('titulo', l.titulo); f.set('descripcion', l.descripcion)
  for (const a of l.muestras) f.append('adjuntos', new Blob([readFileSync(join(documentos, a))]), a)
  const r = new Response(f)
  return { cuerpo: new Uint8Array(await r.arrayBuffer()), tipo: r.headers.get('content-type')! }
}

export function creaPortero(c: ConfigPortero): (req: Request) => Promise<Response> {
  if (!secretoValido(c.secreto)) throw new Error('el portero no arranca sin un secreto de 32 caracteres o más')
  const vistas = new Map<string, number>()
  const reenvia = c.reenvia ?? fetch
  return async (req) => {
    const url = new URL(req.url)
    if (url.pathname !== RUTA || (req.method !== 'GET' && req.method !== 'POST')) return nada()
    const cuerpo = req.method === 'POST' ? new Uint8Array(await req.arrayBuffer()) : new Uint8Array()
    if (cuerpo.length > CUERPO_MAXIMO) return nada()
    const v = verifica(c.secreto, req.headers.get(CABECERA_FIRMA), { metodo: req.method, ruta: url.pathname + url.search, cuerpo }, vistas, c.ahora?.())
    if (!v.ok) return nada()
    const consulta = consultaValida(url.searchParams)
    if (consulta === null) return json(400, { error: 'consulta no admitida en vivo' })
    const destino = `${c.laboratorio}${RUTA}?${consulta}`
    try {
      if (req.method === 'GET') return await pasa(await reenvia(destino))
      if (!(req.headers.get('content-type') ?? '').startsWith('application/json')) return json(415, { error: 'en vivo solo se mandan acciones: los adjuntos son documentos de muestra' })
      let accion: unknown
      try { accion = JSON.parse(new TextDecoder().decode(cuerpo)) } catch { return json(400, { error: 'datos inválidos' }) }
      const l = levantaDe(accion)
      if (l === 'invalida') return json(400, { error: 'en vivo se levanta con documentos de muestra, hasta tres, sin repetir' })
      if (l === null) return await pasa(await reenvia(destino, { method: 'POST', headers: { 'content-type': 'application/json' }, body: cuerpo }))
      const m = await multipartDe(l, c.documentos)
      return await pasa(await reenvia(destino, { method: 'POST', headers: { 'content-type': m.tipo, 'content-length': String(m.cuerpo.length) }, body: m.cuerpo }))
    } catch {
      return json(502, { error: 'el laboratorio no responde en esta máquina' })
    }
  }
}

/** Lee el cuerpo con tope: lo que pasa de él se corta y responde como lo que no existe. */
async function cuerpoDe(req: IncomingMessage): Promise<Uint8Array<ArrayBuffer> | null> {
  const trozos: Buffer[] = []
  let total = 0
  for await (const t of req) { total += (t as Buffer).length; if (total > CUERPO_MAXIMO) return null; trozos.push(t as Buffer) }
  const todo = Buffer.concat(trozos)
  return new Uint8Array(todo.buffer.slice(todo.byteOffset, todo.byteOffset + todo.length) as ArrayBuffer)
}

export function escucha(c: ConfigPortero, puerto: number): ReturnType<typeof createServer> {
  const atiende = creaPortero(c)
  const servidor = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const cuerpo = req.method === 'POST' ? await cuerpoDe(req) : new Uint8Array()
    const cabeceras = new Headers(Object.entries(req.headers).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as [string, string]] : [])))
    const r = cuerpo === null ? nada() : await atiende(new Request(`http://portero${req.url ?? '/'}`, { method: req.method, headers: cabeceras, body: req.method === 'POST' ? cuerpo : undefined }))
    res.writeHead(r.status, Object.fromEntries(r.headers))
    res.end(Buffer.from(await r.arrayBuffer()))
  })
  return servidor.listen(puerto, '127.0.0.1')
}

if (import.meta.url === `file://${resolve(process.argv[1] ?? '')}`) {
  const secreto = process.env['EN_VIVO_SECRETO'] ?? ''
  if (!secretoValido(secreto)) { console.error('EN_VIVO_SECRETO ausente o corto: el portero no arranca'); process.exit(1) }
  const laboratorio = process.env['EN_VIVO_LABORATORIO'] ?? 'http://localhost:3011'
  const puerto = Number(process.env['EN_VIVO_PUERTO'] ?? 8787)
  escucha({ secreto, laboratorio, documentos: resolve('tools/soporte-sap/documentos') }, puerto)
  console.log(`portero de la sección en vivo en 127.0.0.1:${puerto} → ${laboratorio}${RUTA} (secreto presente, ${secreto.length} caracteres)`)
}
