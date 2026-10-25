#!/usr/bin/env node
/**
 * El candado del laboratorio alojado: lo corre `despliega.sh` antes de subir, y su error para el guion. Esta vía no pasa
 * por `configura:deploy` (que le sigue cerrando al laboratorio la vía de compose y VPS), así que lleva el suyo:
 *
 *   estatico           el Dockerfile (base pineada por digest, la misma del OCR; la guarda de `.env*`; prepara-gate),
 *                      la config de wrangler (un contenedor, ubicación fijada, sin SSH, sin secretos en `vars`, sin
 *                      URLs de vista previa) y que en la carpeta no haya `.env*` ni `.dev.vars`.
 *   imagen <tag>       la imagen YA construida: sin `.env*`, sin código fuente ni docs, sin secretos en su entorno, con
 *                      etiqueta de commit (nunca `latest`).
 *   access <url>       después de subir: sin sesión de Access, la mesa no abre.
 *
 * Un `wrangler deploy` a mano se lo salta: es la misma brecha que un `vercel deploy` a mano, y se declara igual.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { revisaImagen, revisaConstruible } from '../despacho/reglas.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, '..', '..')
const lee = (ruta) => readFileSync(join(RAIZ, ruta), 'utf8')
/** JSONC sin comentarios ni comas colgantes (lo que escribe wrangler). Respeta las cadenas. */
export function jsonc(texto) {
  let fuera = '', cadena = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (cadena) { fuera += c; if (c === '\\') { fuera += texto[++i]; continue } if (c === '"') cadena = false; continue }
    if (c === '"') { cadena = true; fuera += c; continue }
    if (c === '/' && texto[i + 1] === '/') { while (i < texto.length && texto[i] !== '\n') i++; fuera += '\n'; continue }
    if (c === '/' && texto[i + 1] === '*') { i = texto.indexOf('*/', i + 2) + 1; continue }
    fuera += c
  }
  return JSON.parse(fuera.replace(/,(\s*[}\]])/g, '$1'))
}

const DIGEST = /FROM\s+(\S+@sha256:[0-9a-f]{64})/g
/** La base de la imagen OCR del extractor: la única que entra (cambiar la base es CDC). */
export const baseDelOcr = (dockerfileOcr) => [...dockerfileOcr.matchAll(DIGEST)][0]?.[1] ?? null

export function revisaDockerfile(dockerfile, base, dockerignore, scripts) {
  const fallas = []
  const froms = [...dockerfile.matchAll(/^FROM\s+(\S+)/gm)].map((m) => m[1])
  if (!froms.length) fallas.push('el Dockerfile no tiene FROM')
  for (const f of froms) if (f !== base) fallas.push(`base no admitida: ${f} (solo la del OCR, pineada por digest: cambiar la base es CDC)`)
  const img = revisaImagen({ dockerignore, dockerfile })
  if (img.entran.length) fallas.push(`entrarían al contexto archivos con llaves: ${img.entran.join(', ')}`)
  if (img.sinGuarda) fallas.push('al Dockerfile le falta la guarda que tumba el build con un .env* en el contexto')
  if (revisaConstruible({ dockerignore, dockerfile, scripts, importados: [] }).sinHerramientas) fallas.push('el build no compila tools/*/dist (prepara-gate)')
  if (!/ENV[^\n]*LABORATORIO_ALOJADO=1/.test(dockerfile)) fallas.push('el build no hornea LABORATORIO_ALOJADO=1: la imagen serviría más que la mesa')
  return fallas
}

const VARS_PERMITIDAS = new Set(['ACCESS_EQUIPO', 'MESA_ALMACEN', 'MESA_S3_BUCKET', 'MESA_S3_REGION', 'MESA_RETENCION_DIAS'])
const REGIONES_DE_EEUU = new Set(['ENAM', 'WNAM'])

/** `desplegable`: la config que de verdad sube (la que genera el guion), que ya trae el equipo de Access. */
export function revisaWrangler(config, { desplegable = false } = {}) {
  const fallas = []
  if (desplegable && !/^[a-z0-9][a-z0-9-]{0,62}$/.test(config.vars?.ACCESS_EQUIPO ?? '')) fallas.push('falta ACCESS_EQUIPO (el equipo de Zero Trust): sin él nadie entra, y no tiene sentido subir')
  if (desplegable && config.containers?.[0]?.image === './Dockerfile') fallas.push('lo que sube es la imagen del commit, ya revisada, no una que wrangler construya por su cuenta')
  const contenedores = config.containers ?? []
  if (contenedores.length !== 1) fallas.push('tiene que haber exactamente un contenedor')
  const c = contenedores[0] ?? {}
  if (c.max_instances !== 1) fallas.push('max_instances tiene que ser 1: el laboratorio vive en memoria y es uno')
  const regiones = c.constraints?.regions ?? []
  if (!regiones.length || !regiones.every((r) => REGIONES_DE_EEUU.has(r))) fallas.push('la ubicación no está fijada en Norteamérica (constraints.regions: ENAM o WNAM)')
  if (c.ssh || c.authorized_keys || c.trusted_user_ca_keys) fallas.push('el contenedor no abre SSH')
  if (typeof c.image !== 'string') fallas.push('falta la imagen')
  else if (c.image !== './Dockerfile' && !/^registry\.cloudflare\.com\/[a-f0-9]{32}\/soporte-sap-laboratorio:[a-f0-9]{7,40}$/.test(c.image)) fallas.push(`imagen no admitida: ${c.image} (el Dockerfile del laboratorio, o la imagen del commit en el registro de Cloudflare; nunca «latest»)`)
  for (const k of Object.keys(config.vars ?? {})) if (!VARS_PERMITIDAS.has(k)) fallas.push(`${k} no va en vars (lo que no está en la lista, va con wrangler secret put)`)
  if (config.preview_urls !== false) fallas.push('las URLs de vista previa van apagadas (preview_urls: false)')
  if (config.observability?.enabled !== false) fallas.push('los registros de las peticiones van apagados (observability.enabled: false)')
  return fallas
}

/** En la carpeta del Worker no puede haber un `.env*` ni un `.dev.vars`: wrangler los lee. */
export const envEnLaCarpeta = (dir) => readdirSync(dir).filter((f) => /^\.env|^\.dev\.vars/.test(f))

/** La imagen ya construida: su listado de archivos y su entorno. */
export function revisaImagenConstruida({ tag, archivos, entorno }) {
  const fallas = []
  if (!/^soporte-sap-laboratorio:[a-f0-9]{7,40}$/.test(tag)) fallas.push(`etiqueta no admitida: ${tag} (la del commit; nunca «latest»)`)
  for (const a of archivos) {
    if (/(^|\/)\.env[^/]*$/.test(a)) fallas.push(`la imagen lleva ${a}`)
    if (/^\/app\/(src|docs|\.claude|erp|trayectorias|inventario|scripts)(\/|$)/.test(a)) fallas.push(`la imagen lleva ${a} (código o documentos del repo)`)
  }
  for (const v of entorno) {
    const nombre = v.split('=')[0]
    if (/(SECRETO|LLAVE|TOKEN|PASSWORD|SECRET|KEY|AUD)/i.test(nombre) || /^(MESA_EXPERTOS|MESA_LABORATORIO|MESA_S3_ENDPOINT)$/.test(nombre)) fallas.push(`la imagen hornea ${nombre}: eso lo pone el Worker al arrancar`)
  }
  return [...new Set(fallas)]
}

/** Después de subir: sin sesión, Access lleva a su inicio de sesión (o responde 401/403). Si la mesa contesta, no está puesto. */
export async function accessPuesto(url, consulta = fetch) {
  try {
    const r = await consulta(`${url.replace(/\/$/, '')}/mesa/soporte-sap`, { redirect: 'manual', signal: AbortSignal.timeout(15_000) })
    const destino = r.headers.get('location') ?? ''
    const puesto = r.status === 401 || r.status === 403 || (r.status >= 300 && r.status < 400 && /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com\//.test(destino))
    return { puesto, vio: `${r.status}${destino ? ` → ${destino.slice(0, 60)}` : ''}` }
  } catch (e) { return { puesto: false, vio: `sin respuesta (${e.message})` } }
}

function estatico() {
  const dockerfile = lee('scripts/laboratorio-alojado/Dockerfile')
  const base = baseDelOcr(lee('tools/extractor-documental/servicio/Dockerfile'))
  const ruta = process.argv[3]
  const config = jsonc(lee(ruta ?? 'scripts/laboratorio-alojado/wrangler.jsonc'))
  return [...revisaDockerfile(dockerfile, base, lee('.dockerignore'), JSON.parse(lee('package.json')).scripts),
    ...revisaWrangler(config, { desplegable: ruta !== undefined }), ...envEnLaCarpeta(AQUI).map((f) => `en la carpeta del Worker hay ${f}: wrangler lo leería`)]
}

function imagen(tag) {
  // Como root solo para MIRAR (el contenedor corre sin privilegios): así no se le escapa lo que el usuario no lee.
  const archivos = execFileSync('docker', ['run', '--rm', '--user', '0', '--network', 'none', '--entrypoint', 'sh', tag, '-c', 'find / -xdev \\( -path /proc -o -path /sys -o -path /app/node_modules -o -path /usr \\) -prune -o -print 2>/dev/null; true'], { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean)
  const entorno = JSON.parse(execFileSync('docker', ['image', 'inspect', tag, '--format', '{{json .Config.Env}}'], { encoding: 'utf8' }))
  return revisaImagenConstruida({ tag, archivos, entorno })
}

async function principal() {
  const [que, arg] = process.argv.slice(2)
  let fallas
  if (que === 'estatico') fallas = estatico()
  else if (que === 'imagen' && arg) fallas = imagen(arg)
  else if (que === 'access' && arg) { const a = await accessPuesto(arg); fallas = a.puesto ? [] : [`sin sesión, la mesa responde (${a.vio}): Access NO está puesto. Actívalo en el Worker antes de dar el enlace`]; console.log(`sin sesión: ${a.vio}`) }
  else { console.error('uso: candado.mjs estatico [config] | imagen <tag> | access <url>'); process.exit(2) }
  for (const f of fallas) console.error(`✗ ${f}`)
  if (fallas.length) process.exit(1)
  console.log(`✓ candado ${que}: en verde`)
}

if (existsSync(process.argv[1] ?? '') && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await principal()
