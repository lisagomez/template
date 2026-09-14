#!/usr/bin/env node
/**
 * Evaluador ESTRUCTURAL (spec 011, RF-10): aplica los criterios binarios de `criterios.json` que
 * un script puede decidir sin juicio, y escribe `trayectorias/evaluaciones/<fecha>-estructural.json`.
 *
 * Los criterios de juicio los responde un agente distinto del ejecutor y se guardan aparte con
 * `--veredicto RUTA` (un JSON {evaluador, vio, veredictos: {id: {criterio: bool}}}). El informe
 * funde los dos. Este script NUNCA invoca al modelo: no evalua nada que exija juicio.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DATOS = join(raiz, 'trayectorias', 'datos')
const EVAL = join(raiz, 'trayectorias', 'evaluaciones')
const criterios = JSON.parse(readFileSync(join(raiz, 'trayectorias', 'criterios.json'), 'utf8'))
const routing = JSON.parse(readFileSync(join(raiz, '.claude', 'routing-modelos.json'), 'utf8'))
const modelosDelCatalogo = new Set(Object.values(routing.niveles ?? {}).flatMap((n) => [n.modelo, n.alternativa_abierta?.modelo].filter(Boolean)))
const BASE_PAG_MIN = 197

export function leeTrayectorias() {
  const salida = []
  const recorre = (dir) => {
    if (!existsSync(dir)) return
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, e.name)
      if (e.isDirectory()) recorre(ruta)
      else if (e.name.endsWith('.json')) salida.push(JSON.parse(readFileSync(ruta, 'utf8')))
    }
  }
  recorre(DATOS)
  return salida.sort((a, b) => a.cuando.inicio.localeCompare(b.cuando.inicio))
}

const total = (o) => Object.values(o ?? {}).reduce((a, b) => a + b, 0)

const ESTRUCTURALES = {
  fabrica: {
    gate_corrido: (t) => t.gates.length > 0,
    sin_gate_rojo_final: (t) => t.gates.every((g) => g.resultado !== 'rojo'),
    errores_acotados: (t) => total(t.acciones.herramientas) === 0 || t.resultado.errores / total(t.acciones.herramientas) <= 0.05,
    cache_aprovechado: (t) => t.uso !== null && t.uso.salida > 0 && (t.uso.cacheLectura ?? 0) >= 20 * t.uso.salida,
    uso_declarado: (t) => t.uso !== null || t.cobertura.faltan.includes('uso'),
  },
  aplicacion: {
    coste_declarado: (t) => (t.uso !== null && t.costoUsd !== null) || (t.uso === null && t.costoUsd === null && t.cobertura.faltan.includes('uso')),
    modelo_del_catalogo: (t) => Object.keys(t.modelos).every((m) => modelosDelCatalogo.has(m)),
    sin_fallo: (t) => (t.resultado.errores ?? 0) === 0,
    latencia_medida: (t) => t.tiempos.totalMs !== null,
  },
  herramientas: {
    sin_documentos_perdidos: (t) => (t.resultado.errores ?? 0) === 0,
    concluyente_o_declarado: (t) => (t.avisos ?? []).some((a) => /concluyente/.test(a)),
    rendimiento_sobre_base: (t) => (t.resultado.metricas?.paginasPorMinutoMotor ?? 0) >= BASE_PAG_MIN,
    revision_acotada: (t) => (t.resultado.campos ?? 0) === 0 || (t.resultado.revisionHumana ?? 0) <= (t.resultado.campos ?? 0) / 2,
  },
}

export function evaluaEstructural(trayectorias) {
  const salida = {}
  for (const t of trayectorias) {
    const reglas = ESTRUCTURALES[t.linea] ?? {}
    const evals = {}
    for (const [nombre, regla] of Object.entries(reglas)) {
      if (criterios[t.linea]?.estructurales?.[nombre] === undefined) continue
      evals[nombre] = Boolean(regla(t))
    }
    salida[t.id] = evals
  }
  return salida
}

const esPrincipal = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (esPrincipal) {
  mkdirSync(EVAL, { recursive: true })
  const i = process.argv.indexOf('--veredicto')
  if (i !== -1) {
    const v = JSON.parse(readFileSync(process.argv[i + 1], 'utf8'))
    if (typeof v.evaluador !== 'string' || typeof v.vio !== 'string' || typeof v.veredictos !== 'object') { console.error('veredicto: {evaluador, vio, veredictos}'); process.exit(1) }
    const fecha = new Date().toISOString().slice(0, 10)
    // Cada pasada se conserva: la historia de veredictos es lo que muestra si el formato mejoro.
    let n = 1
    while (existsSync(join(EVAL, `${fecha}-juicio-${n}.json`))) n++
    writeFileSync(join(EVAL, `${fecha}-juicio-${n}.json`), JSON.stringify({ fecha, pasada: n, ...v }, null, 1) + '\n')
    console.log(`veredicto de juicio guardado (pasada ${n}): ${Object.keys(v.veredictos).length} trayectoria(s), evaluador ${v.evaluador}`)
    process.exit(0)
  }
  const trayectorias = leeTrayectorias()
  const evals = evaluaEstructural(trayectorias)
  const fecha = new Date().toISOString().slice(0, 10)
  writeFileSync(join(EVAL, `${fecha}-estructural.json`), JSON.stringify({ fecha, evaluador: 'scripts/trayectorias/evalua.mjs (estructural, sin modelo)', trayectorias: trayectorias.length, evals }, null, 1) + '\n')
  const porLinea = {}
  for (const t of trayectorias) {
    const e = evals[t.id]
    const l = (porLinea[t.linea] ??= { n: 0, criterios: {} })
    l.n++
    for (const [c, ok] of Object.entries(e)) { const k = (l.criterios[c] ??= { si: 0, no: 0 }); if (ok) k.si++; else k.no++ }
  }
  for (const [linea, l] of Object.entries(porLinea)) {
    console.log(`\n${linea} (${l.n}):`)
    for (const [c, k] of Object.entries(l.criterios)) console.log(`  ${c.padEnd(26)} si ${String(k.si).padStart(3)} · no ${String(k.no).padStart(3)}`)
  }
  console.log(`\nescrito en trayectorias/evaluaciones/${fecha}-estructural.json · los criterios de juicio los responde un agente distinto (--veredicto)`)
}
