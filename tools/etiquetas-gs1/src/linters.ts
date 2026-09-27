/**
 * Validacion del CONTENIDO de cada componente de un AI, con los nombres de linter del GS1
 * Barcode Syntax Dictionary. Los que no estan implementados NO se dan por buenos: se devuelve
 * `no-verificado` y la revision lo dice. Aceptar en silencio un linter desconocido es justo
 * el tipo de "valido" que luego rompe en el CEDIS de un cliente.
 */
import { digitoCorrecto, parDeControlCorrecto } from './digito.js'
import { esFecha, MENSAJE_FECHA, parseaFechaGs1 } from './fechas.js'

export type ResultadoLinter = { ok: true } | { ok: false; mensaje: string } | { noVerificado: true }

const OK: ResultadoLinter = { ok: true }
const mal = (mensaje: string): ResultadoLinter => ({ ok: false, mensaje })

/** GenSpecs §7.11, Tabla 7-20: el subconjunto de ISO/IEC 646 permitido en valores GS1. */
export const CSET82 = /^[!"%&'()*+,\-./0-9:;<=>?A-Z_a-z]*$/
export const CSET39 = /^[#\-/0-9A-Z]*$/
export const CSET64 = /^[-0-9A-Z_a-z]*={0,2}$/

export function caracteresFueraDeCset82(valor: string): string[] {
  return [...new Set([...valor].filter((c) => !CSET82.test(c)))]
}

function fechaComoLinter(valor: string, anio: number, diaCero: boolean): ResultadoLinter {
  const f = parseaFechaGs1(valor, anio, diaCero)
  return esFecha(f) ? OK : mal(MENSAJE_FECHA[f])
}

function fechaLarga(valor: string, diaCero: boolean): ResultadoLinter {
  if (!/^\d{8}$/.test(valor)) return mal('la fecha debe ser de ocho cifras AAAAMMDD')
  const anio = Number(valor.slice(0, 4))
  return fechaComoLinter(valor.slice(2), anio, diaCero)
}

function rangoNumerico(valor: string, min: number, max: number, que: string): ResultadoLinter {
  if (!/^\d+$/.test(valor)) return mal(`${que}: solo cifras`)
  const n = Number(valor)
  return n >= min && n <= max ? OK : mal(`${que} fuera de rango (${min}-${max})`)
}

const LINTERS: Readonly<Record<string, (valor: string, anio: number) => ResultadoLinter>> = {
  csum: (v) => (digitoCorrecto(v) ? OK : mal('el dígito verificador no cuadra')),
  csumalpha: (v) => (parDeControlCorrecto(v) ? OK : mal('el par de control alfanumérico no cuadra')),
  // GCP_MIN_LENGTH del motor de referencia: las 4 primeras posiciones del prefijo son cifras.
  gcppos1: (v) => (/^\d{4}/.test(v) ? OK : mal('no empieza por un prefijo de empresa GS1')),
  gcppos2: (v) => (/^.\d{4}/.test(v) ? OK : mal('no lleva prefijo de empresa GS1 tras el indicador')),
  yymmd0: (v, a) => fechaComoLinter(v, a, true),
  yymmdd: (v, a) => fechaComoLinter(v, a, false),
  yyyymmdd: (v) => fechaLarga(v, false),
  yyyymmd0: (v) => fechaLarga(v, true),
  hhmi: (v) => (/^\d{4}$/.test(v) && Number(v.slice(0, 2)) <= 23 && Number(v.slice(2)) <= 59 ? OK : mal('hora HHMM inválida')),
  hh: (v) => rangoNumerico(v, 0, 23, 'hora'),
  mi: (v) => rangoNumerico(v, 0, 59, 'minuto'),
  ss: (v) => rangoNumerico(v, 0, 59, 'segundo'),
  nonzero: (v) => (/^\d+$/.test(v) && Number(v) !== 0 ? OK : mal('no puede ser cero')),
  zero: (v) => (/^0+$/.test(v) ? OK : mal('debe ser cero')),
  yesno: (v) => (v === '0' || v === '1' ? OK : mal('debe ser 0 o 1')),
  winding: (v) => (['0', '1', '9'].includes(v) ? OK : mal('sentido de bobinado inválido (0, 1 o 9)')),
  hyphen: (v) => (v === '-' ? OK : mal('solo admite un guion')),
  nozeroprefix: (v) => (v === '0' || !v.startsWith('0') ? OK : mal('no puede empezar por cero')),
  hasnondigit: (v) => (/\D/.test(v) ? OK : mal('debe tener al menos un carácter que no sea cifra')),
  iso5218: (v) => (['0', '1', '2', '9'].includes(v) ? OK : mal('código de sexo ISO 5218 inválido')),
  latitude: (v) => rangoNumerico(v, 0, 1_800_000_000, 'latitud'),
  longitude: (v) => rangoNumerico(v, 0, 3_600_000_000, 'longitud'),
  pcenc: (v) => (/%(?![0-9A-Fa-f]{2})/.test(v) ? mal('secuencia de porcentaje mal formada') : OK),
  pieceoftotal: (v) => {
    if (!/^\d+$/.test(v) || v.length % 2 !== 0) return mal('pieza/total mal formado')
    const pieza = Number(v.slice(0, v.length / 2))
    const total = Number(v.slice(v.length / 2))
    if (pieza === 0 || total === 0) return mal('ni la pieza ni el total pueden ser cero')
    return pieza <= total ? OK : mal('la pieza no puede superar al total')
  },
}

/** Linters conocidos por el diccionario que este nucleo NO comprueba (listas ISO, IBAN, cupones). */
export function linterImplementado(nombre: string): boolean {
  return nombre in LINTERS
}

export function aplicaLinter(nombre: string, valor: string, anioActual: number): ResultadoLinter {
  const f = LINTERS[nombre]
  return f ? f(valor, anioActual) : { noVerificado: true }
}
