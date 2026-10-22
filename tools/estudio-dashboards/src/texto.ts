/**
 * Narración restringida (como `tools/crecimiento-demostrado`): todo número que aparece en un texto del Estudio sale
 * de una consulta de ESA vuelta. El texto se escribe con plantillas desde los resultados, y aun así se comprueba:
 * cada número del texto tiene que coincidir, a la precisión con que se escribió, con alguna cifra de la evidencia
 * o con un número que el propio usuario dijo (un año, un umbral). Lo que no cuadra se rechaza, no se redondea.
 */

export interface Evidencia {
  readonly etiqueta: string
  readonly valor: number
  readonly unidad: string
  /** De qué consulta salió (métrica, filtros, periodo), o «derivado: …» si es la variación de dos cifras de la capa. */
  readonly consulta: string
}

const miles = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** Formato del Estudio: millones con «M», porcentajes a un decimal, pesos sin decimales, razones a 2. */
export function formatea(valor: number | null, unidad: string): string {
  if (valor === null || !Number.isFinite(valor)) return '—'
  if (unidad === '%') return `${valor.toFixed(1)} %`
  if (unidad === 'pp') return `${valor > 0 ? '+' : ''}${valor.toFixed(1)} pp`
  if (unidad === 'proporción') return `${(valor * 100).toFixed(1)} %`
  if (unidad === 'x') return `${valor.toFixed(2)}×`
  if (unidad === 'MXN') return Math.abs(valor) >= 1e6 ? `${(valor / 1e6).toFixed(1)} M MXN` : `${miles.format(valor)} MXN`
  if (Math.abs(valor) >= 1e6) return `${(valor / 1e6).toFixed(1)} M`
  if (Number.isInteger(valor) || Math.abs(valor) >= 100) return miles.format(valor)
  return valor.toFixed(Math.abs(valor) < 10 ? 2 : 1)
}

export const formateaVariacion = (v: number | null, tipo: '%' | 'pp' | null): string =>
  v === null || tipo === null ? '—' : tipo === 'pp' ? formatea(v, 'pp') : `${v > 0 ? '+' : ''}${v.toFixed(1)} %`

export interface NumeroEnTexto { readonly texto: string; readonly valor: number; readonly decimales: number; readonly escala: number }

/** Los números de un texto: «74.5 M», «−0.9», «+22.7 %», «1,027», «15.6×». */
export function numerosDe(texto: string): NumeroEnTexto[] {
  const salida: NumeroEnTexto[] = []
  const re = /([−\-+]?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(\s?M\b)?/g
  for (const m of texto.matchAll(re)) {
    const signo = m[1] === '−' || m[1] === '-' ? -1 : 1
    const entero = (m[2] ?? '0').replace(/,/g, '')
    const decimales = (m[3] ?? '').length
    const escala = m[4] ? 1e6 : 1
    salida.push({ texto: m[0], valor: signo * Number(`${entero}.${m[3] ?? '0'}`), decimales, escala })
  }
  return salida
}

/**
 * ¿Este número escrito corresponde a esta cifra? Al redondear la cifra a la precisión escrita (y a la escala «M»),
 * dan lo mismo. Se compara la magnitud: «cae 7.8 pp» respalda −7.8. Una proporción (0.0247) respalda «2.5 %».
 */
function corresponde(n: NumeroEnTexto, cifra: number): boolean {
  const f = 10 ** n.decimales
  return [cifra, cifra * 100].some((c) => Math.round(Math.abs(c / n.escala) * f) === Math.round(Math.abs(n.valor) * f))
}

export interface Comprobacion { readonly ok: boolean; readonly sinRespaldo: readonly string[] }

/**
 * ¿Cada número del texto está respaldado? `permitidos` son números que el usuario puso en su instrucción o que
 * nombran el periodo (años, umbrales): esos no son cifras del negocio.
 */
export function cifrasRespaldadas(texto: string, evidencia: readonly Evidencia[], permitidos: readonly number[] = []): Comprobacion {
  const sinRespaldo = numerosDe(texto)
    .filter((n) => !permitidos.some((p) => Math.abs(p - n.valor) < 1e-9 || Math.abs(p - Math.abs(n.valor)) < 1e-9))
    .filter((n) => !evidencia.some((e) => corresponde(n, e.valor)))
    .map((n) => n.texto.trim())
  return { ok: sinRespaldo.length === 0, sinRespaldo }
}
