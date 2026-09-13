/**
 * Pruebas del puente A2A (spec 005 TAR-8..TAR-13, spec 010 RF-15..RF-21). `node --test scripts/prueba-a2a.ts`.
 *
 * LA DE OPACIDAD, portada de hermes-os-a2a, ENUMERA las rutas de servidor de la app y exige
 * igualdad con las tres: una lista de rutas prohibidas solo caza lo que alguien penso en poner en
 * ella; enumerar caza la ruta que nadie previo. Y el health se compara EXACTO.
 *
 * El fail-safe se prueba APAGANDO la capacidad (URL a un puerto cerrado) y con entrada corrupta:
 * un fail-safe probado solo con el camino feliz no es un fail-safe. El camino feliz exige el
 * servicio OCR corriendo en EXTRACTOR_SERVICIO_URL; si no responde, esa prueba FALLA y lo dice:
 * pasar en silencio seria afirmar una capacidad que nunca corrio.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AGENT_CARD_PATH, A2A_CONTENT_TYPE, A2A_PROTOCOL_VERSION, A2A_VERSION_HEADER } from '@a2a-js/sdk'
import { GET as healthGet } from '../src/app/a2a/health/route.ts'
import { GET as cardGet } from '../src/app/.well-known/agent-card.json/route.ts'
import { POST as rpcPost } from '../src/app/a2a/route.ts'
import { extraeConElServicio } from '../src/features/a2a/servicio-extractor.ts'
import { motivoPublico } from '../src/features/a2a/esquema.ts'
import { AlmacenDeTareasEfimero } from '../src/features/a2a/almacen-de-tareas.ts'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SERVICIO = process.env.EXTRACTOR_SERVICIO_URL ?? 'http://127.0.0.1:8081'
process.env.A2A_URL_BASE = 'http://app:3000'

function rutasDeServidor(desde: string, prefijo = ''): string[] {
  const salida: string[] = []
  for (const e of readdirSync(desde, { withFileTypes: true })) {
    if (e.isDirectory()) salida.push(...rutasDeServidor(join(desde, e.name), `${prefijo}/${e.name}`))
    else if (/^route\.(ts|js)$/.test(e.name)) salida.push(prefijo.replace(/\/\([^)]+\)/g, '') || '/')
  }
  return salida
}

const peticion = (cuerpo: unknown, cabeceras: Record<string, string> = {}): Request =>
  new Request('http://app:3000/a2a', { method: 'POST', headers: { 'content-type': 'application/json', [A2A_VERSION_HEADER]: A2A_PROTOCOL_VERSION, ...cabeceras }, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) })

const enviaDocumento = (base64: string, filename: string, mediaType: string, cabeceras: Record<string, string> = {}): Request =>
  peticion({ jsonrpc: '2.0', id: 1, method: 'SendMessage', params: { message: { messageId: crypto.randomUUID(), role: 'ROLE_USER', parts: [{ raw: base64, filename, mediaType }] } } }, cabeceras)

interface Rpc { result?: { task?: { status?: { state?: string; message?: { parts?: { text?: string }[] } }; artifacts?: { parts?: { data?: Record<string, unknown> }[] }[] } }; error?: { code: number; message: string } }
const rpc = async (r: Response): Promise<Rpc> => (await r.json()) as Rpc

// --- Opacidad ---------------------------------------------------------------------------------

test('la superficie de servidor de la app es EXACTAMENTE card, rpc y health (enumerada, no listada)', () => {
  assert.deepEqual(rutasDeServidor(join(raiz, 'src', 'app')).sort(), [`/${AGENT_CARD_PATH}`, '/a2a', '/a2a/health'].sort())
})

test('/a2a/health no reporta nada del interior', async () => {
  assert.deepEqual(await (await healthGet()).json(), { status: 'ok' })
})

test('la Card se sirve con los tipos del SDK: version 1.0 declarada, dos skills, y sin nombres del interior', async () => {
  const card = (await (await cardGet()).json()) as { supportedInterfaces: { protocolVersion: string; url: string }[]; skills: { id: string }[]; securitySchemes: Record<string, unknown> }
  assert.equal(card.supportedInterfaces[0].protocolVersion, A2A_PROTOCOL_VERSION)
  assert.equal(card.supportedInterfaces[0].url, 'http://app:3000/a2a')
  assert.deepEqual(card.skills.map((s) => s.id), ['extraccion-documental', 'lectura-de-comprobante-xml'])
  const texto = JSON.stringify(card).toLowerCase()
  for (const interior of ['tesseract', 'supabase', 'ollama', 'vllm', 'mistral', 'stack', 'localhost', '127.0.0.1', '8080']) assert.ok(!texto.includes(interior), `la Card menciona "${interior}"`)
})

// --- Protocolo --------------------------------------------------------------------------------

test('sin cabecera A2A-Version el SDK asume 0.3 y la rechaza con razon legible; la respuesta lleva el content-type del SDK', async () => {
  const r = await rpcPost(peticion({ jsonrpc: '2.0', id: 7, method: 'SendMessage', params: {} }, { [A2A_VERSION_HEADER]: '' }))
  assert.equal(r.headers.get('content-type'), A2A_CONTENT_TYPE)
  const cuerpo = await rpc(r)
  assert.ok(cuerpo.error, 'se esperaba un error JSON-RPC')
  assert.match(cuerpo.error!.message, /version/i)
})

test('cuerpo que no es JSON y JSON que no es objeto: error JSON-RPC, nunca 500 crudo', async () => {
  assert.equal((await rpc(await rpcPost(peticion('esto no es json')))).error?.code, -32700)
  assert.equal((await rpc(await rpcPost(peticion([1, 2])))).error?.code, -32600)
})

test('con A2A_API_KEY configurada, sin la cabecera es 401; con ella pasa', async () => {
  process.env.A2A_API_KEY = 'clave-de-prueba'
  try {
    const sin = await rpcPost(peticion({ jsonrpc: '2.0', id: 1, method: 'SendMessage', params: {} }))
    assert.equal(sin.status, 401)
    const card = (await (await cardGet()).json()) as { securityRequirements: unknown[] }
    assert.equal(card.securityRequirements.length, 1, 'la Card declara la clave cuando se exige')
    const con = await rpcPost(peticion({ jsonrpc: '2.0', id: 1, method: 'SendMessage', params: {} }, { 'X-API-Key': 'clave-de-prueba' }))
    assert.equal(con.status, 200)
  } finally {
    delete process.env.A2A_API_KEY
  }
})

// --- Fail-safe: apagando la capacidad y con entrada corrupta ------------------------------------

test('capacidad CAIDA: Task fallida con razon en espanol, sin URL, sin codigo de red ni stack', async () => {
  process.env.EXTRACTOR_SERVICIO_URL = 'http://127.0.0.1:9'
  try {
    const cuerpo = await rpc(await rpcPost(enviaDocumento(Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString('base64'), 'x.png', 'image/png')))
    assert.equal(cuerpo.error, undefined, JSON.stringify(cuerpo.error))
    assert.equal(cuerpo.result?.task?.status?.state, 'TASK_STATE_FAILED')
    const razon = cuerpo.result?.task?.status?.message?.parts?.[0]?.text ?? ''
    assert.match(razon, /no esta disponible/)
    for (const interior of ['127.0.0.1', 'ECONNREFUSED', 'fetch', 'at ', 'http']) assert.ok(!razon.includes(interior), `la razon filtra "${interior}"`)
  } finally {
    process.env.EXTRACTOR_SERVICIO_URL = SERVICIO
  }
})

test('entrada CORRUPTA: sin documento en la peticion, o bytes que no son nada, Task fallida con razon', async () => {
  process.env.EXTRACTOR_SERVICIO_URL = SERVICIO
  const sinParte = await rpc(await rpcPost(peticion({ jsonrpc: '2.0', id: 2, method: 'SendMessage', params: { message: { messageId: 'm1', role: 'ROLE_USER', parts: [{ text: 'hola' }] } } })))
  assert.equal(sinParte.result?.task?.status?.state, 'TASK_STATE_FAILED')
  assert.match(sinParte.result?.task?.status?.message?.parts?.[0]?.text ?? '', /ningun documento/)
  const basura = await rpc(await rpcPost(enviaDocumento(Buffer.from('basura').toString('base64'), 'x.bin', 'application/octet-stream')))
  assert.equal(basura.result?.task?.status?.state, 'TASK_STATE_FAILED', JSON.stringify(basura))
  assert.match(basura.result?.task?.status?.message?.parts?.[0]?.text ?? '', /no es un PDF|no se pudo leer|no esta disponible/)
})

// --- Camino feliz contra el servicio REAL --------------------------------------------------------

test('camino feliz: un escaneo sintetico vuelve COMPLETADO con confianza, evidencia y revisionHumana por campo, y selloVerificado=false', async () => {
  process.env.EXTRACTOR_SERVICIO_URL = SERVICIO
  const ruta = join(raiz, 'tools', 'extractor-documental', 'corpus', 'factura-escaneada-1.png')
  assert.ok(existsSync(ruta), 'falta el corpus sintetico: python3 medicion/genera-corpus.py')
  const cuerpo = await rpc(await rpcPost(enviaDocumento(readFileSync(ruta).toString('base64'), 'factura-escaneada-1.png', 'image/png')))
  assert.equal(cuerpo.error, undefined, JSON.stringify(cuerpo.error))
  assert.equal(cuerpo.result?.task?.status?.state, 'TASK_STATE_COMPLETED', `el servicio OCR en ${SERVICIO} tiene que estar corriendo: ${JSON.stringify(cuerpo.result?.task?.status)}`)
  const datos = cuerpo.result?.task?.artifacts?.[0]?.parts?.[0]?.data as { campos: { clave: string; confianza: number; evidencia: string; revisionHumana: boolean }[]; selloVerificado: boolean; clase: string; tiempos: { motor: number } }
  assert.ok(datos.campos.length > 0)
  for (const c of datos.campos) {
    assert.equal(typeof c.confianza, 'number')
    assert.ok(['codigo', 'exacto', 'corroboracion', 'checksum', 'motor'].includes(c.evidencia))
    assert.equal(typeof c.revisionHumana, 'boolean')
  }
  assert.equal(datos.selloVerificado, false)
  assert.equal(datos.clase, 'factura')
  assert.ok(datos.tiempos.motor > 0, 'los tiempos por etapa viajan')
  console.log(`  campos ${datos.campos.length} · a revision ${datos.campos.filter((c) => c.revisionHumana).length} · motor ${datos.tiempos.motor} ms`)
})

test('un XML como texto va por la skill de comprobante: exacto, sin region, selloVerificado=false', async () => {
  process.env.EXTRACTOR_SERVICIO_URL = SERVICIO
  const xml = readFileSync(join(raiz, 'tools', 'extractor-documental', 'pruebas', 'fixtures', 'cfdi-40-ingreso.xml'), 'utf8')
  const cuerpo = await rpc(await rpcPost(peticion({ jsonrpc: '2.0', id: 3, method: 'SendMessage', params: { message: { messageId: 'm2', role: 'ROLE_USER', parts: [{ text: xml, filename: 'f.xml', mediaType: 'application/xml' }] } } })))
  assert.equal(cuerpo.result?.task?.status?.state, 'TASK_STATE_COMPLETED', JSON.stringify(cuerpo.result?.task?.status))
  const datos = cuerpo.result?.task?.artifacts?.[0]?.parts?.[0]?.data as { ruta: string; campos: { evidencia: string }[]; selloVerificado: boolean }
  assert.equal(datos.ruta, 'xml')
  assert.ok(datos.campos.every((c) => c.evidencia === 'exacto'))
  assert.equal(datos.selloVerificado, false)
})

// --- Regresion de la revision de opacidad (2026-09-13) ------------------------------------------

const INTERIOR = ['tesseract', 'ollama', 'vllm', 'mistral', 'supabase', '127.0.0.1', 'localhost', '8080', '8081', 'ECONNREFUSED', 'node_modules', '/home/', '.ts:', 'Cannot read', 'must be of type', 'ZONAS_MX', 'codigo 2']
const sinInterior = (texto: string, donde: string): void => { for (const i of INTERIOR) assert.ok(!texto.includes(i), `${donde} filtra "${i}": ${texto.slice(0, 200)}`) }

test('los -32603 que fabrica el SDK dentro de handle() salen genericos y sin `data`', async () => {
  for (const cuerpo of [
    { jsonrpc: '2.0', id: 1, method: 'GetExtendedAgentCard', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'SendMessage', params: { message: { messageId: 'm', role: 'ROLE_USER', parts: [null] } } },
    { jsonrpc: '2.0', id: 3, method: 'SendMessage', params: { message: { messageId: 'm', role: 'ROLE_USER', parts: [{ raw: 123 }] } } },
  ]) {
    const r = await rpc(await rpcPost(peticion(cuerpo)))
    const texto = JSON.stringify(r)
    sinInterior(texto, `respuesta a ${cuerpo.method}`)
    if (r.error?.code === -32603) assert.equal(r.error.message, 'fallo interno del puente')
    assert.ok(!('data' in (r.error ?? {})), 'sin `data` en el error')
  }
})

test('ListTasks no existe en este agente; una Task vuelve SIN history (el documento no se eco)', async () => {
  const lista = await rpc(await rpcPost(peticion({ jsonrpc: '2.0', id: 4, method: 'ListTasks', params: {} })))
  assert.equal(lista.error?.code, -32601)
  process.env.EXTRACTOR_SERVICIO_URL = 'http://127.0.0.1:9'
  try {
    const r = (await (await rpcPost(enviaDocumento(Buffer.from('x'.repeat(5000)).toString('base64'), 'x.png', 'image/png'))).json()) as { result: { task: { history: unknown[] } } }
    assert.deepEqual(r.result.task.history, [])
  } finally {
    process.env.EXTRACTOR_SERVICIO_URL = SERVICIO
  }
})

test('el motivo del servicio OCR NUNCA sale crudo: catalogo cerrado por prefijo', async () => {
  assert.equal(motivoPublico('los bytes no son PDF, imagen ni XML', 'ninguna'), 'el documento no es un PDF, una imagen ni un XML')
  assert.equal(motivoPublico('fallo al leer: el proceso local salio con codigo 2 — extractor: zonas por defecto (ZONAS_MX)', 'ninguna'), 'no se pudo leer el documento')
  assert.equal(motivoPublico('imagen image/png al motor; avisos: motor de respaldo: fetch failed http://127.0.0.1:11434', 'motor'), 'imagen leida por el motor')
  const documento = { documentoId: 'x', nombre: 'x', ruta: 'motor', motivo: 'motor tesseract fallo: spawn ENOENT /usr/bin/tesseract; ollama en http://127.0.0.1:11434 ECONNREFUSED', paginas: 1, campos: [], evidencia: { codigo: 0, exacto: 0, corroboracion: 0, checksum: 0, motor: 0 }, revisionHumana: 0, estructura: { clase: 'x', sinClase: true, campos: {}, faltantes: [], noPrevistos: [] }, identificadoresInvalidos: [], tiempos: { codigos: 0, motor: 1, respaldo: 0, total: 1 } }
  const pedirFalso = (async () => new Response(JSON.stringify({ documento }), { status: 200 })) as unknown as typeof fetch
  const resultado = await extraeConElServicio({ bytes: new Uint8Array([1]), nombre: 'x.png', tipoMime: 'image/png' }, pedirFalso)
  sinInterior(JSON.stringify(resultado), 'resultado con motivo hostil')
  assert.equal(resultado.motivo, 'documento leido')
})

test('cabecera de version enorme no se eco entera; mediaType raro es «no admitido», no «caida»', async () => {
  const r = await rpc(await rpcPost(peticion({ jsonrpc: '2.0', id: 5, method: 'SendMessage', params: {} }, { [A2A_VERSION_HEADER]: 'x'.repeat(2000) })))
  assert.ok((r.error?.message.length ?? 0) < 200, `mensaje de ${r.error?.message.length} caracteres`)
  await assert.rejects(extraeConElServicio({ bytes: new Uint8Array([1]), nombre: 'x', tipoMime: 'image/png\r\nX-Evil: 1' }), /no admitido/)
})

test('el almacen de tareas es efimero: sin history, con tope y con caducidad', async () => {
  let t = 0
  const almacen = new AlmacenDeTareasEfimero(2, 100, () => t)
  const tarea = (id: string) => ({ id, contextId: 'c', status: undefined, artifacts: [], history: [{ messageId: 'm', contextId: 'c', taskId: id, role: 1, parts: [], metadata: undefined, extensions: [], referenceTaskIds: [] }], metadata: undefined })
  await almacen.save(tarea('a'))
  assert.deepEqual((await almacen.load('a'))?.history, [])
  await almacen.save(tarea('b'))
  await almacen.save(tarea('c'))
  assert.equal(almacen.tamano, 2, 'tope de 2')
  assert.equal(await almacen.load('a'), undefined, 'la mas vieja se fue')
  t = 101
  assert.equal(await almacen.load('b'), undefined, 'caducada')
  assert.deepEqual((await almacen.list()).tasks, [])
})
