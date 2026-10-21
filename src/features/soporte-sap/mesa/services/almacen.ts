/**
 * Dónde vive la retroalimentación del experto: FUERA del contenedor, porque su disco es efímero (en Cloudflare, al
 * dormirse arranca con un disco nuevo de la imagen). Una interfaz pequeña de objetos con dos implementaciones:
 *
 *   · `disco`: una carpeta (en esta máquina, o un volumen de `docker run`);
 *   · `s3`: la API S3, que hablan R2, Backblaze B2, MinIO y AWS. La imagen no queda atada a un proveedor.
 *
 * Sin la configuración, no hay almacén y la mesa no arranca: perder la retro en silencio sería peor que no abrir.
 */
import { createHash, createHmac } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'

export interface Almacen {
  readonly tipo: 'disco' | 's3'
  /** Dónde está, en palabras (sin llaves): para la pantalla del laboratorio. */
  readonly donde: string
  lee(clave: string): Promise<string | null>
  escribe(clave: string, contenido: string): Promise<void>
  borra(clave: string): Promise<void>
  lista(prefijo: string): Promise<string[]>
}
type Entorno = Readonly<Record<string, string | undefined>>

/** Una clave es una ruta de objeto sencilla: letras, cifras, guiones, puntos y `/`, sin `..`. */
const CLAVE = /^(?!.*\.\.)[a-z0-9][a-z0-9._/-]{0,200}$/
const valida = (clave: string): string => { if (!CLAVE.test(clave)) throw new Error('clave de almacén no válida'); return clave }

export function almacenEnDisco(dir: string): Almacen {
  const ruta = (clave: string) => join(/*turbopackIgnore: true*/ dir, ...valida(clave).split('/'))
  return {
    tipo: 'disco', donde: 'una carpeta de esta máquina',
    async lee(clave) { try { return await readFile(ruta(clave), 'utf8') } catch { return null } },
    async escribe(clave, contenido) {
      const r = ruta(clave)
      await mkdir(join(r, '..'), { recursive: true })
      // Escribir y renombrar: un corte a la mitad no deja un JSON a medias.
      await writeFile(`${r}.tmp`, contenido, 'utf8')
      await rename(`${r}.tmp`, r)
    },
    async borra(clave) { await rm(ruta(clave), { force: true }) },
    async lista(prefijo) {
      const base = ruta(valida(prefijo.replace(/\/$/, '')))
      try { return (await readdir(base)).filter((f) => !f.endsWith('.tmp')).map((f) => `${prefijo.replace(/\/$/, '')}/${f}`) } catch { return [] }
    },
  }
}

export interface ConfigS3 { readonly endpoint: string; readonly bucket: string; readonly region: string; readonly llave: string; readonly secreto: string }

const sha256 = (x: string | Uint8Array) => createHash('sha256').update(x).digest('hex')
const hmac = (k: string | Buffer, x: string) => createHmac('sha256', k).update(x).digest()
const codifica = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

/**
 * La firma SigV4 de una petición S3 (cabeceras), como la documenta AWS: la petición canónica, la cadena a firmar y la
 * llave derivada por fecha, región y servicio. La prueba la compara con el ejemplo publicado por AWS.
 */
export function firmaSigV4(p: { metodo: string; url: URL; cabeceras: Record<string, string>; cuerpo: string; region: string; llave: string; secreto: string; instante: Date }): Record<string, string> {
  const fecha = p.instante.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const dia = fecha.slice(0, 8)
  const huella = sha256(p.cuerpo)
  const cab: Record<string, string> = { ...Object.fromEntries(Object.entries(p.cabeceras).map(([k, v]) => [k.toLowerCase(), v.trim()])), host: p.url.host, 'x-amz-content-sha256': huella, 'x-amz-date': fecha }
  const nombres = Object.keys(cab).sort()
  const consulta = [...p.url.searchParams.entries()].map(([k, v]) => [codifica(k), codifica(v)] as const).sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&')
  const ruta = p.url.pathname.split('/').map((s) => codifica(decodeURIComponent(s))).join('/')
  const canonica = [p.metodo, ruta, consulta, nombres.map((n) => `${n}:${cab[n]}\n`).join(''), nombres.join(';'), huella].join('\n')
  const ambito = `${dia}/${p.region}/s3/aws4_request`
  const aFirmar = ['AWS4-HMAC-SHA256', fecha, ambito, sha256(canonica)].join('\n')
  const llave = hmac(hmac(hmac(hmac(`AWS4${p.secreto}`, dia), p.region), 's3'), 'aws4_request')
  const firma = createHmac('sha256', llave).update(aFirmar).digest('hex')
  return { ...cab, authorization: `AWS4-HMAC-SHA256 Credential=${p.llave}/${ambito}, SignedHeaders=${nombres.join(';')}, Signature=${firma}` }
}

export function almacenS3(c: ConfigS3, consulta: typeof fetch = fetch, reloj: () => Date = () => new Date()): Almacen {
  const pide = async (metodo: string, clave: string, cuerpo = '', params: Record<string, string> = {}) => {
    const url = new URL(`${c.endpoint.replace(/\/$/, '')}/${c.bucket}/${clave}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    const extra: Record<string, string> = cuerpo ? { 'content-type': 'application/json' } : {}
    const headers = firmaSigV4({ metodo, url, cabeceras: extra, cuerpo, region: c.region, llave: c.llave, secreto: c.secreto, instante: reloj() })
    delete headers['host']
    return consulta(url, { method: metodo, headers, body: cuerpo || undefined, signal: AbortSignal.timeout(15_000) })
  }
  const exige = async (r: Response, que: string) => { if (!r.ok) throw new Error(`el almacén S3 respondió ${r.status} al ${que}`) }
  return {
    // En R2, el host empieza por el id de la cuenta: la pantalla (también la del experto) no lo necesita.
    tipo: 's3', donde: `un bucket S3 (${new URL(c.endpoint).host.replace(/^[0-9a-f]{32}\./, '…')}/${c.bucket})`,
    async lee(clave) { const r = await pide('GET', valida(clave)); if (r.status === 404) return null; await exige(r, 'leer'); return r.text() },
    async escribe(clave, contenido) { await exige(await pide('PUT', valida(clave), contenido), 'escribir') },
    async borra(clave) { const r = await pide('DELETE', valida(clave)); if (r.status !== 404) await exige(r, 'borrar') },
    async lista(prefijo) {
      const claves: string[] = []
      let sigue: string | null = null
      do {
        const r = await pide('GET', '', '', { 'list-type': '2', prefix: valida(prefijo.replace(/\/$/, '')) + '/', ...(sigue ? { 'continuation-token': sigue } : {}) })
        await exige(r, 'listar')
        const xml = await r.text()
        claves.push(...[...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]!.replace(/&amp;/g, '&')))
        sigue = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? (/<NextContinuationToken>([^<]+)</.exec(xml)?.[1] ?? null) : null
      } while (sigue)
      return claves
    },
  }
}

/** El almacén que dice el entorno, o el motivo por el que no hay. Nunca imprime una llave: solo dice si falta. */
export function almacenDeEntorno(env: Entorno): Almacen | string {
  const tipo = env['MESA_ALMACEN']
  if (tipo === 'disco') return env['MESA_ALMACEN_DIR'] ? almacenEnDisco(env['MESA_ALMACEN_DIR']) : 'falta MESA_ALMACEN_DIR'
  if (tipo === 's3') {
    const faltan = ['MESA_S3_ENDPOINT', 'MESA_S3_BUCKET', 'MESA_S3_LLAVE', 'MESA_S3_SECRETO'].filter((k) => !env[k])
    if (faltan.length) return `faltan ${faltan.join(', ')}`
    let endpoint: URL
    try { endpoint = new URL(env['MESA_S3_ENDPOINT']!) } catch { return 'MESA_S3_ENDPOINT no es una URL' }
    if (endpoint.protocol !== 'https:' && !['127.0.0.1', 'localhost', 'host.docker.internal'].includes(endpoint.hostname)) return 'MESA_S3_ENDPOINT va por https (en http, solo en esta máquina)'
    return almacenS3({ endpoint: endpoint.origin, bucket: env['MESA_S3_BUCKET']!, region: env['MESA_S3_REGION'] || 'auto', llave: env['MESA_S3_LLAVE']!, secreto: env['MESA_S3_SECRETO']! })
  }
  return 'falta MESA_ALMACEN (disco o s3): sin almacén, la retroalimentación se perdería al dormirse el contenedor'
}
