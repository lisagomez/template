/**
 * Las cifras de referencia de la propuesta (spec §Cifras de referencia), cada una con:
 *   - `propuesta`: el valor publicado, con los decimales con que se publicó (de ahí sale la tolerancia de redondeo);
 *   - `mf`: cómo se pide a MetricFlow (consultas con nombre de `CONSULTAS`) o `null` si NO hay métrica en el catálogo
 *     que la exprese — eso se reporta tal cual, no se fabrica una consulta que la aproxime;
 *   - `directo`: la clave del conteo independiente (`directo.py`), o una función de ellas.
 * `dec` fija los decimales publicados cuando el número los esconde (2.0, 10.0); sin `dec` se leen del literal.
 * Nada aquí ajusta una definición para que cuadre: si no cuadra, la tabla lo dice y `explicacion` dice por qué.
 */
const P = (a) => ({ desde: `${a}-01`, hasta: `${a}-09` })
const M = (a, m) => ({ desde: `${a}-${String(m).padStart(2, '0')}`, hasta: `${a}-${String(m).padStart(2, '0')}` })
const COMPARABLE = { dimension: 'tienda__es_comparable', operador: 'igual', valores: [true] }

/** Consultas al puerto semántico (filtros estructurados, como los que arma el núcleo): una vez cada una. */
export const CONSULTAS = {
  ...Object.fromEntries([2025, 2026].flatMap((a) => [
    [`foto_${a}`, { metricas: ['ventas_netas', 'margen_bruto_pct', 'pedidos', 'ticket_promedio', 'participacion_ecommerce_pct', 'tasa_devolucion'], periodo: P(a) }],
    [`clientes_${a}`, { metricas: ['clientes_activos', 'frecuencia_compra', 'clientes_nuevos', 'clientes_recurrentes', 'clientes_reactivados', 'clientes_perdidos'], periodo: P(a) }],
    [`comparables_${a}`, { metricas: ['ventas_netas'], periodo: P(a), filtros: [COMPARABLE] }],
    [`tienda_${a}`, { metricas: ['ventas_netas'], agrupar: ['tienda__tienda_nombre'], periodo: P(a) }],
    [`region_${a}`, { metricas: ['ventas_netas'], agrupar: ['tienda__region'], periodo: P(a) }],
    [`canal_${a}`, { metricas: ['ventas_netas', 'pedidos'], agrupar: ['linea__canal'], periodo: P(a) }],
  ])),
  yoy_jul26: { metricas: ['crecimiento_ventas_yoy_pct'], agrupar: ['metric_time__month'], periodo: M(2026, 7) },
  retencion_2026: { metricas: ['retencion_m3_pct'], periodo: P(2026) },
  yoy_2026: { metricas: ['crecimiento_ventas_yoy_pct'], agrupar: ['metric_time__year'], periodo: P(2026) },
  comparables_n: { metricas: ['ventas_netas'], agrupar: ['tienda__tienda_nombre'], periodo: P(2025), filtros: [COMPARABLE] },
  reorden: { metricas: ['combinaciones_bajo_reorden'] },
  reorden_tienda: { metricas: ['combinaciones_bajo_reorden'], agrupar: ['tienda__tienda_nombre'] },
  roas: { metricas: ['roas_incremental'], agrupar: ['campana__campana_nombre'] },
  base_inicial: { metricas: ['clientes_activos'], filtros: [{ dimension: 'cliente_mes__estado', operador: 'igual', valores: ['base_inicial'] }] },
  retencion: { metricas: ['retencion_m3_pct'] },
  retencion_origen: { metricas: ['retencion_m3_pct'], agrupar: ['cohorte__origen'] },
  nuevos_origen: { metricas: ['clientes_nuevos'], agrupar: ['cliente_mes__origen'] },
  margen_categoria: { metricas: ['margen_bruto_pct'], agrupar: ['linea__categoria'], periodo: P(2026) },
  margen_jun26: { metricas: ['margen_bruto_pct'], periodo: M(2026, 6) },
  margen_jul26: { metricas: ['margen_bruto_pct'], periodo: M(2026, 7) },
  margen_jul25: { metricas: ['margen_bruto_pct'], periodo: M(2025, 7) },
}

const var_ = (a, b) => 100 * (a / b - 1)
/** Lee una celda: la fila cuya columna `por` vale `clave` (o la única fila) y la columna `col`. */
export const celda = (r, col, por, clave) => {
  const i = r.columnas.indexOf(col)
  if (i < 0) throw new Error(`la consulta no trae la columna ${col}`)
  const fila = por ? r.filas.find((f) => String(f[r.columnas.indexOf(por)]) === String(clave)) : r.filas[0]
  return fila ? Number(fila[i]) : null
}

const SIN_METRICA = null
/** `q` = resultados de CONSULTAS; `d` = conteo directo. */
export const CIFRAS = [
  // ---------------- Foto ene–sep ----------------
  { id: 'ventas_2025', bloque: 'Foto', texto: 'Ventas netas ene–sep 2025 (M MXN)', propuesta: 60.7, escala: 1e6, mf: (q) => celda(q.foto_2025, 'ventas_netas'), directo: 'ventas_2025' },
  { id: 'ventas_2026', bloque: 'Foto', texto: 'Ventas netas ene–sep 2026 (M MXN)', propuesta: 74.5, escala: 1e6, mf: (q) => celda(q.foto_2026, 'ventas_netas'), directo: 'ventas_2026' },
  { id: 'ventas_var', bloque: 'Foto', texto: 'Ventas netas, variación (%)', propuesta: 22.7, mf: (q) => var_(celda(q.foto_2026, 'ventas_netas'), celda(q.foto_2025, 'ventas_netas')), directo: 'ventas_var' },
  { id: 'ventas_yoy_metrica', bloque: 'Foto', texto: 'crecimiento_ventas_yoy_pct a grano año con ene–sep 2026 (TRAMPA documentada)', propuesta: 22.7, trampa: true, mf: (q) => celda(q.yoy_2026, 'crecimiento_ventas_yoy_pct'), directo: 'ventas_var', explicacion: 'Divergencia esperada, no error de modelado: a grano año el desfase de 1 año agrega 2025 COMPLETO (ene–dic) antes de que el filtro ene–sep llegue, y compara 9 meses contra 12 (−17.0 %). La métrica es correcta a grano mes (fila siguiente). Por eso el Estudio compara periodos con dos consultas y no deja usar una métrica con desfase sobre un periodo de varios meses.' },
  { id: 'ventas_yoy_julio', bloque: 'Foto', texto: 'Control: crecimiento_ventas_yoy_pct a grano mes, julio 2026', propuesta: null, mf: (q) => celda(q.yoy_jul26, 'crecimiento_ventas_yoy_pct'), directo: 'ventas_var_julio', explicacion: 'Fila de control (no está en la propuesta): la métrica con desfase, usada a su grano, cuadra con el conteo directo.' },
  { id: 'comparables_n', bloque: 'Foto', texto: 'Tiendas comparables', propuesta: 19, mf: (q) => q.comparables_n.filas.length, directo: 'comparables_n' },
  { id: 'comparables_var', bloque: 'Foto', texto: 'Ventas de tiendas comparables, variación (%)', propuesta: 18.5, mf: (q) => var_(celda(q.comparables_2026, 'ventas_netas'), celda(q.comparables_2025, 'ventas_netas')), directo: 'comparables_var' },
  { id: 'margen_2025', bloque: 'Foto', texto: 'Margen bruto ene–sep 2025 (%)', propuesta: 24.8, mf: (q) => celda(q.foto_2025, 'margen_bruto_pct'), directo: 'margen_2025' },
  { id: 'margen_2026', bloque: 'Foto', texto: 'Margen bruto ene–sep 2026 (%)', propuesta: 23.8, mf: (q) => celda(q.foto_2026, 'margen_bruto_pct'), directo: 'margen_2026' },
  { id: 'margen_pp', bloque: 'Foto', texto: 'Margen bruto, variación (pp)', propuesta: -0.9, mf: (q) => celda(q.foto_2026, 'margen_bruto_pct') - celda(q.foto_2025, 'margen_bruto_pct'), directo: 'margen_pp', explicacion: 'Redondeo: 24.8 − 23.8 = 1.0 con los publicados, pero sin redondear es 24.763 − 23.839 = 0.924, que se publica como −0.9. Se compara el valor sin redondear.' },
  { id: 'pedidos_2025', bloque: 'Foto', texto: 'Pedidos ene–sep 2025', propuesta: 60283, mf: (q) => celda(q.foto_2025, 'pedidos'), directo: 'pedidos_2025' },
  { id: 'pedidos_2026', bloque: 'Foto', texto: 'Pedidos ene–sep 2026', propuesta: 72554, mf: (q) => celda(q.foto_2026, 'pedidos'), directo: 'pedidos_2026' },
  { id: 'pedidos_var', bloque: 'Foto', texto: 'Pedidos, variación (%)', propuesta: 20.4, mf: (q) => var_(celda(q.foto_2026, 'pedidos'), celda(q.foto_2025, 'pedidos')), directo: 'pedidos_var' },
  { id: 'ticket_2025', bloque: 'Foto', texto: 'Ticket promedio ene–sep 2025 (MXN)', propuesta: 1007, mf: (q) => celda(q.foto_2025, 'ticket_promedio'), directo: 'ticket_2025' },
  { id: 'ticket_2026', bloque: 'Foto', texto: 'Ticket promedio ene–sep 2026 (MXN)', propuesta: 1027, mf: (q) => celda(q.foto_2026, 'ticket_promedio'), directo: 'ticket_2026' },
  { id: 'ticket_var', bloque: 'Foto', texto: 'Ticket promedio, variación (%)', propuesta: 2.0, dec: 1, mf: (q) => var_(celda(q.foto_2026, 'ticket_promedio'), celda(q.foto_2025, 'ticket_promedio')), directo: 'ticket_var' },
  { id: 'activos_2025', bloque: 'Foto', texto: 'Clientes activos ene–sep 2025', propuesta: 9692, mf: (q) => celda(q.clientes_2025, 'clientes_activos'), directo: 'activos_2025' },
  { id: 'activos_2026', bloque: 'Foto', texto: 'Clientes activos ene–sep 2026', propuesta: 14234, mf: (q) => celda(q.clientes_2026, 'clientes_activos'), directo: 'activos_2026' },
  { id: 'activos_var', bloque: 'Foto', texto: 'Clientes activos, variación (%)', propuesta: 46.9, mf: (q) => var_(celda(q.clientes_2026, 'clientes_activos'), celda(q.clientes_2025, 'clientes_activos')), directo: 'activos_var' },
  { id: 'frecuencia_2025', bloque: 'Foto', texto: 'Frecuencia ene–sep 2025 (pedidos por cliente)', propuesta: 6.2, mf: (q) => celda(q.clientes_2025, 'frecuencia_compra'), directo: 'frecuencia_2025' },
  { id: 'frecuencia_2026', bloque: 'Foto', texto: 'Frecuencia ene–sep 2026 (pedidos por cliente)', propuesta: 5.1, mf: (q) => celda(q.clientes_2026, 'frecuencia_compra'), directo: 'frecuencia_2026' },
  { id: 'frecuencia_var', bloque: 'Foto', texto: 'Frecuencia, variación (%)', propuesta: -18.0, dec: 1, mf: (q) => var_(celda(q.clientes_2026, 'frecuencia_compra'), celda(q.clientes_2025, 'frecuencia_compra')), directo: 'frecuencia_var' },
  { id: 'bajo_reorden', bloque: 'Foto', texto: 'Combinaciones tienda-SKU bajo reorden (30-sep-2026)', propuesta: 119, mf: (q) => celda(q.reorden, 'combinaciones_bajo_reorden'), directo: 'bajo_reorden' },
  { id: 'combinaciones', bloque: 'Foto', texto: 'Combinaciones tienda-SKU totales', propuesta: 735, mf: SIN_METRICA, directo: 'combinaciones', explicacion: 'Sin métrica en el catálogo: no hay una que cuente combinaciones totales (solo las bajo reorden). Cuadra el conteo directo; no se inventa la consulta.' },
  // ---------------- Catálogo ----------------
  { id: 'ecommerce_pct_2026', bloque: 'Catálogo', texto: 'Participación e-commerce ene–sep 2026 (%)', propuesta: 10.0, dec: 1, mf: (q) => celda(q.foto_2026, 'participacion_ecommerce_pct'), directo: 'ecommerce_pct_2026' },
  { id: 'devolucion_2026', bloque: 'Catálogo', texto: 'Tasa de devolución ene–sep 2026 (%)', propuesta: 2.5, mf: (q) => 100 * celda(q.foto_2026, 'tasa_devolucion'), directo: 'devolucion_2026', explicacion: 'La métrica se publica como proporción 0–1 (meta.unidad = «proporción»); se multiplica por 100 solo para comparar.' },
  { id: 'roas_hot_sale', bloque: 'Catálogo', texto: 'ROAS incremental Hot Sale 2026 (×)', propuesta: -0.17, mf: (q) => celda(q.roas, 'roas_incremental', 'campana__campana_nombre', 'Hot Sale 2026'), directo: 'roas_CMP-04' },
  { id: 'roas_verano', bloque: 'Catálogo', texto: 'ROAS incremental Verano Bebidas (×)', propuesta: 15.6, mf: (q) => celda(q.roas, 'roas_incremental', 'campana__campana_nombre', 'Verano Bebidas'), directo: 'roas_CMP-05' },
  { id: 'nuevos_2026', bloque: 'Catálogo', texto: 'Clientes nuevos ene–sep 2026', propuesta: 7418, mf: (q) => celda(q.clientes_2026, 'clientes_nuevos'), directo: 'nuevos_2026' },
  { id: 'recurrentes_2026', bloque: 'Catálogo', texto: 'Clientes recurrentes ene–sep 2026', propuesta: 6816, mf: (q) => celda(q.clientes_2026, 'clientes_recurrentes'), directo: 'recurrentes_2026' },
  { id: 'retencion_m3', bloque: 'Catálogo', texto: 'Retención a 3 meses, todas las cohortes maduras (%)', propuesta: 70.0, dec: 1, mf: (q) => celda(q.retencion, 'retencion_m3_pct'), directo: 'retencion_m3', explicacion: 'Divergencia de ventana, no de definición: con todas las cohortes maduras da 72.5 %. La columna del catálogo de la propuesta dice «Valor ene–sep 2026», y con las cohortes de 2026 da 70.0 % (fila siguiente). Los 66.3 % y 82.7 % por origen, en cambio, son de todas las cohortes: la propuesta mezcla dos ventanas.' },
  { id: 'retencion_m3_2026', bloque: 'Catálogo', texto: 'Retención a 3 meses, cohortes ene–sep 2026 (%)', propuesta: 70.0, dec: 1, mf: (q) => celda(q.retencion_2026, 'retencion_m3_pct'), directo: 'retencion_m3_cohortes_2026' },
  { id: 'base_inicial', bloque: 'Catálogo', texto: 'Base inicial (clientes de enero de 2025)', propuesta: 3395, mf: (q) => celda(q.base_inicial, 'clientes_activos'), directo: 'base_inicial' },
  // ---------------- Growth por área ----------------
  { id: 'meses_compra_mer', bloque: 'Growth por área', texto: 'Mérida: meses con compra de los establecidos, abr–sep 2026 vs 2025 (%)', propuesta: -28, rango: [-30, -28], mf: SIN_METRICA, directo: 'meses_compra_var_MER-01', explicacion: 'Sin métrica: «meses con compra por cliente establecido» (alta antes de abril de 2025, por tienda preferida) no existe en el catálogo; clientes_mes no expone cohorte ni tienda preferida como dimensión. La propuesta da un rango (28–30 %) para Mérida y Oaxaca juntas.' },
  { id: 'meses_compra_oax', bloque: 'Growth por área', texto: 'Oaxaca: meses con compra de los establecidos, abr–sep 2026 vs 2025 (%)', propuesta: -30, rango: [-30, -28], mf: SIN_METRICA, directo: 'meses_compra_var_OAX-01', explicacion: 'Igual que Mérida: sin métrica en el catálogo.' },
  { id: 'dias_mer_2025', bloque: 'Growth por área', texto: 'Mérida: días entre compras de los establecidos, abr–sep 2025', propuesta: 23, trunca: true, mf: SIN_METRICA, directo: 'dias_entre_MER-01_2025', explicacion: 'Sin métrica: no hay medida de días entre compras. La propuesta TRUNCA (23.77 → 23); redondeado sería 24.' },
  { id: 'dias_mer_2026', bloque: 'Growth por área', texto: 'Mérida: días entre compras de los establecidos, abr–sep 2026', propuesta: 42, trunca: true, mf: SIN_METRICA, directo: 'dias_entre_MER-01_2026', explicacion: 'Sin métrica: no hay medida de días entre compras. La propuesta TRUNCA (42.51 → 42); redondeado sería 43.' },
  { id: 'nuevos_campana_pct', bloque: 'Growth por área', texto: 'Nuevos que llegan en meses de campaña, todas las cohortes (%)', propuesta: 70, mf: (q) => { const c = celda(q.nuevos_origen, 'clientes_nuevos', 'cliente_mes__origen', 'Campaña'); const o = celda(q.nuevos_origen, 'clientes_nuevos', 'cliente_mes__origen', 'Orgánico'); return (100 * c) / (c + o) }, directo: 'nuevos_campana_pct_total', explicacion: 'Origen «Campaña» = adquirido en un mes con campaña activa (dim_clientes). La propuesta no dice el periodo: con todas las cohortes da 70.1 %; solo ene–sep 2026 daría 83.9 % (conteo directo).' },
  { id: 'retencion_campana', bloque: 'Growth por área', texto: 'Retención M+3 de clientes de campaña (%)', propuesta: 66.3, mf: (q) => celda(q.retencion_origen, 'retencion_m3_pct', 'cohorte__origen', 'Campaña'), directo: 'retencion_m3_campana' },
  { id: 'retencion_organico', bloque: 'Growth por área', texto: 'Retención M+3 de clientes orgánicos (%)', propuesta: 82.7, mf: (q) => celda(q.retencion_origen, 'retencion_m3_pct', 'cohorte__origen', 'Orgánico'), directo: 'retencion_m3_organico' },
  { id: 'valor_6m_campana', bloque: 'Growth por área', texto: 'Valor en 6 meses, clientes de campaña (MXN)', propuesta: 4636, mf: SIN_METRICA, directo: 'valor_6m_campana_v2', explicacion: 'Sin métrica: las ventas por cliente no se cortan por meses desde el alta (meses_desde_alta solo vive en el modelo de cohortes, sin ventas). Conteo directo, dos intentos: (1) mes de alta + 5, cohortes con 6 meses observados = 4,635.4; (2) solo altas hasta marzo de 2026 = 4,635.6, que es la ventana con que cuadra. La propuesta no declara la ventana.' },
  { id: 'valor_6m_organico', bloque: 'Growth por área', texto: 'Valor en 6 meses, clientes orgánicos (MXN)', propuesta: 6730, mf: SIN_METRICA, directo: 'valor_6m_organico_v2', explicacion: 'Sin métrica (igual que campaña). Intento (1) = 6,718.3; intento (2), altas hasta marzo de 2026 = 6,730.2, que cuadra. Misma ventana no declarada.' },
  { id: 'perdidos_2026', bloque: 'Growth por área', texto: 'Salidas mensuales de clientes ene–sep 2026', propuesta: 20134, mf: (q) => celda(q.clientes_2026, 'clientes_perdidos'), directo: 'perdidos_2026' },
  { id: 'reactivados_2026', bloque: 'Growth por área', texto: 'Reactivaciones ene–sep 2026', propuesta: 10710, mf: (q) => celda(q.clientes_2026, 'clientes_reactivados'), directo: 'reactivados_2026' },
  { id: 'crec_tampico', bloque: 'Growth por área', texto: 'Tampico: crecimiento de ventas (%)', propuesta: 34.8, mf: (q) => var_(celda(q.tienda_2026, 'ventas_netas', 'tienda__tienda_nombre', 'Tampico'), celda(q.tienda_2025, 'ventas_netas', 'tienda__tienda_nombre', 'Tampico')), directo: 'crec_TAM-01' },
  { id: 'reorden_tampico', bloque: 'Growth por área', texto: 'Tampico: SKU bajo reorden (de 35)', propuesta: 10, mf: (q) => celda(q.reorden_tienda, 'combinaciones_bajo_reorden', 'tienda__tienda_nombre', 'Tampico'), directo: 'bajo_reorden_TAM-01' },
  { id: 'reorden_polanco', bloque: 'Growth por área', texto: 'Polanco: SKU bajo reorden', propuesta: 7, mf: (q) => celda(q.reorden_tienda, 'combinaciones_bajo_reorden', 'tienda__tienda_nombre', 'Polanco'), directo: 'bajo_reorden_CDMX-01' },
  { id: 'ecommerce_pct_2025', bloque: 'Growth por área', texto: 'Participación digital ene–sep 2025 (%)', propuesta: 7.3, mf: (q) => celda(q.foto_2025, 'participacion_ecommerce_pct'), directo: 'ecommerce_pct_2025' },
  // ---------------- Hallazgos ----------------
  ...['Occidente', 'Centro', 'Sureste'].map((r, i) => ({ id: `crec_${r.toLowerCase()}`, bloque: 'Hallazgos', texto: `${r}: crecimiento de ventas (%)`, propuesta: [33.7, 32.7, 14.0][i], dec: 1, mf: (q) => var_(celda(q.region_2026, 'ventas_netas', 'tienda__region', r), celda(q.region_2025, 'ventas_netas', 'tienda__region', r)), directo: `crec_region_${r}` })),
  ...[['Mérida', 'MER-01', -2.4], ['Oaxaca', 'OAX-01', 2.8]].map(([n, t, p]) => ({ id: `crec_${t}`, bloque: 'Hallazgos', texto: `${n}: crecimiento de ventas (%)`, propuesta: p, mf: (q) => var_(celda(q.tienda_2026, 'ventas_netas', 'tienda__tienda_nombre', n), celda(q.tienda_2025, 'ventas_netas', 'tienda__tienda_nombre', n)), directo: `crec_${t}` })),
  { id: 'mayoreo_pedidos', bloque: 'Hallazgos', texto: 'Mayoreo: % de los pedidos, ene–sep 2026', propuesta: 4.1, mf: (q) => { const r = q.canal_2026; const m = celda(r, 'pedidos', 'linea__canal', 'Mayoreo'); const t = r.filas.reduce((s, f) => s + Number(f[r.columnas.indexOf('pedidos')]), 0); return (100 * m) / t }, directo: 'mayoreo_pedidos_pct', explicacion: 'Los pedidos por canal SÍ suman al total (cada pedido tiene un solo canal), por eso aquí la suma de filas es legítima; no lo sería con clientes_activos.' },
  { id: 'mayoreo_ventas', bloque: 'Hallazgos', texto: 'Mayoreo: % de las ventas, ene–sep 2026', propuesta: 52.7, mf: (q) => (100 * celda(q.canal_2026, 'ventas_netas', 'linea__canal', 'Mayoreo')) / celda(q.foto_2026, 'ventas_netas'), directo: 'mayoreo_ventas_pct' },
  { id: 'ecommerce_var', bloque: 'Hallazgos', texto: 'E-commerce: crecimiento de ventas (%)', propuesta: 67.4, mf: (q) => var_(celda(q.canal_2026, 'ventas_netas', 'linea__canal', 'E-commerce'), celda(q.canal_2025, 'ventas_netas', 'linea__canal', 'E-commerce')), directo: 'ecommerce_var' },
  ...[['Cuidado personal', 35.6], ['Limpieza', 32.1], ['Lácteos', 15.1], ['Frescos', 12.0]].map(([c, p]) => ({ id: `margen_${c.split(' ')[0].toLowerCase()}`, bloque: 'Hallazgos', texto: `Margen ${c}, ene–sep 2026 (%)`, propuesta: p, dec: 1, mf: (q) => celda(q.margen_categoria, 'margen_bruto_pct', 'linea__categoria', c), directo: `margen_cat_${c}` })),
  { id: 'julio_dias_campana', bloque: 'Hallazgos', texto: 'Julio 2026: días en campaña (%)', propuesta: 100, mf: SIN_METRICA, directo: 'julio_dias_campana_pct', explicacion: 'Sin métrica de días en campaña; en_campana es dimensión de líneas, no un conteo de días.' },
  { id: 'julio_margen_pp', bloque: 'Hallazgos', texto: 'Julio 2026: caída del margen frente a julio 2025 (pp)', propuesta: -7.8, mf: (q) => celda(q.margen_jul26, 'margen_bruto_pct') - celda(q.margen_jul25, 'margen_bruto_pct'), directo: 'julio_margen_vs_julio25_pp', explicacion: 'La propuesta no dice contra qué: contra julio de 2025 da −7.8 pp; contra junio de 2026 daría −7.2 pp (ver julio_margen_vs_junio_pp en el directo).' },
]
