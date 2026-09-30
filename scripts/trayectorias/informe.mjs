#!/usr/bin/env node
/**
 * Informe por periodos (spec 011, RF-12 y RF-13): compara dos periodos por linea y actor y marca
 * regresiones y mejoras, cada cifra con su fuente (los ids de trayectoria que la sostienen).
 *
 *   node scripts/trayectorias/informe.mjs [--corte 2026-09-01]   # sin corte: la mediana de fechas
 *
 * Reglas: los huecos no se suman como ceros (se cuenta cuantas trayectorias no tienen el dato);
 * si un periodo tiene menos de la mitad de cobertura que el otro se dice y NO se marca regresion
 * por eso; una regresion es un cambio a peor de mas del 20 % en una metrica con al menos 3
 * trayectorias en cada periodo; una tasa del periodo es total ÷ total (`metricas.mjs`).
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { leeTrayectorias, evaluaEstructural } from './evalua.mjs'
import { metricasDe, agrega, MEJOR_SI_SUBE } from './metricas.mjs'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const EVAL = join(raiz, 'trayectorias', 'evaluaciones')
const INFORMES = join(raiz, 'trayectorias', 'informes')
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? null : process.argv[i + 1] }
const MINIMO = 3
const UMBRAL = 0.2

const trayectorias = leeTrayectorias()
if (trayectorias.length === 0) { console.log('sin trayectorias: no hay nada que comparar'); process.exit(0) }
const fechas = trayectorias.map((t) => t.cuando.inicio).sort()
const corte = arg('corte') ?? fechas[Math.floor(fechas.length / 2)].slice(0, 10)
const periodoDe = (t) => (t.cuando.inicio.slice(0, 10) < corte ? 'antes' : 'despues')

// Evals: las estructurales se recalculan; las de juicio se leen del ultimo veredicto guardado.
const estructural = evaluaEstructural(trayectorias)
let juicio = null
if (existsSync(EVAL)) {
  const ultimo = readdirSync(EVAL).filter((n) => /-juicio(-\d+)?\.json$/.test(n)).sort().pop()
  if (ultimo) juicio = JSON.parse(readFileSync(join(EVAL, ultimo), 'utf8'))
}

const actorDe = (t) => t.linea === 'fabrica' ? (t.actor.tarea ?? 'sin-tarea') : t.linea === 'aplicacion' ? (t.actor.feature ?? t.actor.tarea) : (t.actor.herramienta ?? 'herramienta')
const evalsDe = (t) => ({ ...estructural[t.id], ...(juicio?.veredictos?.[t.id] ?? {}) })

// Dos niveles: la LINEA entera (donde de verdad hay base para comparar) y cada actor dentro de
// ella (donde casi nunca la hay todavia, y se dice). Sin el agregado, 21 sesiones con skills
// distintos daban 15 grupos de una trayectoria y ningun hallazgo posible.
const grupos = {}
for (const t of trayectorias) {
  for (const clave of [`${t.linea} · (todas)`, `${t.linea} · ${actorDe(t)}`]) {
    const g = (grupos[clave] ??= { linea: t.linea, antes: [], despues: [] })
    g[periodoDe(t)].push({ id: t.id, m: metricasDe(t, evalsDe(t)), modelos: t.modelos })
  }
}

/**
 * La mezcla de modelos por periodo, y si cambio. Aplicar las propuestas del 2026-09-13 enseno
 * que la «regresion» de tokens de salida por llamada era en buena parte un cambio de modelo
 * (Fable 5.1 emite 2,4 veces mas por llamada que Opus 5, con el razonamiento dentro de la
 * salida): sin esta fila, el informe culpaba a los skills de lo que hacia el modelo.
 */
function mezclaDeModelos(items) {
  const cuenta = {}
  for (const x of items) for (const [m, n] of Object.entries(x.modelos ?? {})) cuenta[m] = (cuenta[m] ?? 0) + n
  const total = Object.values(cuenta).reduce((a, b) => a + b, 0)
  const dominante = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0]
  return { cuenta, total, dominante: dominante ? dominante[0] : null, cuota: dominante && total ? dominante[1] / total : null }
}
const confundidoPorModelo = (g) => {
  const a = mezclaDeModelos(g.antes); const d = mezclaDeModelos(g.despues)
  if (a.dominante === null || d.dominante === null) return null
  const nuevos = Object.keys(d.cuenta).filter((m) => !(m in a.cuenta))
  const cambio = a.dominante !== d.dominante || nuevos.length > 0 || Math.abs((a.cuota ?? 0) - (d.cuota ?? 0)) > 0.3
  return cambio ? `mezcla de modelos distinta (antes ${a.dominante} ${Math.round((a.cuota ?? 0) * 100)} %; despues ${d.dominante} ${Math.round((d.cuota ?? 0) * 100)} %${nuevos.length ? `, nuevos: ${nuevos.join(', ')}` : ''})` : null
}

const lineas = [`# Informe de trayectorias — corte ${corte}`, '', `> ${trayectorias.length} trayectorias · antes: ${trayectorias.filter((t) => periodoDe(t) === 'antes').length} · despues: ${trayectorias.filter((t) => periodoDe(t) === 'despues').length} · evals de juicio: ${juicio ? `${Object.keys(juicio.veredictos).length} trayectorias por ${juicio.evaluador}` : 'ninguna todavia'}`, '', '> Los huecos no se suman como ceros: cada celda dice sobre cuantas trayectorias se calculo. Una regresion (▼) o mejora (▲) exige al menos 3 en cada periodo y un cambio de mas del 20 %; con cobertura desigual (menos de la mitad) se dice y no se marca. La fabrica se compara por intensidad (por llamada, por gate, por herramienta), no por totales de sesion, que crecen con la duracion; y la intensidad de un periodo es total ÷ total, no la media de las tasas de cada sesion (una sesion corta pesaria lo mismo que una larga).', '']
const hallazgos = []
for (const [nombre, g] of Object.entries(grupos).sort()) {
  const confusor = confundidoPorModelo(g)
  lineas.push(`## ${nombre}`, '')
  if (confusor) lineas.push(`> ⚠ ${confusor}: las metricas por llamada (salida, ms) NO se comparan como regresion; se marcan «confundido por modelo».`, '')
  lineas.push('| metrica | antes | despues | cambio |', '|---|---|---|---|')
  for (const metrica of Object.keys(MEJOR_SI_SUBE)) {
    const a = g.antes.map((x) => x.m[metrica]).filter((v) => v !== null)
    const d = g.despues.map((x) => x.m[metrica]).filter((v) => v !== null)
    if (a.length === 0 && d.length === 0) continue
    const ma = agrega(a); const md = agrega(d)
    const f = (v, n, total) => v === null ? `— (0/${total})` : `${Number.isInteger(v) ? v : v.toFixed(3)} (${n}/${total})`
    let cambio = ''
    if (ma !== null && md !== null && a.length >= MINIMO && d.length >= MINIMO) {
      const desigual = Math.min(a.length, d.length) < Math.max(a.length, d.length) / 2
      const delta = ma === 0 ? (md === 0 ? 0 : 1) : (md - ma) / Math.abs(ma)
      const mejora = MEJOR_SI_SUBE[metrica] ? delta > UMBRAL : delta < -UMBRAL
      const peor = MEJOR_SI_SUBE[metrica] ? delta < -UMBRAL : delta > UMBRAL
      const porLlamada = metrica === 'salidaPorLlamada' || metrica === 'msPorLlamada' || metrica === 'costoUsd' || metrica === 'costoPorLlamada'
      const confundido = confusor !== null && porLlamada
      cambio = desigual ? `cobertura desigual (${a.length} vs ${d.length}): no se marca` : confundido ? `${(delta * 100).toFixed(0)} % · confundido por modelo, no se marca` : peor ? `▼ regresion ${(delta * 100).toFixed(0)} %` : mejora ? `▲ mejora ${(delta * 100).toFixed(0)} %` : `${(delta * 100).toFixed(0)} %`
      if (!desigual && !confundido && (peor || mejora)) hallazgos.push({ grupo: nombre, metrica, delta, peor, fuente: [...g.antes, ...g.despues].filter((x) => x.m[metrica] !== null).map((x) => x.id) })
    } else if (ma !== null || md !== null) cambio = `sin base (min ${MINIMO} por periodo)`
    lineas.push(`| ${metrica} | ${f(ma, a.length, g.antes.length)} | ${f(md, d.length, g.despues.length)} | ${cambio} |`)
  }
  lineas.push('')
}
lineas.push('## Hallazgos', '')
if (hallazgos.length === 0) lineas.push('- Ninguna regresion ni mejora marcable con la cobertura actual.')
for (const h of hallazgos) lineas.push(`- ${h.peor ? '▼' : '▲'} **${h.grupo}** · \`${h.metrica}\` ${(h.delta * 100).toFixed(0)} % · fuente: ${h.fuente.slice(0, 6).map((id) => `\`${id}\``).join(', ')}${h.fuente.length > 6 ? ` y ${h.fuente.length - 6} mas` : ''}`)
lineas.push('')
mkdirSync(INFORMES, { recursive: true })
const fecha = new Date().toISOString().slice(0, 10)
writeFileSync(join(INFORMES, `${fecha}.md`), lineas.join('\n'))
writeFileSync(join(INFORMES, `${fecha}.json`), JSON.stringify({ fecha, corte, hallazgos }, null, 1) + '\n')
console.log(lineas.join('\n'))
console.log(`\nescrito en trayectorias/informes/${fecha}.md`)
