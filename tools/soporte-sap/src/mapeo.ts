/**
 * El mapeo de cada consultora a un esquema CONTEXTUAL canónico: la incidencia con su contexto SAP
 * (sistema, release, módulo, transacción). El FDE lo PROPONE desde las columnas y unas filas de
 * muestra; el HIL lo APRUEBA a su nombre; solo un mapeo aprobado se aplica. Lo que no mapea queda
 * en revisión con su motivo: nada se tira en silencio. La procedencia de cada campo dice de qué
 * columna salió y con qué regla.
 *
 * La similitud de textos se INYECTA (en el producto, la del extractor documental): sin umbral
 * medido, una coincidencia por similitud se propone pero no se aplica sola.
 */
import type { Prioridad } from './categoriza.js'

export type CampoCanonico =
  | 'idOrigen' | 'cliente' | 'titulo' | 'descripcion' | 'prioridad' | 'estado' | 'creada' | 'resuelta'
  | 'modulo' | 'sistema' | 'asignado' | 'transaccion'

export const OBLIGATORIOS: readonly CampoCanonico[] = ['idOrigen', 'cliente', 'titulo', 'creada']

/** Sinónimos por campo: de aquí sale la propuesta de columnas. */
export const SINONIMOS: Readonly<Record<CampoCanonico, readonly string[]>> = {
  idOrigen: ['number', 'numero', 'key', 'id', 'ticket', 'folio'],
  cliente: ['company', 'cliente', 'customer', 'empresa', 'fields.customfield_cliente'],
  titulo: ['short_description', 'summary', 'titulo', 'asunto', 'fields.summary'],
  descripcion: ['description', 'descripcion', 'detalle', 'fields.description'],
  prioridad: ['priority', 'prioridad', 'fields.priority.name'],
  estado: ['state', 'estado', 'status', 'fields.status.name'],
  creada: ['sys_created_on', 'created', 'creada', 'fecha_alta', 'fields.created'],
  resuelta: ['resolved_at', 'resolutiondate', 'resuelta', 'fields.resolutiondate'],
  modulo: ['u_sap_module', 'modulo', 'fields.components', 'fields.labels'],
  sistema: ['u_sap_system', 'sistema', 'fields.customfield_sistema'],
  asignado: ['assigned_to', 'asignado', 'fields.assignee.displayname'],
  transaccion: ['u_transaction', 'transaccion', 'tcode', 'fields.customfield_tcode'],
}

/** Vocabularios de valores conocidos. Lo que no está aquí se propone por similitud o va a revisión. */
export const VALORES: Readonly<Record<'prioridad' | 'modulo' | 'sistema', Readonly<Record<string, string>>>> = {
  prioridad: {
    '1 - critical': 'P1', '2 - high': 'P2', '3 - moderate': 'P3', '4 - low': 'P4', '5 - planning': 'P4',
    highest: 'P1', high: 'P2', medium: 'P3', low: 'P4', lowest: 'P4', p1: 'P1', p2: 'P2', p3: 'P3', p4: 'P4',
  },
  modulo: {
    finanzas: 'FI', contabilidad: 'FI', 'fi-gl': 'FI', 'sap-fi': 'FI', fi: 'FI', materiales: 'MM', compras: 'MM', 'sap-mm': 'MM', mm: 'MM',
    ventas: 'SD', facturacion: 'SD', 'sap-sd': 'SD', sd: 'SD', nomina: 'HCM', 'recursos humanos': 'HCM', 'sap-hcm': 'HCM', hcm: 'HCM',
    basis: 'BASIS', 'sap-basis': 'BASIS', 'sap-abap': 'ABAP', 'facturacion electronica': 'FI-LOC', cfdi: 'FI-LOC', 'sap-fi-loc': 'FI-LOC', abap: 'ABAP', desarrollo: 'ABAP',
  },
  sistema: { 's4h 2023': 'S4HANA', 's/4hana': 'S4HANA', s4hana: 'S4HANA', 'ecc6': 'ECC', 'ecc 6.0': 'ECC', ecc: 'ECC' },
}

export interface Mapeo {
  readonly consultora: string
  readonly herramienta: string
  readonly version: number
  readonly columnas: Readonly<Partial<Record<CampoCanonico, string>>>
  readonly sinMapear: readonly string[]
  /** Valores fuera de vocabulario propuestos por similitud: el HIL los acepta o no. */
  readonly propuestosPorSimilitud: Readonly<Record<string, string>>
  /** Zona de las fechas sin zona del exporte (desfase en minutos respecto de UTC). */
  readonly desfaseFechasMin: number
  readonly estado: 'propuesto' | 'aprobado'
  readonly aprobadoPor: string | null
}

export type Similitud = (a: string, b: string) => number

const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '').trim()

/** El FDE propone: columnas por sinónimo exacto (sin adivinar) y valores dudosos por similitud. */
export function proponeMapeo(p: {
  consultora: string; herramienta: string; version: number; columnas: readonly string[]
  muestras: ReadonlyArray<Readonly<Record<string, string>>>; desfaseFechasMin: number; similitud: Similitud
}): Mapeo {
  const columnas: Partial<Record<CampoCanonico, string>> = {}
  for (const [campo, sinonimos] of Object.entries(SINONIMOS) as Array<[CampoCanonico, readonly string[]]>) {
    const col = p.columnas.find((c) => sinonimos.includes(norm(c)))
    if (col) columnas[campo] = col
  }
  const usadas = new Set(Object.values(columnas))
  const propuestos: Record<string, string> = {}
  for (const campo of ['prioridad', 'modulo', 'sistema'] as const) {
    const col = columnas[campo]
    if (!col) continue
    for (const fila of p.muestras) {
      const v = norm(fila[col] ?? '')
      if (!v || VALORES[campo][v]) continue
      const [mejor, s] = Object.keys(VALORES[campo]).map((k) => [k, p.similitud(v, k)] as const).sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
      if (mejor && s > 0) propuestos[`${campo}:${v}`] = VALORES[campo][mejor]!
    }
  }
  return {
    consultora: p.consultora, herramienta: p.herramienta, version: p.version, columnas,
    sinMapear: p.columnas.filter((c) => !usadas.has(c)), propuestosPorSimilitud: propuestos,
    desfaseFechasMin: p.desfaseFechasMin, estado: 'propuesto', aprobadoPor: null,
  }
}

/**
 * El HIL decide. Acepta (o no) los valores propuestos por similitud: los no aceptados se quedan
 * fuera y sus filas van a revisión. Solo un humano aprueba, a su nombre.
 */
export function apruebaMapeo(m: Mapeo, quien: { tipo: 'humano' | 'agente'; id: string }, aceptaSimilitud: readonly string[]): Mapeo {
  if (quien.tipo !== 'humano') throw new Error('un mapeo lo aprueba una persona, no el FDE')
  if (m.estado !== 'propuesto') throw new Error('el mapeo ya está decidido')
  const propuestos = Object.fromEntries(Object.entries(m.propuestosPorSimilitud).filter(([k]) => aceptaSimilitud.includes(k)))
  return { ...m, propuestosPorSimilitud: propuestos, estado: 'aprobado', aprobadoPor: quien.id }
}

export interface Procedencia {
  readonly campo: CampoCanonico
  readonly columna: string
  readonly original: string
  readonly valor: string | null
  readonly regla: string
}

export interface IncidenciaCanonica {
  readonly idOrigen: string
  readonly herramienta: string
  readonly versionMapeo: number
  readonly consultora: string
  readonly cliente: string
  readonly titulo: string
  readonly descripcion: string
  readonly prioridad: Prioridad | null
  readonly estado: string | null
  readonly creada: string
  readonly resuelta: string | null
  readonly modulo: string | null
  readonly sistema: string | null
  readonly asignado: string | null
  readonly transaccion: string | null
}

export type Fila = Readonly<Record<string, string>>

export interface ResultadoMapeo {
  readonly mapeadas: ReadonlyArray<{ readonly indice: number; readonly incidencia: IncidenciaCanonica; readonly procedencia: readonly Procedencia[] }>
  readonly revision: ReadonlyArray<{ readonly indice: number; readonly fila: Fila; readonly motivos: readonly string[] }>
  readonly cuenta: { readonly entrada: number; readonly mapeadas: number; readonly revision: number; readonly cuadra: boolean }
}

/** Fecha del exporte → ISO UTC. Con zona propia se respeta; sin zona, la del mapeo. Lo ilegible, null. */
export function fechaUtc(original: string, desfaseMin: number): string | null {
  const s = original.trim()
  if (!s) return null
  const conZona = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s)
  const iso = s.includes('T') ? s : s.replace(' ', 'T')
  const t = Date.parse(conZona ? iso.replace(/([+-]\d{2})(\d{2})$/, '$1:$2') : `${iso}Z`)
  if (Number.isNaN(t)) return null
  return new Date(conZona ? t : t - desfaseMin * 60_000).toISOString()
}

/** El asignado de un exporte es una persona: en el esquema canónico entra como seudónimo estable. */
export const seudonimoDe = (consultora: string, nombre: string, sha256: (s: string) => string): string =>
  `usr-${sha256(`${consultora}|${norm(nombre)}`).slice(0, 12)}`

type Lectura = { valor: string | null; regla: string; motivo?: string }

function leeValor(m: Mapeo, campo: CampoCanonico, original: string, sha256: (s: string) => string): Lectura {
  const v = norm(original)
  if (campo === 'creada' || campo === 'resuelta') {
    const f = fechaUtc(original, m.desfaseFechasMin)
    return f ? { valor: f, regla: 'fecha a UTC' } : { valor: null, regla: 'fecha a UTC', ...(v ? { motivo: `fecha ilegible «${original}»` } : {}) }
  }
  if (campo === 'prioridad' || campo === 'modulo' || campo === 'sistema') {
    if (!v) return { valor: null, regla: 'vacío' }
    const conocido = VALORES[campo][v]
    if (conocido) return { valor: conocido, regla: `vocabulario de ${campo}` }
    const aceptado = m.propuestosPorSimilitud[`${campo}:${v}`]
    if (aceptado) return { valor: aceptado, regla: `similitud aceptada por ${m.aprobadoPor}` }
    return { valor: null, regla: `vocabulario de ${campo}`, motivo: `${campo} fuera de vocabulario: «${original}»` }
  }
  if (campo === 'asignado') return v ? { valor: seudonimoDe(m.consultora, original, sha256), regla: 'seudónimo' } : { valor: null, regla: 'vacío' }
  if (campo === 'transaccion') return { valor: v ? original.trim().toUpperCase() : null, regla: 'transacción en mayúsculas' }
  return { valor: original.trim() || null, regla: 'copia' }
}

function canonicaDe(m: Mapeo, valores: Partial<Record<CampoCanonico, string | null>>): IncidenciaCanonica {
  return {
    idOrigen: valores.idOrigen!, herramienta: m.herramienta, versionMapeo: m.version, consultora: m.consultora,
    cliente: valores.cliente!, titulo: valores.titulo!, descripcion: valores.descripcion ?? '',
    prioridad: (valores.prioridad as Prioridad | null | undefined) ?? null, estado: valores.estado ?? null,
    creada: valores.creada!, resuelta: valores.resuelta ?? null, modulo: valores.modulo ?? null,
    sistema: valores.sistema ?? null, asignado: valores.asignado ?? null, transaccion: valores.transaccion ?? null,
  }
}

/** Aplica un mapeo APROBADO. Toda fila sale mapeada o en revisión, y la cuenta cierra. */
export function aplicaMapeo(m: Mapeo, filas: readonly Fila[], sha256: (s: string) => string): ResultadoMapeo {
  if (m.estado !== 'aprobado' || !m.aprobadoPor) throw new Error('el mapeo no está aprobado: no se aplica')
  return mapeaFilas(m, filas, sha256)
}

/**
 * Vista previa de una PROPUESTA: cuántas filas saldrían mapeadas y por qué irían a revisión. No
 * devuelve registros canónicos, así que no sirve para cargar nada: para eso, el mapeo aprobado.
 */
export function cuentaPrevia(m: Mapeo, filas: readonly Fila[], sha256: (s: string) => string): ResultadoMapeo['cuenta'] & { motivos: readonly string[] } {
  const r = mapeaFilas(m, filas, sha256)
  return { ...r.cuenta, motivos: [...new Set(r.revision.flatMap((x) => x.motivos))] }
}

function mapeaFilas(m: Mapeo, filas: readonly Fila[], sha256: (s: string) => string): ResultadoMapeo {
  const mapeadas: Array<ResultadoMapeo['mapeadas'][number]> = []
  const revision: Array<ResultadoMapeo['revision'][number]> = []
  filas.forEach((fila, indice) => {
    const valores: Partial<Record<CampoCanonico, string | null>> = {}
    const procedencia: Procedencia[] = []
    const motivos: string[] = []
    for (const [campo, columna] of Object.entries(m.columnas) as Array<[CampoCanonico, string]>) {
      const original = fila[columna] ?? ''
      const l = leeValor(m, campo, original, sha256)
      valores[campo] = l.valor
      if (l.motivo) motivos.push(l.motivo)
      procedencia.push({ campo, columna, original, valor: l.valor, regla: l.regla })
    }
    for (const o of OBLIGATORIOS) if (!valores[o]) motivos.push(`falta ${o}`)
    if (motivos.length) revision.push({ indice, fila, motivos: [...new Set(motivos)] })
    else mapeadas.push({ indice, procedencia, incidencia: canonicaDe(m, valores) })
  })
  return { mapeadas, revision, cuenta: { entrada: filas.length, mapeadas: mapeadas.length, revision: revision.length, cuadra: mapeadas.length + revision.length === filas.length } }
}
