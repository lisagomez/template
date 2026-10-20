/**
 * Versiones de verdad (deshacer, volver, comparar, oficial, almacenes con concurrencia) y la puerta de las cifras
 * (consultor con límites y caché; resolver que no suma en el cliente ni aplica filtros que la métrica no alcanza).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ConsultaInvalida, comparaVersiones, construyeCatalogo, consultor, deshace, fijaOficial, memoriaVersiones, nuevoHistorial,
  registra, resuelve, versionActual, vuelveA, corre, type Dashboard,
} from '../dist/index.js'
import { archivoVersiones } from '../dist/almacenes/archivo.js'
import { FOTO, doble, tablero } from './_doble.ts'

const cat = construyeCatalogo(FOTO, FOTO.dominios)
const T = '2026-10-20T12:00:00.000Z'
const conTitulo = (d: Dashboard, titulo: string): Dashboard => ({ ...d, titulo })

test('deshacer y volver registran versiones nuevas: la historia no se reescribe', () => {
  let h = nuevoHistorial('ejecutivo', tablero('ejecutivo'), T)
  h = registra(h, { dashboard: conTitulo(tablero('ejecutivo'), 'v1'), autor: 'agente', instruccion: 'a', parche: null, resumen: 'r1', cuando: T })
  h = registra(h, { dashboard: conTitulo(tablero('ejecutivo'), 'v2'), autor: 'agente', instruccion: 'b', parche: null, resumen: 'r2', cuando: T })
  h = deshace(h, T)
  assert.equal(h.versiones.length, 4)
  assert.equal(versionActual(h).dashboard.titulo, 'v1')
  assert.equal(versionActual(h).padre, 2)
  h = vuelveA(h, 0, T)
  assert.equal(versionActual(h).dashboard.titulo, 'Ventas ejecutivo')
  assert.equal(fijaOficial(h, 2).oficial, 2)
  assert.throws(() => deshace(nuevoHistorial('x', tablero('vacio'), T)), /nada que deshacer/)
})

test('comparar dos versiones: agregados, quitados, cambiados, movidos y globales', () => {
  const a = tablero('ejecutivo') as Dashboard
  const b: Dashboard = structuredClone(a)
  b.componentes = [b.componentes[1]!, b.componentes[0]!, { ...b.componentes[2]!, titulo: 'Regiones' } as Dashboard['componentes'][number], { id: 'nota', tipo: 'nota', texto: 'hola' }]
  b.filtros.periodo = { desde: '2026-07', hasta: '2026-09' }
  const d = comparaVersiones(a, b)
  assert.deepEqual(d.agregados, ['nota'])
  assert.deepEqual(d.quitados, ['por_categoria', 'tiendas'])
  assert.deepEqual(d.cambiados, [{ id: 'por_region', campos: ['titulo'] }])
  assert.deepEqual(d.movidos, ['tendencia', 'kpis'])
  assert.deepEqual(d.globales.map((g) => g.campo), ['filtros'])
})

test('almacenes: memoria y archivo rechazan pisar una versión que otro movió', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'estudio-versiones-'))
  try {
    for (const almacen of [memoriaVersiones(), archivoVersiones(dir)]) {
      const h0 = nuevoHistorial('ejecutivo', tablero('ejecutivo'), T)
      await almacen.guarda(h0, null)
      const h1 = registra(h0, { dashboard: conTitulo(h0.versiones[0]!.dashboard, 'v1'), autor: 'persona', instruccion: null, parche: null, resumen: 'r', cuando: T })
      await almacen.guarda(h1, 0)
      await assert.rejects(almacen.guarda(h1, 0), /conflicto de versión/)
      assert.equal((await almacen.lee('ejecutivo'))?.actual, 1)
      assert.deepEqual(await almacen.lista(), ['ejecutivo'])
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('consultor: valida antes de tocar la capa y cachea por consulta normalizada', async () => {
  const p = doble()
  const x = consultor(p, cat)
  await assert.rejects(x.consulta({ metricas: ['ventas_magicas'] }), ConsultaInvalida)
  await assert.rejects(x.consulta({ metricas: ['ventas_netas', 'roas_incremental'], agrupar: ['tienda__region'] }), /roas_incremental.*tienda__region/)
  await assert.rejects(x.consulta({ metricas: ['ventas_netas'], limite: 100000 }), /límite/)
  assert.equal(p.pedidas.length, 0, 'nada inválido llega a la capa')
  const q = { metricas: ['ventas_netas', 'pedidos'], agrupar: ['tienda__region'], filtros: [{ dimension: 'linea__canal', operador: 'en' as const, valores: ['Tienda', 'E-commerce'] }] }
  const a = await x.consulta(q)
  const b = await x.consulta({ ...q, metricas: ['pedidos', 'ventas_netas'], filtros: [{ ...q.filtros[0]!, valores: ['E-commerce', 'Tienda'] }] })
  assert.equal(a.desdeCache, false); assert.equal(b.desdeCache, true)
  assert.equal(p.pedidas.length, 1)
  assert.match(a.sql ?? '', /doble/)
})

test('resolver: comparar = misma métrica con el periodo corrido 12 meses, y ningún total sumado en el cliente', async () => {
  const p = doble()
  const d = await resuelve(consultor(p, cat), tablero('ejecutivo'))
  const kpi = d.componentes['kpis']!
  assert.equal(kpi.forma.tipo, 'valores')
  const delKpi = kpi.consultas.map((r) => r.consulta)
  assert.ok(delKpi.every((q) => !q.agrupar?.length), 'cada KPI es su propia consulta sin agrupar')
  assert.ok(delKpi.some((q) => q.periodo?.desde === '2025-01' && q.periodo.hasta === '2025-09'), 'y el año anterior, consultado aparte')
  assert.deepEqual(corre({ desde: '2026-07', hasta: '2026-09' }, 'periodo_anterior'), { desde: '2026-04', hasta: '2026-06' })
  if (kpi.forma.tipo === 'valores') {
    const margen = kpi.forma.valores.find((v) => v.metrica === 'margen_bruto_pct')!
    assert.equal(margen.tipoVariacion, 'pp', 'una métrica en % varía en puntos')
  }
})

test('resolver: un filtro global se aplica donde la métrica lo alcanza, se omite donde no, y se dice', async () => {
  const p = doble()
  const g = tablero('growth') as Dashboard
  g.componentes = g.componentes.map((c) => (c.tipo === 'mapa' ? { ...c, capas: ['reorden', 'senales'] } : c)) as Dashboard['componentes']
  const d: Dashboard = { ...g, filtros: { periodo: { desde: '2026-01', hasta: '2026-09' }, dimensiones: [{ dimension: 'linea__canal', operador: 'no_en', valores: ['Mayoreo'] }] }, seleccion: { dimension: 'tienda__tienda_nombre', valores: ['Mérida', 'Oaxaca'] } }
  const r = await resuelve(consultor(p, cat), d, { dimensionMapa: 'tienda__tienda_nombre', capasMapa: { reorden: 'combinaciones_bajo_reorden' } })
  const metas = r.componentes['metas']!
  assert.ok(metas.advertencias.some((a) => /linea__canal.*clientes_nuevos/.test(a)), metas.advertencias.join(' | '))
  const heroQ = r.componentes['principal']!.consultas[0]!.consulta
  assert.deepEqual(heroQ.filtros?.map((f) => f.dimension), ['linea__canal', 'tienda__tienda_nombre'])
  const mapaQ = r.componentes['mapa']!.consultas.map((x) => x.consulta)
  assert.ok(mapaQ.every((q) => !q.filtros?.some((f) => f.dimension === 'tienda__tienda_nombre')), 'la selección no filtra el propio mapa')
  assert.ok(mapaQ.some((q) => q.metricas[0] === 'combinaciones_bajo_reorden'), 'la capa de inventario se consulta')
  assert.equal(r.componentes['ciclo']!.forma.tipo, 'vacio')
})

test('una capa que no responde no tira el tablero: el componente lo dice', async () => {
  const r = await resuelve(consultor(doble({ falla: true }), cat), tablero('ejecutivo'))
  assert.match(r.componentes['kpis']!.error ?? '', /no responde/)
})
