/**
 * La mesa del experto (`docs/goals/soporte-sap-experto.md`), EJECUTADA: la identidad de Access verificada con llaves
 * reales (generadas aquí), la ruta de Next, el runtime del laboratorio y el almacén en disco. Cada afirmación de
 * seguridad de la mesa tiene aquí su prueba, y su sabotaje en la matriz.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { createServer } from 'node:http'
import { generateKeyPairSync, createSign, createHmac } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AddressInfo } from 'node:net'
import { RAIZ, lee } from './_ayuda.ts'

register('./_app.mjs', import.meta.url)
// La app corre desde la raíz del repo (las muestras y el lector de OCR se leen de ahí).
process.chdir(RAIZ)
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const ajena = generateKeyPairSync('rsa', { modulusLength: 2048 })
const JWK = { ...publicKey.export({ format: 'jwk' }), kid: 'llave-1', alg: 'RS256', use: 'sig' }
const servidor = createServer((_q, r) => { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ keys: [JWK] })) })
await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok))
const DIR = mkdtempSync(join(tmpdir(), 'mesa-experto-'))
const AUD = `aud-de-prueba-${'a'.repeat(24)}`
Object.assign(process.env, {
  SOPORTE_SAP_LABORATORIO: '1', ACCESS_EQUIPO: 'equipo-prueba', ACCESS_AUD: AUD, ACCESS_CERTS_URL: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/certs`,
  MESA_EXPERTOS: 'experto@prueba.local,otro@prueba.local', MESA_LABORATORIO: 'lab@prueba.local', MESA_TOKENS: 'automatizacion.access=experto', MESA_ALMACEN: 'disco', MESA_ALMACEN_DIR: DIR,
})
delete process.env['TESSERACT_CMD']
after(() => { servidor.close(); rmSync(DIR, { recursive: true, force: true }) })

const b64 = (x: unknown) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url')
function jwt(claims: Record<string, unknown>, o: { llave?: typeof privateKey; kid?: string } = {}): string {
  const s = Math.floor(Date.now() / 1000)
  const h = b64({ alg: 'RS256', kid: o.kid ?? 'llave-1', typ: 'JWT' })
  const p = b64({ iss: 'https://equipo-prueba.cloudflareaccess.com', aud: [AUD], iat: s, nbf: s, exp: s + 600, type: 'app', ...claims })
  return `${h}.${p}.${createSign('RSA-SHA256').update(`${h}.${p}`).sign(o.llave ?? privateKey).toString('base64url')}`
}
const EXPERTO = jwt({ email: 'experto@prueba.local' }), OTRO = jwt({ email: 'otro@prueba.local' }), LAB = jwt({ email: 'lab@prueba.local' })

const importa = (r: string) => import(pathToFileURL(join(RAIZ, r)).href)
const acceso = await importa('src/features/soporte-sap/mesa/services/acceso.ts')
const filtro = await importa('src/features/soporte-sap/mesa/services/filtro.ts')
const rt = await importa('src/features/soporte-sap/services/runtime.ts')
const { SESIONES } = await importa('src/features/soporte-sap/services/tipos.ts')
const { GET, POST } = await importa('src/app/api/mesa/soporte-sap/route.ts')
const { NextRequest } = await import('next/server')

type Paso = { clave: string; etapa: string; quien: string; titulo: string; tono: string }
type Caso = { id: string; incidencia: string; vivo: boolean; pasos: Paso[]; resultado: { tipo: string; regla: string | null }; planes: Array<{ aplicado: { errorDespues: boolean } | null; decision: unknown }>; sandbox: { veredicto: string } | null; propuestas: Array<{ tipo: string }>; ensenanza: Array<{ tipo: string | null }>; retro: { pasos: Record<string, { gesto: string }>; veredicto: { valor: string } | null } }
function pide(metodo: 'GET' | 'POST', consulta: string, token: string | null, cuerpo?: unknown, tipo = 'application/json') {
  const headers: Record<string, string> = token ? { 'cf-access-jwt-assertion': token } : {}
  if (cuerpo !== undefined) headers['content-type'] = tipo
  return new NextRequest(`http://mesa/api/mesa/soporte-sap${consulta}`, { method: metodo, headers, body: cuerpo === undefined ? undefined : typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) })
}
async function accion(token: string, cuerpo: unknown): Promise<{ status: number; caso: Caso; error?: string }> {
  const r = await POST(pide('POST', '', token, cuerpo))
  const d = (await r.json()) as { caso: Caso; error?: string }
  return { status: r.status, ...d }
}
const BASE = { transaccion: '', mensaje: '', sociedad: '', periodo: '', intento: '', muestras: [] as string[] }
const MIGO = { ...BASE, sistema: 'S4HANA', modulo: 'MM', transaccion: 'MIGO', mensaje: 'M7 053', sociedad: '1000', periodo: '2026/10', sintoma: 'Al contabilizar la entrada de mercancía en MIGO sale el mensaje M7 053: el periodo de MM no está abierto.' }
const FIORI = { ...BASE, sistema: 'S4HANA', modulo: 'Fiori', sintoma: 'Una app del launchpad de Fiori abre en blanco después del transporte de ayer, a todos los usuarios.' }
const NOMINA = { ...BASE, sistema: 'ECC', modulo: 'HCM', transaccion: 'PC00_M32_CALC', periodo: '2026/10', sintoma: 'El cálculo de la nómina de la quincena no calcula el ISR del empleado para el periodo.' }
const ingresa = async (entrada: unknown, token = EXPERTO) => accion(token, { tipo: 'ingresa', entrada })
const guardados = (): string[] => { try { return readdirSync(join(DIR, 'mesa', 'casos')).sort() } catch { return [] } }
const guardado = (id: string) => readFileSync(join(DIR, 'mesa', 'casos', `${id}.json`), 'utf8')

test('mesa · la identidad sale del JWT de Access verificado: firma, emisor, audiencia y vigencia; nadie la elige', async () => {
  const c = acceso.configDeAcceso(process.env)
  const llaves = acceso.llavesDeAccess(c.certs)
  const quien = (t: string) => acceso.identidadDeLaPeticion(new Request('http://mesa/', { headers: { 'cf-access-jwt-assertion': t } }), c, llaves)
  const e = await quien(jwt({ email: 'Experto@Prueba.local' }))
  assert.equal(e?.rol, 'experto'); assert.equal(e?.correo, 'experto@prueba.local'); assert.match(e!.usuario, /^n1-[0-9a-f]{10}$/)
  assert.equal((await quien(LAB))?.rol, 'laboratorio')
  assert.equal(await quien(jwt({ email: 'intruso@prueba.local' })), null, 'un correo fuera de las listas no entra, aunque Access lo dejara pasar')
  assert.equal(await quien(jwt({ email: 'experto@prueba.local' }, { llave: ajena.privateKey })), null, 'firmado con otra llave')
  assert.equal(await quien(jwt({ email: 'experto@prueba.local', aud: ['otra-aplicacion'] })), null, 'otra audiencia')
  assert.equal(await quien(jwt({ email: 'experto@prueba.local', iss: 'https://otro.cloudflareaccess.com' })), null, 'otro emisor')
  assert.equal(await quien(jwt({ email: 'experto@prueba.local', exp: Math.floor(Date.now() / 1000) - 1 })), null, 'vencido')
  assert.equal(await quien(jwt({ email: 'experto@prueba.local' }, { kid: 'otra' })), null, 'llave desconocida')
  const [, p] = EXPERTO.split('.')
  assert.equal(await quien(`${b64({ alg: 'none', kid: 'llave-1' })}.${p}.`), null, 'sin firma')
  assert.equal(await quien(`${b64({ alg: 'HS256', kid: 'llave-1' })}.${p}.${createHmac('sha256', 'x').update('y').digest('base64url')}`), null, 'HS256 no')
  const partes = EXPERTO.split('.')
  partes[1] = b64({ ...JSON.parse(Buffer.from(partes[1]!, 'base64url').toString()), email: 'lab@prueba.local' })
  assert.equal(await quien(partes.join('.')), null, 'cambiar el correo rompe la firma: nadie se vuelve laboratorio')
  const token = await quien(jwt({ common_name: 'automatizacion.access', sub: '' }))
  assert.equal(token?.rol, 'experto'); assert.equal(token?.prueba, true, 'el token de servicio entra de prueba')
  assert.equal(await quien(jwt({ common_name: 'otro-token.access', sub: '' })), null)
  for (const t of [EXPERTO, LAB]) assert.ok(['experto', 'laboratorio'].includes((await quien(t))!.rol), 'en la mesa no hay superadministrador')
})

test('mesa · sin un JWT válido la mesa no existe: 404 en GET y en POST, aunque el laboratorio esté encendido', async () => {
  for (const t of [null, 'basura', jwt({ email: 'experto@prueba.local' }, { llave: ajena.privateKey }), jwt({ email: 'intruso@prueba.local' })]) {
    assert.equal((await GET(pide('GET', '', t))).status, 404, `GET con ${String(t).slice(0, 12)}`)
    assert.equal((await POST(pide('POST', '', t, { tipo: 'revisa', campos: {} }))).status, 404, `POST con ${String(t).slice(0, 12)}`)
  }
  assert.equal((await GET(pide('GET', '', EXPERTO))).status, 200)
  const aud = process.env['ACCESS_AUD']
  delete process.env['ACCESS_AUD']
  assert.equal((await GET(pide('GET', '', EXPERTO))).status, 404, 'sin la configuración de Access, tampoco')
  process.env['ACCESS_AUD'] = aud
  process.env['SOPORTE_SAP_LABORATORIO'] = '0'
  assert.equal((await GET(pide('GET', '', EXPERTO))).status, 404, 'sin el laboratorio encendido, tampoco')
  process.env['SOPORTE_SAP_LABORATORIO'] = '1'
})

test('mesa · el filtro recorre todo texto de la acción: un campo nuevo o anidado tampoco se escapa', async () => {
  assert.match(filtro.datoPersonalEn({ uno: { dos: ['lo reportó juan.perez@empresa.com'] } }) ?? '', /forma de dato personal/)
  assert.match(filtro.datoPersonalEn({ campoQueNadieListo: 'llámale al 55 1234 5678' }) ?? '', /forma de dato personal/)
  assert.equal(filtro.datoPersonalEn({ campoNuevo: 'MIGO marca M7 053 en la sociedad 1000' }), null, 'el tema SAP no es un dato')
  const antes = guardados()
  for (const campo of ['sintoma', 'intento', 'mensaje']) {
    const r = await ingresa({ ...MIGO, [campo]: `${MIGO.sintoma} Me lo pasó juan.perez@empresa.com` })
    assert.equal(r.status, 400, campo); assert.match(r.error ?? '', /dato personal/)
    assert.doesNotMatch(r.error ?? '', /juan/, 'el motivo no repite el dato')
  }
  assert.deepEqual(guardados(), antes, 'y nada llegó al almacén')
})

test('mesa · la retro solo se guarda filtrada y en su almacén: un texto con forma de dato no llega al disco', async () => {
  const c = (await ingresa(MIGO)).caso
  const antes = guardado(c.id)
  const mal = await accion(EXPERTO, { tipo: 'retro_paso', caso: c.id, clave: c.pasos[0]!.clave, gesto: 'mal', esperaba: 'que le avisara a pedro.lopez@cliente.com' })
  assert.equal(mal.status, 400)
  const v = await accion(EXPERTO, { tipo: 'veredicto', caso: c.id, valor: 'incorrecto', solucion: 'llamar al 55 8765 4321 y pedir la clave', nota: '' })
  assert.equal(v.status, 400)
  assert.equal(guardado(c.id), antes, 'el caso guardado no cambió')
  const bien = await accion(EXPERTO, { tipo: 'retro_paso', caso: c.id, clave: c.pasos[0]!.clave, gesto: 'mal', esperaba: 'que pidiera la sociedad antes de buscar' })
  assert.equal(bien.status, 200)
  assert.match(guardado(c.id), /que pidiera la sociedad antes de buscar/, 'lo filtrado sí se guarda, en el almacén')
})

test('mesa · lo del laboratorio solo existe para su identidad: el experto recibe 404 y no ve casos ajenos', async () => {
  const c = (await ingresa(FIORI)).caso
  assert.equal((await GET(pide('GET', '?vista=laboratorio', EXPERTO))).status, 404)
  assert.equal((await GET(pide('GET', '?vista=laboratorio&export=md', EXPERTO))).status, 404)
  assert.equal((await GET(pide('GET', '?vista=laboratorio&export=json', EXPERTO))).status, 404)
  assert.equal((await POST(pide('POST', '?vista=laboratorio', EXPERTO, { tipo: 'borra', caso: c.id }))).status, 404)
  const lab = await GET(pide('GET', '?vista=laboratorio', LAB))
  assert.equal(lab.status, 200)
  assert.ok(((await lab.json()) as { casos: Caso[] }).casos.some((x) => x.id === c.id), 'el laboratorio sí lo lee')
  const otro = (await (await GET(pide('GET', '', OTRO))).json()) as { casos: Caso[] }
  assert.ok(!otro.casos.some((x) => x.id === c.id), 'otro experto no ve el caso')
  assert.match((await accion(OTRO, { tipo: 'veredicto', caso: c.id, valor: 'resuelto' })).error ?? '', /no es tuyo/, 'ni lo califica')
  assert.match(lee('src/app/mesa/soporte-sap/laboratorio/page.tsx'), /identidadDeLaPagina\('laboratorio'\)/, 'la página también pide la identidad del laboratorio')
})

test('mesa · no acepta archivos: solo las muestras del catálogo, por su nombre exacto', async () => {
  const f = new FormData(); f.set('adjuntos', new File(['x'], 'mio.png'))
  const cuerpo = new Response(f)
  const r = await POST(new NextRequest('http://mesa/api/mesa/soporte-sap', { method: 'POST', body: new Uint8Array(await cuerpo.arrayBuffer()), headers: { 'cf-access-jwt-assertion': EXPERTO, 'content-type': cuerpo.headers.get('content-type')! } }))
  assert.equal(r.status, 415)
  for (const m of ['../../../package.json', 'captura-inyeccion.png', 'CAPTURA-MIGO.PNG']) assert.equal((await ingresa({ ...MIGO, muestras: [m] })).status, 400, m)
  const ok = await ingresa({ ...FIORI, muestras: ['cfdi-rechazado.xml'] })
  assert.equal(ok.status, 200)
  assert.ok(ok.caso.pasos.some((p) => p.etapa === 'evidencia'), 'la muestra del catálogo sí se lee')
})

test('mesa · un caso conocido corre de punta a punta: la línea sale de la cadena, lo hecho en nombre del N3 y del N2 queda marcado, y el experto aprueba en la sala', async () => {
  const c = (await ingresa(MIGO)).caso
  assert.equal(c.resultado.tipo, 'solucion'); assert.equal(c.resultado.regla, 'SS-MM-PERIODO')
  const inc = rt.estado().incidencias.find((x: { id: string }) => x.id === c.incidencia) as { cadena: Array<{ seq: number; tipo: string; actor: string }> }
  for (const p of c.pasos) assert.ok(inc.cadena.some((e) => `${e.seq}:${e.tipo}` === p.clave), `${p.clave} es un evento de la cadena`)
  assert.deepEqual(['recibe', 'entiende', 'busca', 'plan', 'sala'].filter((x) => !c.pasos.some((p) => p.etapa === x)), [])
  assert.equal(c.pasos[0]!.quien, 'n3', 'lo levantó el experto en nombre del cliente')
  assert.ok(c.pasos.some((p) => p.quien === 'n2' && /escala/.test(p.titulo)), 'y lo escaló en nombre de la consultora')
  assert.ok(inc.cadena.some((e) => e.actor.endsWith('·en-nombre-del-N3')) && inc.cadena.some((e) => e.actor.endsWith('·en-nombre-del-N2')), 'la cadena lo dice')
  const d = await accion(EXPERTO, { tipo: 'decide', caso: c.id, accion: 'aprobar' })
  assert.equal(d.status, 200)
  assert.equal(d.caso.planes[0]!.aplicado?.errorDespues, false, 'el simulador ya no reproduce el síntoma')
  assert.ok(d.caso.pasos.some((p) => p.etapa === 'decide' && p.quien === 'tu'), 'la decisión es del experto')
  assert.ok(d.caso.pasos.some((p) => p.etapa === 'aplica' && p.tono === 'bien'))
  assert.doesNotMatch(JSON.stringify(inc.cadena), /experto@prueba\.local/, 'la cadena lleva un seudónimo, no el correo')
  assert.match((await accion(EXPERTO, { tipo: 'decide', caso: c.id, accion: 'aprobar' })).error ?? '', /no hay un plan esperando/, 'no se decide dos veces')
})

test('mesa · un caso sin regla dice «no lo sé», entra al sandbox y la enseñanza queda como propuesta a medida', async () => {
  const c = (await ingresa(FIORI)).caso
  assert.equal(c.resultado.tipo, 'sin_solucion'); assert.equal(c.sandbox?.veredicto, 'entra')
  const e = await accion(EXPERTO, { tipo: 'ensena', caso: c.id, texto: 'Aplica el cambio así: hay que limpiar la caché del launchpad con /UI2/INVALIDATE_GLOBAL_CACHES y volver a entrar' })
  assert.equal(e.status, 200)
  assert.equal(e.caso.ensenanza.at(-1)?.tipo, 'propuesta', 'un «aplica el cambio» dentro de una enseñanza no es pedir una aprobación')
  assert.deepEqual(e.caso.propuestas.map((p) => p.tipo).sort(), ['cli', 'regla'])
  const p = rt.estado().ensenanzas as Record<string, { alcance: string; estado: string }>
  assert.ok(Object.values(p).some((x) => x.alcance === 'a_medida' && x.estado === 'propuesta'), 'a medida, y propuesta: nadie la sembró')
})

test('mesa · un caso de nómina queda en cuarentena: no se enseña, y el veredicto sí se guarda', async () => {
  const c = (await ingresa(NOMINA)).caso
  assert.equal(c.sandbox?.veredicto, 'cuarentena')
  assert.match((await accion(EXPERTO, { tipo: 'ensena', caso: c.id, texto: 'hay que revisar la tabla de ISR del periodo en la nómina' })).error ?? '', /cuarentena/)
  const v = await accion(EXPERTO, { tipo: 'veredicto', caso: c.id, valor: 'resuelto', nota: 'bien que no lo aprenda' })
  assert.equal(v.status, 200); assert.equal(v.caso.retro.veredicto?.valor, 'resuelto')
})

test('mesa · la retro sobrevive a que se reinicie el laboratorio: el caso ya no vive, pero su línea y lo que dijo el experto siguen', async () => {
  const c = (await ingresa(MIGO)).caso
  await accion(EXPERTO, { tipo: 'retro_paso', caso: c.id, clave: c.pasos[1]!.clave, gesto: 'bien' })
  await accion(EXPERTO, { tipo: 'veredicto', caso: c.id, valor: 'parcial', solucion: 'también hay que revisar el periodo de FI con OB52' })
  rt.actua(SESIONES.superadmin, { tipo: 'reinicia' })
  const v = (await (await GET(pide('GET', '', EXPERTO))).json()) as { casos: Caso[] }
  const despues = v.casos.find((x) => x.id === c.id)!
  assert.equal(despues.vivo, false, 'tras el reinicio, el caso ya no vive en el laboratorio')
  assert.equal(despues.pasos.length, c.pasos.length, 'su línea se guardó')
  assert.equal(despues.retro.pasos[c.pasos[1]!.clave]?.gesto, 'bien'); assert.equal(despues.retro.veredicto?.valor, 'parcial')
  assert.match((await accion(EXPERTO, { tipo: 'decide', caso: c.id, accion: 'aprobar' })).error ?? '', /ya no vive/, 'y no se decide sobre otra incidencia con el mismo número')
})

test('mesa · lo guardado vence: con la retención, el caso viejo se borra al listar y el reciente se queda', async () => {
  const nuevo = (await ingresa(FIORI)).caso
  const viejo = { ...JSON.parse(guardado(nuevo.id)), id: 'c-viejo00-abcdef', actualizado: new Date(Date.now() - 200 * 86_400_000).toISOString() }
  writeFileSync(join(DIR, 'mesa', 'casos', 'c-viejo00-abcdef.json'), JSON.stringify(viejo))
  process.env['MESA_RETENCION_DIAS'] = '180'
  const v = (await (await GET(pide('GET', '', EXPERTO))).json()) as { casos: Caso[] }
  delete process.env['MESA_RETENCION_DIAS']
  assert.ok(!v.casos.some((c) => c.id === 'c-viejo00-abcdef'), 'el de hace 200 días ya no está')
  assert.ok(!guardados().includes('c-viejo00-abcdef.json'), 'y se borró del almacén')
  assert.ok(v.casos.some((c) => c.id === nuevo.id), 'el reciente se queda')
})
