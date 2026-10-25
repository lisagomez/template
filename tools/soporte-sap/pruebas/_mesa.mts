/**
 * Lo común a las pruebas de la mesa del experto: la app de Next cargada desde la raíz, llaves RSA de verdad (generadas
 * aquí) servidas como JWKS, el entorno de la mesa con el almacén en disco y JWT firmados como los de Access.
 */
import { after } from 'node:test'
import { register } from 'node:module'
import { createServer } from 'node:http'
import { generateKeyPairSync, createSign } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AddressInfo } from 'node:net'
import { RAIZ } from './_ayuda.ts'

register('./_app.mjs', import.meta.url)
// La app corre desde la raíz del repo (las muestras y el lector de OCR se leen de ahí).
process.chdir(RAIZ)
export const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
export const ajena = generateKeyPairSync('rsa', { modulusLength: 2048 })
const JWK = { ...publicKey.export({ format: 'jwk' }), kid: 'llave-1', alg: 'RS256', use: 'sig' }
const servidor = createServer((_q, r) => { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ keys: [JWK] })) })
await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok))
export const DIR = mkdtempSync(join(tmpdir(), 'mesa-experto-'))
export const AUD = `aud-de-prueba-${'a'.repeat(24)}`
Object.assign(process.env, {
  SOPORTE_SAP_LABORATORIO: '1', ACCESS_EQUIPO: 'equipo-prueba', ACCESS_AUD: AUD, ACCESS_CERTS_URL: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/certs`,
  MESA_EXPERTOS: 'experto@prueba.local,otro@prueba.local', MESA_LABORATORIO: 'lab@prueba.local', MESA_TOKENS: 'automatizacion.access=experto', MESA_ALMACEN: 'disco', MESA_ALMACEN_DIR: DIR,
})
delete process.env['TESSERACT_CMD']
after(() => { servidor.close(); rmSync(DIR, { recursive: true, force: true }) })

export const b64 = (x: unknown) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url')
export function jwt(claims: Record<string, unknown>, o: { llave?: typeof privateKey; kid?: string } = {}): string {
  const s = Math.floor(Date.now() / 1000)
  const h = b64({ alg: 'RS256', kid: o.kid ?? 'llave-1', typ: 'JWT' })
  const p = b64({ iss: 'https://equipo-prueba.cloudflareaccess.com', aud: [AUD], iat: s, nbf: s, exp: s + 600, type: 'app', ...claims })
  return `${h}.${p}.${createSign('RSA-SHA256').update(`${h}.${p}`).sign(o.llave ?? privateKey).toString('base64url')}`
}
export const EXPERTO = jwt({ email: 'experto@prueba.local' }), OTRO = jwt({ email: 'otro@prueba.local' }), LAB = jwt({ email: 'lab@prueba.local' })

export const importa = (r: string) => import(pathToFileURL(join(RAIZ, r)).href)
export const acceso = await importa('src/features/soporte-sap/mesa/services/acceso.ts')
export const filtro = await importa('src/features/soporte-sap/mesa/services/filtro.ts')
export const rt = await importa('src/features/soporte-sap/services/runtime.ts')
export const { SESIONES } = await importa('src/features/soporte-sap/services/tipos.ts')
export const { GET, POST } = await importa('src/app/api/mesa/soporte-sap/route.ts')
export const { NextRequest } = await import('next/server')

export function pide(metodo: 'GET' | 'POST', consulta: string, token: string | null, cuerpo?: unknown, tipo = 'application/json') {
  const headers: Record<string, string> = token ? { 'cf-access-jwt-assertion': token } : {}
  if (cuerpo !== undefined) headers['content-type'] = tipo
  return new NextRequest(`http://mesa/api/mesa/soporte-sap${consulta}`, { method: metodo, headers, body: cuerpo === undefined ? undefined : typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) })
}
