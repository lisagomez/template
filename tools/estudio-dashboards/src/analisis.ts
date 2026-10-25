/**
 * `analizar_variacion`: descompone el cambio de una métrica entre dos periodos con consultas semánticas, y deja un
 * hallazgo cuyo texto solo lleva cifras de esas consultas (o su aritmética declarada: diferencias y efectos).
 *
 *   - Métrica SUMABLE (ventas): contribución de cada segmento al cambio total, por eje.
 *   - Métrica de TASA (razón o derivada con denominador: margen %, ticket): efecto MEZCLA (cambió el peso de los
 *     segmentos) y efecto TASA (cambió la tasa dentro de cada segmento), con el denominador como peso.
 *   - Si la métrica es numerador de una razón del catálogo (ventas = pedidos × ticket), efecto VOLUMEN y PRECIO.
 * Los ejes por defecto son las dimensiones categóricas de dominio chico que la métrica alcanza (canal, categoría,
 * región, campaña, origen…): el núcleo no sabe cuáles son en esta empresa; las descubre en el catálogo.
 */
import { alcanza, define, esSumable, metrica, tieneDesfase, unidadDe, type Catalogo } from './catalogo.js'
import { ConsultaInvalida, type Consultor } from './consulta.js'
import type { Componente, PeriodoDashboard } from './esquema.js'
import type { Filtro } from './puerto.js'
import { corre } from './resolver.js'
import { cifrasRespaldadas, formatea, numerosDe, type Evidencia } from './texto.js'

export interface Segmento { readonly clave: string; readonly antes: number | null; readonly despues: number | null; readonly pesoAntes: number | null; readonly pesoDespues: number | null; readonly contribucion: number | null }
export interface Eje {
  readonly dimension: string
  readonly segmentos: readonly Segmento[]
  readonly mezcla: number | null
  readonly tasa: number | null
  /** |contribución del primer segmento| / Σ |contribuciones|: qué tanto lo explica UN segmento. */
  readonly concentracion: number
  /** ½ Σ |Δpeso|: cuánto cambió la composición (0 = igual, 1 = otra). Solo métricas de tasa. */
  readonly desplazamiento: number
}
export interface AnalisisVariacion {
  readonly metrica: string
  readonly periodo: PeriodoDashboard
  readonly contra: PeriodoDashboard
  readonly antes: number | null
  readonly despues: number | null
  readonly cambio: number | null
  readonly unidadCambio: '%' | 'pp' | 'valor'
  readonly ejes: readonly Eje[]
  readonly volumenPrecio: { readonly volumen: string; readonly precio: string; readonly efectoVolumen: number; readonly efectoPrecio: number } | null
  readonly evidencia: readonly Evidencia[]
  readonly texto: string
  readonly advertencias: readonly string[]
  readonly hallazgo: Extract<Componente, { tipo: 'hallazgo' }>
}

export interface PedidoAnalisis { readonly metrica: string; readonly periodo: PeriodoDashboard; readonly contra?: PeriodoDashboard; readonly filtros?: readonly Filtro[]; readonly ejes?: readonly string[]; readonly id?: string }

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const nombraPeriodo = (p: PeriodoDashboard) => {
  const n = (s: string) => `${MESES[Number(s.slice(5)) - 1]} ${s.slice(0, 4)}`
  return p.desde === p.hasta ? n(p.desde) : `${n(p.desde)}–${n(p.hasta)}`
}

/** El denominador que pesa a una métrica de tasa: el de la razón, o el `/ nullif(x, 0)` de una derivada. */
export function denominadorDe(cat: Catalogo, nombre: string): string | null {
  const m = metrica(cat, nombre)
  if (!m) return null
  if (m.tipo === 'ratio') return m.denominador
  const d = m.expr?.match(/\/\s*(?:nullif\(\s*)?([a-z_][a-z0-9_]*)/)?.[1]
  return d && m.entradas.some((e) => (e.alias ?? e.nombre) === d) ? d : null
}

/** Ejes por defecto: categóricas con dominio de 2 a 12 valores que la métrica (y su peso) alcanzan. */
export function ejesPorDefecto(cat: Catalogo, nombre: string): string[] {
  const m = metrica(cat, nombre)
  const peso = denominadorDe(cat, nombre)
  const mp = peso ? metrica(cat, peso) : undefined
  if (!m) return []
  return m.dimensiones.filter((d) => d.tipo === 'categorica').map((d) => d.nombre)
    .filter((d) => { const n = cat.dominios.get(d)?.length ?? 0; return n >= 2 && n <= 12 })
    .filter((d) => !mp || alcanza(mp, d))
}

async function porSegmento(x: Consultor, nombre: string, eje: string, p: PeriodoDashboard, filtros: readonly Filtro[]): Promise<Map<string, number | null>> {
  const r = await x.consulta({ metricas: [nombre], agrupar: [eje], periodo: p, filtros: [...filtros] })
  const [ie, im] = [r.columnas.indexOf(eje), r.columnas.indexOf(nombre)]
  return new Map(r.filas.map((f) => [String(f[ie]), f[im] === null ? null : Number(f[im])]))
}

async function total(x: Consultor, nombre: string, p: PeriodoDashboard, filtros: readonly Filtro[]): Promise<number | null> {
  const r = await x.consulta({ metricas: [nombre], periodo: p, filtros: [...filtros] })
  const v = r.filas[0]?.[r.columnas.indexOf(nombre)]
  return v === null || v === undefined ? null : Number(v)
}

async function analizaEje(x: Consultor, a: PedidoAnalisis, contra: PeriodoDashboard, eje: string, peso: string | null, base: number | null): Promise<Eje> {
  const f = a.filtros ?? []
  const [v0, v1] = await Promise.all([porSegmento(x, a.metrica, eje, contra, f), porSegmento(x, a.metrica, eje, a.periodo, f)])
  const [w0, w1] = peso ? await Promise.all([porSegmento(x, peso, eje, contra, f), porSegmento(x, peso, eje, a.periodo, f)]) : [new Map(), new Map()]
  const [t0, t1] = [[...w0.values()].reduce((s, v) => s + (v ?? 0), 0), [...w1.values()].reduce((s, v) => s + (v ?? 0), 0)]
  let mezcla = 0, tasa = 0, desplazamiento = 0
  const segmentos = [...new Set([...v0.keys(), ...v1.keys()])].map((clave) => {
    const [antes, despues] = [v0.get(clave) ?? null, v1.get(clave) ?? null]
    const [pa, pd] = peso ? [t0 ? (w0.get(clave) ?? 0) / t0 : 0, t1 ? (w1.get(clave) ?? 0) / t1 : 0] : [null, null]
    if (!peso) return { clave, antes, despues, pesoAntes: null, pesoDespues: null, contribucion: (despues ?? 0) - (antes ?? 0) }
    // Shift-share: mezcla = Δpeso × tasa₀; tasa = peso₁ × Δtasa. Un segmento que no existía usa la tasa global anterior.
    const r0 = antes ?? base ?? 0
    const dm = ((pd ?? 0) - (pa ?? 0)) * r0
    const dt = despues === null ? 0 : (pd ?? 0) * (despues - r0)
    mezcla += dm; tasa += dt; desplazamiento += Math.abs((pd ?? 0) - (pa ?? 0)) / 2
    return { clave, antes, despues, pesoAntes: pa, pesoDespues: pd, contribucion: dm + dt }
  }).sort((s1, s2) => peso
    // El que más cambió de peso; a la par, el que GANÓ peso (es la composición nueva la que se explica).
    ? Math.abs((s2.pesoDespues ?? 0) - (s2.pesoAntes ?? 0)) - Math.abs((s1.pesoDespues ?? 0) - (s1.pesoAntes ?? 0))
      || ((s2.pesoDespues ?? 0) - (s2.pesoAntes ?? 0)) - ((s1.pesoDespues ?? 0) - (s1.pesoAntes ?? 0))
    : Math.abs(s2.contribucion ?? 0) - Math.abs(s1.contribucion ?? 0))
  const suma = segmentos.reduce((s, g) => s + Math.abs(g.contribucion ?? 0), 0)
  const concentracion = suma ? Math.abs(segmentos[0]?.contribucion ?? 0) / suma : 0
  return { dimension: eje, segmentos, mezcla: peso ? mezcla : null, tasa: peso ? tasa : null, concentracion, desplazamiento }
}

/** El eje que mejor explica: en una tasa, el que más cambió de composición (si cambió algo); si no, el más concentrado. */
export function ejeExplicativo(ejes: readonly Eje[], tasa: boolean): Eje | undefined {
  const porDesplazamiento = [...ejes].sort((a, b) => b.desplazamiento - a.desplazamiento)[0]
  if (tasa && porDesplazamiento && porDesplazamiento.desplazamiento >= 0.2) return porDesplazamiento
  return [...ejes].sort((a, b) => b.concentracion - a.concentracion)[0]
}

/** Si la métrica es numerador de una razón (ventas / pedidos = ticket): volumen = Δden × tasa₀; precio = den₁ × Δtasa. */
async function volumenPrecio(x: Consultor, a: PedidoAnalisis, contra: PeriodoDashboard) {
  const razon = [...x.catalogo.metricas.values()].find((m) => m.tipo === 'ratio' && m.numerador === a.metrica && m.denominador)
  if (!razon?.denominador) return null
  const f = a.filtros ?? []
  const [d0, d1, r0, r1] = await Promise.all([total(x, razon.denominador, contra, f), total(x, razon.denominador, a.periodo, f), total(x, razon.nombre, contra, f), total(x, razon.nombre, a.periodo, f)])
  if ([d0, d1, r0, r1].some((v) => v === null)) return null
  return { volumen: razon.denominador, precio: razon.nombre, efectoVolumen: (d1! - d0!) * r0!, efectoPrecio: d1! * (r1! - r0!), d0: d0!, d1: d1!, r0: r0!, r1: r1! }
}

const pct = (v: number) => `${(v * 100).toFixed(1)} %`

function redacta(cat: Catalogo, a: PedidoAnalisis, contra: PeriodoDashboard, r: Pick<AnalisisVariacion, 'antes' | 'despues' | 'cambio' | 'unidadCambio' | 'ejes' | 'volumenPrecio'>, ev: Evidencia[]): string {
  const m = metrica(cat, a.metrica)!
  const u = unidadDe(m)
  const etiqueta = m.etiqueta ?? a.metrica
  const cambio = r.unidadCambio === 'pp' ? formatea(r.cambio, 'pp') : r.unidadCambio === '%' ? `${(r.cambio ?? 0) > 0 ? '+' : ''}${(r.cambio ?? 0).toFixed(1)} %` : formatea(r.cambio, u)
  const partes = [`${etiqueta} pasó de ${formatea(r.antes, u)} (${nombraPeriodo(contra)}) a ${formatea(r.despues, u)} (${nombraPeriodo(a.periodo)}): ${cambio}.`]
  const eje = ejeExplicativo(r.ejes, r.ejes.some((e) => e.mezcla !== null))
  const top = eje?.segmentos[0]
  if (eje && top) {
    if (eje.mezcla !== null && top.pesoAntes !== null && top.pesoDespues !== null) {
      const contraTasa = top.antes ?? r.antes
      partes.push(`Por ${eje.dimension}, «${top.clave}» pasó de ${pct(top.pesoAntes)} a ${pct(top.pesoDespues)} del total, con ${m.etiqueta ?? a.metrica} de ${formatea(top.despues, u)} contra ${formatea(contraTasa, u)}${top.antes === null ? ' del total anterior' : ''}; efecto mezcla ${formatea(eje.mezcla, u === '%' ? 'pp' : u)}, efecto tasa ${formatea(eje.tasa, u === '%' ? 'pp' : u)}.`)
      ev.push({ etiqueta: `peso ${top.clave} antes`, valor: top.pesoAntes, unidad: 'proporción', consulta: 'derivado: participación del denominador' }, { etiqueta: `peso ${top.clave} después`, valor: top.pesoDespues, unidad: 'proporción', consulta: 'derivado: participación del denominador' }, { etiqueta: 'efecto mezcla', valor: eje.mezcla, unidad: u, consulta: 'derivado: Σ Δpeso × tasa₀' }, { etiqueta: 'efecto tasa', valor: eje.tasa ?? 0, unidad: u, consulta: 'derivado: Σ peso₁ × Δtasa' })
      ev.push({ etiqueta: `${top.clave} después`, valor: top.despues ?? 0, unidad: u, consulta: `${a.metrica} por ${eje.dimension}, ${nombraPeriodo(a.periodo)}` })
      if (top.antes !== null) ev.push({ etiqueta: `${top.clave} antes`, valor: top.antes, unidad: u, consulta: `${a.metrica} por ${eje.dimension}, ${nombraPeriodo(contra)}` })
    } else {
      partes.push(`Por ${eje.dimension}, «${top.clave}» explica ${formatea(top.contribucion, u)} del cambio (${formatea(top.antes, u)} → ${formatea(top.despues, u)}).`)
      ev.push({ etiqueta: `contribución ${top.clave}`, valor: top.contribucion ?? 0, unidad: u, consulta: 'derivado: Δ del segmento' })
      ev.push({ etiqueta: `${top.clave} antes`, valor: top.antes ?? 0, unidad: u, consulta: `${a.metrica} por ${eje.dimension}, ${nombraPeriodo(contra)}` }, { etiqueta: `${top.clave} después`, valor: top.despues ?? 0, unidad: u, consulta: `${a.metrica} por ${eje.dimension}, ${nombraPeriodo(a.periodo)}` })
    }
  }
  const vp = r.volumenPrecio
  if (vp) {
    partes.push(`Volumen (${vp.volumen}) aporta ${formatea(vp.efectoVolumen, u)} y precio (${vp.precio}) ${formatea(vp.efectoPrecio, u)}.`)
    ev.push({ etiqueta: 'efecto volumen', valor: vp.efectoVolumen, unidad: u, consulta: 'derivado: Δden × tasa₀' }, { etiqueta: 'efecto precio', valor: vp.efectoPrecio, unidad: u, consulta: 'derivado: den₁ × Δtasa' })
  }
  return partes.join(' ')
}

export async function analizaVariacion(x: Consultor, a: PedidoAnalisis): Promise<AnalisisVariacion> {
  const cat = x.catalogo
  const m = metrica(cat, a.metrica)
  if (!m) throw new ConsultaInvalida([{ codigo: 'metrica_inexistente', ruta: 'metrica', mensaje: `la métrica «${a.metrica}» no existe en el catálogo` }])
  // Una métrica con desfase no se totaliza sobre un periodo (compara contra el año anterior completo, y MetricFlow
  // la rechaza sin agrupar por tiempo). Su variación contra el año anterior ES el cambio de su métrica base: se
  // descompone esa y el hallazgo lo dice. Visto en la medición del 2026-10-20 (q059); se mide en un set nuevo.
  if (tieneDesfase(cat, a.metrica)) {
    const base = m.entradas.find((e) => e.desfase === null)?.nombre
    if (!base || tieneDesfase(cat, base)) throw new ConsultaInvalida([{ codigo: 'desfase_en_periodo', ruta: 'metrica', mensaje: `«${a.metrica}» lleva desfase de un año y no se descompone sobre un periodo, y no tiene una métrica base sin desfase que analizar` }])
    const r = await analizaVariacion(x, { ...a, metrica: base })
    const etiqueta = m.etiqueta ?? a.metrica
    const texto = `${etiqueta} compara ${metrica(cat, base)?.etiqueta ?? base} contra el año anterior; descompongo ese cambio. ${r.texto}`
    return { ...r, texto, hallazgo: { ...r.hallazgo, titulo: `¿Por qué cambió ${etiqueta}?`.slice(0, 100), texto: texto.slice(0, 800) } }
  }
  const contra = a.contra ?? corre(a.periodo, 'anio_anterior')
  const f = a.filtros ?? []
  const [antes, despues] = await Promise.all([total(x, a.metrica, contra, f), total(x, a.metrica, a.periodo, f)])
  const u = unidadDe(m)
  const unidadCambio: AnalisisVariacion['unidadCambio'] = u === '%' ? 'pp' : esSumable(cat, a.metrica, 'categorica') || m.tipo === 'ratio' ? '%' : 'valor'
  const cambio = antes === null || despues === null ? null : unidadCambio === 'pp' ? despues - antes : unidadCambio === '%' && antes !== 0 ? 100 * (despues / antes - 1) : despues - antes
  const peso = esSumable(cat, a.metrica, 'categorica') ? null : denominadorDe(cat, a.metrica)
  const ejes = await Promise.all((a.ejes ?? ejesPorDefecto(cat, a.metrica)).slice(0, 6).map((e) => analizaEje(x, a, contra, e, peso, antes)))
  const vp = esSumable(cat, a.metrica, 'categorica') ? await volumenPrecio(x, a, contra) : null
  const ev: Evidencia[] = [
    { etiqueta: `${a.metrica} ${nombraPeriodo(contra)}`, valor: antes ?? 0, unidad: u, consulta: `${a.metrica}, ${nombraPeriodo(contra)}` },
    { etiqueta: `${a.metrica} ${nombraPeriodo(a.periodo)}`, valor: despues ?? 0, unidad: u, consulta: `${a.metrica}, ${nombraPeriodo(a.periodo)}` },
    { etiqueta: 'cambio', valor: cambio ?? 0, unidad: unidadCambio, consulta: 'derivado: diferencia de las dos cifras' },
  ]
  const volumenPrecioR = vp ? { volumen: vp.volumen, precio: vp.precio, efectoVolumen: vp.efectoVolumen, efectoPrecio: vp.efectoPrecio } : null
  const texto = redacta(cat, a, contra, { antes, despues, cambio, unidadCambio, ejes, volumenPrecio: volumenPrecioR }, ev)
  const advertencias = [...(define(cat, a.metrica)?.advertencias ?? [])]
  if (/ingenu|no controla|aproximad|sin ajuste/i.test(m.descripcion)) advertencias.push(`Advertencia de la definición: ${m.descripcion}`)
  const anios = [a.periodo.desde, a.periodo.hasta, contra.desde, contra.hasta].map((s) => Number(s.slice(0, 4)))
  const chequeo = cifrasRespaldadas(texto, ev, [...anios, ...[m.etiqueta ?? '', m.descripcion, ...ev.map((e) => e.etiqueta)].flatMap((t) => numerosDe(t).map((n) => n.valor))])
  if (!chequeo.ok) throw new Error(`el hallazgo tendría cifras sin respaldo: ${chequeo.sinRespaldo.join(', ')}`)
  const hallazgo = { id: a.id ?? `hallazgo_${a.metrica}`.slice(0, 40), tipo: 'hallazgo' as const, titulo: `¿Por qué cambió ${m.etiqueta ?? a.metrica}?`.slice(0, 100), texto: texto.slice(0, 800), evidencia: ev.slice(0, 30).map((e) => ({ ...e, consulta: e.consulta.slice(0, 400), etiqueta: e.etiqueta.slice(0, 120) })) }
  return { metrica: a.metrica, periodo: a.periodo, contra, antes, despues, cambio, unidadCambio, ejes, volumenPrecio: volumenPrecioR, evidencia: ev, texto, advertencias, hallazgo }
}
