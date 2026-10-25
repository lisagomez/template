/**
 * El laboratorio alojado en Cloudflare, sin Cloudflare: la puerta del Worker, las reglas que hornea el build de la
 * imagen, el candado del despliegue y el almacén S3, cada uno ejecutado. Lo que solo existe en la nube (Access delante,
 * el contenedor sin URL propia) se comprueba contra la URL alojada y queda en el informe del goal.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type IncomingMessage } from 'node:http'
import { generateKeyPairSync, createSign } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import type { AddressInfo } from 'node:net'
import { RAIZ, lee } from './_ayuda.ts'

const importa = (r: string) => import(pathToFileURL(join(RAIZ, r)).href)
const puerta = await importa('scripts/laboratorio-alojado/puerta.ts')
const candado = await importa('scripts/laboratorio-alojado/candado.mjs')
const almacen = await importa('src/features/soporte-sap/mesa/services/almacen.ts')
const config = await importa('next.config.ts')
const { getPathMatch } = createRequire(join(RAIZ, 'package.json'))('next/dist/shared/lib/router/utils/path-match') as {
  getPathMatch: (ruta: string, o: { removeUnnamedParams: boolean; strict: boolean }) => (p: string) => false | object
}
const casa = (source: string) => getPathMatch(source, { removeUnnamedParams: true, strict: true })

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const JWK = { ...publicKey.export({ format: 'jwk' }), kid: 'k1' }
const AUD = `aud-alojado-${'b'.repeat(24)}`
const ENV = { ACCESS_EQUIPO: 'equipo-prueba', ACCESS_AUD: AUD, MESA_EXPERTOS: 'experto@prueba.local', MESA_LABORATORIO: 'lab@prueba.local' }
const llaves = async (kid: string) => (kid === 'k1' ? (JWK as { kid: string; kty: string; n: string; e: string }) : null)
const b64 = (x: unknown) => Buffer.from(JSON.stringify(x)).toString('base64url')
function jwt(claims: Record<string, unknown>): string {
  const s = Math.floor(Date.now() / 1000)
  const h = b64({ alg: 'RS256', kid: 'k1' }), p = b64({ iss: 'https://equipo-prueba.cloudflareaccess.com', aud: [AUD], iat: s, exp: s + 300, ...claims })
  return `${h}.${p}.${createSign('RSA-SHA256').update(`${h}.${p}`).sign(privateKey).toString('base64url')}`
}
const EXPERTO = jwt({ email: 'experto@prueba.local' })
/** Lo que llega al contenedor, o `null` si no llegó nada. */
async function porLaPuerta(url: string, init: RequestInit = {}, env: Record<string, string> = ENV) {
  let llego: Request | null = null
  const r = await puerta.atiende(new Request(url, init), env, async (q: Request) => { llego = q; return new Response('del laboratorio') }, llaves)
  return { r, llego: llego as Request | null }
}

test('puerta · sin un JWT válido el Worker no pasa nada al contenedor: todo responde como si no existiera', async () => {
  for (const cabeceras of [{} as Record<string, string>, { 'cf-access-jwt-assertion': 'basura' }, { 'cf-access-jwt-assertion': jwt({ email: 'intruso@prueba.local' }) }, { 'cf-access-jwt-assertion': jwt({ email: 'experto@prueba.local', aud: ['otra'] }) }]) {
    for (const ruta of ['/mesa/soporte-sap', '/api/mesa/soporte-sap', '/']) {
      const { r, llego } = await porLaPuerta(`https://lab.workers.dev${ruta}`, { headers: cabeceras })
      assert.equal(r.status, 404, `${ruta}`); assert.equal(llego, null, `${ruta}: nada llega al contenedor`)
    }
  }
  const { r } = await porLaPuerta('https://lab.workers.dev/mesa/soporte-sap', { headers: { 'cf-access-jwt-assertion': EXPERTO } }, { ...ENV, ACCESS_AUD: '' })
  assert.equal(r.status, 404, 'sin la configuración de Access, tampoco')
  const ok = await porLaPuerta('https://lab.workers.dev/mesa/soporte-sap', { headers: { 'cf-access-jwt-assertion': EXPERTO } })
  assert.equal(ok.r.status, 200); assert.ok(ok.llego, 'con un JWT válido, sí')
})

test('puerta · solo pasan las rutas de la mesa, sin archivos ni credenciales de Access hacia el contenedor', async () => {
  const h = { 'cf-access-jwt-assertion': EXPERTO }
  for (const ruta of ['/api/soporte-sap?rol=superadmin', '/soporte-sap', '/vitrina/soporte-sap', '/api/a2a', '/_next/../api/soporte-sap', '/mesa/soporte-sap/otra'])
    assert.equal((await porLaPuerta(`https://lab.workers.dev${ruta}`, { headers: h })).llego, null, `${ruta} no pasa`)
  for (const ruta of ['/mesa/soporte-sap', '/mesa/soporte-sap/kit', '/mesa/soporte-sap/laboratorio', '/api/mesa/soporte-sap', '/_next/static/chunks/a.js'])
    assert.ok((await porLaPuerta(`https://lab.workers.dev${ruta}`, { headers: h })).llego, `${ruta} pasa`)
  const f = new FormData(); f.set('adjuntos', new File(['x'], 'mio.png'))
  const multi = new Response(f)
  const subida = await porLaPuerta('https://lab.workers.dev/api/mesa/soporte-sap', { method: 'POST', headers: { ...h, 'content-type': multi.headers.get('content-type')! }, body: await multi.arrayBuffer() })
  assert.equal(subida.r.status, 415); assert.equal(subida.llego, null, 'un archivo no llega al contenedor')
  const { llego } = await porLaPuerta('https://lab.workers.dev/api/mesa/soporte-sap', { method: 'POST', headers: { ...h, 'content-type': 'application/json', cookie: 'CF_Authorization=x', 'cf-access-client-secret': 'secreto-del-token', authorization: 'Bearer x' }, body: '{}' })
  assert.ok(llego)
  for (const k of ['cookie', 'cf-access-client-secret', 'authorization']) assert.equal(llego!.headers.get(k), null, `${k} no llega al contenedor`)
  assert.equal(llego!.headers.get('cf-access-jwt-assertion'), EXPERTO, 'el JWT sí, para que el contenedor lo verifique otra vez')
  assert.equal((await porLaPuerta('https://lab.workers.dev/api/mesa/soporte-sap', { method: 'DELETE', headers: h })).llego, null, 'otro método, no')
})

test('alojado · la imagen sirve solo la mesa: otra página lleva a ella y otra API, también /api/soporte-sap, da 404', () => {
  assert.deepEqual(config.reglasDelAlojado({}), { redirects: [], rewrites: [] }, 'sin LABORATORIO_ALOJADO no cambia nada')
  const { redirects, rewrites } = config.reglasDelAlojado({ LABORATORIO_ALOJADO: '1' })
  const pagina = casa(redirects[0].source), api = casa(rewrites[0].source)
  assert.equal(redirects[0].destination, '/mesa/soporte-sap')
  for (const p of ['/', '/soporte-sap', '/vitrina/soporte-sap', '/reel', '/laboratorio-voz']) assert.ok(pagina(p), `${p} lleva a la mesa`)
  for (const p of ['/mesa/soporte-sap', '/mesa/soporte-sap/kit', '/_next/static/x.js', '/manifest.json']) assert.equal(pagina(p), false, `${p} se sirve`)
  for (const p of ['/api/soporte-sap', '/api/vitrina/soporte-sap/en-vivo', '/api/a2a', '/api/dictado/movil']) assert.ok(api(p), `${p} no existe`)
  assert.equal(api('/api/mesa/soporte-sap'), false, 'la de la mesa, sí')
  assert.match(lee('scripts/laboratorio-alojado/Dockerfile'), /ENV NEXT_TELEMETRY_DISABLED=1 LABORATORIO_ALOJADO=1/, 'y el build de la imagen lo hornea')
})

test('alojado · LABORATORIO_ALOJADO no va con la vitrina ni a Vercel', () => {
  assert.throws(() => config.compruebaAlojado({ LABORATORIO_ALOJADO: '1', VITRINA_SOPORTE_SAP: '1' }), /no va con la vitrina/)
  assert.throws(() => config.compruebaAlojado({ LABORATORIO_ALOJADO: '1', VERCEL: '1' }), /no va con la vitrina/)
  assert.doesNotThrow(() => config.compruebaAlojado({ LABORATORIO_ALOJADO: '1' }))
})

const DOCKERFILE = lee('scripts/laboratorio-alojado/Dockerfile')
const BASE = candado.baseDelOcr(lee('tools/extractor-documental/servicio/Dockerfile'))
const WRANGLER = candado.jsonc(lee('scripts/laboratorio-alojado/wrangler.jsonc'))
const SCRIPTS = JSON.parse(lee('package.json')).scripts
const revisaD = (d: string) => candado.revisaDockerfile(d, BASE, lee('.dockerignore'), SCRIPTS) as string[]
const revisaW = (c: unknown) => candado.revisaWrangler(c) as string[]

test('candado · no sube con otra base, sin la guarda de .env, con secretos en vars, sin ubicación fijada, con SSH o con la etiqueta latest', () => {
  assert.ok(BASE?.includes('@sha256:'), 'la base del OCR está pineada por digest')
  assert.deepEqual(revisaD(DOCKERFILE), [], 'el Dockerfile del repo pasa')
  assert.deepEqual(revisaW(WRANGLER), [], 'la config del repo pasa')
  assert.ok(revisaD(DOCKERFILE.replace(BASE!, 'node:22-alpine')).length, 'otra base')
  assert.ok(revisaD(DOCKERFILE.replace(/RUN if find[^\n]*\n[^\n]*exit 1; fi\n/, '')).length, 'sin la guarda de .env')
  assert.ok(revisaD(DOCKERFILE.replace('LABORATORIO_ALOJADO=1', 'LABORATORIO_ALOJADO=0')).length, 'sin hornear lo alojado')
  const c = WRANGLER.containers[0]
  for (const [que, mal] of [
    ['un secreto en vars', { ...WRANGLER, vars: { ...WRANGLER.vars, MESA_S3_SECRETO: 'x' } }],
    ['sin ubicación', { ...WRANGLER, containers: [{ ...c, constraints: undefined }] }],
    ['fuera de Norteamérica', { ...WRANGLER, containers: [{ ...c, constraints: { regions: ['WEUR'] } }] }],
    ['con SSH', { ...WRANGLER, containers: [{ ...c, ssh: { enabled: true } }] }],
    ['dos instancias', { ...WRANGLER, containers: [{ ...c, max_instances: 2 }] }],
    ['la etiqueta latest', { ...WRANGLER, containers: [{ ...c, image: `registry.cloudflare.com/${'0'.repeat(32)}/soporte-sap-laboratorio:latest` }] }],
    ['vistas previas', { ...WRANGLER, preview_urls: true }],
    ['con registros', { ...WRANGLER, observability: { enabled: true } }],
  ] as const) assert.ok(revisaW(mal).length, que)
  const registro = { ...WRANGLER, containers: [{ ...c, image: `registry.cloudflare.com/${'0'.repeat(32)}/soporte-sap-laboratorio:417bc57a1b2c` }] }
  assert.deepEqual(revisaW(registro), [], 'la imagen del commit, en el registro, sí')
  const desplegable = (x: unknown) => candado.revisaWrangler(x, { desplegable: true }) as string[]
  assert.deepEqual(desplegable({ ...registro, vars: { ...registro.vars, ACCESS_EQUIPO: 'mi-equipo' } }), [], 'lo que sube: la imagen del commit y el equipo de Access')
  assert.ok(desplegable(registro).some((f) => /ACCESS_EQUIPO/.test(f)), 'sin el equipo de Access no sube')
  assert.ok(desplegable({ ...WRANGLER, vars: { ...WRANGLER.vars, ACCESS_EQUIPO: 'mi-equipo' } }).some((f) => /imagen del commit/.test(f)), 'ni con una imagen que wrangler construya por su cuenta')
  const dir = mkdtempSync(join(tmpdir(), 'candado-'))
  writeFileSync(join(dir, '.dev.vars'), 'X=1'); writeFileSync(join(dir, 'wrangler.jsonc'), '{}')
  assert.deepEqual(candado.envEnLaCarpeta(dir), ['.dev.vars'], 'wrangler leería un .dev.vars')
  rmSync(dir, { recursive: true, force: true })
})

test('candado · la imagen construida no lleva .env, código del repo ni secretos horneados', () => {
  const limpia = { tag: 'soporte-sap-laboratorio:417bc57a1b2c', archivos: ['/app/server.js', '/app/tools/soporte-sap/documentos/captura-migo.png'], entorno: ['PORT=8080', 'SOPORTE_SAP_LABORATORIO=1'] }
  assert.deepEqual(candado.revisaImagenConstruida(limpia), [])
  for (const [que, mal] of [
    ['latest', { ...limpia, tag: 'soporte-sap-laboratorio:latest' }],
    ['un .env', { ...limpia, archivos: [...limpia.archivos, '/app/.env.production'] }],
    ['un .env escondido', { ...limpia, archivos: [...limpia.archivos, '/app/tools/x/.env.local'] }],
    ['el código', { ...limpia, archivos: [...limpia.archivos, '/app/src/features/soporte-sap/services/runtime.ts'] }],
    ['un secreto horneado', { ...limpia, entorno: [...limpia.entorno, 'MESA_S3_SECRETO=x'] }],
    ['la lista de expertos horneada', { ...limpia, entorno: [...limpia.entorno, 'MESA_EXPERTOS=a@b.c'] }],
  ] as const) assert.ok((candado.revisaImagenConstruida(mal) as string[]).length, que)
})

test('candado · después de subir, sin sesión de Access la mesa no abre', async () => {
  const responde = (status: number, location?: string) => (async () => new Response(null, { status, headers: location ? { location } : {} })) as typeof fetch
  assert.equal((await candado.accessPuesto('https://lab.workers.dev', responde(302, 'https://equipo.cloudflareaccess.com/cdn-cgi/access/login/x'))).puesto, true)
  assert.equal((await candado.accessPuesto('https://lab.workers.dev', responde(403))).puesto, true)
  assert.equal((await candado.accessPuesto('https://lab.workers.dev', responde(200))).puesto, false, 'si la mesa contesta, Access no está')
  assert.equal((await candado.accessPuesto('https://lab.workers.dev', responde(404))).puesto, false, 'un 404 no prueba que haya Access delante')
  assert.equal((await candado.accessPuesto('https://lab.workers.dev', responde(302, 'https://otro.example/login'))).puesto, false)
})

test('almacén · SigV4 da la firma del ejemplo publicado por AWS', () => {
  // El ejemplo «GET Object» de la documentación de SigV4 de AWS (sig-v4-header-based-auth). Llave y firma son las
  // PÚBLICAS de ese ejemplo, no secretos; van partidas porque `audita:secretos` trata un AKIA… o un hex de 64 como una llave.
  const h = almacen.firmaSigV4({ metodo: 'GET', url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'), cabeceras: { Range: 'bytes=0-9' }, cuerpo: '', region: 'us-east-1',
    llave: 'AKIA' + 'IOSFODNN7EXAMPLE', secreto: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', instante: new Date('2013-05-24T00:00:00Z') })
  assert.match(h['authorization']!, /SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, /)
  assert.equal(h['authorization']!.split('Signature=')[1], 'f0e8bdb87c964420e857bd35b5d6ed31' + '0bd44f0170aba48dd91039c6036bdb41')
})

test('almacén · el S3 guarda, lee, lista y borra, y firma cada petición', async () => {
  const objetos = new Map<string, string>()
  const sinFirma: string[] = []
  const cuerpo = (q: IncomingMessage) => new Promise<string>((ok) => { let t = ''; q.on('data', (d) => { t += d }); q.on('end', () => ok(t)) })
  const s3 = createServer(async (q, r) => {
    if (!/^AWS4-HMAC-SHA256 Credential=llave-de-prueba\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]+$/.test(q.headers.authorization ?? '')) { sinFirma.push(q.url ?? ''); r.writeHead(403); r.end(); return }
    const u = new URL(q.url!, 'http://s3'), clave = decodeURIComponent(u.pathname.replace(/^\/cubeta\/?/, ''))
    if (q.method === 'PUT') { objetos.set(clave, await cuerpo(q)); r.writeHead(200); r.end(); return }
    if (q.method === 'DELETE') { objetos.delete(clave); r.writeHead(204); r.end(); return }
    if (u.searchParams.get('list-type') === '2') { const p = u.searchParams.get('prefix') ?? ''; r.writeHead(200, { 'content-type': 'application/xml' }); r.end(`<ListBucketResult>${[...objetos.keys()].filter((k) => k.startsWith(p)).map((k) => `<Contents><Key>${k}</Key></Contents>`).join('')}<IsTruncated>false</IsTruncated></ListBucketResult>`); return }
    const v = objetos.get(clave); r.writeHead(v === undefined ? 404 : 200); r.end(v ?? '')
  })
  await new Promise<void>((ok) => s3.listen(0, '127.0.0.1', ok))
  after(() => s3.close())
  const a = almacen.almacenS3({ endpoint: `http://127.0.0.1:${(s3.address() as AddressInfo).port}`, bucket: 'cubeta', region: 'auto', llave: 'llave-de-prueba', secreto: 'secreto-de-prueba' })
  await a.escribe('mesa/casos/c-1.json', '{"a":1}'); await a.escribe('mesa/casos/c-2.json', '{"a":2}'); await a.escribe('otra/x.json', '{}')
  assert.equal(await a.lee('mesa/casos/c-1.json'), '{"a":1}')
  assert.equal(await a.lee('mesa/casos/no-existe.json'), null)
  assert.deepEqual((await a.lista('mesa/casos')).sort(), ['mesa/casos/c-1.json', 'mesa/casos/c-2.json'])
  await a.borra('mesa/casos/c-1.json')
  assert.deepEqual(await a.lista('mesa/casos'), ['mesa/casos/c-2.json'])
  assert.deepEqual(sinFirma, [], 'cada petición iba firmada')
  await assert.rejects(a.escribe('../fuera.json', 'x'), /clave de almacén no válida/)
})

test('almacén · sin configuración no hay almacén: la mesa no abre en vez de perder la retro', () => {
  assert.match(almacen.almacenDeEntorno({}) as string, /falta MESA_ALMACEN/)
  assert.match(almacen.almacenDeEntorno({ MESA_ALMACEN: 's3', MESA_S3_ENDPOINT: 'https://x.r2.cloudflarestorage.com', MESA_S3_BUCKET: 'b' }) as string, /faltan MESA_S3_LLAVE, MESA_S3_SECRETO/)
  assert.match(almacen.almacenDeEntorno({ MESA_ALMACEN: 's3', MESA_S3_ENDPOINT: 'http://otra.example', MESA_S3_BUCKET: 'b', MESA_S3_LLAVE: 'l', MESA_S3_SECRETO: 's' }) as string, /https/)
  assert.equal(typeof almacen.almacenDeEntorno({ MESA_ALMACEN: 'disco', MESA_ALMACEN_DIR: '/tmp/x' }), 'object')
})
