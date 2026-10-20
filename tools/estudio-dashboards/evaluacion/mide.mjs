#!/usr/bin/env node
/**
 * Mide el agente con el LLM REAL contra el set de referencia congelado (sha256 en set-referencia.sha256).
 *
 *   - Un nivel de `.claude/routing-modelos.json` por corrida, con su modelo PINEADO tal cual está ahí.
 *   - Tope duro: el gasto acumulado de TODAS las corridas (libro `llamadas.jsonl`) no pasa de US$2; si la siguiente
 *     pregunta lo rebasaría, se para y se reporta lo medido hasta ahí.
 *   - Saldo de OpenRouter antes y después (uso de la llave y de la cuenta).
 *   - La llave se lee de OPENROUTER_API_KEY o de `--env <archivo>`; jamás se imprime (presente, largo).
 *   - Latencias: regeneración (modelo + validación + datos con caché caliente) y consulta a la capa (en frío).
 *   - Detalle de los fallos SOLO de la partición `desarrollo`; de la `retenida`, ids y campos (para no iterar el
 *     prompt contra ella).
 *
 * Uso: node tools/estudio-dashboards/evaluacion/mide.mjs --nivel voz [--env ../../.env.local] [--solo desarrollo|retenida] [--ids q1,q2] [--nombre x]
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { cargaCatalogo, consultor, interpreta, puntua, resuelve, construyeCatalogo } from '../dist/index.js'
import { modeloOpenRouter, saldoOpenRouter } from '../dist/openrouter.js'
import { puertoGolfoNorte } from '../laboratorio/puerto.mjs'
import { MAPA_GN } from '../laboratorio/perfil.mjs'

const AQUI = import.meta.dirname
const RAIZ = join(AQUI, '..', '..', '..')
const SALIDA = join(RAIZ, 'docs', 'goals', 'estudio-dashboards-medicion')
const LIBRO = join(SALIDA, 'llamadas.jsonl')
const TOPE = 2.0
const arg = (n, d) => process.argv.find((_, i) => process.argv[i - 1] === n) ?? d
const nivel = arg('--nivel', 'voz')
const solo = arg('--solo', null)
/** `--ids q047,q048` repite solo esas preguntas (p. ej. las que murieron por un error del proveedor). */
const ids = arg('--ids', null)?.split(',')
/** `--nombre corrida3` separa el archivo de salida de las corridas anteriores. */
const nombre = arg('--nombre', null)

function llave() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  const archivo = arg('--env', null)
  if (!archivo || !existsSync(archivo)) return ''
  const linea = readFileSync(archivo, 'utf8').split('\n').find((l) => /^\s*OPENROUTER_API_KEY\s*=/.test(l))
  return linea ? linea.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '') : ''
}

const gastado = () => (existsSync(LIBRO) ? readFileSync(LIBRO, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []).reduce((s, l) => s + (l.costoUsd ?? l.costoEstimadoUsd ?? 0), 0)
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null }

async function saldo(k) {
  const cuenta = await saldoOpenRouter(k, fetch).catch((e) => ({ error: e.message }))
  const r = await fetch('https://openrouter.ai/api/v1/key', { headers: { authorization: `Bearer ${k}` } }).catch(() => null)
  const j = r?.ok ? await r.json() : null
  return { cuenta, llave: j?.data ? { uso: j.data.usage, limite: j.data.limit, restante: j.data.limit_remaining } : null }
}

async function principal() {
  const routing = JSON.parse(readFileSync(join(RAIZ, '.claude', 'routing-modelos.json'), 'utf8'))
  const cfg = routing.niveles[nivel]
  if (!cfg) throw new Error(`no hay nivel «${nivel}» en el routing`)
  const k = llave()
  console.log(`▸ llave OPENROUTER_API_KEY: ${k ? `presente (${k.length} caracteres)` : 'AUSENTE'}`)
  if (!k) process.exit(2)
  const set = JSON.parse(readFileSync(join(AQUI, 'set-referencia.json'), 'utf8'))
  const sha = createHash('sha256').update(readFileSync(join(AQUI, 'set-referencia.json'))).digest('hex')
  const congelado = readFileSync(join(AQUI, 'set-referencia.sha256'), 'utf8').split(/\s/)[0]
  if (sha !== congelado) throw new Error('el set no coincide con su hash congelado: no se mide')
  console.log(`▸ set ${sha.slice(0, 16)}… (= congelado) · nivel ${nivel} → ${cfg.modelo} (${cfg.precio.entrada}/${cfg.precio.salida} USD por M)`)
  const antes = await saldo(k)
  console.log(`▸ saldo antes: ${JSON.stringify(antes)}`)
  const puerto = puertoGolfoNorte()
  const resultados = []
  try {
    const cat = await cargaCatalogo(puerto)
    const x = consultor(puerto, cat)
    const tableros = Object.fromEntries(['growth', 'ejecutivo', 'vacio'].map((t) => [t, JSON.parse(readFileSync(join(AQUI, '..', 'laboratorio', 'tableros', `${t}.json`), 'utf8'))]))
    // Consulta en FRÍO (sin caché) y caché caliente para la regeneración.
    const frio = consultor(puerto, cat, { cache: 0 })
    const consultasFrio = []
    for (const t of Object.values(tableros)) for (const c of Object.values((await resuelve(frio, t, MAPA_GN)).componentes)) for (const r of c.consultas) consultasFrio.push(r.totalMs)
    for (const t of Object.values(tableros)) await resuelve(x, t, MAPA_GN)
    const modelo = modeloOpenRouter({ llave: k, modelo: cfg.modelo, fetch, cabeceras: { 'X-Title': 'estudio-dashboards (laboratorio)' } })
    const preguntas = set.preguntas.filter((q) => (!solo || q.particion === solo) && (!ids || ids.includes(q.id)))
    mkdirSync(SALIDA, { recursive: true })
    for (const [i, q] of preguntas.entries()) {
      const llevamos = gastado()
      if (llevamos >= TOPE - 0.02) { console.log(`■ tope: ${llevamos.toFixed(4)} USD gastados de ${TOPE}; se para en la pregunta ${i + 1}`); break }
      const base = tableros[q.tablero]
      const t0 = performance.now()
      const registrador = (l) => appendFileSync(LIBRO, `${JSON.stringify({ nivel, modelo: l.modelo, pregunta: q.id, intento: l.intento, uso: l.uso, costoUsd: l.costoUsd, costoEstimadoUsd: l.uso ? (l.uso.entrada - l.uso.cacheados) * cfg.precio.entrada / 1e6 + l.uso.cacheados * cfg.precio.lectura_cache / 1e6 + l.uso.salida * cfg.precio.salida / 1e6 : null, ms: Math.round(l.ms), cuando: l.cuando })}\n`)
      let v
      try { v = await interpreta({ consultor: x, modelo, corte: '2026-09', contexto: 'Distribuidora Golfo Norte, empresa ficticia', registrador }, base, 0, q.instruccion, q.seleccion ?? null) }
      catch (e) { v = { plan: null, resultado: null, error: e.message, llamadas: [], ms: { modelo: 0, total: 0 }, costoUsd: null, intentos: 0 } }
      const d = v.resultado?.aplicado?.dashboard
      const tDatos = performance.now()
      if (d) await resuelve(x, d, MAPA_GN)
      const regeneracion = performance.now() - t0
      const s = puntua(q, v, base.componentes.map((c) => c.id))
      resultados.push({ id: q.id, tipo: q.tipo, particion: q.particion, correcta: s.correcta, campos: s.campos, intentos: v.intentos, modeloMs: Math.round(v.ms.modelo), datosMs: d ? Math.round(performance.now() - tDatos) : null, regeneracionMs: Math.round(regeneracion), costoUsd: v.costoUsd, error: v.error, ...(q.particion === 'desarrollo' && !s.correcta ? { instruccion: q.instruccion, entendi: v.entendi, plan: v.plan } : {}) })
      process.stdout.write(s.correcta ? '·' : q.particion === 'desarrollo' ? 'x' : 'r')
    }
    console.log('')
    const despues = await saldo(k)
    const r = resumen(resultados, consultasFrio, cfg, antes, despues, sha)
    writeFileSync(join(SALIDA, `medicion-${nivel}${solo ? `-${solo}` : ''}${ids ? '-reintento' : ''}${nombre ? `-${nombre}` : ''}.json`), `${JSON.stringify({ ...r, resultados }, null, 1)}\n`)
    imprime(r, resultados)
  } finally { await puerto.cierra() }
}

function resumen(rs, consultasFrio, cfg, antes, despues, sha) {
  const grupo = (f) => Object.fromEntries([...new Set(rs.map(f))].sort().map((k) => { const g = rs.filter((r) => f(r) === k); return [k, { n: g.length, correctas: g.filter((r) => r.correcta).length, precision: g.length ? g.filter((r) => r.correcta).length / g.length : null }] }))
  const costos = rs.map((r) => r.costoUsd).filter((c) => c !== null)
  return {
    nivel, modelo: cfg.modelo, set: sha, fecha: new Date().toISOString(), n: rs.length,
    precision: rs.length ? rs.filter((r) => r.correcta).length / rs.length : null,
    porTipo: grupo((r) => r.tipo), porParticion: grupo((r) => r.particion),
    costo: { totalUsd: costos.reduce((s, c) => s + c, 0), sinCosto: rs.length - costos.length, porInstruccionUsd: costos.length ? costos.reduce((s, c) => s + c, 0) / costos.length : null, libroAcumuladoUsd: gastado() },
    latencia: { modeloP50: pct(rs.map((r) => r.modeloMs), 0.5), modeloP95: pct(rs.map((r) => r.modeloMs), 0.95), regeneracionP50: pct(rs.map((r) => r.regeneracionMs), 0.5), regeneracionP95: pct(rs.map((r) => r.regeneracionMs), 0.95), consultaFrioP50: pct(consultasFrio, 0.5), consultaFrioP95: pct(consultasFrio, 0.95), consultas: consultasFrio.length },
    saldo: { antes, despues },
  }
}

function imprime(r, rs) {
  console.log(`\n▸ ${r.modelo}: ${(100 * r.precision).toFixed(1)} % (${rs.filter((x) => x.correcta).length}/${r.n})`)
  for (const [t, g] of Object.entries(r.porTipo)) console.log(`   ${t.padEnd(10)} ${String(g.correctas).padStart(2)}/${String(g.n).padEnd(2)} ${(100 * g.precision).toFixed(1)} %`)
  for (const [t, g] of Object.entries(r.porParticion)) console.log(`   [${t}] ${g.correctas}/${g.n} ${(100 * g.precision).toFixed(1)} %`)
  console.log(`▸ costo: ${r.costo.totalUsd.toFixed(4)} USD (${r.costo.porInstruccionUsd?.toFixed(5)} por instrucción; sin costo: ${r.costo.sinCosto}); libro acumulado ${r.costo.libroAcumuladoUsd.toFixed(4)} USD`)
  console.log(`▸ latencia ms: modelo p50 ${r.latencia.modeloP50} p95 ${r.latencia.modeloP95} · regeneración p50 ${r.latencia.regeneracionP50} p95 ${r.latencia.regeneracionP95} · consulta en frío p50 ${Math.round(r.latencia.consultaFrioP50)} p95 ${Math.round(r.latencia.consultaFrioP95)} (${r.latencia.consultas})`)
  console.log(`▸ saldo después: ${JSON.stringify(r.saldo.despues)}`)
  const fallos = rs.filter((x) => !x.correcta)
  console.log(`▸ fallos (${fallos.length}):`)
  for (const f of fallos) console.log(`   ${f.id} [${f.tipo}/${f.particion}] ${Object.entries(f.campos).filter(([, ok]) => !ok).map(([c]) => c).join(', ')}${f.error ? ` · ${f.error.slice(0, 140)}` : ''}${f.instruccion ? `\n      «${f.instruccion}» → ${f.entendi}` : ''}`)
}

principal().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1) })
