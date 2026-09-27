/**
 * El motor (spec 004, PRP-005 Fase 3): determinista, sin modelo, sin red y sin datos propios.
 * Recibe el conocimiento y una pregunta ya estructurada, y devuelve un veredicto con su traza.
 *
 * Es el port de `businessos/grafo/evaluador.py` de Hermes en el corte `97d9f9e`, y se mide contra
 * él: la prueba de paridad corre este motor sobre la fuente única y exige las mismas respuestas
 * que dio el motor de Hermes en los 782 casos del corpus, salvo las diferencias firmadas.
 *
 * Lo que decide distinto de Hermes, a propósito:
 * - **Fail-safe tipado** (RF-6, RF-8): sin regla, con reglas en conflicto o por encima del tope,
 *   `veredicto: null` y un `motivo`. En Hermes los tres eran `estado: dudoso`.
 * - **Empates explícitos**: a igual largo de keyword gana la categoría de clave menor, y a igual
 *   `vigente_desde` la regla de clave menor. En Hermes decidía el orden del seed.
 * - **El tope acota cualquier veredicto**, no solo `deducible`, y sin moneda en la bandera.
 * - **El régimen es obligatorio**, y la fecha que falta se dice (`fecha_supuesta`, RF-13).
 */
import {
  Pregunta,
  Resultado,
  type FalloSinVeredicto,
  type Categoria,
  type ConceptoEvaluado,
  type Conocimiento,
  type Fuente,
  type Impacto,
  type Regla,
} from './contrato.js'
import { validaConocimiento } from './valida.js'

export const DISCLAIMER =
  'Veredicto informativo y automatizado, calculado con reglas de fuente citada: señala riesgos, no es asesoría. ' +
  'La decisión final es de quien la toma, con su asesor. Las cifras marcadas por verificar deben cotejarse con la fuente oficial.'

/** El texto de la traza cuando no hay regla. Es el de Hermes, para comparar caso por caso. */
export const RAZON_SIN_REGLA = 'sin regla aplicable'

// --- Clasificación ------------------------------------------------------------------------------

/** Minúsculas y sin acentos: así se casan las keywords, igual que en Hermes. */
export const normaliza = (texto: string): string => texto.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')

const patrones = new Map<string, RegExp>()
/** Frontera de palabra: «interes» no casa en «interesante». */
function casa(texto: string, keywordNormalizada: string): boolean {
  let re = patrones.get(keywordNormalizada)
  if (!re) {
    const escapada = keywordNormalizada.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    re = new RegExp(`(?<![a-z0-9])${escapada}(?![a-z0-9])`)
    patrones.set(keywordNormalizada, re)
  }
  return re.test(texto)
}

/**
 * La categoría por la keyword más larga que casa. Una categoría cuya exclusión casa queda
 * descartada aunque también casen sus keywords (RF-7, el incidente de «drones»). Empate: la
 * categoría de clave menor.
 */
export function clasifica(descripcion: string, categorias: readonly Categoria[]): string | null {
  const texto = normaliza(descripcion)
  let mejor: { largo: number; clave: string } | null = null
  for (const cat of [...categorias].sort((a, b) => a.clave.localeCompare(b.clave))) {
    if (cat.exclusiones.some((x) => casa(texto, normaliza(x)))) continue
    for (const kw of cat.keywords) {
      const k = normaliza(kw)
      if (casa(texto, k) && (mejor === null || k.length > mejor.largo)) mejor = { largo: k.length, clave: cat.clave }
    }
  }
  return mejor?.clave ?? null
}

// --- Reglas vivas -------------------------------------------------------------------------------

interface Par {
  regla: Regla
  impacto: Impacto
}

const vigente = (r: Regla, fecha: string) => r.vigente_desde <= fecha && (r.vigente_hasta === null || fecha <= r.vigente_hasta)

/** Impactos de reglas vigentes a la fecha del hecho (RF-13), del régimen pedido o `GENERAL`. */
function impactosVivos(reglas: readonly Regla[], fecha: string, regimen: string): Par[] {
  return reglas
    .filter((r) => vigente(r, fecha))
    .flatMap((regla) => regla.impactos.map((impacto) => ({ regla, impacto })))
    .filter(({ impacto }) => impacto.regimen === regimen || impacto.regimen === 'GENERAL')
}

const fuente = (r: Regla): Fuente => ({
  clave: r.clave,
  cita: r.fuente_cita,
  url: r.fuente_url,
  vigencia: { desde: r.vigente_desde, hasta: r.vigente_hasta },
})

function unicos<T>(xs: readonly T[]): T[] {
  const vistos = new Set<string>()
  return xs.filter((x) => {
    const k = JSON.stringify(x)
    return vistos.has(k) ? false : (vistos.add(k), true)
  })
}

const importe = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// --- Un concepto --------------------------------------------------------------------------------

interface Ambito {
  reglas: Regla[]
  categorias: Categoria[]
  dominioDe: Map<string, string>
  fecha: string
  regimen: string
}

function evaluaConcepto(concepto: Pregunta['conceptos'][number], a: Ambito): ConceptoEvaluado {
  const categoria = clasifica(concepto.descripcion, a.categorias)
  const vivos = impactosVivos(a.reglas, a.fecha, a.regimen)
  const generales = vivos.filter((p) => p.impacto.categoria === null)
  const especificos = categoria === null ? [] : vivos.filter((p) => p.impacto.categoria === categoria)
  const banderas = especificos.flatMap((p) => p.impacto.banderas)
  const base = {
    descripcion: concepto.descripcion,
    categoria,
    dominio: categoria === null ? null : (a.dominioDe.get(categoria) ?? null),
    fuentes: unicos([...generales, ...especificos].map((p) => fuente(p.regla))),
    checklist: unicos([...generales, ...especificos].flatMap((p) => p.impacto.requisitos)),
  }
  const conVeredicto = especificos.filter((p) => p.impacto.veredicto_base !== null)
  if (conVeredicto.length === 0) {
    return { ...base, motivo: 'sin_regla', veredicto: null, razon: RAZON_SIN_REGLA, fuente: null, banderas: unicos(banderas) }
  }
  // Rectora: la más reciente; a igual fecha, la de clave menor (explícito, no el orden de llegada).
  const [rector] = [...conVeredicto].sort(
    (x, y) => y.regla.vigente_desde.localeCompare(x.regla.vigente_desde) || x.regla.clave.localeCompare(y.regla.clave),
  )
  const { regla, impacto } = rector!
  const veredictos = new Set(conVeredicto.map((p) => p.impacto.veredicto_base))
  if (veredictos.size > 1) {
    const pares = conVeredicto.map((p) => `${p.regla.clave}=${p.impacto.veredicto_base}`).sort()
    return {
      ...base,
      motivo: 'conflicto',
      veredicto: null,
      razon: `contradiccion entre reglas vigentes; rectora: ${regla.fuente_cita}`,
      fuente: fuente(regla),
      banderas: unicos([...banderas, `Reglas vigentes en conflicto: ${pares.join(', ')} — requiere revision`]),
    }
  }
  const tope = impacto.tope_monto
  if (tope != null && concepto.importe !== undefined && concepto.importe > tope) {
    return {
      ...base,
      motivo: 'tope_excedido',
      veredicto: null,
      razon: `excede tope de ${regla.fuente_cita}`,
      fuente: fuente(regla),
      banderas: unicos([...banderas, `Importe ${importe(concepto.importe)} excede el tope de ${importe(tope)} (${regla.fuente_cita})`]),
    }
  }
  return {
    ...base,
    motivo: 'regla',
    veredicto: impacto.veredicto_base,
    razon: `${regla.titulo} (${regla.fuente_cita})`,
    fuente: fuente(regla),
    banderas: unicos(banderas),
  }
}

// --- La pregunta ------------------------------------------------------------------------------

/** Categoría → dominio que la trae. Si dos dominios del ámbito la comparten, el primero. */
function dominioPorCategoria(dominios: Conocimiento['dominios']): Map<string, string> {
  const m = new Map<string, string>()
  for (const d of dominios) for (const k of d.categorias) if (!m.has(k)) m.set(k, d.clave)
  return m
}

export interface OpcionesMotor {
  /** Fecha de la consulta (ISO). Solo se usa si el hecho no trae fecha; por defecto, hoy en UTC. */
  hoy?: string
}

/**
 * Evalúa una pregunta contra un conocimiento YA validado (`validaConocimiento`). Lanza si la
 * pregunta no tiene forma. El resultado se valida contra el contrato antes de devolverse: un
 * resultado sin forma no se entrega.
 */
export function evalua(conocimiento: Conocimiento, entrada: Pregunta, opciones: OpcionesMotor = {}): Resultado {
  const { contexto, conceptos } = Pregunta.parse(entrada)
  const fecha = contexto.fecha ?? opciones.hoy ?? new Date().toISOString().slice(0, 10)
  const reglas = conocimiento.reglas.filter((r) => r.jurisdiccion === contexto.jurisdiccion && r.dimension === contexto.dimension)
  const usadas = new Set(reglas.flatMap((r) => r.impactos.map((i) => i.categoria)))
  const dominios = conocimiento.dominios.filter((d) => d.jurisdiccion === contexto.jurisdiccion && d.dimension === contexto.dimension)
  const ambito: Ambito = {
    reglas,
    // Solo categorías que alguna regla del ámbito usa: una cláusula no clasifica en una consulta fiscal.
    categorias: conocimiento.categorias.filter((c) => usadas.has(c.clave)),
    dominioDe: dominioPorCategoria(dominios),
    fecha,
    regimen: contexto.regimen,
  }
  const evaluados = conceptos.map((c) => evaluaConcepto(c, ambito))
  const veredictos = new Set(evaluados.map((c) => c.veredicto))
  const [unico] = veredictos
  return Resultado.parse({
    contexto: { ...contexto, fecha, fecha_supuesta: contexto.fecha === undefined },
    conceptos: evaluados,
    veredicto_global: veredictos.size === 1 && unico !== undefined ? unico : null,
    corte: dominios.map((d) => d.corte).sort()[0] ?? null,
    disclaimer: DISCLAIMER,
  })
}

/**
 * La puerta que usa un servicio: valida el conocimiento y la pregunta, y si algo no tiene forma
 * devuelve un `FalloSinVeredicto`, que no admite nada con forma de respuesta. Un conocimiento con
 * cualquier problema de validación NO se usa: mejor no responder que responder con reglas rotas.
 */
export function evaluaSeguro(conocimiento: unknown, pregunta: unknown, opciones: OpcionesMotor = {}): Resultado | FalloSinVeredicto {
  const v = validaConocimiento(conocimiento)
  if (!v.ok || v.conocimiento === null) {
    const primeros = v.problemas.slice(0, 3).map((p) => `${p.tipo}:${p.clave}`).join(', ')
    return { tipo: 'conocimiento_no_disponible', detalle: `el conocimiento no valida (${v.problemas.length}): ${primeros}` }
  }
  const p = Pregunta.safeParse(pregunta)
  if (!p.success) {
    return { tipo: 'pregunta_invalida', detalle: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
  }
  return evalua(v.conocimiento, p.data, opciones)
}
