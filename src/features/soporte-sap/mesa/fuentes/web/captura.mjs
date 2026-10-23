/**
 * Lo único de las fuentes web que sale a internet. Lo corre el laboratorio en su máquina; la mesa alojada nunca lo carga.
 *
 *   descubre(carpeta)  pregunta qué hay hoy (NVD: los CVE cuyo CNA es SAP; KEV y SAP-docs: su último commit) y deja una
 *                      PROPUESTA de pin en `<carpeta>/pin-propuesto.json`. No toca `pin.json`: moverlo es del laboratorio.
 *   captura(carpeta)   baja exactamente lo fijado en `pin.json` (cada fuente por su SHA, del CVE List solo los registros
 *                      del pin) a una carpeta FUERA del repo. Nada de lo bajado se ejecuta: el generador solo lo lee.
 *
 * Toda URL pasa por `permitida`: solo una fuente del catálogo, pública y que sus términos y su robots.txt dejan capturar
 * en automático. me.sap.com (S-user), help.sap.com y support.sap.com (robots y términos de SAP) se niegan siempre.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'
import { carpetas, rutaDeCve } from './generador.mjs'
import { diaUtc, paraNvd, patchDayDe } from './reglas.mjs'

const AGENTE = 'soporte-sap-laboratorio/0.1 (captura puntual de fuentes publicas)'
const ESPERA_NVD_MS = 7000

/** La fuente del catálogo a la que pertenece una URL (por prefijo), o null. */
export function fuenteDeUrl(url, catalogo) {
  const u = String(url)
  return catalogo.fuentes.find((f) => u === f.url || u.startsWith(`${f.url.replace(/\/$/, '')}/`) || u.startsWith(`${f.url}.git`) || u.startsWith(`${f.url}?`)) ?? null
}

/** Se captura solo lo público y automatizable del catálogo; lo demás se niega diciendo por qué. */
export function permitida(url, catalogo) {
  const f = fuenteDeUrl(url, catalogo)
  if (!f) throw new Error(`${url} no está en el catálogo de fuentes: no se captura`)
  if (f.acceso !== 'publica') throw new Error(`${f.nombre} pide ${f.acceso === 's-user' ? 'S-user' : 'registro'}: no se captura`)
  if (f.captura !== 'automatica') throw new Error(`${f.nombre}: ${f.porQueAsi}`)
  return f
}

/** La captura vive fuera del repo: lo bajado de la web no se versiona ni se empaqueta. */
export function carpetaFuera(carpeta, raiz) {
  if (!carpeta || !isAbsolute(carpeta)) throw new Error('la carpeta de captura va como ruta absoluta')
  const r = relative(raiz, carpeta)
  if (!r.startsWith('..') && !isAbsolute(r)) throw new Error(`${carpeta} está dentro del repo: la captura va fuera`)
  mkdirSync(carpeta, { recursive: true })
  return carpeta
}

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 600_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim()

/** Una copia git de `url` en exactamente `sha`, con solo `rutas` (vacío = todo). Si ya está y limpia, no baja nada. */
function copiaEn(dir, url, sha, rutas, catalogo) {
  permitida(url, catalogo)
  if (existsSync(join(dir, '.git'))) {
    try { if (git(dir, 'rev-parse', 'HEAD') === sha && !git(dir, 'status', '--porcelain')) return 'ya estaba' } catch { /* se rehace */ }
    rmSync(dir, { recursive: true, force: true })
  }
  mkdirSync(dir, { recursive: true })
  git(dir, 'init', '-q')
  git(dir, 'remote', 'add', 'origin', `${url}.git`)
  if (rutas.length) {
    git(dir, 'config', 'core.sparseCheckout', 'true')
    writeFileSync(join(dir, '.git/info/sparse-checkout'), rutas.map((r) => `/${r}`).join('\n') + '\n')
  }
  git(dir, 'fetch', '-q', '--depth', '1', ...(rutas.length ? ['--filter=tree:0'] : []), 'origin', sha)
  git(dir, '-c', 'advice.detachedHead=false', 'checkout', '-q', sha)
  return 'bajada'
}

/** Baja lo fijado en `pin` a `carpeta`. */
export function captura(carpeta, pin, catalogo) {
  const d = carpetas(carpeta)
  const hechos = [
    ['CVE List', copiaEn(d.cvelist, pin.cvelist.web, pin.cvelist.sha, pin.cvelist.cves.map(rutaDeCve), catalogo)],
    ['KEV', copiaEn(d.kev, pin.kev.web, pin.kev.sha, ['known_exploited_vulnerabilities.json'], catalogo)],
    ...pin.sapDocs.map((s) => [s.repo, copiaEn(d.sapDocs(s.id), s.web, s.sha, [], catalogo)]),
  ]
  return hechos
}

// ── Descubrir (la propuesta de pin) ────────────────────────────────────────────────────────────

const espera = (ms) => new Promise((ok) => setTimeout(ok, ms))
/** Los CVE cuyo CNA es SAP publicados entre dos fechas, en ventanas de 120 días como pide NVD. */
async function cvesDeSap(desde, hasta, catalogo) {
  const ids = []
  for (let ini = diaUtc(desde); ini <= diaUtc(hasta);) {
    const fin = new Date(Math.min(ini.getTime() + 119 * 86_400_000, diaUtc(hasta).getTime() + 86_399_999))
    const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?sourceIdentifier=cna@sap.com&pubStartDate=${paraNvd(ini)}&pubEndDate=${paraNvd(fin)}&resultsPerPage=2000`
    permitida(url, catalogo)
    const r = await fetch(url, { headers: { 'user-agent': AGENTE } })
    if (!r.ok) throw new Error(`NVD respondió ${r.status}`)
    ids.push(...(await r.json()).vulnerabilities.map((v) => v.cve.id))
    ini = new Date(fin.getTime() + 1000)
    await espera(ESPERA_NVD_MS)
  }
  return ids
}

const cabeza = (web, catalogo) => { permitida(web, catalogo); return execFileSync('git', ['ls-remote', `${web}.git`, 'HEAD'], { encoding: 'utf8', timeout: 60_000 }).split(/\s+/)[0] }

/** El último Patch Day que ya pasó en una fecha. */
export function ultimoPatchDayHasta(fecha) {
  const [a, m] = [Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7))]
  const este = patchDayDe(a, m)
  return este <= fecha ? este : m === 1 ? patchDayDe(a - 1, 12) : patchDayDe(a, m - 1)
}

/** La propuesta de pin de hoy: lo que habría que fijar para estar al día. La decide el laboratorio. */
export async function descubre(carpeta, pin, catalogo, { desde, hasta }) {
  const nvd = await cvesDeSap(desde, hasta, catalogo)
  const kevSha = cabeza(pin.kev.web, catalogo)
  copiaEn(carpetas(carpeta).kev, pin.kev.web, kevSha, ['known_exploited_vulnerabilities.json'], catalogo)
  const kev = JSON.parse(readFileSync(join(carpetas(carpeta).kev, 'known_exploited_vulnerabilities.json'), 'utf8'))
  const deSapEnKev = kev.vulnerabilities.filter((v) => /^SAP/i.test(v.vendorProject)).map((v) => v.cveID)
  const sapDocs = pin.sapDocs.map((s) => ({ ...s, sha: cabeza(s.web, catalogo) }))
  const propuesta = {
    ...pin, capturadoEl: hasta, ventana: { desde, hasta }, ultimoPatchDay: ultimoPatchDayHasta(hasta),
    cvelist: { ...pin.cvelist, sha: cabeza(pin.cvelist.web, catalogo), cves: [...new Set([...nvd, ...deSapEnKev])].sort(), descubiertos: { nvd: nvd.length, kev: deSapEnKev.length } },
    kev: { ...pin.kev, sha: kevSha, catalogVersion: kev.catalogVersion },
    sapDocs,
  }
  delete propuesta.revision
  writeFileSync(join(carpeta, 'pin-propuesto.json'), `${JSON.stringify(propuesta, null, 2)}\n`)
  return propuesta
}
