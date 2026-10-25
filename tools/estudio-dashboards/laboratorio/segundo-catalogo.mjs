#!/usr/bin/env node
/**
 * Portabilidad: el Estudio sobre un SEGUNDO catálogo del repo, la capa semántica de soporte-sap TAL CUAL
 * (`tools/soporte-sap/semantica`: sus semillas, su perfil, su Postgres efímero pineado por digest), con el mismo
 * puerto de MetricFlow y el mismo núcleo, sin cambiar una línea. Registra que `git diff` del núcleo está vacío.
 *
 *   1. semillas con su propio generador (`semillas.ts`) y Postgres efímero en 127.0.0.1, clave al azar por entorno;
 *   2. `dbt build` con SU perfil;
 *   3. el puerto del Estudio: catálogo, dominios, un tablero armado SOLO desde el catálogo, validado y resuelto;
 *   4. → docs/goals/estudio-dashboards-medicion/segundo-catalogo.json. El contenedor se tira siempre.
 */
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { cargaCatalogo, consultor, esSumable, resuelve, validaDashboard, ejecutaHerramienta, memoriaAlertas, memoriaVersiones } from '../dist/index.js'
import { aseguraEntorno, puertoMetricFlow, SIN_TELEMETRIA } from '../dist/metricflow/index.js'

const AQUI = import.meta.dirname
const RAIZ = join(AQUI, '..', '..', '..')
const SS = join(RAIZ, 'tools', 'soporte-sap', 'semantica')
const { semillas, aCsv } = await import(join(SS, 'semillas.ts'))
const { IMAGEN_POSTGRES } = await import(join(SS, 'imagen.mjs'))
const corre = (cmd, args, o = {}) => { const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...o }); return { codigo: r.status ?? 1, salida: `${r.stdout ?? ''}${r.stderr ?? ''}` } }
const exige = (cmd, args, o, que) => { const r = corre(cmd, args, o); if (r.codigo) { console.error(r.salida.slice(-4000)); throw new Error(`${que} falló`) } return r.salida }
const puertoLibre = () => new Promise((ok) => { const s = createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)) }) })

/** Un tablero armado SOLO con lo que dice el catálogo: nada de este archivo nombra una métrica de soporte-sap. */
function tableroGenerico(cat, periodo) {
  const ms = [...cat.metricas.values()]
  const conTiempo = ms.filter((m) => m.tipo === 'simple' && esSumable(cat, m.nombre, 'categorica') && m.dimensiones.some((d) => d.nombre === 'metric_time__day' || d.nombre === 'metric_time__month'))
  const principal = conTiempo[0]
  const dim = principal?.dimensiones.find((d) => d.tipo === 'categorica' && (cat.dominios.get(d.nombre)?.length ?? 0) >= 2 && (cat.dominios.get(d.nombre)?.length ?? 99) <= 12)?.nombre
  const razon = ms.find((m) => m.tipo === 'ratio' && dim && m.dimensiones.some((d) => d.nombre === dim))
  return {
    esquema: 'estudio.dashboard/1', titulo: 'Segundo catálogo (armado desde el catálogo)',
    filtros: { periodo, dimensiones: [] },
    componentes: [
      { id: 'kpis', tipo: 'kpis', metricas: [principal.nombre, ...(razon ? [razon.nombre] : [])].slice(0, 4) },
      { id: 'tendencia', tipo: 'linea', metrica: principal.nombre, grano: 'month' },
      ...(dim ? [{ id: 'desglose', tipo: 'barras', metrica: principal.nombre, dimension: dim }] : []),
    ],
  }
}

async function principal() {
  const s = semillas()
  mkdirSync(join(SS, 'semillas'), { recursive: true })
  for (const [n, t] of Object.entries(s.tablas)) writeFileSync(join(SS, 'semillas', `${n}.csv`), aCsv(t))
  console.log(`▸ semillas de soporte-sap (su generador): ${Object.entries(s.tablas).map(([n, t]) => `${n} ${t.filas.length}`).join(' · ')} · corte ${s.corte}`)
  const { dir } = aseguraEntorno()
  const [puerto, clave, nombre] = [await puertoLibre(), randomBytes(24).toString('hex'), `estudio-ss-${process.pid}`]
  exige('docker', ['run', '-d', '--rm', '--name', nombre, '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_DB=semantica', '-p', `127.0.0.1:${puerto}:5432`, IMAGEN_POSTGRES], { env: { ...process.env, POSTGRES_PASSWORD: clave } }, 'levantar Postgres')
  let mf
  try {
    for (let k = 0; corre('docker', ['exec', nombre, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'semantica']).codigo; k++) { if (k > 60) throw new Error('Postgres no respondió'); await new Promise((r) => setTimeout(r, 1000)) }
    const entorno = { SS_PG_HOST: '127.0.0.1', SS_PG_PORT: String(puerto), SS_PG_PASSWORD: clave, SS_PG_DB: 'semantica' }
    const dbt = exige(join(dir, 'bin', 'dbt'), ['build', '--no-use-colors'], { cwd: SS, env: { PATH: process.env.PATH, HOME: process.env.HOME, DBT_PROFILES_DIR: join(SS, 'perfil'), ...SIN_TELEMETRIA, ...entorno } }, 'dbt build').split('\n').filter((l) => /Done\. PASS=/.test(l)).map((l) => l.replace(/^\S+\s+/, '').trim())
    console.log(`▸ dbt build (perfil de soporte-sap): ${dbt.join(' ')}`)
    mf = puertoMetricFlow({ proyecto: SS, perfiles: join(SS, 'perfil'), entorno })
    const cat = await cargaCatalogo(mf)
    const x = consultor(mf, cat)
    const periodo = { desde: '2026-04', hasta: s.corte.slice(0, 7) }
    const d = tableroGenerico(cat, periodo)
    const v = validaDashboard(cat, d)
    const datos = v.ok ? await resuelve(x, v.valor) : null
    const ctx = { consultor: x, versiones: memoriaVersiones(), alertas: memoriaAlertas(), fechaCorte: periodo.hasta }
    const listado = await ejecutaHerramienta(ctx, 'listar_metricas', {})
    const nucleo = corre('git', ['diff', '--stat', 'HEAD', '--', 'tools/estudio-dashboards/src'], { cwd: RAIZ }).salida.trim()
    const salida = {
      catalogo: 'tools/soporte-sap/semantica', version: cat.version, metricas: listado.map((m) => `${m.nombre} [${m.tipo}${m.unidad ? `, ${m.unidad}` : ''}]`), dominios: Object.fromEntries([...cat.dominios].map(([k, val]) => [k, val.length])),
      tablero: d, valido: v.ok, errores: v.ok ? [] : v.errores,
      datos: datos && Object.fromEntries(Object.entries(datos.componentes).map(([id, c]) => [id, { forma: c.forma, error: c.error, advertencias: c.advertencias, sql: c.consultas[0]?.sql?.slice(0, 300) ?? null }])),
      diffNucleo: nucleo || '(vacío)', commitNucleo: corre('git', ['rev-parse', '--short', 'HEAD'], { cwd: RAIZ }).salida.trim(),
    }
    mkdirSync(join(RAIZ, 'docs', 'goals', 'estudio-dashboards-medicion'), { recursive: true })
    writeFileSync(join(RAIZ, 'docs', 'goals', 'estudio-dashboards-medicion', 'segundo-catalogo.json'), `${JSON.stringify(salida, null, 1)}\n`)
    console.log(`▸ ${listado.length} métricas listadas del segundo catálogo (${cat.dominios.size} dimensiones con dominio)`)
    console.log(`▸ tablero armado desde el catálogo: ${d.componentes.map((c) => `${c.id}:${c.tipo}(${c.metrica ?? c.metricas?.join('+')}${c.dimension ? ` por ${c.dimension}` : ''})`).join(' · ')} → ${v.ok ? 'VÁLIDO' : `inválido: ${JSON.stringify(v.errores)}`}`)
    if (datos) for (const [id, c] of Object.entries(datos.componentes)) console.log(`   ${id}: ${c.error ?? (c.forma.tipo === 'valores' ? c.forma.valores.map((x) => `${x.metrica} = ${x.valor}`).join(', ') : c.forma.tipo === 'filas' ? c.forma.filas.map((f) => `${f.clave}: ${Object.values(f.valores)[0]}`).join(' · ') : c.forma.tipo === 'series' ? `${c.forma.series.length} serie(s), ${c.forma.series[0]?.puntos.length ?? 0} puntos` : c.forma.tipo)}`)
    console.log(`▸ git diff del núcleo (tools/estudio-dashboards/src) contra ${salida.commitNucleo}: ${salida.diffNucleo}`)
  } finally {
    await mf?.cierra()
    corre('docker', ['rm', '-f', nombre])
    console.log('▸ contenedor tirado')
  }
}

principal().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1) })
