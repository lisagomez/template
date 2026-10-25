/**
 * El bucle de regeneración: instrucción → el modelo devuelve un plan → el núcleo lo valida contra el esquema y el
 * catálogo (si falla, el modelo recibe los errores UNA vez para corregir) → parche en seco → la persona ve «lo que
 * entendí» y el cambio → aplicar es otra decisión (versión nueva). Cada llamada al modelo queda registrada con su
 * uso y su costo; si faltan, `null`.
 *
 * El texto que ve la persona lo redacta el núcleo: el análisis con cifras de sus consultas, la explicación con la
 * definición de la capa, y el resumen del modelo solo si no trae números que no salgan de la instrucción.
 */
import { formatea } from '../texto.js'
import { define, metrica, type Catalogo } from '../catalogo.js'
import type { Consultor } from '../consulta.js'
import type { Dashboard, FiltroDashboard } from '../esquema.js'
import { cifrasRespaldadas, numerosDe } from '../texto.js'
import { nombraPeriodo } from '../analisis.js'
import { ejecutaPlan, planEsquema, type Plan, type Resultado } from './plan.js'
import { mensajeUsuario, promptSistema, VERSION_PROMPT, type UltimoCambio } from './prompt.js'
import type { LlamadaModelo, Mensaje, ModeloEstudio, Registrador } from './tipos.js'

export interface ContextoAgente {
  readonly consultor: Consultor
  readonly modelo: ModeloEstudio
  /** Último mes con datos (`AAAA-MM`). */
  readonly corte: string
  readonly contexto?: string
  readonly registrador?: Registrador
  readonly maxIntentos?: number
  readonly maxTokens?: number
  readonly reloj?: () => string
}

export interface Vuelta {
  readonly instruccion: string
  readonly versionPrompt: string
  readonly modelo: string
  readonly plan: Plan | null
  readonly resultado: Resultado | null
  readonly intentos: number
  readonly llamadas: readonly LlamadaModelo[]
  readonly ms: { readonly modelo: number; readonly total: number }
  readonly costoUsd: number | null
  /** «Lo que entendí», en una línea. */
  readonly entendi: string
  readonly texto: string
  readonly error: string | null
}

const sistemas = new Map<string, string>()
function sistema(cat: Catalogo, c: ContextoAgente): string {
  const clave = `${cat.version}|${c.corte}|${c.contexto ?? ''}`
  if (!sistemas.has(clave)) sistemas.set(clave, promptSistema(cat, { corte: c.corte, contexto: c.contexto }))
  return sistemas.get(clave)!
}

/** El primer objeto JSON del texto (los modelos a veces lo envuelven en ``` aunque se les pida que no). */
export function extraeJson(texto: string): unknown {
  const i = texto.indexOf('{')
  const f = texto.lastIndexOf('}')
  if (i < 0 || f < i) throw new Error('la respuesta no trae un objeto JSON')
  return JSON.parse(texto.slice(i, f + 1))
}

const OPERADOR: Record<string, string> = { igual: '=', distinto: '≠', en: 'en', no_en: 'sin', mayor: '>', menor: '<', mayor_igual: '≥', menor_igual: '≤' }
export const textoFiltro = (f: FiltroDashboard) => `${f.dimension} ${OPERADOR[f.operador] ?? f.operador} ${f.valores.join(', ')}`

export function textoEntendi(p: Plan): string {
  if (!p.responde) return `sin métrica para «${p.sin_metrica?.pedido ?? p.entendi.metricas.join(', ')}»`
  const e = p.entendi
  return [`tipo: ${p.tipo}`, `métrica: ${e.metricas.join(', ')}`, e.dimensiones.length ? `dimensión: ${e.dimensiones.join(', ')}` : '', e.filtros.length ? `filtros: ${e.filtros.map(textoFiltro).join('; ')}` : '', e.periodo ? `periodo: ${e.periodo.desde}..${e.periodo.hasta}` : '', e.comparar ? 'comparar: año anterior' : '', p.componentes.length ? `toca: ${p.componentes.join(', ')}` : ''].filter(Boolean).join(' · ')
}

function redacta(cat: Catalogo, instruccion: string, r: Resultado): string {
  const p = r.plan
  if (!p.responde) return `No hay una métrica en el catálogo para «${p.sin_metrica?.pedido ?? ''}». No la aproximo con otra parecida. Puedo proponerla como métrica nueva (un diff del modelo semántico que revisa su dueño)${r.propuesta ? `: ${r.propuesta.motivo}` : ''}.`
  if (r.explicacion) {
    const d = r.explicacion
    return `${d.etiqueta} (${d.nombre}): ${d.descripcion || 'sin descripción en la capa'}. Tipo ${d.tipo}; fórmula ${d.formula}${d.filtro.length ? `; filtro ${d.filtro.join(' y ')}` : ''}. Dueño: ${d.dueno ?? 'sin dueño declarado'}; unidad: ${d.unidad || '—'}.${d.advertencias.length ? ` Ojo: ${d.advertencias.join('; ')}.` : ''}`
  }
  if (r.alerta) {
    const a = r.alerta
    const etiqueta = metrica(cat, a.metrica)?.etiqueta ?? a.metrica
    const cond = { cae_mas_de: 'cae más de', sube_mas_de: 'sube más de', debajo_de: 'queda debajo de', encima_de: 'queda encima de' }[a.condicion]
    return `Propuesta de alerta: avisar si ${etiqueta} ${cond} ${a.valor} ${a.unidad === 'valor' ? '' : a.unidad} (ventana ${a.ventana})${a.filtros.length ? ` para ${a.filtros.map(textoFiltro).join('; ')}` : ''}. Necesita tu confirmación para registrarse, y en el laboratorio no se envía a ningún canal.`.replace(/\s+/g, ' ')
  }
  if (r.analisis) return [r.analisis.texto, ...r.analisis.advertencias.filter((a) => a.startsWith('Advertencia'))].join(' ')
  const tocados = r.aplicado?.tocados.length ? ` Toca: ${r.aplicado.tocados.join(', ')}.` : ''
  return `${p.resumen || 'Listo para aplicar.'}${tocados}`.trim()
}

/** Cifras del texto ⊆ resultados de esta vuelta ∪ números que dijo la persona ∪ texto del catálogo. */
function verificaTexto(cat: Catalogo, instruccion: string, r: Resultado, texto: string): string {
  const permitidos = [...numerosDe(instruccion).map((n) => n.valor), ...[r.plan.entendi.periodo?.desde, r.plan.entendi.periodo?.hasta].flatMap((s) => (s ? [Number(s.slice(0, 4)), Number(s.slice(5))] : []))]
  const catalogo = r.plan.entendi.metricas.flatMap((m) => { const d = define(cat, m); return d ? numerosDe(`${d.etiqueta} ${d.descripcion} ${d.formula} ${d.filtro.join(' ')}`).map((n) => n.valor) : [] })
  const a = r.analisis
  const delAnalisis = a ? [a.periodo.desde, a.periodo.hasta, a.contra.desde, a.contra.hasta].map((s) => Number(s.slice(0, 4))).concat(a.evidencia.flatMap((e) => numerosDe(e.etiqueta).map((n) => n.valor))) : []
  const c = cifrasRespaldadas(texto, a?.evidencia ?? [], [...permitidos, ...catalogo, ...delAnalisis, ...(r.alerta ? [r.alerta.valor] : [])])
  if (c.ok) return texto
  return `${r.plan.tipo === 'filtrar' ? 'Apliqué los filtros pedidos.' : 'Preparé el cambio pedido.'}${r.aplicado?.tocados.length ? ` Toca: ${r.aplicado.tocados.join(', ')}.` : ''}`
}

const sumaCostos = (ls: readonly LlamadaModelo[]) => (ls.some((l) => l.costoUsd === null) ? null : ls.reduce((s, l) => s + (l.costoUsd ?? 0), 0))

/** Interpreta una instrucción sobre un tablero, EN SECO. No guarda nada: eso es `aplicaVuelta`. */
export async function interpreta(c: ContextoAgente, d: Dashboard, version: number, instruccion: string, seleccion?: Dashboard['seleccion'], ultimo?: UltimoCambio | null): Promise<Vuelta> {
  const t0 = performance.now()
  const cat = c.consultor.catalogo
  const mensajes: Mensaje[] = [{ role: 'user', content: mensajeUsuario(d, version, instruccion, seleccion ?? d.seleccion ?? null, ultimo) }]
  const llamadas: LlamadaModelo[] = []
  let plan: Plan | null = null
  let resultado: Resultado | null = null
  let error: string | null = null
  const max = c.maxIntentos ?? 2
  for (let intento = 1; intento <= max; intento++) {
    const r = await c.modelo.completa({ sistema: sistema(cat, c), mensajes, maxTokens: c.maxTokens ?? 1200 })
    const llamada: LlamadaModelo = { modelo: c.modelo.id, uso: r.uso, costoUsd: r.costoUsd, ms: r.ms, intento, cuando: (c.reloj ?? (() => new Date().toISOString()))() }
    llamadas.push(llamada)
    await c.registrador?.(llamada)
    let problemas: string[]
    try {
      const p = planEsquema.safeParse(extraeJson(r.texto))
      if (!p.success) problemas = p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
      else {
        resultado = await ejecutaPlan(c.consultor, p.data, d, version)
        // El plan que queda es el del resultado: el núcleo puede completar «lo que entendí» (el eje de tiempo).
        plan = resultado.plan
        problemas = resultado.errores.map((e) => `${e.codigo} · ${e.ruta}: ${e.mensaje}`)
      }
    } catch (e) {
      problemas = [e instanceof Error ? e.message : String(e)]
    }
    if (!problemas.length) { error = null; break }
    error = problemas.join(' | ')
    mensajes.push({ role: 'assistant', content: r.texto }, { role: 'user', content: `Tu plan no pasó la validación:\n- ${problemas.join('\n- ')}\nDevuelve el plan corregido, solo el JSON.` })
  }
  const modeloMs = llamadas.reduce((s, l) => s + l.ms, 0)
  const listo = resultado && !error ? resultado : null
  const texto = listo ? verificaTexto(cat, instruccion, listo, redacta(cat, instruccion, listo)) : `No pude convertir la instrucción en un cambio válido: ${error ?? 'sin respuesta'}`
  return { instruccion, versionPrompt: VERSION_PROMPT, modelo: c.modelo.id, plan, resultado: listo ?? resultado, intentos: llamadas.length, llamadas, ms: { modelo: modeloMs, total: performance.now() - t0 }, costoUsd: sumaCostos(llamadas), entendi: plan ? textoEntendi(plan) : '—', texto, error: listo ? null : error }
}

export { formatea, nombraPeriodo }
