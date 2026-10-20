#!/usr/bin/env node
/**
 * La corrida semántica del laboratorio Golfo Norte (datos ficticios), de punta a punta:
 *
 *   1. los 7 CSV, VERIFICADOS por sha256 contra `datos.json` antes de cargar nada (un hash distinto la para);
 *   2. el entorno Python del lock con hashes (dbt-core, dbt-duckdb, MetricFlow), sin telemetría;
 *   3. `dbt build` (22 modelos y 45 pruebas en la propuesta) y `mf validate-configs`;
 *   4. cada cifra de la propuesta por el PUERTO SEMÁNTICO del Estudio (MetricFlow caliente, filtros estructurados)
 *      y por un CONTEO DIRECTO independiente (`directo.py`, SQL propio sobre los CSV, sin marts);
 *   5. la tabla propuesta · MetricFlow · directo → docs/goals/estudio-dashboards-medicion/cifras.{json,md}.
 *
 * Una cifra que no cuadra se REPORTA con su explicación; no se ajusta ninguna definición. El código de salida es 1
 * solo si falla algo de la corrida (hash, dbt, validate) o si MetricFlow y el conteo directo discrepan entre sí:
 * eso sería un error de modelado. Que la PROPUESTA no cuadre se reporta y no rompe la corrida.
 *
 * Uso: node tools/estudio-dashboards/laboratorio/corre.mjs   (requiere `npm --prefix tools/estudio-dashboards run build`)
 *   ESTUDIO_GN_DATOS=<dir de los CSV>  (por defecto .datos/estudio-dashboards/golfo_norte/data/raw del checkout)
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aseguraEntorno, puertoMetricFlow, SIN_TELEMETRIA } from '../dist/metricflow/index.js'
import { CIFRAS, CONSULTAS } from './cifras.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', '..', '..')
const PROYECTO = join(AQUI, 'golfo_norte')
const DATOS = process.env.ESTUDIO_GN_DATOS ?? join(RAIZ, '.datos', 'estudio-dashboards', 'golfo_norte', 'data', 'raw')
const DUCKDB = join(homedir(), '.cache', 'estudio-dashboards-semantica', 'golfo_norte', 'golfo_norte.duckdb')
const SALIDA = join(RAIZ, 'docs', 'goals', 'estudio-dashboards-medicion')
const casa = (s) => s.replaceAll(homedir(), '~')

function verificaDatos() {
  const manifiesto = JSON.parse(readFileSync(join(AQUI, 'datos.json'), 'utf8'))
  const filas = Object.entries(manifiesto.csv).map(([archivo, esperado]) => {
    const ruta = join(DATOS, archivo)
    if (!existsSync(ruta)) throw new Error(`falta ${archivo} en ${casa(DATOS)}`)
    const sha256 = createHash('sha256').update(readFileSync(ruta)).digest('hex')
    return { archivo, sha256, esperado: esperado.sha256, igual: sha256 === esperado.sha256 }
  })
  for (const f of filas) console.log(`  ${f.igual ? '✓' : '✗'} ${f.archivo.padEnd(18)} ${f.sha256}`)
  if (filas.some((f) => !f.igual)) throw new Error('un CSV no coincide con su hash: no se carga nada')
  return filas
}

function corre(cmd, args, env) {
  const r = spawnSync(cmd, args, { cwd: PROYECTO, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const salida = `${r.stdout ?? ''}${r.stderr ?? ''}`.replace(/\x1b\[[0-9;]*m/g, '')
  if (r.status !== 0) { console.error(casa(salida).slice(-6000)); throw new Error(`${args[0]} falló (código ${r.status})`) }
  return salida
}

const decimales = (c) => c.dec ?? (String(c.propuesta).split('.')[1] ?? '').length
function compara(c, mf, directo) {
  const v = mf ?? directo
  const escalado = v === null ? null : v / (c.escala ?? 1)
  const tol = 0.5 * 10 ** -decimales(c) + 1e-9
  const contraPropuesta = c.propuesta === null ? null : escalado === null ? false
    : c.rango ? Math.round(escalado) >= c.rango[0] && Math.round(escalado) <= c.rango[1]
      : c.trunca ? Math.trunc(escalado) === c.propuesta
        : Math.abs(escalado - c.propuesta) <= tol
  const mfIgualDirecto = mf === null || directo === null ? null : Math.abs(mf - directo) <= 1e-6 * Math.max(1, Math.abs(directo))
  return { escalado, contraPropuesta, mfIgualDirecto }
}

async function cifras(env) {
  const puerto = puertoMetricFlow({ proyecto: PROYECTO, perfiles: PROYECTO, entorno: { ...env, GN_DBT_TARGET: 'lectura' } })
  try {
    console.log(`▸ MetricFlow caliente en ${await puerto.listo} ms`)
    const q = {}
    const tiempos = []
    for (const [nombre, consulta] of Object.entries(CONSULTAS)) {
      const t = performance.now()
      q[nombre] = await puerto.consulta(consulta)
      tiempos.push({ consulta: nombre, capaMs: q[nombre].ms, totalMs: Math.round(performance.now() - t) })
    }
    const venv = join(aseguraEntorno().dir, 'bin', 'python')
    const directo = JSON.parse(spawnSync(venv, ['-I', join(AQUI, 'directo.py'), DATOS], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).stdout)
    const filas = CIFRAS.map((c) => {
      const mf = c.mf ? c.mf(q) : null
      const d = typeof c.directo === 'function' ? c.directo(directo) : directo[c.directo] ?? null
      return { id: c.id, bloque: c.bloque, texto: c.texto, propuesta: c.propuesta, trampa: Boolean(c.trampa), metricflow: mf, directo: d, ...compara(c, mf, d), explicacion: c.explicacion ?? null }
    })
    return { filas, tiempos, directo }
  } finally {
    await puerto.cierra()
  }
}

const fmt = (x) => (x === null || x === undefined ? '—' : Math.abs(x) >= 1000 ? x.toLocaleString('en-US', { maximumFractionDigits: 1 }) : x.toFixed(Math.abs(x) < 10 ? 3 : 2))
function tabla(filas) {
  const lineas = ['| Bloque | Cifra | Propuesta | MetricFlow | Directo | MF = directo | Cuadra con la propuesta | Explicación |', '|---|---|---|---|---|---|---|---|']
  for (const f of filas) lineas.push(`| ${f.bloque} | ${f.texto} | ${f.propuesta ?? '—'} | ${fmt(f.metricflow)} | ${fmt(f.directo)} | ${f.mfIgualDirecto === null ? 'sin métrica' : f.mfIgualDirecto ? '✓' : f.trampa ? '✗ (trampa esperada)' : '✗'} | ${f.contraPropuesta === null ? '— (control)' : f.contraPropuesta ? '✓' : '✗'} | ${f.explicacion ?? ''} |`)
  return lineas.join('\n')
}

async function principal() {
  const t0 = Date.now()
  console.log(`▸ datos (${casa(DATOS)}):`)
  const hashes = verificaDatos()
  const { dir, estado } = aseguraEntorno()
  console.log(`▸ entorno dbt + MetricFlow: ${estado} (${casa(dir)})`)
  mkdirSync(dirname(DUCKDB), { recursive: true })
  const env = { GN_DATOS: DATOS, GN_DUCKDB: DUCKDB }
  const envDbt = { PATH: process.env.PATH, HOME: process.env.HOME, DBT_PROFILES_DIR: PROYECTO, ...SIN_TELEMETRIA, ...env }
  const dbt = corre(join(dir, 'bin', 'dbt'), ['build', '--no-use-colors'], envDbt).split('\n').filter((l) => /Finished running|Done\. PASS=|Completed successfully/.test(l)).map((l) => l.replace(/^\S+\s+/, '').trim())
  dbt.forEach((l) => console.log(`  dbt  ${l}`))
  const mf = corre(join(dir, 'bin', 'mf'), ['validate-configs'], envDbt).split('\n').filter((l) => /✔|ERROR|WARN/.test(l)).map((l) => `✔${l.split('✔').pop()}`.trim())
  mf.forEach((l) => console.log(`  mf   ${l}`))
  const { filas, tiempos, directo } = await cifras(env)
  console.log(`\n${tabla(filas)}\n`)
  const versiones = Object.fromEntries(corre('uv', ['pip', 'freeze', '--python', join(dir, 'bin', 'python')], process.env).split('\n').map((l) => l.trim().split('==')).filter(([n, v]) => v && /^(dbt-core|dbt-duckdb|dbt-postgres|dbt-metricflow|metricflow|duckdb)$/.test(n)))
  mkdirSync(SALIDA, { recursive: true })
  writeFileSync(join(SALIDA, 'cifras.json'), `${JSON.stringify({ generado: new Date().toISOString(), versiones, hashes, dbt, mf, tiempos, cifras: filas, directo }, null, 1)}\n`)
  writeFileSync(join(SALIDA, 'cifras.md'), `# Cifras de la propuesta: MetricFlow vs conteo directo\n\nGenerado por \`laboratorio/corre.mjs\` (${new Date().toISOString().slice(0, 10)}). Versiones: ${Object.entries(versiones).map(([n, v]) => `${n} ${v}`).join(', ')}.\n\n${tabla(filas)}\n`)
  const rotas = filas.filter((f) => f.mfIgualDirecto === false && !f.trampa)
  const fuera = filas.filter((f) => f.contraPropuesta === false)
  console.log(`▸ ${filas.length} cifras · MF = directo en ${filas.filter((f) => f.mfIgualDirecto).length} · sin métrica ${filas.filter((f) => f.mfIgualDirecto === null).length} · trampas documentadas ${filas.filter((f) => f.trampa).length} · no cuadran con la propuesta ${fuera.length} · ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  if (rotas.length) throw new Error(`MetricFlow y el conteo directo discrepan en: ${rotas.map((f) => f.id).join(', ')}`)
}

principal().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1) })
