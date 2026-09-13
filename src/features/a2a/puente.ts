/**
 * El puente JSON-RPC A2A montado DIRECTO en un Route Handler, sin Express (spec 005 TAR-4: el SDK
 * exporta `JsonRpcTransportHandler`, `DefaultRequestHandler` e `InMemoryTaskStore`, y con eso
 * basta). Espeja lo que hace el adaptador Express del SDK —cabecera de version, contexto,
 * validacion contra la Card— sobre `Request`/`Response` de la web.
 *
 * LO QUE DECIDE SI ESTO ES SEGURO: el `catch` final. Atrapa todo y no deja pasar nada del
 * interior: ni ruta, ni stack, ni nombre de motor (spec 005 RF-6). Y la respuesta lleva el tipo de
 * contenido que el SDK declara, importado, no escrito a mano.
 */
import { A2A_CONTENT_TYPE, A2A_VERSION_HEADER } from '@a2a-js/sdk'
import type { AgentCard } from '@a2a-js/sdk'
import {
  DefaultRequestHandler, JsonRpcTransportHandler, defaultServerCallContextBuilder, validateVersion,
} from '@a2a-js/sdk/server'
import { tarjetaDelExtractor, CABECERA_DE_LA_CLAVE } from './tarjeta.ts'
import { EjecutorDelExtractor } from './ejecutor.ts'
import { AlmacenDeTareasEfimero } from './almacen-de-tareas.ts'

/**
 * Metodos que este agente NO atiende aunque el SDK los implemente. `ListTasks` enumeraria las
 * extracciones de TODOS los consumidores (revision de opacidad, 2026-09-13: 37 tareas y 39 MB con
 * RFC y CURP dentro): con una clave compartida no hay forma de acotarlo por llamante, asi que no
 * existe. Un id de Task es un UUID: quien lo tiene, lo pidio.
 */
const METODOS_CERRADOS: ReadonlySet<string> = new Set(['ListTasks'])
const LARGO_MAXIMO_DE_VERSION = 32

const baseDelPuente = (): string => process.env.A2A_URL_BASE ?? 'http://app:3000'
const claveExigida = (): string => process.env.A2A_API_KEY ?? ''

export function tarjeta(): AgentCard {
  return tarjetaDelExtractor(baseDelPuente(), claveExigida().length > 0)
}

let transporte: JsonRpcTransportHandler | null = null
let tarjetaMontada = ''

/** Un solo transporte por proceso, reconstruido si cambia la base o la exigencia de clave (pruebas). */
function transporteActual(): JsonRpcTransportHandler {
  const firma = `${baseDelPuente()}|${claveExigida().length > 0}`
  if (transporte === null || tarjetaMontada !== firma) {
    transporte = new JsonRpcTransportHandler(new DefaultRequestHandler(tarjeta(), new AlmacenDeTareasEfimero(), new EjecutorDelExtractor()))
    tarjetaMontada = firma
  }
  return transporte
}

const respuestaJson = (cuerpo: unknown, estado = 200): Response =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'content-type': A2A_CONTENT_TYPE } })

const errorRpc = (id: unknown, code: number, message: string, estado = 200): Response =>
  respuestaJson({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, estado)

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Lo que sale del transporte se REVISA antes de salir. Dos cosas, las dos medidas en la revision
 * de opacidad: (1) `handle()` tiene su propio catch y fabrica `-32603` con `error.message` crudo
 * («Cannot read properties of null…», mensajes de Node): se sustituye y se quita `data`;
 * (2) la Task vuelve con `history`, que lleva el documento entero: aqui no se eco nada.
 */
function saneaRespuesta(resultado: unknown): unknown {
  if (!esObjeto(resultado)) return resultado
  const salida: Record<string, unknown> = { ...resultado }
  if (esObjeto(salida.error)) {
    const { code, message } = salida.error
    salida.error = code === -32603 || typeof message !== 'string'
      ? { code: -32603, message: 'fallo interno del puente' }
      : { code, message: message.slice(0, 200) }
  }
  if (esObjeto(salida.result)) {
    const result: Record<string, unknown> = { ...salida.result }
    if (esObjeto(result.task)) result.task = { ...result.task, history: [] }
    if ('history' in result) result.history = []
    salida.result = result
  }
  return salida
}

const cabecerasComoObjeto = (request: Request): Record<string, string> => {
  const salida: Record<string, string> = {}
  request.headers.forEach((valor, nombre) => { salida[nombre] = valor })
  return salida
}

export async function atiendeJsonRpc(request: Request): Promise<Response> {
  let cuerpo: Record<string, unknown> = {}
  try {
    const exigida = claveExigida()
    if (exigida.length > 0 && request.headers.get(CABECERA_DE_LA_CLAVE) !== exigida) {
      return errorRpc(null, -32001, 'clave de API ausente o invalida', 401)
    }
    const texto = await request.text()
    try {
      const parseado: unknown = JSON.parse(texto)
      if (typeof parseado !== 'object' || parseado === null || Array.isArray(parseado)) return errorRpc(null, -32600, 'se esperaba un objeto JSON-RPC')
      cuerpo = parseado as Record<string, unknown>
    } catch {
      return errorRpc(null, -32700, 'el cuerpo no es JSON')
    }
    if (typeof cuerpo.method === 'string' && METODOS_CERRADOS.has(cuerpo.method)) return errorRpc(cuerpo.id, -32601, 'metodo no disponible en este agente')
    // La version se acota ANTES de que el SDK la eco en su error: sin tope, una cabecera de 2000 caracteres volvia entera.
    const versionPedida = request.headers.get(A2A_VERSION_HEADER)?.slice(0, LARGO_MAXIMO_DE_VERSION) || undefined
    const contexto = defaultServerCallContextBuilder({
      extensions: undefined, user: undefined, headers: cabecerasComoObjeto(request), requestedVersion: versionPedida,
    })
    validateVersion(contexto.requestedVersion, tarjeta(), 'JSONRPC')
    const resultado = await transporteActual().handle(cuerpo, contexto)
    if (typeof (resultado as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function') {
      return errorRpc(cuerpo.id, -32004, 'este agente no soporta respuestas en flujo')
    }
    return respuestaJson(saneaRespuesta(resultado))
  } catch (error) {
    // Los errores del SDK (version, forma de la peticion) llevan mensaje seguro; el resto se resume.
    const mapeado = JsonRpcTransportHandler.mapToJSONRPCError(error)
    const esDelProtocolo = typeof mapeado.code === 'number' && mapeado.code !== -32603
    return errorRpc(cuerpo.id, esDelProtocolo ? mapeado.code : -32603, esDelProtocolo ? mapeado.message : 'fallo interno del puente')
  }
}
