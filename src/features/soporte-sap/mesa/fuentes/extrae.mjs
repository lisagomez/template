#!/usr/bin/env node
/**
 * Regenera lo que la mesa sabe de sus fuentes. Lo corre el laboratorio:
 *
 *   node src/features/soporte-sap/mesa/fuentes/extrae.mjs sapstack <copia-de-sapstack>
 *     Lee `data/tcodes.yaml` y `data/sap-notes.yaml` de una copia que esté EXACTAMENTE en el SHA de `fuente.json` y
 *     escribe `candidatos-sapstack.json`. Con otro SHA se niega: mover el pin es decisión del laboratorio (se cambia
 *     `fuente.json`, se vuelve a extraer y la diferencia de candidatos va a la mesa).
 *   node src/features/soporte-sap/mesa/fuentes/extrae.mjs base
 *     Vuelve a tomar la foto de `tools/conocimiento` en `base.json` (después de cada `npm run registra`).
 *   node src/features/soporte-sap/mesa/fuentes/extrae.mjs web descubre <carpeta> [--desde AAAA-MM-DD] [--hasta AAAA-MM-DD]
 *     Pregunta qué hay hoy en las fuentes web de BASIS y deja una PROPUESTA de pin en `<carpeta>/pin-propuesto.json`.
 *   node src/features/soporte-sap/mesa/fuentes/extrae.mjs web captura <carpeta>
 *     Baja a `<carpeta>` (fuera del repo) exactamente lo fijado en `web/pin.json`, cada fuente por su SHA.
 *   node src/features/soporte-sap/mesa/fuentes/extrae.mjs web <carpeta>
 *     Extrae de la captura los candidatos de BASIS y el cruce con sapstack y escribe `web/candidatos-web.json`. Se niega
 *     si una copia no está en su SHA o fue alterada.
 *   node src/features/soporte-sap/mesa/fuentes/extrae.mjs revisa [web] [--hoy AAAA-MM-DD] [--sin-red] [--pin <ruta>]
 *     Pregunta a sapstack (git ls-remote) y a las fuentes web si hay versión nueva y lo apunta en «revision». Avisa, no
 *     mueve: el mapa enseña «commit nuevo» o «hay versión nueva» y el pin sigue donde estaba.
 *
 * sapstack y la web son de terceros: nunca se corre un guion suyo ni se instala nada de ellos.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { baseDe, candidatosDe } from './generadores.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '../../../../..')
const FUENTE = join(AQUI, 'sapstack/fuente.json')
const WEB = join(AQUI, 'web')
const escribe = (ruta, x) => writeFileSync(ruta, `${JSON.stringify(x, null, 2)}\n`)
const leeJson = (ruta) => JSON.parse(readFileSync(ruta, 'utf8'))
const fuente = () => leeJson(FUENTE)
const opcion = (args, n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] ?? null : null }

function sapstack(clon) {
  if (!clon) throw new Error('falta la ruta de la copia de sapstack')
  const f = fuente()
  const head = execFileSync('git', ['-C', clon, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (head !== f.sha) throw new Error(`la copia está en ${head.slice(0, 12)} y el pin es ${f.sha.slice(0, 12)}: mover el pin lo decide el laboratorio, en fuente.json`)
  const c = candidatosDe(clon, f)
  escribe(join(AQUI, 'sapstack/candidatos-sapstack.json'), c)
  console.log(`✓ ${c.candidatos.length} candidatos de ${f.repo}@${f.sha.slice(0, 12)} · ${c.huella.slice(0, 19)}`)
}

function base() {
  const b = baseDe(RAIZ)
  escribe(join(AQUI, 'base.json'), b)
  console.log(`✓ ${b.paquete}: ${b.versiones.length} versión(es) registradas`)
}

function revisaSapstack() {
  const f = fuente()
  const salida = execFileSync('git', ['ls-remote', `${f.web}.git`, 'HEAD'], { encoding: 'utf8', timeout: 30_000 })
  const head = salida.split(/\s+/)[0]
  if (!/^[0-9a-f]{40}$/.test(head ?? '')) throw new Error('GitHub no devolvió un commit')
  f.revision = { fecha: new Date().toISOString().slice(0, 10), head }
  escribe(FUENTE, f)
  console.log(head === f.sha ? `✓ sapstack sin commits nuevos (${head.slice(0, 12)})` : `! sapstack: commit nuevo ${head.slice(0, 12)} (el pin sigue en ${f.sha.slice(0, 12)})`)
}

async function revisa(args) {
  const { conRed, revisaWeb, sinRed } = await import('./web/revisa.mjs')
  const red = !args.includes('--sin-red')
  if (args[0] !== 'web' && red) revisaSapstack()
  const ruta = resolve(opcion(args, '--pin') ?? join(WEB, 'pin.json'))
  const r = await revisaWeb(ruta, { hoy: opcion(args, '--hoy') ?? new Date().toISOString().slice(0, 10), remoto: red ? conRed : sinRed })
  if (r.estado === 'al_dia') console.log(`✓ la web de BASIS está al día (${r.fecha}; el próximo Patch Day es el ${r.proximoPatchDay})`)
  else for (const a of r.avisos) console.log(`! hay versión nueva · ${a}`)
  console.log(`  el pin no se movió: ${ruta}`)
}

async function web(args) {
  const [que, carpeta] = args[0] === 'descubre' || args[0] === 'captura' ? args : ['extrae', args[0]]
  const catalogo = leeJson(join(WEB, 'catalogo.json'))
  const pin = leeJson(join(WEB, 'pin.json'))
  const { captura, carpetaFuera, descubre } = await import('./web/captura.mjs')
  const dir = carpetaFuera(carpeta && resolve(carpeta), RAIZ)
  if (que === 'descubre') {
    const hasta = opcion(args, '--hasta') ?? new Date().toISOString().slice(0, 10)
    const p = await descubre(dir, pin, catalogo, { desde: opcion(args, '--desde') ?? pin.ventana.desde, hasta })
    return console.log(`✓ propuesta de pin en ${join(dir, 'pin-propuesto.json')}: ${p.cvelist.cves.length} CVE (${p.cvelist.descubiertos.nvd} de NVD, ${p.cvelist.descubiertos.kev} de KEV), KEV ${p.kev.catalogVersion}. Moverlo lo decide el laboratorio`)
  }
  if (que === 'captura') {
    for (const [n, estado] of captura(dir, pin, catalogo)) console.log(`✓ ${n}: ${estado}`)
    return
  }
  const { catalogoWebDe } = await import('./web/generador.mjs')
  const sapstackJson = leeJson(join(AQUI, 'sapstack/candidatos-sapstack.json'))
  const c = catalogoWebDe(dir, pin, catalogo, sapstackJson.candidatos)
  escribe(join(WEB, 'candidatos-web.json'), c)
  const r = c.resumen
  console.log(`✓ ${r.candidatos.total} candidatos de la web (${r.candidatos.seguridad} notas de seguridad, ${r.candidatos.punteros} punteros a SAP Notes, ${r.candidatos.tcodes} T-codes) · cruce con sapstack: ${r.cruce.corroborados} corroborados, ${r.cruce.contradichos} contradichos, ${r.cruce.noEncontrados} no encontrados · ${c.huella.slice(0, 19)}`)
}

const [orden, ...resto] = process.argv.slice(2)
try {
  if (orden === 'sapstack') sapstack(resto[0])
  else if (orden === 'base') base()
  else if (orden === 'revisa') await revisa(resto)
  else if (orden === 'web') await web(resto)
  else throw new Error('uso: extrae.mjs sapstack <copia> | base | web [descubre|captura] <carpeta> | revisa [web] [--hoy F] [--sin-red] [--pin R]')
} catch (e) {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
}
