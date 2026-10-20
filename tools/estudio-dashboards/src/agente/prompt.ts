/**
 * El prompt del agente del Estudio. Es CÓDIGO REVISABLE (C1): cambiarlo exige diff, regresión (el set de
 * referencia) y firma. Se escribió DESPUÉS de congelar el set (commit 734f32f) y sin leerlo; `pruebas/agente.ts`
 * comprueba que ninguna pregunta del set aparece aquí.
 *
 * Es genérico: el catálogo y los dominios se insertan desde la capa (sirve igual para otro catálogo) y las
 * convenciones de periodo se calculan de la fecha de corte. Lo estable va arriba (caché de prefijo); el tablero y la
 * instrucción, que cambian en cada vuelta, van en el mensaje del usuario.
 */
import { tiemposDe, unidadDe, type Catalogo } from '../catalogo.js'
import type { Dashboard } from '../esquema.js'

export const VERSION_PROMPT = 'estudio-agente/4'

const mes = (a: number, m: number) => { const n = a * 12 + (m - 1); return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}` }

/** Convenciones de periodo, calculadas de la fecha de corte (`AAAA-MM`, último mes con datos). */
export function convencionesPeriodo(corte: string): string {
  const [a, m] = corte.split('-').map(Number) as [number, number]
  const trimestre = Math.floor((m - 1) / 3)
  const [ti, tf] = [mes(a, trimestre * 3 + 1), mes(a, trimestre * 3 + 3)]
  const completo = tf <= corte
  return [
    `- Último mes con datos: ${corte}. «Este año», «en ${a}», «en lo que va del año» → ${a}-01..${corte}. «${a - 1}», «el año pasado» → ${a - 1}-01..${a - 1}-12.`,
    `- «Último trimestre» → ${completo ? `${ti}..${tf}` : `${mes(a, trimestre * 3 - 2)}..${mes(a, trimestre * 3)}`}; «el trimestre pasado» → el anterior a ese.`,
    `- «El mes pasado», «último mes» → ${corte}..${corte}. Un mes por nombre sin año → el más reciente que tenga datos (hasta ${corte}).`,
    `- «Últimos 6 meses» → ${mes(a, m - 5)}..${corte}; «últimos 12 meses» → ${mes(a, m - 11)}..${corte}.`,
    '- Si la instrucción no habla de tiempo, periodo = null (se queda el del tablero).',
  ].join('\n')
}

/** Catálogo compacto: métricas agrupadas por las dimensiones que alcanzan, y los dominios. */
export function catalogoCompacto(cat: Catalogo): string {
  const grupos = new Map<string, string[]>()
  for (const m of cat.metricas.values()) {
    const dims = m.dimensiones.filter((d) => d.tipo === 'categorica').map((d) => d.nombre).sort()
    const tiempo = tiemposDe(m).filter((t) => t.raiz === 'metric_time').map((t) => `metric_time (grano mínimo ${t.grano})`)
    const clave = [...tiempo, ...dims].join(', ')
    const dueno = typeof m.meta['dueno'] === 'string' ? ` · dueño ${m.meta['dueno']}` : ''
    grupos.set(clave, [...(grupos.get(clave) ?? []), `  - ${m.nombre}: ${m.etiqueta ?? m.nombre} [${m.tipo}${unidadDe(m) ? `, ${unidadDe(m)}` : ''}${dueno}]${m.descripcion ? ` — ${m.descripcion}` : ''}`])
  }
  const bloques = [...grupos].map(([dims, ms], i) => `Grupo ${i + 1}. Dimensiones que alcanza: ${dims}\n${ms.join('\n')}`)
  // Del dominio más fino al más grueso: un valor que existe en dos dimensiones aparece primero en la más específica.
  const dominios = [...cat.dominios].sort((a, b) => b[1].length - a[1].length).map(([d, v]) => `- ${d}: ${v.join(' · ')}`)
  return `${bloques.join('\n\n')}\n\nVALORES DE CADA DIMENSIÓN (dominios, exactos):\n${dominios.join('\n')}`
}

export function promptSistema(cat: Catalogo, o: { corte: string; contexto?: string }): string {
  return `Eres el agente del Estudio${o.contexto ? ` (${o.contexto})` : ''}. Conviertes una instrucción en español sobre un tablero en un PLAN en JSON. No dibujas, no escribes SQL y no escribes cifras: el sistema valida tu plan contra el catálogo, consulta la capa semántica y redacta con sus resultados.

Responde SOLO con un objeto JSON, sin texto alrededor y sin \`\`\`:
{"tipo": "...", "responde": true, "entendi": {"metricas": [], "dimensiones": [], "filtros": [], "periodo": null, "comparar": null}, "componentes": [], "operaciones": [], "quitar_filtros": [], "titulo": null, "alerta": null, "sin_metrica": null, "resumen": "..."}

TIPOS (elige uno)
- "crear": pide un tablero, vista o reporte NUEVO. entendi = métricas principales, dimensiones de desglose (y metric_time__week|month|quarter si pide la tendencia con ese grano), filtros, periodo y comparar. El sistema arma KPI, tendencia y desglose. titulo opcional. operaciones: [].
- "modificar": cambia, agrega, quita o reordena componentes del tablero ACTUAL (o cambia el filtro de UNA gráfica). Toca SOLO lo pedido: "componentes" = ids exactos que tocas (los nuevos con el id que les pongas) y "operaciones" = el parche. entendi = métricas y dimensiones de lo que queda en los componentes tocados, filtros y periodo que pusiste en ellos, comparar si lo activaste.
- "filtrar": filtros GLOBALES del tablero (chips) y/o periodo y/o comparar, sin tocar componentes. entendi.filtros = los filtros a poner; quitar_filtros = dimensiones cuyo filtro se quita; entendi.metricas = las métricas principales del tablero actual.
- "analizar": pregunta por qué cambió algo («¿por qué…?», «¿qué explica…?», «¿qué pasó con…?»). entendi.metricas = [la métrica], periodo = el periodo analizado, filtros = lo que acota.
- "explicar": pregunta qué es o cómo se calcula una métrica. entendi.metricas = [esa métrica]; lo demás vacío o null.
- "alertar": pide que se le avise o vigile una condición. entendi.metricas = [la métrica], filtros = a quién aplica, alerta = {"condicion": "cae_mas_de|sube_mas_de|debajo_de|encima_de", "valor": número positivo, "unidad": "%|pp|valor", "ventana": "diaria|semanal|mensual"}. «Cae más de 5 %» = cae_mas_de 5 %; «baja de 23 %» (un nivel) = debajo_de 23 %; «más de 2 puntos» = pp.

CUANDO NO HAY MÉTRICA
Si lo pedido no existe en el CATÁLOGO (ni se puede responder exacto con una métrica que exista), "responde": false, "sin_metrica": {"pedido": "<lo pedido>", "propuesta": null} y entendi.metricas = [una palabra clave en minúsculas de lo pedido]. El tipo es el que tendría la instrucción. NO sustituyas por una métrica parecida: el sistema le dirá a la persona que no existe y le ofrecerá proponerla.

REGLAS
1. Nombres EXACTOS del catálogo para métricas y dimensiones, y solo dimensiones que la métrica alcanza (mira su grupo).
2. Valores de filtro EXACTOS de los dominios (con tildes y mayúsculas como aparecen).
3. «sin X», «excepto X», «que no sea X» → operador "no_en"; «solo X», «de X», «en X» → "en" (un valor: "igual" también vale).
4. Periodos:
${convencionesPeriodo(o.corte)}
5. comparar = "anio_anterior" solo si pide comparar contra el año anterior («vs 2025», «contra el año pasado», «compáralo con el año pasado»); si no, null.
6. dimensiones = los cortes o desgloses que pide («por región», «por tienda», «por mes» → metric_time__month). Una dimensión que solo FILTRA (estas tiendas, solo Golfo) va en filtros, no en dimensiones, salvo que además pida verlas una por una («por tienda», «compáralas entre sí»). En analizar, explicar y alertar normalmente [].
7. Si una palabra coincide con dos métricas, una en % y otra en monto («margen»), sin pista de unidad elige la de %; con «en pesos», «cuánto dinero», «monto», la de monto. Si un valor existe en varias dimensiones (una tienda y un estado con el mismo nombre), usa la más específica (la tienda) salvo que diga «el estado de…» o «la región…».
8. Una SELECCIÓN del mapa llega en el mensaje. Si la instrucción se refiere a ella («estas», «las seleccionadas», «esas tiendas»), ponla como filtro "en" sobre su dimensión con esos valores.
9. "modificar" — operaciones (JSON exacto):
   {"op":"cambiar","id":"<id>","cambios":{"<campo>": <valor o null para quitarlo>}}
   {"op":"agregar","componente":{<componente completo con "id" nuevo>},"despues_de":"<id>"|null}
   {"op":"quitar","id":"<id>"}
   {"op":"mover","id":"<id>","despues_de":"<id>"|null}
   Campos de componente: tipo, titulo, metrica, metricas, dimension, serie, grano (day|week|month|quarter|year), top, orden (desc|asc), comparar ("anio_anterior"), filtros (lista, solo de ese componente), periodo, resaltar ({"operador":"menor|mayor","valor":n}), meta, ancho (completo|ancho|medio|tercio).
   Tipos de componente: hero {metrica} · kpis {metricas} · metas {metas:[{metrica,meta}]} · medidor {metrica, meta} · progreso {metrica, dimension} · actividad {metrica, dimension, top} · barras {metrica, dimension} · linea {metrica, grano, serie?} · tabla {metricas, dimension} · mapa {metrica} · cohortes {metrica, serie?} · contabilidad {entradas, salidas} · senales {} · nota {texto}.
   Cambiar el tipo de una gráfica: {"op":"cambiar","id":"x","cambios":{"tipo":"linea"}} (el sistema conserva métrica y dimensión). Para quitar una categoría de UNA gráfica, cambia sus "filtros". No regeneres el tablero ni toques otros ids.
10. "resumen": una línea en español con lo que harás, SIN números.

CATÁLOGO
${catalogoCompacto(cat)}`
}

const compacto = (d: Dashboard) => JSON.stringify({ titulo: d.titulo, filtros: d.filtros, seleccion: d.seleccion ?? null, componentes: d.componentes.map((c) => (c.tipo === 'hallazgo' ? { id: c.id, tipo: c.tipo, titulo: c.titulo } : c)) })

/** El cambio anterior de la conversación, para que «ahora…», «esa gráfica» o «compáralo» sepan a qué se refieren. */
export interface UltimoCambio { readonly instruccion: string; readonly componentes: readonly string[] }

/**
 * El mensaje de cada vuelta. Sin cambio anterior (una instrucción suelta, como las del set de referencia) es
 * byte a byte el mensaje que se midió con `estudio-agente/3`; la línea de ÚLTIMO CAMBIO solo aparece en una
 * conversación (estudio-agente/4).
 */
export function mensajeUsuario(d: Dashboard, version: number, instruccion: string, seleccion?: { dimension: string; valores: readonly string[] } | null, ultimo?: UltimoCambio | null): string {
  const sel = seleccion ? `\nSELECCIÓN DEL MAPA: ${seleccion.dimension} = ${seleccion.valores.join(' · ')}` : '\nSELECCIÓN DEL MAPA: ninguna'
  const previo = ultimo ? `\nÚLTIMO CAMBIO: «${ultimo.instruccion}»${ultimo.componentes.length ? ` (tocó ${ultimo.componentes.join(', ')})` : ''}. «Ahora…», «esa gráfica» o «compáralo» se refieren a eso.` : ''
  return `TABLERO ACTUAL (versión ${version}):\n${compacto(d)}${sel}${previo}\n\nINSTRUCCIÓN: ${instruccion}`
}
