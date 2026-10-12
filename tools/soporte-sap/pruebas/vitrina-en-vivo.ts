/**
 * La sección en vivo de la vitrina (Vercel → túnel → portero → laboratorio local), EJECUTADA sin red: la ruta de Vercel
 * y el portero se encadenan en el proceso, y el «laboratorio» es una función que anota lo que le llega. Cada regla del
 * portero se prueba con su caso malo, porque lo que no se rechaza en una prueba se acepta en el túnel.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { RAIZ } from './_ayuda.ts'

const DIR = join(RAIZ, 'src', 'features', 'soporte-sap', 'vitrina', 'en-vivo')
const { firma, verifica, CABECERA_FIRMA, VENTANA_MS } = await import(pathToFileURL(join(DIR, 'firma.ts')).href)
const { creaPortero } = await import(pathToFileURL(join(DIR, 'portero.ts')).href)
const { atiendeEnVivo, estadoEnVivo } = await import(pathToFileURL(join(DIR, 'proxy.ts')).href)

const SECRETO = 'a'.repeat(24) + 'secreto-de-prueba-0123456789'
const OTRO = 'b'.repeat(24) + 'secreto-de-prueba-0123456789'
const DOCUMENTOS = join(RAIZ, 'tools', 'soporte-sap', 'documentos')
const LAB = 'http://127.0.0.1:3011'
type Llegada = { url: string; metodo: string; tipo: string | null; cuerpo: Uint8Array }

/** Un laboratorio de mentira: anota lo que le llega y responde una vista mínima. */
function laboratorio(cae = false) {
  const llegadas: Llegada[] = []
  const reenvia = async (url: string, init: RequestInit = {}) => {
    if (cae) throw new Error('ECONNREFUSED')
    const cabeceras = new Headers(init.headers)
    llegadas.push({ url, metodo: init.method ?? 'GET', tipo: cabeceras.get('content-type'), cuerpo: init.body ? new Uint8Array(init.body as ArrayBuffer) : new Uint8Array() })
    return Response.json({ vista: { sesion: { rol: 'cliente' } } })
  }
  return { llegadas, reenvia: reenvia as typeof fetch }
}

const firmada = (ruta: string, cuerpo: string | Uint8Array<ArrayBuffer> = '', metodo = 'POST', tipo = 'application/json', secreto = SECRETO, t = Date.now()) =>
  new Request(`http://portero${ruta}`, { method: metodo, body: metodo === 'POST' ? cuerpo : undefined, headers: { 'content-type': tipo, [CABECERA_FIRMA]: firma(secreto, { metodo, ruta, cuerpo }, t) } })
const RUTA = '/api/soporte-sap?rol=cliente'
const ACCION = JSON.stringify({ tipo: 'escala', incidencia: 'inc-001' })

test('en vivo · la firma vale para su petición, una vez, y dentro de la ventana', () => {
  const vistas = new Map<string, number>(), ahora = Date.now()
  const p = { metodo: 'POST', ruta: RUTA, cuerpo: ACCION }
  const f = firma(SECRETO, p, ahora)
  assert.equal(verifica(SECRETO, f, p, vistas, ahora).ok, true)
  assert.equal(verifica(SECRETO, f, p, vistas, ahora).ok, false, 'repetida no vale')
  assert.equal(verifica(SECRETO, firma(SECRETO, p, ahora), { ...p, cuerpo: '{}' }, new Map(), ahora).ok, false, 'otro cuerpo')
  assert.equal(verifica(SECRETO, firma(SECRETO, p, ahora), { ...p, ruta: '/api/soporte-sap?rol=superadmin' }, new Map(), ahora).ok, false, 'otra ruta')
  assert.equal(verifica(OTRO, firma(SECRETO, p, ahora), p, new Map(), ahora).ok, false, 'otro secreto')
  assert.equal(verifica(SECRETO, firma(SECRETO, p, ahora - VENTANA_MS - 1), p, new Map(), ahora).ok, false, 'vieja')
  assert.throws(() => firma('corto', p), /32 caracteres/)
})

test('en vivo · el portero no existe para quien no trae la firma de Vercel: ni la de otra petición, ni vieja, ni repetida', async () => {
  const lab = laboratorio()
  const portero = creaPortero({ secreto: SECRETO, laboratorio: LAB, documentos: DOCUMENTOS, reenvia: lab.reenvia })
  const sinFirma = await portero(new Request(`http://portero${RUTA}`, { method: 'POST', body: ACCION, headers: { 'content-type': 'application/json' } }))
  assert.equal(sinFirma.status, 404); assert.equal(await sinFirma.text(), 'Not Found')
  const otra = firmada(RUTA, '{}')
  const cambiada = new Request(otra.url, { method: 'POST', body: ACCION, headers: otra.headers })
  assert.equal((await portero(cambiada)).status, 404, 'firma de otra petición')
  assert.equal((await portero(firmada(RUTA, ACCION, 'POST', 'application/json', SECRETO, Date.now() - 2 * VENTANA_MS))).status, 404, 'vieja')
  assert.equal((await portero(firmada(RUTA, ACCION, 'POST', 'application/json', OTRO))).status, 404, 'otro secreto')
  const buena = firmada(RUTA, ACCION)
  const copia = new Request(buena.url, { method: 'POST', body: ACCION, headers: buena.headers })
  assert.equal((await portero(buena)).status, 200)
  assert.equal((await portero(copia)).status, 404, 'repetida')
  assert.equal(lab.llegadas.length, 1, 'al laboratorio solo llegó la buena')
})

test('en vivo · el portero solo deja pasar Soporte SAP: otra ruta, aun firmada, no existe', async () => {
  const lab = laboratorio()
  const portero = creaPortero({ secreto: SECRETO, laboratorio: LAB, documentos: DOCUMENTOS, reenvia: lab.reenvia })
  for (const ruta of ['/api/buzon', '/api/soporte-sap/../buzon', '/soporte-sap', '/api/a2a', '/']) {
    assert.equal((await portero(firmada(ruta, ACCION))).status, 404, ruta)
  }
  assert.equal((await portero(firmada('/api/soporte-sap?rol=cliente&otro=1', '', 'GET'))).status, 400, 'consulta con más de rol y export')
  assert.equal((await portero(firmada('/api/soporte-sap?rol=root', '', 'GET'))).status, 400, 'un rol que no existe')
  assert.equal(lab.llegadas.length, 0)
  assert.equal((await portero(firmada('/api/soporte-sap?rol=consultor', '', 'GET'))).status, 200)
  assert.equal(lab.llegadas[0]!.url, `${LAB}/api/soporte-sap?rol=consultor`)
})

test('en vivo · el portero no acepta archivos: solo documentos de muestra, que lee de este disco', async () => {
  const lab = laboratorio()
  const portero = creaPortero({ secreto: SECRETO, laboratorio: LAB, documentos: DOCUMENTOS, reenvia: lab.reenvia })
  const multipart = await portero(firmada(RUTA, '--x\r\n\r\nhola\r\n--x--', 'POST', 'multipart/form-data; boundary=x'))
  assert.equal(multipart.status, 415)
  for (const muestras of [['../../.env'], ['spool-inyeccion.pdf'], ['captura-migo.png', 'captura-migo.png'], ['captura-migo.png', 'cfdi-rechazado.xml', 'spool-job.pdf', 'captura-migo.png']]) {
    const r = await portero(firmada(RUTA, JSON.stringify({ levanta: { titulo: 'MIGO', descripcion: 'M7 053', muestras } })))
    assert.equal(r.status, 400, muestras.join(','))
  }
  assert.equal(lab.llegadas.length, 0, 'nada de eso llegó al laboratorio')
  const r = await portero(firmada(RUTA, JSON.stringify({ levanta: { titulo: 'MIGO no contabiliza', descripcion: 'Sale M7 053 en sociedad 1000', muestras: ['captura-migo.png'] } })))
  assert.equal(r.status, 200)
  const llegada = lab.llegadas[0]!
  assert.match(llegada.tipo ?? '', /^multipart\/form-data; boundary=/)
  const imagen = readFileSync(join(DOCUMENTOS, 'captura-migo.png'))
  assert.ok(Buffer.from(llegada.cuerpo).includes(imagen), 'el multipart lleva el documento de muestra de este disco')
})

test('en vivo · con la máquina apagada el portero lo dice, sin tumbarse', async () => {
  const portero = creaPortero({ secreto: SECRETO, laboratorio: LAB, documentos: DOCUMENTOS, reenvia: laboratorio(true).reenvia })
  const r = await portero(firmada(RUTA, '', 'GET'))
  assert.equal(r.status, 502)
  assert.throws(() => creaPortero({ secreto: 'corto', laboratorio: LAB, documentos: DOCUMENTOS }), /32 caracteres/)
})

/** Vercel → portero en el mismo proceso: lo que la ruta de Vercel manda es lo que el portero recibe. */
function cadena(secretoVercel = SECRETO, secretoPortero = SECRETO, cae = false) {
  const lab = laboratorio(cae)
  const portero = creaPortero({ secreto: secretoPortero, laboratorio: LAB, documentos: DOCUMENTOS, reenvia: lab.reenvia })
  const enviadas: Request[] = []
  const tunel = (async (url: string, init: RequestInit) => { const r = new Request(url, init); enviadas.push(r.clone()); return portero(r) }) as typeof fetch
  const env = { EN_VIVO_URL: 'https://lab.ejemplo.ts.net', EN_VIVO_SECRETO: secretoVercel }
  return { lab, enviadas, pide: (req: Request) => atiendeEnVivo(req, env, tunel) }
}
const desdeElNavegador = (q: string, cuerpo?: string, tipo = 'application/json') =>
  new Request(`https://vitrina.vercel.app/api/vitrina/soporte-sap/en-vivo${q}`, cuerpo === undefined ? {} : { method: 'POST', body: cuerpo, headers: { 'content-type': tipo } })

test('en vivo · Vercel firma lo que pasa, y la firma no vuelve al navegador', async () => {
  const c = cadena()
  const r = await c.pide(desdeElNavegador('?rol=cliente', ACCION))
  assert.equal(r.status, 200)
  assert.equal(c.enviadas[0]!.url, 'https://lab.ejemplo.ts.net/api/soporte-sap?rol=cliente')
  assert.ok(c.enviadas[0]!.headers.get(CABECERA_FIRMA), 'por el túnel va la firma')
  assert.equal(r.headers.get(CABECERA_FIRMA), null, 'al navegador, no')
  assert.ok(!(await r.text()).includes('ts.net'), 'ni la URL del túnel')
})

test('en vivo · sin configurar, con otro secreto o con el túnel caído: apagado, con su aviso', async () => {
  const sinConfig = await atiendeEnVivo(desdeElNavegador('?rol=cliente'), {})
  assert.equal(sinConfig.status, 503); assert.equal((await sinConfig.json()).apagado, true)
  for (const url of ['http://lab.ejemplo.ts.net', 'https://lab.ejemplo.ts.net/otra', 'nada']) {
    assert.equal((await atiendeEnVivo(desdeElNavegador('?rol=cliente'), { EN_VIVO_URL: url, EN_VIVO_SECRETO: SECRETO })).status, 503, url)
  }
  const otro = await cadena(SECRETO, OTRO).pide(desdeElNavegador('?rol=cliente'))
  assert.equal(otro.status, 503); assert.match((await otro.json()).error, /no reconoce la firma/)
  const caido = await cadena(SECRETO, SECRETO, true).pide(desdeElNavegador('?rol=cliente'))
  assert.equal(caido.status, 503); assert.match((await caido.json()).error, /apagado/)
})

test('en vivo · el navegador no manda archivos ni consultas raras, y levanta con muestras de punta a punta', async () => {
  const c = cadena()
  assert.equal((await c.pide(desdeElNavegador('?rol=cliente', 'x', 'multipart/form-data; boundary=x'))).status, 415)
  assert.equal((await c.pide(desdeElNavegador('?rol=cliente&ruta=/api/buzon'))).status, 400)
  assert.equal(c.enviadas.length, 0)
  const r = await c.pide(desdeElNavegador('?rol=cliente', JSON.stringify({ levanta: { titulo: 'CFDI rechazado', descripcion: 'El CFDI no timbra', muestras: ['cfdi-rechazado.xml'] } })))
  assert.equal(r.status, 200)
  assert.match(c.lab.llegadas[0]!.tipo ?? '', /^multipart\/form-data/)
})

test('en vivo · el estado siempre responde 200: con la vista si está encendido, con el motivo si no', async () => {
  const lab = laboratorio(), portero = creaPortero({ secreto: SECRETO, laboratorio: LAB, documentos: DOCUMENTOS, reenvia: lab.reenvia })
  const tunel = (async (url: string, init: RequestInit) => portero(new Request(url, init))) as typeof fetch
  const env = { EN_VIVO_URL: 'https://lab.ejemplo.ts.net', EN_VIVO_SECRETO: SECRETO }
  const encendido = await estadoEnVivo(env, tunel)
  assert.equal(encendido.status, 200); assert.equal((await encendido.json()).encendido, true)
  const apagado = await estadoEnVivo(env, (async () => { throw new Error('ECONNREFUSED') }) as typeof fetch)
  assert.equal(apagado.status, 200)
  const a = await apagado.json(); assert.equal(a.encendido, false); assert.match(a.motivo, /apagado/)
  assert.equal((await (await estadoEnVivo({})).json()).encendido, false, 'sin configurar')
})
