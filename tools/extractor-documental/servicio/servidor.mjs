/**
 * Servicio HTTP del extractor documental para el VPS del cliente (spec 010, RF-1 a RF-6).
 *
 * TRES RUTAS. `GET /health` devuelve exactamente {"status":"ok"} y nada del interior (un health
 * que reporta versiones o colas es reconocimiento gratis). `POST /extraer` recibe UN documento en
 * crudo (PDF, imagen o XML) y devuelve su lectura enriquecida. `POST /lote` recibe varios en
 * base64 y devuelve ademas las cifras del lote: paginas por minuto y latencia p50/p95 por etapa.
 *
 * LO QUE NO HACE. No tiene credenciales de nada: el motor es un proceso local y el respaldo, si
 * lo hay, lo declara el entorno. No publica puertos por si mismo: escucha donde el compose le
 * diga, en la red interna. Y un error NUNCA lleva ruta, stack ni texto del documento: solo una
 * razon en espanol.
 *
 * Sin dependencias propias: `node:http` y el `dist/` del paquete.
 */
import { createServer } from 'node:http'
import { configura } from './configuracion.mjs'
import { leeDocumentos } from './lectura.mjs'

const PUERTO = Number(process.env.EXTRACTOR_PUERTO ?? '8080')
const ESCUCHA = process.env.EXTRACTOR_ESCUCHA ?? '0.0.0.0'

const configuracion = await configura()
console.log(`extractor: ${JSON.stringify(configuracion.describe())}`)

const json = (res, codigo, cuerpo) => {
  res.writeHead(codigo, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(cuerpo))
}

function leeCuerpo(req, maximo) {
  // Con `content-length` se rechaza ANTES de leer un byte: un documento de 100 MB no toca el motor.
  const declarado = Number(req.headers['content-length'] ?? 0)
  if (Number.isFinite(declarado) && declarado > maximo) return Promise.reject(new Error('demasiado grande'))
  return new Promise((resuelve, rechaza) => {
    const trozos = []
    let largo = 0
    req.on('data', (d) => {
      largo += d.length
      if (largo > maximo) { rechaza(new Error('demasiado grande')); req.destroy(); return }
      trozos.push(d)
    })
    req.on('end', () => resuelve(Buffer.concat(trozos)))
    req.on('error', () => rechaza(new Error('cuerpo ilegible')))
  })
}

/** Un solo documento en crudo: el nombre y el tipo van en cabeceras, el cuerpo son los bytes. */
async function extraer(req, res) {
  const bytes = await leeCuerpo(req, configuracion.bytesMaximos)
  if (bytes.length === 0) return json(res, 400, { error: 'el cuerpo esta vacio: se esperaba un PDF, una imagen o un XML' })
  const nombre = decodeURIComponent(String(req.headers['x-nombre'] ?? 'documento'))
  const tipoDocumento = decodeURIComponent(String(req.headers['x-tipo-documento'] ?? 'documento'))
  const { documentos } = await leeDocumentos([{ documentoId: nombre, nombre, tipoDocumento, bytes: new Uint8Array(bytes) }], configuracion, 1)
  return json(res, 200, { documento: documentos[0] })
}

/** Varios documentos en base64, con `enVuelo` opcional. Devuelve ademas las cifras del lote. */
async function lote(req, res) {
  const cuerpo = await leeCuerpo(req, configuracion.bytesMaximos * 4)
  let peticion
  try { peticion = JSON.parse(cuerpo.toString('utf8')) } catch { return json(res, 400, { error: 'el cuerpo no es JSON' }) }
  if (!Array.isArray(peticion?.documentos) || peticion.documentos.length === 0) return json(res, 400, { error: 'se esperaba `documentos`: una lista no vacia' })
  const archivos = []
  for (const [i, d] of peticion.documentos.entries()) {
    if (typeof d?.base64 !== 'string' || typeof d?.nombre !== 'string') return json(res, 400, { error: `documento ${i}: faltan \`nombre\` o \`base64\`` })
    const bytes = Buffer.from(d.base64, 'base64')
    if (bytes.length > configuracion.bytesMaximos) return json(res, 413, { error: `documento ${i}: supera el tamano maximo` })
    archivos.push({ documentoId: d.documentoId ?? `${i}-${d.nombre}`, nombre: d.nombre, tipoDocumento: d.tipoDocumento ?? 'documento', bytes: new Uint8Array(bytes) })
  }
  return json(res, 200, await leeDocumentos(archivos, configuracion, typeof peticion.enVuelo === 'number' ? peticion.enVuelo : undefined))
}

const servidor = createServer(async (req, res) => {
  const ruta = new URL(req.url ?? '/', 'http://interno').pathname
  try {
    if (req.method === 'GET' && ruta === '/health') return json(res, 200, { status: 'ok' })
    if (req.method === 'POST' && ruta === '/extraer') return await extraer(req, res)
    if (req.method === 'POST' && ruta === '/lote') return await lote(req, res)
    return json(res, 404, { error: 'ruta desconocida' })
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : ''
    if (mensaje === 'demasiado grande') {
      res.writeHead(413, { 'content-type': 'application/json; charset=utf-8', connection: 'close' })
      return res.end(JSON.stringify({ error: 'el documento supera el tamano maximo' }))
    }
    // Solo el TIPO del error al log: el mensaje puede llevar rutas o texto del documento.
    console.error(`extractor: fallo en ${ruta} (${error instanceof Error ? error.constructor.name : 'error'})`)
    return json(res, 500, { error: 'fallo interno al leer el documento' })
  }
})

servidor.listen(PUERTO, ESCUCHA, () => console.log(`extractor: escuchando en ${ESCUCHA}:${PUERTO}`))
