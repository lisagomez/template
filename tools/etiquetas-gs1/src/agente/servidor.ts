/**
 * El agente local de impresion: un servidor HTTP pequeño que recibe trabajos del sistema, los
 * encola y los manda por TCP 9100 a las impresoras de SU lista.
 *
 * Superficie de entrada a la red de impresoras (C3). Lo que la cierra:
 *  - escucha solo en `escucha.host:escucha.puerto` (por defecto 127.0.0.1);
 *  - cada trabajo trae su credencial (ticket HMAC de un solo uso, atado a impresora, sitio,
 *    ZPL exacto y copias); sin ella, 401;
 *  - la peticion nombra una impresora por su ID; el host y el puerto salen de la configuracion,
 *    nunca de la peticion: no hay forma de pedirle que conecte a otro sitio;
 *  - el ZPL pasa por la lista de comandos permitidos (`revisaZpl`): nada de guardar
 *    configuracion, reiniciar, tocar la red o cambiar los prefijos de comando;
 *  - todo cuerpo se valida con Zod (estricto), con tope de tamaño; CORS solo a origenes listados;
 *  - limite de peticiones por IP.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { z } from 'zod'
import { revisaZpl } from '../zpl.js'
import type { Cola } from './cola.js'
import type { ConfigAgente } from './config.js'
import { huellaDe, huellaToken, verificaTicket } from './ticket.js'

const esquemaTrabajo = z.object({
  impresora: z.string().min(1).max(40),
  zpl: z.string().min(5),
  copias: z.number().int().min(1).max(10_000).default(1),
}).strict()

export interface OpcionesServidor {
  readonly config: ConfigAgente
  readonly secreto: string
  readonly cola: Cola
  readonly registra?: (m: string) => void
  readonly ahora?: () => number
}

export interface Agente {
  readonly servidor: Server
  escucha(): Promise<AddressInfo>
  cierra(): Promise<void>
}

export function creaServidorAgente(o: OpcionesServidor): Agente {
  const { config, secreto, cola } = o
  const registra = o.registra ?? (() => {})
  const ahora = o.ahora ?? (() => Math.floor(Date.now() / 1000))
  const noncesUsados = new Map<string, number>()
  const cubetas = new Map<string, { fichas: number; desde: number }>()

  const responde = (res: ServerResponse, codigo: number, cuerpo: unknown) => {
    res.writeHead(codigo, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(cuerpo))
  }

  const permitido = (ip: string): boolean => {
    const t = Date.now()
    const c = cubetas.get(ip) ?? { fichas: 60, desde: t }
    c.fichas = Math.min(60, c.fichas + ((t - c.desde) / 1000) * 6)
    c.desde = t
    cubetas.set(ip, c)
    if (c.fichas < 1) return false
    c.fichas -= 1
    return true
  }

  const cors = (req: IncomingMessage, res: ServerResponse): boolean => {
    const origen = req.headers.origin
    if (!origen) return true
    if (!config.origenes.includes(origen)) return false
    res.setHeader('access-control-allow-origin', origen)
    res.setHeader('vary', 'Origin')
    res.setHeader('access-control-allow-headers', 'authorization, content-type')
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
    if (req.headers['access-control-request-private-network'] === 'true') res.setHeader('access-control-allow-private-network', 'true')
    return true
  }

  const leeCuerpo = (req: IncomingMessage): Promise<string | undefined> => new Promise((resolve) => {
    let total = 0
    const trozos: Buffer[] = []
    req.on('data', (d: Buffer) => {
      total += d.length
      if (total > config.maxBytes + 4096) { resolve(undefined); req.destroy() } else trozos.push(d)
    })
    req.on('end', () => resolve(Buffer.concat(trozos).toString('utf8')))
    req.on('error', () => resolve(undefined))
  })

  const credencial = (req: IncomingMessage): string | undefined => {
    const a = req.headers.authorization ?? ''
    return a.startsWith('Ticket ') ? a.slice(7).trim() : undefined
  }

  async function nuevoTrabajo(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const token = credencial(req)
    if (!token) return responde(res, 401, { error: 'falta la credencial del trabajo (Authorization: Ticket ...)' })
    const v = verificaTicket(token, secreto, ahora())
    if (!v.ok) { registra(`rechazado: ${v.motivo}`); return responde(res, 401, { error: v.motivo }) }
    const texto = await leeCuerpo(req)
    if (texto === undefined) return responde(res, 413, { error: `el trabajo pasa de ${config.maxBytes} bytes` })
    let json: unknown
    try { json = JSON.parse(texto) } catch { return responde(res, 400, { error: 'el cuerpo no es JSON' }) }
    const cuerpo = esquemaTrabajo.safeParse(json)
    if (!cuerpo.success) return responde(res, 400, { error: 'trabajo inválido', detalle: cuerpo.error.issues.map((i) => `${i.path.join('.') || 'cuerpo'}: ${i.message}`) })
    const t = cuerpo.data
    const imp = config.impresoras.find((i) => i.id === t.impresora)
    if (!imp) return responde(res, 403, { error: `la impresora «${t.impresora}» no está en la lista de este agente` })
    const d = v.datos
    if (d.sitio !== config.sitio) return responde(res, 403, { error: 'la credencial es de otro sitio' })
    if (d.impresora !== imp.id) return responde(res, 403, { error: 'la credencial es para otra impresora' })
    if (d.huellaZpl !== huellaDe(t.zpl)) return responde(res, 403, { error: 'el ZPL no es el que se autorizó' })
    if (d.copias !== t.copias) return responde(res, 403, { error: 'las copias no son las autorizadas' })
    if (Buffer.byteLength(t.zpl, 'utf8') > config.maxBytes) return responde(res, 413, { error: `el ZPL pasa de ${config.maxBytes} bytes` })
    const revision = revisaZpl(t.zpl, config.maxCopias)
    if (!revision.ok) { registra(`rechazado por contenido: ${revision.motivo}`); return responde(res, 422, { error: revision.motivo }) }
    for (const [n, vence] of noncesUsados) if (vence < ahora()) noncesUsados.delete(n)
    if (noncesUsados.has(d.nonce)) return responde(res, 409, { error: 'esa credencial ya se usó' })
    noncesUsados.set(d.nonce, d.vence)
    const trabajo = await cola.agrega({ impresora: imp.id, zpl: t.zpl, copias: t.copias, huellaToken: huellaToken(token), operador: d.operador })
    registra(`trabajo ${trabajo.id} aceptado para ${imp.id} (${revision.etiquetas} etiqueta(s), operador ${d.operador})`)
    void cola.procesa()
    responde(res, 202, { id: trabajo.id, estado: trabajo.estado })
  }

  function consulta(req: IncomingMessage, res: ServerResponse, id: string): void {
    const token = credencial(req)
    const t = cola.busca(id)
    if (!token || !t || huellaToken(token) !== t.huellaToken) return responde(res, 404, { error: 'no hay ningún trabajo tuyo con ese id' })
    responde(res, 200, { id: t.id, impresora: t.impresora, estado: t.estado, intentos: t.intentos, ...(t.ultimoError ? { ultimoError: t.ultimoError } : {}), ...(t.terminado ? { terminado: t.terminado } : {}) })
  }

  const servidor = createServer((req, res) => {
    const ip = req.socket.remoteAddress ?? '?'
    if (!permitido(ip)) return responde(res, 429, { error: 'demasiadas peticiones' })
    if (!cors(req, res)) return responde(res, 403, { error: 'origen no permitido' })
    const url = new URL(req.url ?? '/', 'http://agente')
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
    if (req.method === 'GET' && url.pathname === '/v1/salud') {
      return responde(res, 200, { ok: true, sitio: config.sitio, impresoras: config.impresoras.map((i) => ({ id: i.id, nombre: i.nombre })), pendientes: cola.pendientes(), fallidos: cola.fallidos() })
    }
    if (req.method === 'POST' && url.pathname === '/v1/trabajos') { void nuevoTrabajo(req, res).catch(() => responde(res, 500, { error: 'error interno' })); return }
    const m = /^\/v1\/trabajos\/([0-9a-f-]{36})$/.exec(url.pathname)
    if (req.method === 'GET' && m?.[1]) return consulta(req, res, m[1])
    responde(res, 404, { error: 'ruta desconocida' })
  })
  servidor.requestTimeout = 15_000
  servidor.headersTimeout = 10_000

  return {
    servidor,
    escucha: () => new Promise((resolve, reject) => {
      servidor.once('error', reject)
      servidor.listen(config.escucha.puerto, config.escucha.host, () => resolve(servidor.address() as AddressInfo))
    }),
    cierra: () => new Promise((resolve) => { servidor.closeAllConnections(); servidor.close(() => resolve()) }),
  }
}
