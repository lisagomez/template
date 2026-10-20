/**
 * El agente con un modelo DOBLE (respuestas fijas): el contrato del bucle, no la puntería del modelo (esa la mide
 * `evaluacion/mide.mjs` con el LLM real). Incluye el canario de contaminación: ninguna pregunta del set de
 * referencia aparece en el prompt.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construyeCatalogo, consultor, interpreta, promptSistema, mensajeUsuario, type LlamadaModelo, type ModeloEstudio } from '../dist/index.js'
import { FOTO, RAIZ, doble, tablero } from './_doble.ts'

const cat = construyeCatalogo(FOTO, FOTO.dominios)
const plan = (p: Record<string, unknown>) => JSON.stringify({ responde: true, entendi: { metricas: [], dimensiones: [], filtros: [], periodo: null, comparar: null }, componentes: [], operaciones: [], resumen: 'Cambio la gráfica.', ...p })

function modelo(respuestas: string[], uso: boolean = true): ModeloEstudio & { pedidos: number } {
  const m = { id: 'doble/modelo-fijo', pedidos: 0, async completa() { const texto = respuestas[Math.min(m.pedidos, respuestas.length - 1)]!; m.pedidos++; return { texto, uso: uso ? { entrada: 1000, salida: 100, cacheados: 800 } : null, costoUsd: uso ? 0.0001 : null, truncada: false, ms: 5 } } }
  return m
}
const contexto = (m: ModeloEstudio, registro: LlamadaModelo[] = []) => ({ consultor: consultor(doble(), cat), modelo: m, corte: '2026-09', registrador: (l: LlamadaModelo) => { registro.push(l) } })

/**
 * Se vigila el texto REDACTADO del prompt (reglas, tipos, convenciones, plantilla del mensaje), sin el bloque del
 * catálogo: las etiquetas y descripciones de la capa son insumo compartido por diseño con el revisor (medido el
 * 2026-10-20: la única coincidencia fue la etiqueta «Crecimiento de ventas vs año anterior %» del YAML).
 */
test('canario: ninguna pregunta del set de referencia aparece en el prompt', () => {
  const set = JSON.parse(readFileSync(join(RAIZ, 'evaluacion', 'set-referencia.json'), 'utf8')) as { preguntas: { instruccion: string }[] }
  const sinCatalogo = construyeCatalogo({ version: 'vacio', metricas: [] }, {})
  const prompt = `${promptSistema(sinCatalogo, { corte: '2026-09', contexto: 'laboratorio' })}\n${mensajeUsuario(tablero('growth'), 0, '')}`.toLowerCase()
  const palabras = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9ñ]+/g) ?? []
  const p = palabras(prompt).join(' ')
  for (const q of set.preguntas) {
    const w = palabras(q.instruccion)
    for (let i = 0; i + 6 <= w.length; i++) assert.ok(!p.includes(w.slice(i, i + 6).join(' ')), 'una pregunta del set (6 palabras seguidas) aparece en el prompt')
  }
  assert.equal(set.preguntas.length, 100)
})

test('modificar: el plan del modelo se convierte en un parche que toca solo lo pedido', async () => {
  const m = modelo([plan({ tipo: 'modificar', entendi: { metricas: ['ventas_netas'], dimensiones: ['tienda__region'], filtros: [], periodo: null, comparar: null }, componentes: ['por_region'], operaciones: [{ op: 'cambiar', id: 'por_region', cambios: { tipo: 'linea' } }] })])
  const v = await interpreta(contexto(m), tablero('ejecutivo'), 0, 'esa gráfica de regiones mejor como línea')
  assert.equal(v.error, null)
  assert.deepEqual(v.resultado?.aplicado?.tocados, ['por_region'])
  assert.match(v.entendi, /métrica: ventas_netas · dimensión: tienda__region · toca: por_region/)
  assert.equal(v.intentos, 1)
})

test('un plan inválido vuelve al modelo con sus errores UNA vez; las dos llamadas quedan registradas', async () => {
  const registro: LlamadaModelo[] = []
  const malo = plan({ tipo: 'explicar', entendi: { metricas: ['ticket_medio'], dimensiones: [], filtros: [], periodo: null, comparar: null } })
  const bueno = plan({ tipo: 'explicar', entendi: { metricas: ['ticket_promedio'], dimensiones: [], filtros: [], periodo: null, comparar: null } })
  const v = await interpreta(contexto(modelo([malo, bueno]), registro), tablero('ejecutivo'), 0, 'qué es el ticket')
  assert.equal(v.intentos, 2)
  assert.equal(registro.length, 2)
  assert.equal(v.costoUsd, 0.0002)
  assert.match(v.texto, /Ticket promedio \(ticket_promedio\).*ventas_netas \/ pedidos.*Dueño: Comercial/)
})

test('si el modelo no corrige, no se aplica nada y se dice por qué', async () => {
  const tocaDeMas = plan({ tipo: 'modificar', entendi: { metricas: ['ventas_netas'], dimensiones: [], filtros: [], periodo: null, comparar: null }, componentes: ['tendencia'], operaciones: [{ op: 'quitar', id: 'tiendas' }] })
  const v = await interpreta(contexto(modelo([tocaDeMas])), tablero('ejecutivo'), 0, 'quita la tendencia')
  assert.match(v.error ?? '', /alcance/)
  assert.match(v.texto, /No pude convertir/)
})

test('sin métrica: lo dice, no aproxima con otra y ofrece proponerla; costo null si el proveedor no dio uso', async () => {
  const p = plan({ tipo: 'analizar', responde: false, entendi: { metricas: ['nps'], dimensiones: [], filtros: [], periodo: null, comparar: null }, sin_metrica: { pedido: 'NPS por tienda', propuesta: null } })
  const v = await interpreta(contexto(modelo([p], false)), tablero('growth'), 0, '¿cómo va el NPS por tienda?')
  assert.match(v.texto, /No hay una métrica en el catálogo para «NPS por tienda».*No la aproximo.*proponerla/)
  assert.equal(v.resultado?.parche, null)
  assert.equal(v.costoUsd, null)
})

test('alertar: queda como propuesta que pide confirmación; nada se envía', async () => {
  const p = plan({ tipo: 'alertar', entendi: { metricas: ['ventas_netas'], dimensiones: [], filtros: [{ dimension: 'tienda__tienda_nombre', operador: 'en', valores: ['Mérida'] }], periodo: null, comparar: null }, alerta: { condicion: 'cae_mas_de', valor: 5, unidad: '%', ventana: 'semanal' } })
  const v = await interpreta(contexto(modelo([p])), tablero('growth'), 0, 'avísame si Mérida cae más de 5 % en una semana')
  assert.equal(v.resultado?.alerta?.estado, 'propuesta')
  assert.match(v.texto, /Necesita tu confirmación.*no se envía/)
})

test('un resumen del modelo con una cifra que no salió de ninguna consulta se reemplaza', async () => {
  const p = plan({ tipo: 'filtrar', entendi: { metricas: ['ventas_netas'], dimensiones: [], filtros: [{ dimension: 'tienda__region', operador: 'en', valores: ['Golfo'] }], periodo: null, comparar: null }, resumen: 'Filtro al Golfo, que creció 35 % este año.' })
  const v = await interpreta(contexto(modelo([p])), tablero('ejecutivo'), 0, 'solo Golfo')
  assert.doesNotMatch(v.texto, /35/)
  assert.match(v.texto, /Apliqué los filtros pedidos/)
})

test('crear: con lo entendido se arma KPI, tendencia y desglose, sin métricas con desfase en el KPI', async () => {
  const p = plan({ tipo: 'crear', entendi: { metricas: ['ventas_netas', 'crecimiento_ventas_yoy_pct'], dimensiones: ['linea__canal'], filtros: [{ dimension: 'linea__canal', operador: 'no_en', valores: ['Mayoreo'] }], periodo: { desde: '2026-01', hasta: '2026-09' }, comparar: 'anio_anterior' }, titulo: 'Ventas por canal' })
  const v = await interpreta(contexto(modelo([p])), tablero('vacio'), 0, 'arma uno de ventas por canal sin mayoreo')
  assert.equal(v.error, null, v.error ?? '')
  const d = v.resultado!.aplicado!.dashboard
  assert.deepEqual(d.componentes.map((c) => c.tipo), ['hero', 'linea', 'tabla'])
  assert.equal(d.filtros.comparar, 'anio_anterior')
})

test('analizar: el hallazgo entra como componente nuevo y su texto solo lleva cifras de sus consultas', async () => {
  const p = plan({ tipo: 'analizar', entendi: { metricas: ['ventas_netas'], dimensiones: [], filtros: [], periodo: { desde: '2026-07', hasta: '2026-07' }, comparar: null } })
  const v = await interpreta(contexto(modelo([p])), tablero('ejecutivo'), 0, '¿qué pasó con las ventas en julio?')
  assert.equal(v.error, null, v.error ?? '')
  assert.deepEqual(v.resultado?.aplicado?.tocados, ['hallazgo_1'])
  assert.equal(v.resultado?.aplicado?.dashboard.componentes[1]?.tipo, 'hallazgo')
  assert.match(v.texto, /Ventas netas pasó de/)
})

test('analizar una métrica con desfase vuelve al modelo con el porqué, y el modelo puede corregir a la base', async () => {
  const yoy = plan({ tipo: 'analizar', entendi: { metricas: ['crecimiento_ventas_yoy_pct'], dimensiones: [], filtros: [], periodo: { desde: '2026-01', hasta: '2026-09' }, comparar: null } })
  const base = plan({ tipo: 'analizar', entendi: { metricas: ['ventas_netas'], dimensiones: [], filtros: [], periodo: { desde: '2026-01', hasta: '2026-09' }, comparar: null } })
  const v = await interpreta(contexto(modelo([yoy, base])), tablero('ejecutivo'), 0, '¿por qué crecimos tanto este año?')
  assert.equal(v.intentos, 2)
  assert.equal(v.error, null)
  assert.equal(v.plan?.entendi.metricas[0], 'ventas_netas')
})
