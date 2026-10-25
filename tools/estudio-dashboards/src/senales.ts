/**
 * El motor de señales: detectar → diagnosticar → actuar → aprender, SOLO con consultas semánticas.
 *
 * No sabe qué buscar. Recorre las palancas que el perfil le asigna (frecuencia, valor, retención, riesgo) por la
 * entidad (p. ej. tienda) y por las dimensiones de origen, y publica una tarjeta cuando un cambio pasa un umbral
 * ESTADÍSTICO declarado aquí, igual para cualquier catálogo:
 *   - caída atípica: la variación interanual de una entidad está a z robusto ≤ −3 de sus pares (mediana y MAD);
 *   - brecha entre segmentos: ≥ 10 pp en una métrica en %, o ≥ 15 % relativo en las demás;
 *   - crecimiento con riesgo: crece por encima de la mediana de sus pares y su métrica de riesgo pasa el p75.
 * Ninguna regla nombra una tienda, una región, una campaña ni un resultado esperado: el perfil solo dice qué
 * métrica es de qué palanca y por qué dimensiones recorrer. Toda cifra de una tarjeta sale de una consulta.
 */
import { define, metrica, unidadDe, type Catalogo } from './catalogo.js'
import type { Consultor } from './consulta.js'
import type { PeriodoDashboard } from './esquema.js'
import type { Filtro } from './puerto.js'
import { analizaVariacion, ejeExplicativo, nombraPeriodo } from './analisis.js'
import { corre } from './resolver.js'
import { cifrasRespaldadas, formatea, numerosDe, type Evidencia } from './texto.js'

export type Palanca = 'frecuencia' | 'valor' | 'retencion' | 'riesgo' | 'eficiencia'
export type Etapa = 'detectar' | 'diagnosticar' | 'actuar' | 'aprender'

export interface PerfilSenales {
  readonly entidad: string
  /** Filtro de comparables para lo interanual (deja fuera lo que no existía el año anterior). */
  readonly comparables?: readonly Filtro[]
  readonly periodo: PeriodoDashboard
  readonly palancas: {
    readonly crecimiento?: string
    readonly frecuencia?: readonly string[]
    readonly valor?: readonly string[]
    readonly retencion?: readonly string[]
    readonly riesgo?: readonly string[]
    readonly eficiencia?: readonly string[]
    /** Métrica de adquisición: liga una brecha de segmento con las entidades donde ese segmento pesa más. */
    readonly adquisicion?: string
  }
  /** Dimensiones de origen o cohorte por las que buscar brechas. */
  readonly segmentos?: readonly string[]
  readonly guardarrail?: { readonly metrica: string; readonly minimo: number }
}

export const UMBRALES = { zRobusto: 3, brechaPp: 10, brechaRelativa: 0.15, percentilRiesgo: 0.75 } as const
const FACILIDAD: Record<Palanca, number> = { frecuencia: 8, retencion: 7, riesgo: 7, valor: 6, eficiencia: 6 }

export interface Experimento { readonly descripcion: string; readonly metricaGuia: string; readonly guardarrail: string; readonly poblacion: string; readonly duracion: string }
export interface Senal {
  readonly id: string
  readonly etapa: Etapa
  readonly estado: 'vigilando' | 'hipotesis' | 'experimento' | 'aprendizaje'
  readonly palancas: readonly Palanca[]
  readonly titulo: string
  readonly evidenciaTexto: string
  readonly hipotesis: string
  readonly diagnostico: string | null
  readonly experimento: Experimento | null
  readonly ice: { readonly impacto: number; readonly confianza: number; readonly facilidad: number; readonly ice: number }
  readonly dimension: string
  readonly entidades: readonly string[]
  readonly metricas: readonly string[]
  readonly evidencia: readonly Evidencia[]
  readonly advertencias: readonly string[]
  /** En una brecha: el segmento que rinde menos y el que rinde más. */
  readonly segmento?: { readonly bajo: string; readonly alto: string }
}

export const mediana = (xs: readonly number[]) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2) : 0 }
export const percentil = (xs: readonly number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]! : 0 }
export function zRobusto(xs: readonly number[]): (x: number) => number {
  const med = mediana(xs)
  const mad = mediana(xs.map((x) => Math.abs(x - med))) * 1.4826
  return (x) => (mad ? (x - med) / mad : 0)
}

async function porEntidad(x: Consultor, m: string, dim: string, periodo: PeriodoDashboard | undefined, filtros: readonly Filtro[]): Promise<Map<string, number>> {
  const r = await x.consulta({ metricas: [m], agrupar: [dim], filtros: [...filtros], ...(periodo ? { periodo } : {}) })
  const [id, im] = [r.columnas.indexOf(dim), r.columnas.indexOf(m)]
  return new Map(r.filas.filter((f) => f[im] !== null).map((f) => [String(f[id]), Number(f[im])]))
}

async function interanual(x: Consultor, p: PerfilSenales, m: string): Promise<{ cambio: Map<string, number>; antes: Map<string, number>; despues: Map<string, number> }> {
  const f = p.comparables ?? []
  const [antes, despues] = await Promise.all([porEntidad(x, m, p.entidad, corre(p.periodo, 'anio_anterior'), f), porEntidad(x, m, p.entidad, p.periodo, f)])
  const cambio = new Map([...despues].filter(([k]) => antes.get(k)).map(([k, v]) => [k, 100 * (v / antes.get(k)! - 1)]))
  return { cambio, antes, despues }
}

const lista = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`)
const limita = (n: number) => Math.max(1, Math.min(10, Math.round(n)))
const ice = (impacto: number, confianza: number, palanca: Palanca) => ({ impacto: limita(impacto), confianza: limita(confianza), facilidad: FACILIDAD[palanca], ice: Math.round(((limita(impacto) + limita(confianza) + FACILIDAD[palanca]) / 3) * 10) / 10 })

async function impactoDe(x: Consultor, p: PerfilSenales, filtros: readonly Filtro[]): Promise<number> {
  const n = p.palancas.crecimiento
  if (!n) return 5
  const [parte, todo] = await Promise.all([x.consulta({ metricas: [n], periodo: p.periodo, filtros: [...filtros] }), x.consulta({ metricas: [n], periodo: p.periodo })])
  const [a, b] = [Number(parte.filas[0]?.[0] ?? 0), Number(todo.filas[0]?.[0] ?? 0)]
  return b ? 1 + 9 * Math.min(1, (4 * a) / b) : 5
}

const guardarrailTexto = (p: PerfilSenales) => (p.guardarrail ? `${p.guardarrail.metrica} ≥ ${p.guardarrail.minimo}` : 'sin guardarraíl declarado')

/** Caída atípica de una palanca por entidad (interanual, comparables). */
async function caidas(x: Consultor, p: PerfilSenales, palanca: 'frecuencia' | 'valor'): Promise<Senal[]> {
  const salida: Senal[] = []
  for (const m of p.palancas[palanca] ?? []) {
    const { cambio, antes, despues } = await interanual(x, p, m)
    const z = zRobusto([...cambio.values()])
    const med = mediana([...cambio.values()])
    const atipicas = [...cambio].filter(([, v]) => z(v) <= -UMBRALES.zRobusto).sort((a, b) => a[1] - b[1])
    if (!atipicas.length) continue
    const u = unidadDe(metrica(x.catalogo, m)!)
    const entidades = atipicas.map(([k]) => k)
    const ev: Evidencia[] = [{ etiqueta: `mediana de la red (${m})`, valor: med, unidad: '%', consulta: `derivado: mediana de la variación interanual por ${p.entidad}` }]
    for (const [k, v] of atipicas) ev.push({ etiqueta: `${k} variación`, valor: v, unidad: '%', consulta: 'derivado: (después / antes − 1)' }, { etiqueta: `${k} antes`, valor: antes.get(k)!, unidad: u, consulta: `${m} por ${p.entidad}, ${nombraPeriodo(corre(p.periodo, 'anio_anterior'))}` }, { etiqueta: `${k} después`, valor: despues.get(k)!, unidad: u, consulta: `${m} por ${p.entidad}, ${nombraPeriodo(p.periodo)}` })
    const etiqueta = metrica(x.catalogo, m)?.etiqueta ?? m
    const detalle = atipicas.map(([k, v]) => `${k}: ${formatea(antes.get(k)!, u)} → ${formatea(despues.get(k)!, u)} (${v.toFixed(1)} %)`).join('; ')
    const filtroEnt: Filtro = { dimension: p.entidad, operador: 'en', valores: entidades }
    salida.push({
      id: `${palanca}-${m}`, etapa: 'detectar', estado: 'vigilando', palancas: [palanca], dimension: p.entidad, entidades, metricas: [m], evidencia: ev, advertencias: [],
      titulo: `${lista(entidades)}: ${etiqueta.toLowerCase()} cae mucho más que en el resto de la red`,
      evidenciaTexto: `${detalle}. Mediana de la red: ${med.toFixed(1)} % (${nombraPeriodo(p.periodo)} contra el año anterior).`,
      hipotesis: `Los clientes de ${lista(entidades)} compran menos seguido o gastan menos que en el resto de la red; algo local está frenando la ${palanca}.`,
      diagnostico: null,
      experimento: { descripcion: `A/B: recordatorio de recompra a la mitad de los clientes recurrentes de ${lista(entidades)}`, metricaGuia: m, guardarrail: guardarrailTexto(p), poblacion: `clientes de ${lista(entidades)}`, duracion: '6 semanas' },
      ice: ice(await impactoDe(x, p, [filtroEnt]), (5 * Math.abs(z(atipicas[0]![1]))) / UMBRALES.zRobusto, palanca),
    })
  }
  return salida
}

/** Brecha entre segmentos (origen, cohorte…) de una palanca, sobre toda la historia observable. */
async function brechas(x: Consultor, p: PerfilSenales, palanca: 'retencion' | 'valor'): Promise<Senal[]> {
  const salida: Senal[] = []
  for (const m of p.palancas[palanca] ?? []) {
    const mm = metrica(x.catalogo, m)
    if (!mm) continue
    for (const dim of (p.segmentos ?? []).filter((d) => mm.dimensiones.some((md) => md.nombre === d))) {
      const v = await porEntidad(x, m, dim, palanca === 'valor' ? p.periodo : undefined, [])
      if (v.size < 2) continue
      const orden = [...v].sort((a, b) => b[1] - a[1])
      const [alto, bajo] = [orden[0]!, orden.at(-1)!]
      const u = unidadDe(mm)
      const brecha = u === '%' ? alto[1] - bajo[1] : (alto[1] - bajo[1]) / Math.abs(alto[1] || 1)
      if (u === '%' ? brecha < UMBRALES.brechaPp : brecha < UMBRALES.brechaRelativa) continue
      const ev: Evidencia[] = [{ etiqueta: `${alto[0]}`, valor: alto[1], unidad: u, consulta: `${m} por ${dim}` }, { etiqueta: `${bajo[0]}`, valor: bajo[1], unidad: u, consulta: `${m} por ${dim}` }, { etiqueta: 'brecha', valor: u === '%' ? brecha : 100 * brecha, unidad: u === '%' ? 'pp' : '%', consulta: 'derivado: diferencia entre segmentos' }]
      const etiqueta = mm.etiqueta ?? m
      salida.push({
        id: `${palanca}-${m}-${dim}`, etapa: 'diagnosticar', estado: 'hipotesis', palancas: [palanca], dimension: dim, entidades: [], metricas: [m], evidencia: ev, advertencias: [], segmento: { bajo: bajo[0], alto: alto[0] },
        titulo: `Los clientes de «${bajo[0]}» rinden menos en ${etiqueta.toLowerCase()} que los de «${alto[0]}»`,
        evidenciaTexto: `${etiqueta}: ${formatea(bajo[1], u)} en «${bajo[0]}» contra ${formatea(alto[1], u)} en «${alto[0]}» (${u === '%' ? `${brecha.toFixed(1)} pp` : `${(100 * brecha).toFixed(1)} %`} de brecha, por ${dim}).`,
        hipotesis: `Lo que trae a los clientes de «${bajo[0]}» atrae compradores de una sola vez; cambiar el incentivo de entrada por uno de segunda compra retendría más.`,
        diagnostico: null,
        experimento: { descripcion: `Incentivo de segunda compra a la próxima cohorte de «${bajo[0]}», frente a la anterior sin él`, metricaGuia: m, guardarrail: guardarrailTexto(p), poblacion: `clientes nuevos de «${bajo[0]}»`, duracion: '90 días' },
        ice: ice(6, (5 * (u === '%' ? brecha / UMBRALES.brechaPp : brecha / UMBRALES.brechaRelativa)), palanca),
      })
    }
  }
  return salida
}

/** Entidades que crecen sobre la mediana de sus pares con la métrica de riesgo sobre el p75 de la red. */
async function riesgos(x: Consultor, p: PerfilSenales): Promise<Senal[]> {
  const n = p.palancas.crecimiento
  if (!n) return []
  const { cambio } = await interanual(x, p, n)
  const med = mediana([...cambio.values()])
  const salida: Senal[] = []
  for (const r of p.palancas.riesgo ?? []) {
    const riesgo = await porEntidad(x, r, p.entidad, undefined, [])
    const corte = percentil([...riesgo.values()], UMBRALES.percentilRiesgo)
    const en = [...cambio].filter(([k, v]) => v > med && (riesgo.get(k) ?? 0) > corte).sort((a, b) => (riesgo.get(b[0]) ?? 0) - (riesgo.get(a[0]) ?? 0) || b[1] - a[1])
    if (!en.length) continue
    const entidades = en.map(([k]) => k)
    const ur = unidadDe(metrica(x.catalogo, r)!)
    const ev: Evidencia[] = [{ etiqueta: 'mediana de crecimiento', valor: med, unidad: '%', consulta: `derivado: mediana interanual de ${n} por ${p.entidad}` }, { etiqueta: `p75 de ${r}`, valor: corte, unidad: ur, consulta: `derivado: percentil 75 de ${r} por ${p.entidad}` }]
    for (const [k, v] of en) ev.push({ etiqueta: `${k} crecimiento`, valor: v, unidad: '%', consulta: 'derivado: (después / antes − 1)' }, { etiqueta: `${k} ${r}`, valor: riesgo.get(k)!, unidad: ur, consulta: `${r} por ${p.entidad}` })
    const etiqueta = metrica(x.catalogo, r)?.etiqueta ?? r
    salida.push({
      id: `riesgo-${r}`, etapa: 'detectar', estado: 'vigilando', palancas: ['riesgo'], dimension: p.entidad, entidades, metricas: [n, r], evidencia: ev, advertencias: [...(define(x.catalogo, r)?.advertencias ?? [])],
      titulo: `${entidades[0]} crece rápido y se está quedando sin producto`,
      evidenciaTexto: `${en.map(([k, v]) => `${k}: +${v.toFixed(1)} % y ${formatea(riesgo.get(k)!, ur)} en ${etiqueta.toLowerCase()}`).join('; ')}. Mediana de crecimiento: ${med.toFixed(1)} %; p75 de ${etiqueta.toLowerCase()}: ${formatea(corte, ur)}.`,
      hipotesis: 'Parte de la demanda ya no se está atendiendo: el crecimiento puede frenarse por quiebres de inventario.',
      diagnostico: null,
      experimento: { descripcion: `Reabasto priorizado de lo que está bajo reorden en ${lista(entidades)}, con seguimiento de ventas perdidas`, metricaGuia: n, guardarrail: guardarrailTexto(p), poblacion: lista(entidades), duracion: '4 semanas' },
      ice: ice(await impactoDe(x, p, [{ dimension: p.entidad, operador: 'en', valores: entidades }]), 5 + (riesgo.get(entidades[0]!)! - corte), 'riesgo'),
    })
  }
  return salida
}

/** Aprendizajes de eficiencia: el mejor y el peor caso de la palanca, con la advertencia de su definición. */
async function aprendizajes(x: Consultor, p: PerfilSenales): Promise<Senal[]> {
  const salida: Senal[] = []
  for (const m of p.palancas.eficiencia ?? []) {
    const mm = metrica(x.catalogo, m)
    const dim = mm?.dimensiones.find((d) => d.tipo === 'categorica' && (x.catalogo.dominios.get(d.nombre)?.length ?? 99) <= 12)?.nombre
    if (!mm || !dim) continue
    const v = [...(await porEntidad(x, m, dim, undefined, []))].sort((a, b) => b[1] - a[1])
    if (v.length < 2) continue
    const [mejor, peor] = [v[0]!, v.at(-1)!]
    const u = unidadDe(mm)
    const advertencias = /ingenu|no controla|aproximad|sin ajuste/i.test(mm.descripcion) ? [`Advertencia de la definición: ${mm.descripcion}`] : []
    salida.push({
      id: `aprendizaje-${m}`, etapa: 'aprender', estado: 'aprendizaje', palancas: ['eficiencia'], dimension: dim, entidades: [], metricas: [m], advertencias,
      evidencia: [{ etiqueta: mejor[0], valor: mejor[1], unidad: u, consulta: `${m} por ${dim}` }, { etiqueta: peor[0], valor: peor[1], unidad: u, consulta: `${m} por ${dim}` }],
      titulo: `«${peor[0]}» no rindió como «${mejor[0]}»`,
      evidenciaTexto: `${mm.etiqueta ?? m}: ${formatea(peor[1], u)} en «${peor[0]}» contra ${formatea(mejor[1], u)} en «${mejor[0]}».${advertencias.length ? ` ${mm.descripcion}` : ''}`,
      hipotesis: `Concentrar la inversión en lo que se parece a «${mejor[0]}» y no repetir lo que se parece a «${peor[0]}» sin revisar por qué.`,
      diagnostico: null, experimento: null, ice: ice(5, 5, 'eficiencia'),
    })
  }
  return salida
}

/** Diagnóstico: el eje que mejor explica la caída en las entidades señaladas (consulta semántica, sin LLM). */
async function diagnostica(x: Consultor, p: PerfilSenales, s: Senal): Promise<Senal> {
  if (s.etapa !== 'detectar' || !s.entidades.length || s.palancas.includes('riesgo')) return s
  try {
    const m = s.metricas[0]!
    const a = await analizaVariacion(x, { metrica: m, periodo: p.periodo, filtros: [{ dimension: p.entidad, operador: 'en', valores: [...s.entidades] }, ...(p.comparables ?? [])] })
    const eje = ejeExplicativo(a.ejes, a.ejes.some((e) => e.mezcla !== null))
    return { ...s, etapa: 'diagnosticar', estado: 'hipotesis', diagnostico: a.texto, evidencia: [...s.evidencia, ...a.evidencia], advertencias: [...s.advertencias, ...(eje ? [] : ['ningún eje explica la caída'])] }
  } catch {
    return s
  }
}

/**
 * Los números que son TEXTO del catálogo no son cifras: el nombre o la definición de una métrica («Retención a 3
 * meses», «baseline de 14 días») y el nombre de un segmento («Hot Sale 2026»). Se permiten; nada más.
 */
export function numerosDelCatalogo(cat: Catalogo, metricas: readonly string[], nombres: readonly string[]): number[] {
  const textos = [...metricas.flatMap((m) => [metrica(cat, m)?.etiqueta ?? '', metrica(cat, m)?.descripcion ?? '']), ...nombres]
  return textos.flatMap((t) => numerosDe(t).map((n) => n.valor))
}

function comprueba(cat: Catalogo, s: Senal, base: readonly number[]): Senal {
  const permitidos = [...base, ...numerosDelCatalogo(cat, s.metricas, [...s.entidades, ...s.evidencia.map((e) => e.etiqueta)])]
  for (const t of [s.titulo, s.evidenciaTexto, s.hipotesis, s.diagnostico ?? '']) {
    const c = cifrasRespaldadas(t, s.evidencia, permitidos)
    if (!c.ok) throw new Error(`la señal ${s.id} tendría cifras sin respaldo: ${c.sinRespaldo.join(', ')}`)
  }
  return s
}

/**
 * Liga una brecha de segmento al mapa: la entidad donde ese segmento pesa más entre los clientes nuevos (métrica de
 * adquisición del perfil, por la dimensión de mismo sufijo que la alcance). Sin esa métrica, la tarjeta no se liga.
 */
async function ligaEntidades(x: Consultor, p: PerfilSenales, s: Senal): Promise<Senal> {
  const n = p.palancas.adquisicion
  const m = n ? metrica(x.catalogo, n) : undefined
  if (!s.segmento || !m || !n) return s
  const sufijo = s.dimension.slice(s.dimension.lastIndexOf('__'))
  const dim = m.dimensiones.find((d) => d.tipo === 'categorica' && d.nombre.endsWith(sufijo))?.nombre
  if (!dim) return s
  const [parte, todo] = await Promise.all([porEntidad(x, n, p.entidad, p.periodo, [{ dimension: dim, operador: 'en', valores: [s.segmento.bajo] }]), porEntidad(x, n, p.entidad, p.periodo, [])])
  const [mayor] = [...parte].filter(([k]) => todo.get(k)).map(([k, v]) => [k, v / todo.get(k)!] as const).sort((a, b) => b[1] - a[1])
  return mayor ? { ...s, entidades: [mayor[0]] } : s
}

/** Recorre el catálogo con el perfil y devuelve las señales ordenadas por ICE. */
export async function detectaSenales(x: Consultor, p: PerfilSenales): Promise<Senal[]> {
  const detectadas = [...await caidas(x, p, 'frecuencia'), ...await caidas(x, p, 'valor'), ...await brechas(x, p, 'retencion'), ...await brechas(x, p, 'valor'), ...await riesgos(x, p), ...await aprendizajes(x, p)]
  const unidas = await Promise.all(unePorEntidades(detectadas).map((s) => ligaEntidades(x, p, s)))
  const diagnosticadas = await Promise.all(unidas.map((s) => diagnostica(x, p, s)))
  const anios = [p.periodo.desde, p.periodo.hasta, corre(p.periodo, 'anio_anterior').desde].map((s) => Number(s.slice(0, 4)))
  return diagnosticadas.map((s) => comprueba(x.catalogo, s, [...anios, 100 * UMBRALES.percentilRiesgo])).sort((a, b) => b.ice.ice - a.ice.ice)
}

/**
 * Una historia, una tarjeta: dos caídas en las MISMAS entidades (frecuencia y valor) o dos brechas del MISMO segmento
 * (retención y valor) se unen. Las métricas y la evidencia se suman; la palanca principal es la primera.
 */
function unePorEntidades(ss: readonly Senal[]): Senal[] {
  const clave = (s: Senal) => s.palancas.includes('riesgo') || s.etapa === 'aprender' ? null
    : s.segmento ? `segmento:${s.segmento.bajo}|${s.segmento.alto}`
      : s.entidades.length ? `entidades:${[...s.entidades].sort().join('|')}` : null
  const salida: Senal[] = []
  for (const s of ss) {
    const k = clave(s)
    const igual = k ? salida.find((o) => clave(o) === k) : undefined
    if (!igual) { salida.push(s); continue }
    const principal = igual.palancas.includes('retencion') || !s.palancas.includes('retencion') ? igual : s
    const otra = principal === igual ? s : igual
    salida[salida.indexOf(igual)] = { ...principal, palancas: [...new Set([...principal.palancas, ...otra.palancas])], metricas: [...principal.metricas, ...otra.metricas], evidencia: [...principal.evidencia, ...otra.evidencia], evidenciaTexto: `${principal.evidenciaTexto} ${otra.evidenciaTexto}`, ice: principal.ice.ice >= otra.ice.ice ? principal.ice : otra.ice }
  }
  return salida
}
