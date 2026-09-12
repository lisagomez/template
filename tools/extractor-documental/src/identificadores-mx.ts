/**
 * Validadores de identificadores mexicanos: RFC, CURP y NSS. Logica pura, sin red ni catalogos.
 *
 * POR QUE EXISTEN. Un motor de OCR devuelve una confianza que no calibra nadie (medido el
 * 2026-09-11 sobre expedientes reales: el preprocesado de imagen la mueve 0-3 puntos, y los modos
 * que la «suben» lo hacen leyendo la mitad). Un identificador con digito verificador da una
 * confianza EXTERNA al motor: o pasa el checksum o no, y eso no depende de como se escaneo.
 *
 * Lo que validan es la FORMA y el digito: que un RFC pase no dice que exista ni que sea de quien
 * dice el documento. Verificar contra el SAT o RENAPO es consultar a un tercero, y queda fuera.
 *
 * Y una regla que no se negocia: `corrigePorChecksum` solo cambia UNA posicion, y solo si
 * exactamente una variante pasa. Un checksum mod 10 u 11 detecta toda sustitucion simple; con dos
 * posiciones la tasa de «arreglar» hacia el identificador de OTRA persona no esta medida (C4).
 */

export type Validador = (valor: string) => boolean
export type MotivoDeInvalidez = 'forma' | 'fecha' | 'entidad' | 'digito'

export interface DiagnosticoDeIdentificador {
  readonly valido: boolean
  readonly motivo: MotivoDeInvalidez | null
}

const VALIDO: DiagnosticoDeIdentificador = { valido: true, motivo: null }
const invalido = (motivo: MotivoDeInvalidez): DiagnosticoDeIdentificador => ({ valido: false, motivo })

/**
 * RFC genericos del SAT (publico en general y extranjeros). El de XAXX no cuadra su digito; el de XEXX
 * si, por coincidencia aritmetica (medido). Por eso la opcion `admiteGenericos` mira la lista, no el digito.
 */
export const RFC_GENERICOS: ReadonlySet<string> = new Set(['XAXX010101000', 'XEXX010101000'])

/** Las 32 entidades federativas mas NE (nacido en el extranjero), como las codifica RENAPO. */
export const ENTIDADES_CURP: ReadonlySet<string> = new Set(
  'AS BC BS CC CL CM CS CH DF DG GT GR HG JC MC MN MS NT NL OC PL QT QR SP SL SR TC TS TL VZ YN ZS NE'.split(' '),
)

const normaliza = (valor: string): string => valor.trim().toUpperCase()

const DIAS_POR_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Fecha yymmdd sin siglo: el 29 de febrero se admite siempre, porque el siglo es ambiguo. */
function fechaSinSigloValida(yymmdd: string): boolean {
  const mes = Number(yymmdd.slice(2, 4))
  const dia = Number(yymmdd.slice(4, 6))
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= DIAS_POR_MES[mes - 1]
}

/** Fecha con siglo resuelto: febrero se valida exacto. */
function fechaConSigloValida(anio: number, mes: number, dia: number): boolean {
  if (mes < 1 || mes > 12 || dia < 1) return false
  const bisiesto = (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0
  const tope = mes === 2 ? (bisiesto ? 29 : 28) : DIAS_POR_MES[mes - 1]
  return dia <= tope
}

// --- RFC ---------------------------------------------------------------------------------------

const FORMA_RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/
/** Tabla del anexo del SAT: la posicion de cada caracter es su valor. El espacio (37) rellena a la persona moral. */
const TABLA_RFC = '0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ Ñ'

export interface OpcionesDeRfc {
  /** Admite `XAXX010101000` y `XEXX010101000`, cuyo digito no cuadra a proposito. */
  readonly admiteGenericos?: boolean
}

/**
 * Digito verificador de un RFC SIN su ultimo caracter (11 caracteres para persona moral, 12 para
 * fisica). `null` si lo que llega no tiene esa forma.
 */
export function digitoVerificadorRfc(sinDigito: string): string | null {
  const cuerpo = normaliza(sinDigito)
  if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{2}$/.test(cuerpo)) return null
  const relleno = cuerpo.padStart(12, ' ')
  let suma = 0
  for (let i = 0; i < 12; i++) {
    const valor = TABLA_RFC.indexOf(relleno[i])
    if (valor < 0) return null
    suma += valor * (13 - i)
  }
  const resto = suma % 11
  if (resto === 0) return '0'
  if (resto === 1) return 'A'
  return String(11 - resto)
}

export function diagnosticaRfc(valor: string, opciones: OpcionesDeRfc = {}): DiagnosticoDeIdentificador {
  const rfc = normaliza(valor)
  if (!FORMA_RFC.test(rfc)) return invalido('forma')
  const letras = rfc.length - 9
  if (!fechaSinSigloValida(rfc.slice(letras, letras + 6))) return invalido('fecha')
  if (opciones.admiteGenericos === true && RFC_GENERICOS.has(rfc)) return VALIDO
  return digitoVerificadorRfc(rfc.slice(0, -1)) === rfc.slice(-1) ? VALIDO : invalido('digito')
}

export const validaRfc = (valor: string, opciones: OpcionesDeRfc = {}): boolean => diagnosticaRfc(valor, opciones).valido

// --- CURP --------------------------------------------------------------------------------------

const FORMA_CURP = /^[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9]\d$/
/** Tabla de RENAPO: la Ñ ocupa la posicion 24, entre la N y la O. */
const TABLA_CURP = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'

/** Digito verificador de una CURP SIN su ultimo caracter (17 caracteres). `null` si no tiene esa forma. */
export function digitoVerificadorCurp(sinDigito: string): string | null {
  const cuerpo = normaliza(sinDigito)
  if (cuerpo.length !== 17) return null
  let suma = 0
  for (let i = 0; i < 17; i++) {
    const valor = TABLA_CURP.indexOf(cuerpo[i])
    if (valor < 0) return null
    suma += valor * (18 - i)
  }
  return String((10 - (suma % 10)) % 10)
}

export function diagnosticaCurp(valor: string): DiagnosticoDeIdentificador {
  const curp = normaliza(valor)
  if (!FORMA_CURP.test(curp)) return invalido('forma')
  // La posicion 17 (indice 16) resuelve el siglo: digito = nacido antes de 2000, letra = despues.
  const siglo = /\d/.test(curp[16]) ? 1900 : 2000
  const anio = siglo + Number(curp.slice(4, 6))
  if (!fechaConSigloValida(anio, Number(curp.slice(6, 8)), Number(curp.slice(8, 10)))) return invalido('fecha')
  if (!ENTIDADES_CURP.has(curp.slice(11, 13))) return invalido('entidad')
  return digitoVerificadorCurp(curp.slice(0, 17)) === curp[17] ? VALIDO : invalido('digito')
}

export const validaCurp = (valor: string): boolean => diagnosticaCurp(valor).valido

// --- NSS ---------------------------------------------------------------------------------------

/** Luhn sobre una cadena de digitos, con el digito de control INCLUIDO al final. */
export function validaLuhn(digitos: string): boolean {
  if (!/^\d+$/.test(digitos)) return false
  let suma = 0
  let doble = false
  for (let i = digitos.length - 1; i >= 0; i--) {
    let d = Number(digitos[i])
    if (doble) {
      d *= 2
      if (d > 9) d -= 9
    }
    suma += d
    doble = !doble
  }
  return suma % 10 === 0
}

/**
 * NSS del IMSS: 11 digitos, el ultimo de control por Luhn. Se admiten los separadores que el
 * propio IMSS imprime (`12-34-56-7890-1`). Subdelegacion y anio NO se validan: seria un catalogo
 * que envejece, y este modulo no tiene ninguno a proposito.
 */
export function diagnosticaNss(valor: string): DiagnosticoDeIdentificador {
  const digitos = valor.replace(/[\s-]/g, '')
  if (!/^\d{11}$/.test(digitos)) return invalido('forma')
  return validaLuhn(digitos) ? VALIDO : invalido('digito')
}

export const validaNss = (valor: string): boolean => diagnosticaNss(valor).valido

// --- Correccion restringida por checksum ---------------------------------------------------------

const PARES_CONFUNDIBLES: readonly (readonly [string, string])[] = [
  ['0', 'O'], ['1', 'I'], ['1', 'L'], ['I', 'L'], ['5', 'S'], ['8', 'B'], ['2', 'Z'], ['6', 'G'],
  // Las tres que faltaban salieron de constancias reales de CURP (2026-09-11): una letra donde va
  // el primer digito del anio. Siguen siendo pares de una posicion, sometidos al checksum.
  ['3', 'E'], ['4', 'A'], ['7', 'T'],
]

function tablaSimetrica(pares: readonly (readonly [string, string])[]): Readonly<Record<string, readonly string[]>> {
  const tabla: Record<string, string[]> = {}
  for (const [a, b] of pares) {
    ;(tabla[a] ??= []).push(b)
    ;(tabla[b] ??= []).push(a)
  }
  return tabla
}

/** Las confusiones tipicas de un OCR sobre texto impreso. Simetrica: si 0 se lee O, O se lee 0. */
export const CONFUSIONES_OCR: Readonly<Record<string, readonly string[]>> = tablaSimetrica(PARES_CONFUNDIBLES)

export type Correccion =
  | {
      readonly corregido: false
      readonly valor: string
      readonly motivo: 'ya_valido' | 'sin_variante_valida' | 'ambiguo'
      /** Cuantas variantes distintas pasaron el validador. Con `ambiguo` son dos o mas. */
      readonly variantesValidas: number
    }
  | { readonly corregido: true; readonly valor: string; readonly original: string; readonly posicion: number }

/**
 * Intenta corregir UNA confusion de OCR para que `valida` pase.
 *
 * Nunca toca un valor que ya pasa. Prueba, posicion a posicion, cada sustitucion de la tabla, y
 * acepta solo si exactamente UNA variante distinta pasa: con cero no hay arreglo, con dos o mas
 * la decision es de una persona. Determinista y sin ningun numero que ajustar.
 */
export function corrigePorChecksum(
  valor: string,
  valida: Validador,
  confusiones: Readonly<Record<string, readonly string[]>> = CONFUSIONES_OCR,
): Correccion {
  const original = normaliza(valor)
  if (valida(original)) return { corregido: false, valor: original, motivo: 'ya_valido', variantesValidas: 0 }
  const validas = new Map<string, number>()
  for (let i = 0; i < original.length; i++) {
    for (const alternativa of confusiones[original[i]] ?? []) {
      const variante = original.slice(0, i) + alternativa + original.slice(i + 1)
      if (variante !== original && valida(variante) && !validas.has(variante)) validas.set(variante, i)
    }
  }
  if (validas.size === 1) {
    const [[corregida, posicion]] = validas
    return { corregido: true, valor: corregida, original, posicion }
  }
  return { corregido: false, valor: original, motivo: validas.size === 0 ? 'sin_variante_valida' : 'ambiguo', variantesValidas: validas.size }
}
