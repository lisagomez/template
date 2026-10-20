/**
 * Una identidad de Access DE PRUEBA, para correr la mesa en esta máquina (con `npm run dev` o con `docker run`) por el
 * MISMO camino que en Cloudflare: un JWT RS256 firmado y verificado contra unas llaves. Aquí las llaves son locales: se
 * generan una vez en `dir` (permisos 600), se sirven en 127.0.0.1 y la app las lee por `ACCESS_CERTS_URL`, que solo
 * admite esta máquina. Nada de esto sirve contra la mesa alojada: allá las llaves son las del equipo de Access.
 */
import { createServer } from 'node:http'
import { createSign, generateKeyPairSync, createPrivateKey, createPublicKey, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const EQUIPO_LOCAL = 'prueba-local'

/** Las llaves y la audiencia de la prueba local: las mismas en cada corrida, para que la caché de la app no se confunda. */
export function identidadLocal(dir) {
  const ruta = join(dir, 'identidad-local.json')
  if (!existsSync(ruta)) {
    mkdirSync(dir, { recursive: true })
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    writeFileSync(ruta, JSON.stringify({ privada: privateKey.export({ format: 'pem', type: 'pkcs8' }), aud: `local-${randomBytes(16).toString('hex')}`, kid: `local-${randomBytes(4).toString('hex')}` }), { mode: 0o600 })
  }
  const d = JSON.parse(readFileSync(ruta, 'utf8'))
  const privada = createPrivateKey(d.privada)
  // Solo la parte pública: de la privada no sale nada.
  const jwks = { keys: [{ ...createPublicKey(privada).export({ format: 'jwk' }), kid: d.kid, alg: 'RS256', use: 'sig' }] }
  const b64 = (x) => Buffer.from(JSON.stringify(x)).toString('base64url')
  /** Un JWT como el de Access: `email` para una persona, `common_name` para un token de servicio. */
  const firma = (claims, segundos = 3600) => {
    const s = Math.floor(Date.now() / 1000)
    const h = b64({ alg: 'RS256', kid: d.kid, typ: 'JWT' })
    const p = b64({ iss: `https://${EQUIPO_LOCAL}.cloudflareaccess.com`, aud: [d.aud], iat: s, nbf: s, exp: s + segundos, type: 'app', ...claims })
    return `${h}.${p}.${createSign('RSA-SHA256').update(`${h}.${p}`).sign(privada).toString('base64url')}`
  }
  return { aud: d.aud, jwks, firma }
}

/** Sirve las llaves públicas en `http://<host>:<puerto>/certs`. */
export function sirveLlaves(jwks, puerto, host = '127.0.0.1') {
  const limpio = JSON.stringify(jwks)
  return new Promise((ok) => {
    const s = createServer((req, res) => {
      if (req.url !== '/certs') { res.writeHead(404); res.end(); return }
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(limpio)
    }).listen(puerto, host, () => ok(s))
  })
}

/** Las variables con las que arranca la app para esta identidad local (sin secretos: la llave privada no sale de `dir`). */
export const entornoLocal = (aud, certs) => ({ ACCESS_EQUIPO: EQUIPO_LOCAL, ACCESS_AUD: aud, ACCESS_CERTS_URL: certs, MESA_EXPERTOS: 'experto@prueba.local', MESA_LABORATORIO: 'laboratorio@prueba.local' })

/**
 * Uso: node scripts/laboratorio-alojado/identidad-local.mjs <carpeta> <url de las llaves> [almacén en disco]
 * Escribe `<carpeta>/app.env` (600) con lo que la app necesita para la identidad local y un almacén en disco.
 */
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const [dir, certs, almacen] = process.argv.slice(2)
  if (!dir || !certs) { console.error('uso: identidad-local.mjs <carpeta> <url de las llaves> [carpeta del almacén]'); process.exit(2) }
  const id = identidadLocal(dir)
  const env = { ...entornoLocal(id.aud, certs), SOPORTE_SAP_LABORATORIO: '1', ...(almacen ? { MESA_ALMACEN: 'disco', MESA_ALMACEN_DIR: almacen } : {}) }
  writeFileSync(join(dir, 'app.env'), Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 })
  console.log(`✓ ${join(dir, 'app.env')}: ${Object.keys(env).length} variables (identidad de prueba local; las llaves, en ${join(dir, 'identidad-local.json')})`)
}
