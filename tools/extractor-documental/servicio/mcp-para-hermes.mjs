/**
 * Puente MCP -> A2A para Hermes (spec 010, RF-22 y RF-23).
 *
 * POR QUE EXISTE. Hermes (`nousresearch/hermes-agent`) no habla A2A: consume servidores MCP
 * (`mcp_servers` en su `config.yaml`, verificado en su documentacion). Este proceso le ofrece dos
 * herramientas por MCP sobre HTTP y las traduce a llamadas A2A contra la Agent Card del template.
 * Hermes no toca el extractor: habla con esto, y esto habla con el puente A2A.
 *
 * LO QUE TIENE Y LO QUE NO. Tiene la URL del puente A2A y, si el puente la exige, SU clave de API
 * (`A2A_API_KEY`). No tiene ninguna llave del extractor, del almacen ni `service_role`: Hermes
 * recibe respuestas, no credenciales. Y la confianza por campo con `revisionHumana` viaja intacta:
 * es la regla de oro de la capacidad (RF-21).
 *
 * Protocolo: MCP por HTTP (JSON-RPC 2.0 en `POST /mcp`; `initialize`, `tools/list`, `tools/call`,
 * `ping`). Sin dependencias: `node:http` y `fetch`.
 */
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { resolve, sep, extname, basename } from 'node:path'

const PUERTO = Number(process.env.PUENTE_PUERTO ?? '8090')
const ESCUCHA = process.env.PUENTE_ESCUCHA ?? '0.0.0.0'
const A2A_BASE = (process.env.A2A_URL ?? 'http://app:3000').replace(/\/$/, '')
const A2A_API_KEY = process.env.A2A_API_KEY ?? ''
const A2A_VERSION = '1.0'
const CARD_PATH = '.well-known/agent-card.json' // AGENT_CARD_PATH del SDK, sin barra inicial
/** Carpeta de ENTRADA montada en este contenedor (solo lectura). Un agente pide por nombre; nunca sale de aqui. */
const CARPETA = resolve(process.env.PUENTE_CARPETA ?? '/documentos')
const MIME_POR_EXTENSION = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.xml': 'application/xml' }

const HERRAMIENTAS = [
  {
    name: 'descubrir_agente',
    description: 'Lee la Agent Card del extractor documental: que capacidades ofrece y con que limites.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'extraer_documento',
    description: 'Extrae los datos de un documento (PDF, imagen o XML fiscal) por A2A. Devuelve campos con confianza, la EVIDENCIA que la sostiene y si requiere revision humana. Un campo con revisionHumana=true NO es un hecho. Se indica `archivo` (nombre dentro de la carpeta de entrada) o bien `base64` + `nombre` + `tipoMime`.',
    inputSchema: {
      type: 'object',
      properties: {
        archivo: { type: 'string', description: 'Nombre del archivo en la carpeta de entrada, por ejemplo factura-1.png' },
        base64: { type: 'string', description: 'El documento en base64 (alternativa a archivo)' },
        nombre: { type: 'string', description: 'Nombre del archivo, con extension (con base64)' },
        tipoMime: { type: 'string', description: 'application/pdf, image/png, image/jpeg o application/xml (con base64)' },
      },
      additionalProperties: false,
    },
  },
]

const cabecerasA2A = () => ({
  'content-type': 'application/json', accept: 'application/a2a+json, application/json', 'A2A-Version': A2A_VERSION,
  ...(A2A_API_KEY ? { 'x-api-key': A2A_API_KEY } : {}),
})

async function descubrir() {
  const r = await fetch(`${A2A_BASE}/${CARD_PATH}`, { headers: cabecerasA2A() })
  if (!r.ok) throw new Error(`la Agent Card respondio ${r.status}`)
  return r.json()
}

/** Lee de la carpeta de entrada y NADA mas: la ruta se resuelve y se exige que quede dentro. */
async function documentoDeCarpeta(archivo) {
  if (typeof archivo !== 'string' || archivo.length === 0) throw new Error('`archivo` tiene que ser un nombre dentro de la carpeta de entrada')
  const ruta = await realpath(resolve(CARPETA, basename(archivo))).catch(() => null)
  if (ruta === null || !ruta.startsWith(CARPETA + sep)) throw new Error(`no existe "${basename(archivo)}" en la carpeta de entrada`)
  const tipoMime = MIME_POR_EXTENSION[extname(ruta).toLowerCase()]
  if (tipoMime === undefined) throw new Error('extension no admitida: pdf, png, jpg, webp o xml')
  return { base64: (await readFile(ruta)).toString('base64'), nombre: basename(ruta), tipoMime }
}

async function extraer(argumentos) {
  const { base64, nombre, tipoMime } = argumentos.archivo !== undefined ? await documentoDeCarpeta(argumentos.archivo) : argumentos
  if (typeof base64 !== 'string' || typeof nombre !== 'string' || typeof tipoMime !== 'string') throw new Error('faltan `archivo`, o bien `base64`, `nombre` y `tipoMime`')
  const peticion = {
    jsonrpc: '2.0', id: randomUUID(), method: 'SendMessage',
    params: { message: { messageId: randomUUID(), role: 'ROLE_USER', parts: [{ raw: base64, filename: nombre, mediaType: tipoMime }] } },
  }
  const r = await fetch(`${A2A_BASE}/a2a`, { method: 'POST', headers: cabecerasA2A(), body: JSON.stringify(peticion) })
  const cuerpo = await r.json()
  if (cuerpo.error) throw new Error(`A2A: ${cuerpo.error.message ?? 'error sin mensaje'}`)
  return cuerpo.result
}

function textoDeTask(task) {
  const estado = task?.task?.status?.state ?? task?.status?.state ?? 'desconocido'
  const artefactos = task?.task?.artifacts ?? task?.artifacts ?? []
  const datos = artefactos.flatMap((a) => a.parts ?? []).map((p) => p.data).filter((d) => d !== undefined)
  const razon = task?.task?.status?.message?.parts?.[0]?.text ?? task?.status?.message?.parts?.[0]?.text
  return JSON.stringify({ estado, ...(razon ? { razon } : {}), resultado: datos.length === 1 ? datos[0] : datos }, null, 1)
}

async function atiende(peticion) {
  const { id, method, params } = peticion
  const ok = (result) => ({ jsonrpc: '2.0', id, result })
  switch (method) {
    case 'initialize':
      return ok({ protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'puente-extractor-a2a', version: '0.1.0' } })
    case 'ping':
      return ok({})
    case 'tools/list':
      return ok({ tools: HERRAMIENTAS })
    case 'tools/call': {
      const nombre = params?.name
      try {
        if (nombre === 'descubrir_agente') return ok({ content: [{ type: 'text', text: JSON.stringify(await descubrir(), null, 1) }] })
        if (nombre === 'extraer_documento') return ok({ content: [{ type: 'text', text: textoDeTask(await extraer(params?.arguments ?? {})) }] })
        return ok({ content: [{ type: 'text', text: `herramienta desconocida: ${String(nombre)}` }], isError: true })
      } catch (error) {
        return ok({ content: [{ type: 'text', text: error instanceof Error ? error.message : 'fallo al llamar al puente A2A' }], isError: true })
      }
    }
    default:
      if (typeof method === 'string' && method.startsWith('notifications/')) return null
      return { jsonrpc: '2.0', id: id ?? null, error: { code: -32601, message: `metodo no soportado: ${String(method)}` } }
  }
}

const servidor = createServer(async (req, res) => {
  const ruta = new URL(req.url ?? '/', 'http://interno').pathname
  const json = (codigo, cuerpo) => { res.writeHead(codigo, { 'content-type': 'application/json' }); res.end(cuerpo === undefined ? '' : JSON.stringify(cuerpo)) }
  if (req.method === 'GET' && ruta === '/health') return json(200, { status: 'ok' })
  if (ruta !== '/mcp') return json(404, { error: 'ruta desconocida' })
  if (req.method === 'GET') return json(405, { error: 'este puente no abre flujos SSE; usa POST' })
  if (req.method !== 'POST') return json(405, { error: 'metodo no permitido' })
  const trozos = []
  for await (const t of req) trozos.push(t)
  let peticion
  try { peticion = JSON.parse(Buffer.concat(trozos).toString('utf8')) } catch { return json(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON invalido' } }) }
  const respuestas = await Promise.all((Array.isArray(peticion) ? peticion : [peticion]).map(atiende))
  const conRespuesta = respuestas.filter((r) => r !== null)
  if (conRespuesta.length === 0) return json(202)
  return json(200, Array.isArray(peticion) ? conRespuesta : conRespuesta[0])
})

servidor.listen(PUERTO, ESCUCHA, () => console.log(`puente-hermes: MCP en ${ESCUCHA}:${PUERTO}/mcp -> A2A en ${A2A_BASE} (clave ${A2A_API_KEY ? `presente, largo ${A2A_API_KEY.length}` : 'ausente'})`))
