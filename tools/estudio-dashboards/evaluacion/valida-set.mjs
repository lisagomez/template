#!/usr/bin/env node
/**
 * Valida la FORMA del set de referencia contra `CONTRATO.md` y el catálogo: que cada respuesta esperada nombre
 * métricas que existen, dimensiones que esas métricas alcanzan, valores del dominio e ids de los tableros base.
 * No juzga si la respuesta es la correcta: eso es del revisor.
 *
 * Uso:  node valida-set.mjs [set-referencia.json] [--resumen]
 *   --resumen  solo conteos (lo que corre quien escribe el prompt: no lee las preguntas)
 * Exit 0 si el set es válido; 1 si no.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const AQUI = import.meta.dirname
const args = process.argv.slice(2)
const resumen = args.includes('--resumen')
const ruta = args.find((a) => !a.startsWith('--')) ?? join(AQUI, 'set-referencia.json')
const cat = JSON.parse(readFileSync(join(AQUI, 'catalogo-golfo-norte.json'), 'utf8'))
const metricas = new Map(cat.metricas.map((m) => [m.nombre, m]))
const tableros = Object.fromEntries(['growth', 'ejecutivo', 'vacio'].map((t) => [t, JSON.parse(readFileSync(join(AQUI, '..', 'laboratorio', 'tableros', `${t}.json`), 'utf8'))]))
const TIPOS = ['crear', 'modificar', 'filtrar', 'analizar', 'explicar', 'alertar']
const OPS = ['igual', 'distinto', 'en', 'no_en', 'mayor', 'menor', 'mayor_igual', 'menor_igual']
const ORDEN = { day: 0, week: 1, month: 2, quarter: 3, year: 4 }
const MES = /^\d{4}-(0[1-9]|1[0-2])$/

function alcanza(m, dim) {
  if (m.dimensiones.some((d) => d.tipo === 'categorica' && d.nombre === dim)) return true
  const i = dim.lastIndexOf('__')
  const [raiz, grano] = [dim.slice(0, i), dim.slice(i + 2)]
  return grano in ORDEN && m.dimensiones.some((d) => {
    if (d.tipo !== 'tiempo') return false
    const j = d.nombre.lastIndexOf('__'); const g = d.nombre.slice(j + 2)
    return (g in ORDEN ? d.nombre.slice(0, j) : d.nombre) === raiz && ORDEN[grano] >= (ORDEN[g] ?? 0)
  })
}

function validaEsperado(q, e, donde) {
  const err = []
  if (typeof e.responde !== 'boolean') err.push(`${donde}: responde debe ser booleano`)
  if (!Array.isArray(e.metricas) || !e.metricas.length) err.push(`${donde}: metricas vacía`)
  if (e.responde === false) return err
  for (const n of e.metricas ?? []) if (!metricas.has(n)) err.push(`${donde}: métrica inexistente «${n}»`)
  const ms = (e.metricas ?? []).map((n) => metricas.get(n)).filter(Boolean)
  for (const d of e.dimensiones ?? []) if (ms.length && !ms.some((m) => alcanza(m, d))) err.push(`${donde}: ninguna métrica alcanza «${d}»`)
  for (const f of e.filtros ?? []) {
    if (!OPS.includes(f.operador)) err.push(`${donde}: operador inválido ${f.operador}`)
    if (ms.length && !ms.some((m) => alcanza(m, f.dimension))) err.push(`${donde}: ninguna métrica alcanza el filtro «${f.dimension}»`)
    const dom = cat.dominios[f.dimension]
    if (dom && !['mayor', 'menor', 'mayor_igual', 'menor_igual'].includes(f.operador)) {
      for (const v of f.valores ?? []) if (!dom.map((x) => x.toLowerCase()).includes(String(v).toLowerCase())) err.push(`${donde}: «${v}» no está en el dominio de ${f.dimension}`)
    }
  }
  if (e.periodo !== null && e.periodo !== undefined && !(MES.test(e.periodo.desde) && MES.test(e.periodo.hasta) && e.periodo.desde <= e.periodo.hasta)) err.push(`${donde}: periodo mal formado`)
  if (![null, undefined, 'anio_anterior'].includes(e.comparar)) err.push(`${donde}: comparar inválido`)
  if (q.tipo === 'modificar') {
    if (!Array.isArray(e.componentes_tocados) || !e.componentes_tocados.length) err.push(`${donde}: modificar exige componentes_tocados`)
    const ids = new Set(tableros[q.tablero]?.componentes.map((c) => c.id) ?? [])
    for (const id of e.componentes_tocados ?? []) if (id !== '+nuevo' && !ids.has(id)) err.push(`${donde}: «${id}» no es un componente del tablero ${q.tablero}`)
  } else if (e.componentes_tocados !== null && e.componentes_tocados !== undefined) err.push(`${donde}: componentes_tocados solo en modificar`)
  if (q.tipo === 'alertar') {
    const a = e.alerta ?? {}
    if (!['cae_mas_de', 'sube_mas_de', 'debajo_de', 'encima_de'].includes(a.condicion) || typeof a.valor !== 'number' || !['%', 'pp', 'valor'].includes(a.unidad) || !['diaria', 'semanal', 'mensual'].includes(a.ventana)) err.push(`${donde}: alerta mal formada`)
  }
  return err
}

const set = JSON.parse(readFileSync(ruta, 'utf8'))
const preguntas = Array.isArray(set) ? set : set.preguntas
const errores = []
const ids = new Set()
for (const q of preguntas) {
  if (ids.has(q.id)) errores.push(`${q.id}: id repetido`)
  ids.add(q.id)
  if (!TIPOS.includes(q.tipo)) errores.push(`${q.id}: tipo inválido`)
  if (!tableros[q.tablero]) errores.push(`${q.id}: tablero inválido`)
  if (!['desarrollo', 'retenida'].includes(q.particion)) errores.push(`${q.id}: partición inválida`)
  if (typeof q.instruccion !== 'string' || q.instruccion.length < 5) errores.push(`${q.id}: instrucción vacía`)
  errores.push(...validaEsperado(q, q.esperado ?? {}, q.id))
  for (const [i, a] of (q.alternativas ?? []).entries()) errores.push(...validaEsperado(q, a, `${q.id}.alt${i}`))
}
const cuenta = (f) => Object.fromEntries([...new Set(preguntas.map(f))].sort().map((k) => [k, preguntas.filter((q) => f(q) === k).length]))
console.log(`preguntas: ${preguntas.length}`)
console.log('por tipo:', JSON.stringify(cuenta((q) => q.tipo)))
console.log('por partición:', JSON.stringify(cuenta((q) => q.particion)))
console.log('sin métrica:', preguntas.filter((q) => q.esperado?.responde === false).length, '· con selección:', preguntas.filter((q) => q.seleccion).length, '· con alternativas:', preguntas.filter((q) => (q.alternativas ?? []).length).length)
if (preguntas.length !== 100) errores.push(`el set tiene ${preguntas.length} preguntas, no 100`)
if (errores.length) {
  console.log(`✗ ${errores.length} error(es)${resumen ? ' (detalle oculto con --resumen)' : ''}`)
  if (!resumen) errores.forEach((e) => console.log(`  ${e}`))
  process.exit(1)
}
console.log('✓ set válido')
