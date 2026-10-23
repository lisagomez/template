/**
 * El contrato: el agente edita una especificación validada. Aquí los casos MALOS que el HECHO exige que se rechacen
 * (métrica inventada, dimensión inválida, SQL libre, filtro fuera de dominio, parche que toca de más) y los buenos
 * que tienen que pasar sin tocar lo que nadie pidió.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aplicaParche, construyeCatalogo, validaDashboard, type Dashboard } from '../dist/index.js'
import { FOTO, tablero } from './_doble.ts'

const cat = construyeCatalogo(FOTO, FOTO.dominios)
const ejecutivo = (): Dashboard => tablero('ejecutivo')
const codigos = (r: { ok: boolean; errores?: readonly { codigo: string }[] }) => (r.ok ? [] : r.errores!.map((e) => e.codigo))
const parche = (operaciones: unknown[], alcance: { tipo: string; componentes: string[] }, base = 0) => ({ esquema: 'estudio.parche/1', base, alcance, operaciones })

test('los tres tableros base validan contra el catálogo real', () => {
  for (const t of ['growth', 'ejecutivo', 'vacio']) assert.equal(validaDashboard(cat, tablero(t)).ok, true, t)
})

test('métrica inventada: se rechaza, no se aproxima', () => {
  const d = ejecutivo(); (d.componentes[1] as { metrica: string }).metrica = 'ventas_totales_ajustadas'
  assert.deepEqual(codigos(validaDashboard(cat, d)), ['metrica_inexistente'])
})

test('dimensión inválida: una métrica que no alcanza la dimensión se rechaza', () => {
  const d = ejecutivo(); d.componentes.push({ id: 'roas_region', tipo: 'barras', metrica: 'roas_incremental', dimension: 'tienda__region' })
  assert.deepEqual(codigos(validaDashboard(cat, d)), ['dimension_invalida'])
})

test('SQL libre: ni como campo, ni escondido en un texto o en un filtro', () => {
  const conCampo = { ...ejecutivo(), componentes: [{ id: 'x', tipo: 'tabla', metricas: ['ventas_netas'], dimension: 'tienda__region', sql: 'select 1' }] }
  assert.deepEqual(codigos(validaDashboard(cat, conCampo)), ['sql_libre'])
  const enTexto = { ...ejecutivo(), componentes: [{ id: 'n', tipo: 'nota', texto: 'select sum(venta_neta) from fct_ventas_lineas' }] }
  assert.deepEqual(codigos(validaDashboard(cat, enTexto)), ['sql_libre'])
  const enFiltro = parche([{ op: 'filtrar', agregar: [{ dimension: 'tienda__region', operador: 'en', valores: ["Golfo' union select * from raw_clientes --"] }] }], { tipo: 'filtrar', componentes: [] })
  assert.deepEqual(codigos(aplicaParche(cat, ejecutivo(), 0, enFiltro)), ['sql_libre'])
})

test('filtro fuera de dominio: el valor tiene que existir en la dimensión', () => {
  const p = parche([{ op: 'filtrar', agregar: [{ dimension: 'tienda__region', operador: 'en', valores: ['Pacífico'] }] }], { tipo: 'filtrar', componentes: [] })
  const r = aplicaParche(cat, ejecutivo(), 0, p)
  assert.deepEqual(codigos(r), ['valor_fuera_de_dominio'])
  assert.match(r.ok ? '' : r.errores[0]!.mensaje, /Centro, Golfo, Norte, Occidente, Sureste/)
})

test('métricas que no suman: participación de clientes activos y YoY sobre nueve meses se rechazan con su porqué', () => {
  const d = ejecutivo(); d.componentes.push({ id: 'p', tipo: 'progreso', metrica: 'clientes_activos', dimension: 'tienda__region' })
  assert.deepEqual(codigos(validaDashboard(cat, d)), ['no_sumable'])
  const y = ejecutivo(); y.componentes.push({ id: 'y', tipo: 'hero', metrica: 'crecimiento_ventas_yoy_pct' })
  const r = validaDashboard(cat, y)
  assert.deepEqual(codigos(r), ['desfase_en_periodo'])
  assert.match(r.ok ? '' : r.errores[0]!.mensaje, /año anterior completo/)
  const porMes = ejecutivo(); porMes.componentes.push({ id: 'y', tipo: 'linea', metrica: 'crecimiento_ventas_yoy_pct', grano: 'month' })
  assert.equal(validaDashboard(cat, porMes).ok, true, 'por mes sí')
})

test('modificar: el parche toca SOLO el componente pedido y lo demás queda idéntico', () => {
  const p = parche([{ op: 'cambiar', id: 'por_region', cambios: { tipo: 'linea' } }], { tipo: 'modificar', componentes: ['por_region'] })
  const r = aplicaParche(cat, ejecutivo(), 0, p)
  assert.equal(r.ok, true, JSON.stringify(r))
  if (!r.ok) return
  assert.deepEqual(r.valor.tocados, ['por_region'])
  assert.deepEqual(r.valor.dashboard.componentes.find((c) => c.id === 'por_region'), { id: 'por_region', tipo: 'linea', metrica: 'ventas_netas', grano: 'month', serie: 'tienda__region' })
  for (const c of ejecutivo().componentes.filter((x) => x.id !== 'por_region')) assert.deepEqual(r.valor.dashboard.componentes.find((x) => x.id === c.id), c)
})

test('el merge silencioso: un parche que borra o cambia lo que no se pidió se rechaza entero', () => {
  const borra = parche([{ op: 'cambiar', id: 'por_region', cambios: { tipo: 'linea' } }, { op: 'quitar', id: 'tiendas' }], { tipo: 'modificar', componentes: ['por_region'] })
  const r = aplicaParche(cat, ejecutivo(), 0, borra)
  assert.deepEqual(codigos(r), ['alcance'])
  assert.match(r.ok ? '' : r.errores[0]!.mensaje, /«tiendas», que la instrucción no pidió/)
  const cambia = parche([{ op: 'cambiar', id: 'kpis', cambios: { metricas: ['ventas_netas'] } }], { tipo: 'modificar', componentes: ['tendencia'] })
  assert.deepEqual(codigos(aplicaParche(cat, ejecutivo(), 0, cambia)), ['alcance'])
  const regenera = parche([{ op: 'reemplazar', dashboard: { ...ejecutivo(), componentes: [] } }], { tipo: 'modificar', componentes: ['kpis'] })
  assert.deepEqual(codigos(aplicaParche(cat, ejecutivo(), 0, regenera)), ['operacion_no_permitida'])
})

test('cada tipo de instrucción admite solo sus operaciones', () => {
  const filtrarQueCambia = parche([{ op: 'cambiar', id: 'kpis', cambios: { titulo: 'x' } }], { tipo: 'filtrar', componentes: ['kpis'] })
  assert.deepEqual(codigos(aplicaParche(cat, ejecutivo(), 0, filtrarQueCambia)), ['operacion_no_permitida'])
  const analizarQueQuita = parche([{ op: 'quitar', id: 'kpis' }], { tipo: 'analizar', componentes: ['kpis'] })
  assert.deepEqual(codigos(aplicaParche(cat, ejecutivo(), 0, analizarQueQuita)), ['operacion_no_permitida'])
  const hallazgo = { id: 'hallazgo_1', tipo: 'hallazgo', texto: 'El margen cae 7.8 pp.', evidencia: [{ etiqueta: 'cambio', valor: -7.8, unidad: 'pp', consulta: 'derivado' }] }
  const r = aplicaParche(cat, ejecutivo(), 0, parche([{ op: 'agregar', componente: hallazgo, despues_de: 'kpis' }], { tipo: 'analizar', componentes: ['hallazgo_1'] }))
  assert.equal(r.ok, true, JSON.stringify(r))
  if (r.ok) assert.equal(r.valor.dashboard.componentes[1]!.id, 'hallazgo_1')
})

test('filtrar: los filtros globales se reemplazan por dimensión y el periodo cambia sin tocar componentes', () => {
  const p = parche([{ op: 'filtrar', agregar: [{ dimension: 'linea__canal', operador: 'no_en', valores: ['Mayoreo'] }] }, { op: 'periodo', periodo: { desde: '2026-07', hasta: '2026-09' }, comparar: null }], { tipo: 'filtrar', componentes: [] })
  const r = aplicaParche(cat, ejecutivo(), 0, p)
  assert.equal(r.ok, true, JSON.stringify(r))
  if (!r.ok) return
  assert.deepEqual(r.valor.tocados, [])
  assert.deepEqual([...r.valor.globales].sort(), ['filtros', 'periodo'])
  assert.equal(r.valor.dashboard.filtros.comparar, undefined)
})

test('un parche calculado sobre otra versión no se fusiona a ciegas', () => {
  const p = parche([{ op: 'titulo', titulo: 'x' }], { tipo: 'modificar', componentes: [] }, 3)
  assert.deepEqual(codigos(aplicaParche(cat, ejecutivo(), 0, p)), ['version'])
})

test('crear: reemplazar el tablero entero solo cuando la instrucción es crear', () => {
  const nuevo = { esquema: 'estudio.dashboard/1', titulo: 'Ventas por canal', filtros: { periodo: { desde: '2026-01', hasta: '2026-09' }, dimensiones: [] }, componentes: [{ id: 'kpi', tipo: 'hero', metrica: 'ventas_netas' }, { id: 'canal', tipo: 'barras', metrica: 'ventas_netas', dimension: 'linea__canal' }] }
  const r = aplicaParche(cat, ejecutivo(), 0, parche([{ op: 'reemplazar', dashboard: nuevo }], { tipo: 'crear', componentes: [] }))
  assert.equal(r.ok, true, JSON.stringify(r))
  if (r.ok) assert.deepEqual(r.valor.globales, ['todo'])
})
