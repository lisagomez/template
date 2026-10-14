/**
 * Pruebas del puente A2A (spec 005 TAR-8..TAR-13, spec 010 RF-15..RF-21). `node --test scripts/prueba-a2a.ts`.
 *
 * LA DE OPACIDAD, portada de hermes-os-a2a, ENUMERA las rutas del bridge y exige igualdad con las
 * tres: una lista de rutas prohibidas solo caza lo que alguien penso en poner en ella; enumerar
 * caza la ruta que nadie previo. Y el health se compara EXACTO. Son DOS pruebas, y la segunda
 * existe para no perder nada al acotar la primera al bridge: el resto de la superficie de servidor
 * va DECLARADA en `RUTAS_FUERA_DEL_BRIDGE`, asi que una ruta nueva en cualquier sitio sigue
 * cayendo. Ver el comentario de `rutasDelBridge()` para por que se acoto (2026-09-26).
 *
 * El fail-safe se prueba APAGANDO la capacidad (URL a un puerto cerrado) y con entrada corrupta:
 * un fail-safe probado solo con el camino feliz no es un fail-safe.
 *
 * LAS DOS PRUEBAS QUE EMPIEZAN POR `SERVICIO:` exigen el servicio del extractor corriendo en
 * EXTRACTOR_SERVICIO_URL; si no responde, FALLAN y lo dicen: pasar en silencio seria afirmar una
 * capacidad que nunca corrio. La marca en el nombre es lo que permite al padron de gates
 * (`.claude/gates.json`) correrlas SOLO donde ese servicio existe, en vez de apagar el archivo
 * entero como estuvo hasta el 2026-09-26. Levantarlo necesita el binario de Tesseract: sin el,
 * `servicio/configuracion.mjs` lanza y el servicio no arranca.
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

/**
 * Las rutas que cuelgan de la superficie A2A: el bridge y nada mas. Es `rutasDelBridge()`, el
 * nombre que le puso el diseno en `docs/SDD-puente-a2a-extractor.md` §6.
 *
 * POR QUE NO ENUMERA `src/app` ENTERO (2026-09-26). Esta prueba lo hacia, y era correcto el dia
 * que se escribio: el bridge era lo UNICO que habia en `src/app`, asi que «las rutas de la app» y
 * «las rutas del bridge» eran el mismo conjunto. Al crecer la app con las 11 `/api/*` de dictado,
 * laboratorio, historial y ajustes, la afirmacion se volvio falsa — y como NADIE corria este
 * archivo (no estaba en ningun script npm), nadie lo vio: la prueba llevaba meses en rojo y la
 * opacidad A2A sin vigilar. Lo destapo la comprobacion de huerfanos de `verifica-gates.mjs`.
 *
 * RF-17 de la spec 010 («expondra exactamente tres rutas de servidor... y una prueba las
 * enumerara y exigira igualdad») habla del sistema que se despliega en la infra del cliente, y su
 * modelo es cada agente de hermes-os-a2a: un servicio propio cuya superficie entera son tres
 * rutas. Aqui el bridge vive dentro de la app de la fabrica, asi que el conjunto que RF-17 acota
 * es el del bridge. Se enumera igual: no se listan rutas prohibidas.
 */
const rutasDelBridge = (): string[] => [
  ...rutasDeServidor(join(raiz, 'src', 'app', 'a2a'), '/a2a'),
  ...rutasDeServidor(join(raiz, 'src', 'app', '.well-known'), '/.well-known'),
]

/**
 * El resto de la superficie de servidor de la app, DECLARADO una por una.
 *
 * Existe para no perder lo que la version vieja de la prueba si daba: que una ruta que nadie
 * previo caiga sola. Acotar la enumeracion al bridge sin esto habria dejado de cazar una ruta
 * nueva colgada en cualquier otro sitio — y renunciar a eso para poner la prueba en verde seria
 * debilitarla, que es justo lo que este arreglo no puede hacer.
 *
 * Una ruta nueva aqui NO es un fallo: es una decision que alguien tiene que tomar a la vista. Se
 * anade a esta lista en el mismo cambio que la crea, y ahi se pregunta si debe quedar detras del
 * mismo puerto que el bridge (RF-20: el puente no se publica fuera de la red interna del compose).
 */
const RUTAS_FUERA_DEL_BRIDGE = [
  '/api/ajustes',
  // Buzón de CFDI del despacho (spec 015). RF-20: misma app y mismo puerto; en el despacho la app no tiene salida
  // a internet (docker-compose.despacho.yml). Todas exigen sesión y ser miembro del despacho (`entra()`), las que
  // escriben, `Origin` del mismo sitio; RLS y disparadores deciden. NO pasan por `src/proxy.ts` a propósito: Next 16
  // corta ahí el cuerpo a 10 MB sin error. El documento no se guarda, solo su lectura; sin consentimiento, ni se lee.
  '/api/buzon/cifras',
  '/api/buzon/consentimientos',
  '/api/buzon/documentos',
  '/api/buzon/documentos/[id]',
  '/api/buzon/exporta',
  '/api/buzon/horas',
  '/api/buzon/lista-69b',
  '/api/buzon/pendientes',
  '/api/buzon/piloto',
  '/api/buzon/pymes',
  '/api/contenido/video',
  // Crecimiento demostrado (goal crecimiento-demostrado, laboratorio con pymes sintéticas). RF-20: misma
  // app y mismo puerto. Es la pasarela del agente `crecimiento-demostrado`, OTRA superficie que no es este
  // bridge: local, 503 sin CRECIMIENTO_A2A_SECRETO y CRECIMIENTO_A2A_LLAVE (sin secreto por omisión),
  // token HMAC con la pyme y las skills, «ajeno» = «no existe», ListTasks cerrado. Solo lee: responde
  // preguntas y verifica derivaciones; no ejecuta nada. Exponerla a un partner o a internet es gate humano
  // con C3 + C4.
  '/api/crecimiento/a2a',
  '/api/crecimiento/a2a/.well-known/agent-card.json',
  '/api/dictado',
  '/api/dictado/movil',
  '/api/etiquetas',
  // Fotos de etiquetas (recepción con foto y pieza suelta): misma puerta Bearer y mismo puerto que
  // `/api/etiquetas`; no van detrás del bridge ni se publican aparte (RF-20).
  '/api/etiquetas/fotos',
  '/api/etiquetas/fotos/[huella]',
  '/api/historial',
  '/api/laboratorio/datos',
  '/api/laboratorio/estado',
  '/api/laboratorio/muestra',
  '/api/laboratorio/sintetizar',
  '/api/laboratorio/sintetizar-flujo',
  '/api/laboratorio/transcribir',
  '/api/laboratorio/veredictos',
  // Reel del celular (PRP-007). RF-20: misma app y mismo puerto que las demás; todas exigen la sesión del
  // dueño (proxy + getUser) y las que escriben, `Origin` del mismo sitio; RLS por dueño; el video no sale
  // del servidor. Sin sesión: 401. No se publican fuera de la red del compose más que el resto de la app.
  '/api/reel/[id]',
  '/api/reel/[id]/ajustes',
  '/api/reel/[id]/archivo',
  '/api/reel/[id]/consentimientos',
  '/api/reel/[id]/decision',
  '/api/reel/proyectos',
  // Sistema integrado ISO (PRP-013): exporta la versión EXACTA de un documento a DOCX o PDF. Solo GET (no escribe),
  // exige sesión (proxy: 401 sin ella) y lee con la sesión de quien pide (RLS por organización); la huella del archivo
  // viaja en X-Huella. Misma app y mismo puerto que las demás (RF-20).
  '/api/sgi/documento/[version]',
  // Soporte SAP en LABORATORIO (PRP-008). RF-20: misma app y mismo puerto. Responde 404 sin
  // SOPORTE_SAP_LABORATORIO=1 (que `configura:deploy` rechaza en producción); estado sintético en memoria,
  // identidades de laboratorio, sin base y sin `service_role`. Exponerla es gate humano con C3 + C4.
  '/api/soporte-sap',
  // Vendedor con IA en WhatsApp (goal ventas-ia-waba, fases 0-3 en laboratorio). RF-20: misma app y mismo
  // puerto. `webhook`, `flows` y `pagos` son las únicas que un tercero (Meta, el procesador) tendría que
  // alcanzar, y solo con el canal REAL: la app no lo arranca sin C3 + C4 firmados; en el laboratorio las
  // llaman simuladores locales. Todas verifican firma (X-Hub-Signature-256 / HMAC del procesador) antes de
  // leer el cuerpo. `panel`: Bearer por inquilino. `plataforma`: Bearer de quien opera, solo en el
  // laboratorio. `a2a/[dominio]`: la pasarela de `pedidos` y `atribucion`, OTRA superficie que no es este
  // bridge — local, 503 sin llave de firma, token con inquilino; exponerla a un partner o a internet es gate
  // humano con C3 + C4.
  '/api/ventas-whatsapp/a2a/[dominio]',
  '/api/ventas-whatsapp/a2a/[dominio]/.well-known/agent-card.json',
  '/api/ventas-whatsapp/flows',
  '/api/ventas-whatsapp/pagos',
  '/api/ventas-whatsapp/panel',
  '/api/ventas-whatsapp/plataforma',
  '/api/ventas-whatsapp/webhook',
  // La vitrina de Soporte SAP (docs/VITRINA-SOPORTE-SAP.md). RF-20: misma app y mismo puerto. En Vercel, detrás de su
  // protección; NO enciende el laboratorio: firma cada petición (HMAC, ventana y una sola vez) y la pasa por un túnel
  // al portero de la máquina del laboratorio, que solo deja pasar /api/soporte-sap. Sin EN_VIVO_URL ni EN_VIVO_SECRETO
  // (fuera de Vercel) responden «apagado». `estado`: siempre 200, para que un laboratorio apagado no sea un error.
  '/api/vitrina/soporte-sap/en-vivo',
  '/api/vitrina/soporte-sap/en-vivo/estado',
]

const peticion = (cuerpo: unknown, cabeceras: Record<string, string> = {}): Request =>
  new Request('http://app:3000/a2a', { method: 'POST', headers: { 'content-type': 'application/json', [A2A_VERSION_HEADER]: A2A_PROTOCOL_VERSION, ...cabeceras }, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) })

const enviaDocumento = (base64: string, filename: string, mediaType: string, cabeceras: Record<string, string> = {}): Request =>
  peticion({ jsonrpc: '2.0', id: 1, method: 'SendMessage', params: { message: { messageId: crypto.randomUUID(), role: 'ROLE_USER', parts: [{ raw: base64, filename, mediaType }] } } }, cabeceras)

interface Rpc { result?: { task?: { status?: { state?: string; message?: { parts?: { text?: string }[] } }; artifacts?: { parts?: { data?: Record<string, unknown> }[] }[] } }; error?: { code: number; message: string } }
const rpc = async (r: Response): Promise<Rpc> => (await r.json()) as Rpc

// --- Opacidad ---------------------------------------------------------------------------------

test('la superficie A2A es EXACTAMENTE card, rpc y health (enumerada, no listada)', () => {
  assert.deepEqual(rutasDelBridge().sort(), [`/${AGENT_CARD_PATH}`, '/a2a', '/a2a/health'].sort())
})

test('ninguna ruta de servidor aparece fuera del bridge sin estar declarada (enumerada, no listada)', () => {
  const delBridge = new Set(rutasDelBridge())
  const fuera = rutasDeServidor(join(raiz, 'src', 'app')).filter((r) => !delBridge.has(r))
  assert.deepEqual(
    fuera.sort(),
    [...RUTAS_FUERA_DEL_BRIDGE].sort(),
    'aparecio o desaparecio una ruta de servidor: declarala en RUTAS_FUERA_DEL_BRIDGE y decide si debe compartir puerto con el bridge (RF-20)',
  )
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
    const casi = await rpcPost(peticion({ jsonrpc: '2.0', id: 1, method: 'SendMessage', params: {} }, { 'X-API-Key': 'clave-de-pruebA' }))
    assert.equal(casi.status, 401, 'misma longitud, un caracter distinto')
  } finally {
    delete process.env.A2A_API_KEY
  }
})

test('en PRODUCCION sin clave el puente esta apagado: rpc y Card responden 503 (revision C3 del 2026-10-02)', async () => {
  const entorno = process.env as Record<string, string | undefined>
  const antes = entorno['NODE_ENV']
  entorno['NODE_ENV'] = 'production'
  try {
    const rpcApagado = await rpcPost(peticion({ jsonrpc: '2.0', id: 1, method: 'SendMessage', params: {} }))
    assert.equal(rpcApagado.status, 503)
    assert.equal((await rpc(rpcApagado)).error?.message, 'puente A2A apagado')
    assert.equal((await cardGet()).status, 503, 'no se anuncia un agente que no atiende')
    entorno['A2A_API_KEY'] = 'clave-de-prueba'
    assert.equal((await rpcPost(peticion({ jsonrpc: '2.0', id: 1, method: 'SendMessage', params: {} }))).status, 401, 'con clave vuelve a exigirla')
    assert.equal((await cardGet()).status, 200)
  } finally {
    entorno['NODE_ENV'] = antes
    delete entorno['A2A_API_KEY']
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

test('SERVICIO: camino feliz: un escaneo sintetico vuelve COMPLETADO con confianza, evidencia y revisionHumana por campo, y selloVerificado=false', async () => {
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

test('SERVICIO: un XML como texto va por la skill de comprobante: exacto, sin region, selloVerificado=false', async () => {
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
