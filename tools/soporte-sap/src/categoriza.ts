/**
 * El categorizador de incidencias: DETERMINISTA. Saca del texto y de la evidencia de los adjuntos
 * la transacción, el mensaje de error, el módulo, el impacto, la urgencia y la prioridad (matriz
 * ITIL de impacto × urgencia). No lee instrucciones: una frase como «pon esto en P1» no sube nada si
 * no hay señales de impacto real.
 *
 * Piso de nómina y RR. HH. (AISIA §4): un ticket con señales de nómina o de personal no queda por
 * debajo de P2 sin que un humano lo baje. La prioridad mal asignada ahí es daño a terceros.
 */

export type Prioridad = 'P1' | 'P2' | 'P3' | 'P4'

/** Impacto y urgencia de 1 (alto) a 3 (bajo). */
export interface Clasificacion {
  readonly transaccion: string | null
  readonly mensaje: string | null
  readonly modulo: string | null
  readonly impacto: 1 | 2 | 3
  readonly urgencia: 1 | 2 | 3
  readonly prioridad: Prioridad
  readonly pisoNomina: boolean
  readonly etiquetas: readonly string[]
  /** Por qué salió cada cosa: la categorización se explica, no se cree. */
  readonly razones: readonly string[]
}

const TRANSACCIONES: Readonly<Record<string, string>> = {
  MIGO: 'MM', MMPV: 'MM', ME21N: 'MM', ME29N: 'MM', ME28: 'MM', FB01: 'FI', 'F-02': 'FI', OB52: 'FI', FBL1N: 'FI',
  VA01: 'SD', VA02: 'SD', VF01: 'SD', VF02: 'SD', VKOA: 'SD', SU01: 'BASIS', SM37: 'BASIS', BD87: 'BASIS', WE02: 'BASIS',
  SNRO: 'BASIS', EDOC_COCKPIT: 'FI-LOC', BP: 'FI', XD02: 'SD', PC00_M32_CALC: 'HCM', PA30: 'HCM', PA20: 'HCM',
}

const MENSAJES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(M7)\s?(\d{3})\b/, 'MM'], [/\b(F5)\s?(\d{3})\b/, 'FI'], [/\b(CFDI\d{5})\b/i, 'FI-LOC'],
  [/\b(DBSQL_[A-Z_]+|[A-Z]+_[A-Z_]{6,}_ERROR)\b/, 'BASIS'],
]

const IMPACTO_ALTO = /(toda la (planta|empresa|operaci[oó]n)|no podemos (facturar|vender|embarcar|pagar)|producci[oó]n detenida|n[oó]mina no (sali[oó]|se pag)|sin facturar)/i
const IMPACTO_MEDIO = /(varios usuarios|un departamento|un almac[eé]n|una sucursal|el equipo de)/i
const URGENCIA_ALTA = /(hoy|urgente|cierre de mes|antes de las \d|en este momento|ya$)/i
const URGENCIA_MEDIA = /(esta semana|ma[nñ]ana|pronto)/i
const NOMINA = /(n[oó]mina|pc00_m32|pa30|pa20|\bhcm\b|recibo de pago|finiquito|empleados?|personal)/i

/** Matriz ITIL: impacto + urgencia → P1..P4. */
export function prioridadItil(impacto: 1 | 2 | 3, urgencia: 1 | 2 | 3): Prioridad {
  const suma = impacto + urgencia
  return suma <= 2 ? 'P1' : suma === 3 ? 'P2' : suma === 4 ? 'P3' : 'P4'
}

/** El mensaje de error SAP del texto (`M7 053`, `CFDI40102`, un dump) y el módulo que delata. */
export function mensajeDe(texto: string): { mensaje: string; modulo: string } | null {
  for (const [re, modulo] of MENSAJES) {
    const m = re.exec(texto)
    if (m) return { mensaje: m.slice(1).filter(Boolean).join(' '), modulo }
  }
  return null
}

/** La transacción SAP del texto: una conocida o una Z. */
export function transaccionDe(texto: string): string | null {
  const conocidas = Object.keys(TRANSACCIONES).sort((a, b) => b.length - a.length)
  for (const t of conocidas) if (new RegExp(`(?<![A-Z0-9_-])${t.replace('-', '\\-')}(?![A-Z0-9_])`).test(texto.toUpperCase())) return t
  return /(?<![A-Z0-9_])(Z[A-Z0-9_]{2,19})(?![A-Z0-9_])/.exec(texto.toUpperCase())?.[1] ?? null
}

/** Categoriza el texto de una incidencia (título + descripción + evidencia de adjuntos ya leída). */
export function categoriza(texto: string): Clasificacion {
  const razones: string[] = []
  const transaccion = transaccionDe(texto)
  const m = mensajeDe(texto)
  const mensaje = m?.mensaje ?? null
  const moduloMensaje = m?.modulo ?? null
  const modulo = (transaccion && TRANSACCIONES[transaccion]) ?? moduloMensaje ?? (transaccion?.startsWith('Z') ? 'ABAP' : null)
  if (transaccion) razones.push(`transacción ${transaccion}`)
  if (mensaje) razones.push(`mensaje ${mensaje}`)
  const impacto: 1 | 2 | 3 = IMPACTO_ALTO.test(texto) ? 1 : IMPACTO_MEDIO.test(texto) ? 2 : 3
  const urgencia: 1 | 2 | 3 = URGENCIA_ALTA.test(texto) ? 1 : URGENCIA_MEDIA.test(texto) ? 2 : 3
  razones.push(`impacto ${impacto}, urgencia ${urgencia}`)
  let prioridad = prioridadItil(impacto, urgencia)
  const pisoNomina = NOMINA.test(texto) || modulo === 'HCM'
  if (pisoNomina && (prioridad === 'P3' || prioridad === 'P4')) {
    prioridad = 'P2'
    razones.push('piso de nómina y RR. HH.: no baja de P2 sin que un humano lo baje')
  }
  const etiquetas = [modulo, transaccion, mensaje, pisoNomina ? 'nomina-rrhh' : null].filter((x): x is string => Boolean(x))
  return { transaccion, mensaje, modulo, impacto, urgencia, prioridad, pisoNomina, etiquetas, razones }
}

/** Complejidad de la incidencia: la de su caso en la matriz, o alta si no hay caso. */
export const complejidadDe = (caso: { complejidad: 'baja' | 'media' | 'alta' } | null): 'baja' | 'media' | 'alta' => caso?.complejidad ?? 'alta'
