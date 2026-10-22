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
  // Hecha línea, la gráfica también agrupa por mes: el núcleo lo agrega a «lo que entendí».
  assert.match(v.entendi, /métrica: ventas_netas · dimensión: tienda__region, metric_time__month · toca: por_region/)
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

test('analizar una métrica con desfase descompone su base contra el año anterior, sin volver al modelo, y lo dice', async () => {
  const yoy = plan({ tipo: 'analizar', entendi: { metricas: ['crecimiento_ventas_yoy_pct'], dimensiones: [], filtros: [], periodo: { desde: '2026-01', hasta: '2026-09' }, comparar: null } })
  const m = modelo([yoy])
  const v = await interpreta(contexto(m), tablero('ejecutivo'), 0, '¿de dónde salió el crecimiento de este año?')
  assert.deepEqual([v.intentos, m.pedidos, v.error], [1, 1, null], v.error ?? '')
  assert.equal(v.plan?.entendi.metricas[0], 'crecimiento_ventas_yoy_pct', '«lo que entendí» sigue siendo lo que se pidió')
  assert.equal(v.resultado?.analisis?.metrica, 'ventas_netas', 'lo que se descompone es la base')
  assert.match(v.texto, /compara Ventas netas contra el año anterior; descompongo ese cambio\. Ventas netas pasó de/)
  const h = v.resultado?.aplicado?.dashboard.componentes.find((c) => c.tipo === 'hallazgo')
  assert.match(h && 'titulo' in h ? String(h.titulo) : '', /^¿Por qué cambió Crecimiento/)
})

test('modificar: «lo que entendí» lleva el eje de tiempo de la línea que toca, sacado del tablero ya parchado', async () => {
  const entendi = (dimensiones: string[]) => ({ metricas: ['ventas_netas'], dimensiones, filtros: [], periodo: null, comparar: null })
  const casos: [Record<string, unknown>, string[]][] = [
    [{ entendi: entendi([]), componentes: [], operaciones: [{ op: 'agregar', componente: { id: 'ventas_semana', tipo: 'linea', metrica: 'ventas_netas', grano: 'week' }, despues_de: null }] }, ['metric_time__week']],
    [{ entendi: entendi(['tienda__region']), componentes: ['crec_region'], operaciones: [{ op: 'cambiar', id: 'crec_region', cambios: { orden: 'asc' } }] }, ['tienda__region']],
    [{ entendi: entendi([]), componentes: ['tendencia'], operaciones: [{ op: 'quitar', id: 'tendencia' }] }, []],
    [{ entendi: entendi(['metric_time__month']), componentes: ['tendencia'], operaciones: [{ op: 'cambiar', id: 'tendencia', cambios: { titulo: 'Ventas' } }] }, ['metric_time__month']],
  ]
  for (const [p, esperado] of casos) {
    const v = await interpreta(contexto(modelo([plan({ tipo: 'modificar', ...p })])), tablero('growth'), 0, 'un cambio')
    assert.equal(v.error, null, v.error ?? '')
    assert.deepEqual([...(v.plan?.entendi.dimensiones ?? [])].sort(), esperado)
  }
  const v = await interpreta(contexto(modelo([plan({ tipo: 'modificar', ...casos[0]![0] })])), tablero('growth'), 0, 'un cambio')
  assert.match(v.entendi, /dimensión: metric_time__week/, 'la persona lo ve en «lo que entendí»')
})

test('sin cambio anterior, el mensaje es el MISMO que se midió (estudio-agente/3); con él, nombra lo que tocó', () => {
  const d = tablero('growth')
  const medido = `TABLERO ACTUAL (versión 0):\n${JSON.stringify({ titulo: d.titulo, filtros: d.filtros, seleccion: null, componentes: d.componentes })}\nSELECCIÓN DEL MAPA: ninguna\n\nINSTRUCCIÓN: hola`
  assert.equal(mensajeUsuario(d, 0, 'hola'), medido)
  assert.equal(mensajeUsuario(d, 0, 'hola', null, null), medido)
  assert.match(mensajeUsuario(d, 1, 'ahora por mes', null, { instruccion: 'margen por región', componentes: ['margen_region'] }), /ÚLTIMO CAMBIO: «margen por región» \(tocó margen_region\)/)
})

test('con reserva: si el primario trunca, contesta la reserva y se suman costo y tiempo; si no, la reserva no se llama', async () => {
  const { conReserva } = await import('../dist/index.js')
  let llamadasReserva = 0
  const truncador = { id: 'p', async completa() { return { texto: '{"tipo": "crea', uso: { entrada: 100, salida: 1200, cacheados: 0 }, costoUsd: 0.001, truncada: true, ms: 3000 } } }
  const reserva = { id: 'r', async completa() { llamadasReserva++; return { texto: '{}', uso: { entrada: 100, salida: 300, cacheados: 0 }, costoUsd: 0.002, truncada: false, ms: 4000 } } }
  const r = await conReserva(truncador, reserva).completa({ sistema: '', mensajes: [], maxTokens: 10 })
  assert.deepEqual([r.texto, r.costoUsd, r.ms, r.uso?.salida, llamadasReserva], ['{}', 0.003, 7000, 1500, 1])
  const sano = { ...truncador, async completa() { return { texto: '{}', uso: null, costoUsd: null, truncada: false, ms: 10 } } }
  await conReserva(sano, reserva).completa({ sistema: '', mensajes: [], maxTokens: 10 })
  assert.equal(llamadasReserva, 1)
})
