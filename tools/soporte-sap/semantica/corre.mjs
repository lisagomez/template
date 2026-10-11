#!/usr/bin/env node
/**
 * Corre la capa semántica de punta a punta en el laboratorio y escribe el CORTE semántico
 * (`semantica/corte.json`), lo único que leen las superficies:
 *
 *   1. entorno Python 3.12 con dbt Core + MetricFlow del `requirements.lock` (con hashes), por `uv`;
 *   2. semillas desde el corpus sintético (`semillas.ts`);
 *   3. Postgres efímero en Docker, pineado por digest, solo en 127.0.0.1, contraseña al azar que no
 *      sale en ninguna línea de comandos;
 *   4. `dbt build` (semillas, modelos y pruebas) y `mf validate-configs`;
 *   5. `mf query` por alcance (total, tamaño, consultora, cliente) → corte.json;
 *   6. el contenedor se tira siempre.
 *
 * Sin telemetría (DBT_SEND_ANONYMOUS_USAGE_STATS=false, DO_NOT_TRACK=1) y sin red más allá de
 * instalar los paquetes pineados la primera vez. Uso: node tools/soporte-sap/semantica/corre.mjs
 */
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { semillas, aCsv } from './semillas.ts'
import { marcaLoQueVeElLaboratorio } from './grupo-minimo.ts'
import { IMAGEN_POSTGRES } from './imagen.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const LOCK = readFileSync(join(AQUI, 'requirements.lock'), 'utf8')
const VENV = process.env.SS_DBT_VENV ?? join(homedir(), '.cache', 'soporte-sap-semantica', `venv-${createHash('sha256').update(LOCK).digest('hex').slice(0, 12)}`)
const bin = (x) => join(VENV, 'bin', x)

/** Qué se pregunta por alcance: una sola definición, compartida con el job de producción (job.py). */
const DEF = JSON.parse(readFileSync(join(AQUI, 'consultas.json'), 'utf8'))
export const CONSULTAS = DEF.consultas.map((q) => ({ ...q, metricas: q.metricas.flatMap((m) => (m === '@operacion' ? DEF.operacion : [m])) }))

function corre(cmd, args, opciones = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opciones })
  if (r.error) throw r.error
  return { codigo: r.status ?? 1, salida: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

function exige(cmd, args, opciones, que) {
  const r = corre(cmd, args, opciones)
  if (r.codigo !== 0) { console.error(r.salida.slice(-6000)); throw new Error(`${que} falló (código ${r.codigo})`) }
  return r.salida
}

const puertoLibre = () => new Promise((ok, mal) => {
  const s = createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)) }).on('error', mal)
})
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms))

function entorno() {
  if (existsSync(bin('dbt')) && existsSync(bin('mf'))) return 'ya estaba'
  mkdirSync(dirname(VENV), { recursive: true })
  exige('uv', ['venv', '--python', '3.12', VENV], {}, 'crear el entorno Python 3.12')
  exige('uv', ['pip', 'sync', '--python', bin('python'), '--require-hashes', join(AQUI, 'requirements.lock')], {}, 'instalar el lock')
  return 'creado'
}

/** CSV simple (lo que escribe `mf query --csv`): sin comas dentro de los valores. */
function leeCsv(texto) {
  const [cab, ...filas] = texto.trim().split(/\r?\n/)
  const cols = cab.split(',')
  return filas.filter(Boolean).map((f) => Object.fromEntries(f.split(',').map((v, i) => [cols[i], v])))
}

/** El primer mes con datos del corpus del laboratorio (abril de 2026): antes y después no hay periodo que medir. */
const PRIMER_MES = '2026-04-01'
const numero = (v) => (v === '' || v === undefined || v === 'None' || v === 'nan') ? null : Math.round(Number(v) * 1e6) / 1e6

async function principal() {
  const inicio = Date.now()
  console.log(`▸ entorno dbt + MetricFlow: ${entorno()} (${VENV.replace(homedir(), '~')})`)
  const versiones = Object.fromEntries(exige('uv', ['pip', 'freeze', '--python', bin('python')], {}, 'uv pip freeze').split('\n')
    .map((l) => l.trim().split('==')).filter(([n, v]) => v && /^(dbt-core|dbt-postgres|dbt-metricflow|metricflow|dbt-semantic-interfaces)$/.test(n)))

  const s = semillas()
  mkdirSync(join(AQUI, 'semillas'), { recursive: true })
  for (const [nombre, t] of Object.entries(s.tablas)) writeFileSync(join(AQUI, 'semillas', `${nombre}.csv`), aCsv(t))
  console.log(`▸ semillas: ${Object.entries(s.tablas).map(([n, t]) => `${n} ${t.filas.length}`).join(' · ')} · huella ${s.huella.slice(0, 12)}`)

  const puerto = await puertoLibre()
  const clave = randomBytes(24).toString('hex')
  const nombre = `ss-semantica-${process.pid}`
  const conClave = { ...process.env, POSTGRES_PASSWORD: clave }
  exige('docker', ['run', '-d', '--rm', '--name', nombre, '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_DB=semantica', '-p', `127.0.0.1:${puerto}:5432`, IMAGEN_POSTGRES], { env: conClave }, 'levantar Postgres')
  try {
    for (let k = 0; ; k++) {
      if (corre('docker', ['exec', nombre, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'semantica']).codigo === 0) break
      if (k > 60) throw new Error('Postgres no respondió en 60 s')
      await espera(1000)
    }
    console.log(`▸ Postgres efímero ${IMAGEN_POSTGRES.slice(0, 28)}… en 127.0.0.1:${puerto}`)
    const env = {
      ...process.env, SS_PG_HOST: '127.0.0.1', SS_PG_PORT: String(puerto), SS_PG_PASSWORD: clave, SS_PG_DB: 'semantica',
      DBT_PROFILES_DIR: join(AQUI, 'perfil'), DBT_SEND_ANONYMOUS_USAGE_STATS: 'false', DO_NOT_TRACK: '1',
    }
    const dbt = exige(bin('dbt'), ['build', '--no-use-colors'], { cwd: AQUI, env }, 'dbt build')
    console.log(dbt.split('\n').filter((l) => /Done\. PASS=|Completed successfully|Finished running/.test(l)).map((l) => `  dbt  ${l.replace(/^\S+\s+/, '').trim()}`).join('\n'))
    const valida = exige(bin('mf'), ['validate-configs'], { cwd: AQUI, env }, 'mf validate-configs')
    console.log(valida.split('\n').filter((l) => /✔|WARNING|ERROR/.test(l)).map((l) => `  mf   ${l.replace(/^[\s\S]*✔/, "✔").trim()}`).join('\n'))

    const carpeta = mkdtempSync(join(tmpdir(), 'ss-corte-'))
    const consultoraDe = Object.fromEntries(s.tablas.ss_organizacion.filas.filter((f) => f[1] === 'cliente').map((f) => [f[0], f[2]]))
    const filas = []
    for (const [n, q] of CONSULTAS.entries()) {
      const archivo = join(carpeta, `q${n}.csv`)
      exige(bin('mf'), ['query', '--metrics', q.metricas.join(','), '--group-by', ['metric_time__month', ...q.por].join(','),
        '--start-time', PRIMER_MES, '--end-time', s.corte.slice(0, 10), '--csv', archivo], { cwd: AQUI, env }, `mf query ${q.alcance}`)
      for (const r of leeCsv(readFileSync(archivo, 'utf8'))) {
        const periodo = (r.metric_time__month ?? '').slice(0, 7)
        if (!/^\d{4}-\d{2}$/.test(periodo)) continue
        const cliente = r.cliente ?? null
        const consultora = r.consultora ?? (cliente ? consultoraDe[cliente] ?? null : null)
        for (const m of q.metricas) {
          filas.push({ metrica: m, periodo, alcance: q.alcance, tamano: r.cliente__tamano ?? null, consultora, cliente, etapa: r.cliente_mes__etapa ?? null, valor: numero(r[m]) })
        }
      }
    }
    filas.sort((a, b) => [a.metrica, a.alcance, a.periodo, a.tamano ?? '', a.consultora ?? '', a.cliente ?? '', a.etapa ?? ''].join('|').localeCompare([b.metrica, b.alcance, b.periodo, b.tamano ?? '', b.consultora ?? '', b.cliente ?? '', b.etapa ?? ''].join('|')))

    const manifiesto = JSON.parse(readFileSync(join(AQUI, 'target', 'semantic_manifest.json'), 'utf8'))
    const metricas = manifiesto.metrics.map((m) => ({
      nombre: m.name, etiqueta: m.label ?? m.name, descripcion: m.description ?? '', tipo: m.type,
      unidad: m.config?.meta?.unidad ?? null, visibleAlCliente: m.config?.meta?.visible_al_cliente === true,
      etapa: m.config?.meta?.etapa ?? null, supuestos: m.config?.meta?.supuestos ?? null,
      // Auxiliar: las que MetricFlow crea de una medida (sin unidad declarada) y los acumulados de apoyo.
      auxiliar: m.config?.meta?.auxiliar === true || !m.config?.meta?.unidad,
    })).sort((a, b) => a.nombre.localeCompare(b.nombre))
    const corte = {
      version: `sha256:${s.huella}`, corte: s.corte,
      generadoCon: { ...versiones, postgres: IMAGEN_POSTGRES, python: '3.12' },
      metricas, filas: marcaLoQueVeElLaboratorio(filas),
    }
    writeFileSync(join(AQUI, 'corte.json'), `${JSON.stringify(corte, null, 1)}\n`)
    console.log(`▸ corte.json: ${metricas.length} métricas en el catálogo · ${filas.length} valores · versión ${s.huella.slice(0, 12)} · ${((Date.now() - inicio) / 1000).toFixed(1)} s`)
  } finally {
    corre('docker', ['rm', '-f', nombre])
    console.log('▸ contenedor tirado')
  }
}

principal().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1) })
