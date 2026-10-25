/**
 * La identidad de la mesa del experto. La da Cloudflare Access: la persona entra con su correo y un PIN de un solo uso
 * (o la automatización, con un token de servicio de prueba), y Access manda la prueba firmada en `Cf-Access-Jwt-Assertion`.
 * La verifican la puerta (el Worker) y el laboratorio, cada uno por su cuenta: la firma RS256 con las llaves del equipo,
 * el emisor, la audiencia y la vigencia. Nadie elige su identidad: el rol sale del correo, de las listas que pone el
 * laboratorio, y un correo que no está en ellas no entra. Sin un JWT válido, la mesa no existe.
 *
 * Sin dependencias y con Web Crypto: el mismo código corre en el Worker y en Node.
 */
export const CABECERA_ACCESO = 'cf-access-jwt-assertion'
/** La mesa no tiene superadministrador: el experto prueba y el laboratorio lee lo que dijo. */
export type RolMesa = 'experto' | 'laboratorio'
export interface IdentidadMesa {
  /** El correo verificado por Access, o `token de prueba` si entró la automatización. */
  readonly correo: string
  readonly rol: RolMesa
  /** Entró con un token de servicio: sus casos se marcan de prueba, aparte de los del experto. */
  readonly prueba: boolean
  /** Un seudónimo estable para la cadena de eventos: el correo no viaja en ella. */
  readonly usuario: string
}
export interface ConfigAcceso {
  readonly equipo: string
  readonly aud: string
  readonly expertos: readonly string[]
  readonly laboratorio: readonly string[]
  /** Tokens de servicio de prueba: su Client ID y el rol con el que entra la automatización. */
  readonly tokens: Readonly<Record<string, RolMesa>>
  readonly certs: string
}
export interface Jwk { readonly kid: string; readonly kty: string; readonly n: string; readonly e: string; readonly alg?: string }
export type Llaves = (kid: string) => Promise<Jwk | null>
type Entorno = Readonly<Record<string, string | undefined>>
export type Verificado = { readonly ok: true; readonly claims: Readonly<Record<string, unknown>> } | { readonly ok: false; readonly motivo: string }

const EQUIPO = /^[a-z0-9][a-z0-9-]{0,62}$/
const MAXIMO_DEL_TOKEN = 8192
/** Lo que se tolera de desfase de reloj en `nbf` e `iat`. `exp` no se estira. */
const HOLGURA_S = 30
const LOCALES = new Set(['127.0.0.1', 'localhost', 'host.docker.internal'])
const lista = (x: string | undefined): string[] => (x ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)

/**
 * La configuración, del entorno. Devuelve el motivo si falta algo: sin equipo, audiencia y al menos un correo, la mesa no
 * arranca (falla cerrada). `ACCESS_CERTS_URL` solo cambia de dónde salen las llaves para probar en esta máquina.
 */
export function configDeAcceso(env: Entorno): ConfigAcceso | string {
  const equipo = (env['ACCESS_EQUIPO'] ?? '').trim().toLowerCase()
  const aud = (env['ACCESS_AUD'] ?? '').trim()
  if (!EQUIPO.test(equipo)) return 'falta ACCESS_EQUIPO (el nombre del equipo de Zero Trust)'
  if (aud.length < 16) return 'falta ACCESS_AUD (la audiencia de la aplicación de Access)'
  const expertos = lista(env['MESA_EXPERTOS']), laboratorio = lista(env['MESA_LABORATORIO'])
  const tokens: Record<string, RolMesa> = {}
  for (const par of lista(env['MESA_TOKENS'])) {
    const [id, rol] = par.split('=')
    if (!id || (rol !== 'experto' && rol !== 'laboratorio')) return `MESA_TOKENS mal escrito: «id=experto» o «id=laboratorio», separados por comas`
    tokens[id] = rol
  }
  if (!expertos.length && !laboratorio.length && !Object.keys(tokens).length) return 'no hay nadie en MESA_EXPERTOS ni en MESA_LABORATORIO'
  const propio = env['ACCESS_CERTS_URL']
  let certs = `https://${equipo}.cloudflareaccess.com/cdn-cgi/access/certs`
  if (propio) {
    let u: URL
    try { u = new URL(propio) } catch { return 'ACCESS_CERTS_URL no es una URL' }
    if (!LOCALES.has(u.hostname)) return 'ACCESS_CERTS_URL solo apunta a esta máquina: en lo alojado, las llaves son las del equipo'
    certs = u.href
  }
  return { equipo, aud, expertos, laboratorio, tokens, certs }
}

const b64url = (s: string): Uint8Array<ArrayBuffer> => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}
const json = (s: string): unknown => JSON.parse(new TextDecoder().decode(b64url(s)))
const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/** Firma, emisor, audiencia y vigencia. Cualquier duda es un no. */
export async function verificaJwt(token: string, c: ConfigAcceso, llaves: Llaves, ahora: number = Date.now()): Promise<Verificado> {
  if (!token || token.length > MAXIMO_DEL_TOKEN) return { ok: false, motivo: 'sin token' }
  const partes = token.split('.')
  if (partes.length !== 3) return { ok: false, motivo: 'no es un JWT' }
  let cabecera: unknown, claims: unknown
  try { cabecera = json(partes[0]!); claims = json(partes[1]!) } catch { return { ok: false, motivo: 'JWT ilegible' } }
  if (!esObjeto(cabecera) || cabecera['alg'] !== 'RS256' || typeof cabecera['kid'] !== 'string') return { ok: false, motivo: 'algoritmo o llave no admitidos' }
  const jwk = await llaves(cabecera['kid'])
  if (!jwk || jwk.kty !== 'RSA') return { ok: false, motivo: 'llave desconocida' }
  const llave = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const firmado = new TextEncoder().encode(`${partes[0]}.${partes[1]}`)
  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', llave, b64url(partes[2]!), firmado))) return { ok: false, motivo: 'firma inválida' }
  if (!esObjeto(claims)) return { ok: false, motivo: 'claims ilegibles' }
  return vigente(claims, c, Math.floor(ahora / 1000))
}

function vigente(claims: Record<string, unknown>, c: ConfigAcceso, s: number): Verificado {
  if (claims['iss'] !== `https://${c.equipo}.cloudflareaccess.com`) return { ok: false, motivo: 'otro emisor' }
  const aud = claims['aud']
  if (!(Array.isArray(aud) ? aud.includes(c.aud) : aud === c.aud)) return { ok: false, motivo: 'otra audiencia' }
  const exp = claims['exp'], nbf = claims['nbf'], iat = claims['iat']
  if (typeof exp !== 'number' || exp <= s) return { ok: false, motivo: 'vencido' }
  if (typeof nbf === 'number' && nbf > s + HOLGURA_S) return { ok: false, motivo: 'todavía no vale' }
  if (typeof iat === 'number' && iat > s + HOLGURA_S) return { ok: false, motivo: 'emitido en el futuro' }
  if (claims['type'] !== undefined && claims['type'] !== 'app') return { ok: false, motivo: 'no es un token de aplicación' }
  return { ok: true, claims }
}

async function seudonimo(correo: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`mesa-soporte-sap:${correo}`)))
  return `n1-${[...h.slice(0, 5)].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

/**
 * El rol, de las listas del laboratorio: un correo en las dos es del laboratorio. Un token de servicio entra con el rol que
 * se le dio, y de prueba. Lo que no está en ninguna lista no entra, aunque Access lo haya dejado pasar.
 */
export async function identidadDe(claims: Readonly<Record<string, unknown>>, c: ConfigAcceso): Promise<IdentidadMesa | null> {
  const correo = typeof claims['email'] === 'string' ? claims['email'].trim().toLowerCase() : ''
  if (correo) {
    const rol: RolMesa | null = c.laboratorio.includes(correo) ? 'laboratorio' : c.expertos.includes(correo) ? 'experto' : null
    return rol ? { correo, rol, prueba: false, usuario: await seudonimo(correo) } : null
  }
  const cn = typeof claims['common_name'] === 'string' ? claims['common_name'].trim().toLowerCase() : ''
  const rol = cn ? c.tokens[cn] : undefined
  return rol ? { correo: 'token de prueba', rol, prueba: true, usuario: await seudonimo(`token:${cn}`) } : null
}

/** Las llaves del equipo, con caché: se vuelven a pedir cada 10 minutos o ante una llave nueva (Access rota cada 6 semanas). */
export function llavesDeAccess(url: string, consulta: typeof fetch = fetch, reloj: () => number = Date.now): Llaves {
  let cache: { llaves: Jwk[]; hasta: number; pedidas: number } | null = null
  const pide = async (): Promise<Jwk[]> => {
    const r = await consulta(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
    if (!r.ok) return []
    const d = (await r.json()) as { keys?: unknown }
    return Array.isArray(d.keys) ? d.keys.filter((k): k is Jwk => esObjeto(k) && typeof k['kid'] === 'string' && typeof k['n'] === 'string' && typeof k['e'] === 'string') : []
  }
  return async (kid) => {
    const t = reloj()
    const conocida = cache && cache.hasta > t ? cache.llaves.find((k) => k.kid === kid) : undefined
    if (conocida) return conocida
    if (cache && cache.hasta > t && t - cache.pedidas < 30_000) return null
    try { cache = { llaves: await pide(), hasta: t + 600_000, pedidas: t } } catch { return null }
    return cache.llaves.find((k) => k.kid === kid) ?? null
  }
}

/** De una petición a su identidad: el JWT de la cabecera, verificado, y el rol de las listas. `null` es «no existe». */
export async function identidadDeLaPeticion(req: Request, c: ConfigAcceso, llaves: Llaves, ahora?: number): Promise<IdentidadMesa | null> {
  const v = await verificaJwt(req.headers.get(CABECERA_ACCESO) ?? '', c, llaves, ahora)
  return v.ok ? identidadDe(v.claims, c) : null
}
