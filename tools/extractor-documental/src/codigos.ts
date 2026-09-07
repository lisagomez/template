/**
 * Analisis de lo que devuelve un decodificador de codigos. Puro: aqui no se lee ninguna camara ni
 * se escucha ningun teclado — eso es DOM y vive en los entry points de navegador.
 *
 * La idea que ordena el modulo: **decodificar bien no dice nada sobre si el contenido es cierto**.
 * Un QR decodifica o no (Reed-Solomon corrige), asi que la confianza del decodificador es 1
 * siempre. Pero es el canal MAS controlable por un atacante: cualquiera imprime una pegatina y la
 * pega encima de la legitima. De ahi que aqui se clasifique y se valide, y que jamas se navegue a
 * una URL que venga de un codigo.
 */

/** Lo que se reconoce en la carga. `desconocido` es una respuesta valida, no un fallo. */
export type TipoDeCarga = 'url' | 'cfdi' | 'gs1' | 'fnsku' | 'guia' | 'texto'

export interface CargaAnalizada {
  tipo: TipoDeCarga
  /** La carga original, sin tocar. Lo que se guarda como evidencia. */
  cruda: string
  /** Campos reconocidos, ya con clave. Vacio si el tipo es `texto`. */
  campos: Readonly<Record<string, string>>
  /**
   * Presente solo cuando el tipo es `url`. **Se muestra, nunca se abre.**
   * Un QR pegado encima del legitimo es el patron de fraude documentado en facturas: el destino
   * se le ensena a la persona y decide ella.
   */
  destino?: string
}

// --- GS1 ---------------------------------------------------------------------------------------

/**
 * Application Identifiers con longitud FIJA. Los que no estan aqui son de longitud variable y
 * terminan en el separador de grupo (FNC1, que los decodificadores entregan como \x1D).
 */
const AI_FIJOS: Readonly<Record<string, number>> = {
  '00': 18, // SSCC
  '01': 14, // GTIN
  '11': 6, // fecha de produccion
  '15': 6, // consumo preferente
  '17': 6, // caducidad
}

const NOMBRE_AI: Readonly<Record<string, string>> = {
  '00': 'sscc',
  '01': 'gtin',
  '10': 'lote',
  '11': 'fecha_produccion',
  '15': 'consumo_preferente',
  '17': 'caducidad',
  '21': 'serie',
  '37': 'cantidad',
}

const SEPARADOR = '\x1D'

/**
 * Extrae los Application Identifiers de una cadena GS1 (GS1-128, DataMatrix, GS1 QR).
 *
 * Los AIs YA son un esquema: (01) GTIN, (10) lote, (17) caducidad, (21) serie, (00) SSCC. Para
 * inventario eso da el mapeo campo->clave sin OCR y sin anotacion, que es la razon de que una
 * etiqueta sea mucho mas barata de procesar que un documento.
 */
export function parseaGs1(carga: string): Readonly<Record<string, string>> {
  const campos: Record<string, string> = {}
  let resto = carga.startsWith(']C1') ? carga.slice(3) : carga
  while (resto.length >= 2) {
    // Un separador solo hace falta tras un campo de longitud variable, pero los datos reales
    // traen de todo. Uno de sobra es inofensivo: se salta en vez de romper la lectura entera.
    if (resto.startsWith(SEPARADOR)) {
      resto = resto.slice(1)
      continue
    }
    const ai = resto.slice(0, 2)
    const nombre = NOMBRE_AI[ai]
    if (nombre === undefined) break // AI desconocido: se para, no se adivina.
    resto = resto.slice(2)
    const fija = AI_FIJOS[ai]
    if (fija !== undefined) {
      campos[nombre] = resto.slice(0, fija)
      resto = resto.slice(fija)
    } else {
      const fin = resto.indexOf(SEPARADOR)
      campos[nombre] = fin === -1 ? resto : resto.slice(0, fin)
      resto = fin === -1 ? '' : resto.slice(fin + 1)
    }
  }
  return campos
}

// --- Digitos de control ------------------------------------------------------------------------

/**
 * Modulo 10 de GS1: GTIN-8/12/13/14 y SSCC. Pesos 3 y 1 alternos desde la derecha.
 *
 * Una lectura 1D mal hecha FALLA aqui. Es validacion determinista, sin red y sin modelo — mucho
 * mejor respuesta a "esta lectura es buena?" que una puntuacion de confianza inventada.
 */
export function validaModulo10(digitos: string): boolean {
  if (!/^\d{8,18}$/.test(digitos)) return false
  const cuerpo = digitos.slice(0, -1)
  const control = Number(digitos.slice(-1))
  let suma = 0
  for (let i = cuerpo.length - 1, peso = 3; i >= 0; i -= 1, peso = peso === 3 ? 1 : 3) {
    suma += Number(cuerpo[i]) * peso
  }
  return (10 - (suma % 10)) % 10 === control
}

/**
 * Modulo 11 de FedEx Express (12 digitos): pesos 1,3,7 repetidos de derecha a izquierda sobre los
 * 11 primeros; el resto entre 11 es el digito de control, con 10 -> 0.
 */
export function validaGuiaFedexExpress(numero: string): boolean {
  if (!/^\d{12}$/.test(numero)) return false
  const pesos = [1, 3, 7]
  const cuerpo = numero.slice(0, 11)
  let suma = 0
  for (let i = cuerpo.length - 1, k = 0; i >= 0; i -= 1, k += 1) {
    suma += Number(cuerpo[i]) * pesos[k % 3]
  }
  return suma % 11 % 10 === Number(numero.slice(-1))
}

/** Enruta al validador que corresponda. `null` = no se sabe validar, que NO es "es valido". */
export function validaDigitoDeControl(valor: string, tipo: 'gtin' | 'sscc' | 'fedex-express'): boolean | null {
  if (tipo === 'gtin') return /^\d{8}$|^\d{12,14}$/.test(valor) ? validaModulo10(valor) : null
  if (tipo === 'sscc') return /^\d{18}$/.test(valor) ? validaModulo10(valor) : null
  return /^\d{12}$/.test(valor) ? validaGuiaFedexExpress(valor) : null
}

// --- Clasificacion -----------------------------------------------------------------------------

const CFDI = /verificacfdi\.facturaelectronica\.sat\.gob\.mx/i
const FNSKU = /^X00[A-Z0-9]{7}$/i

/** Parametros del QR de un CFDI: UUID, RFC emisor, RFC receptor, total y 8 chars del sello. */
function camposCfdi(url: URL): Readonly<Record<string, string>> {
  const p = url.searchParams
  const campos: Record<string, string> = {}
  for (const [clave, nombre] of [['id', 'uuid'], ['re', 'rfc_emisor'], ['rr', 'rfc_receptor'], ['tt', 'total'], ['fe', 'sello']] as const) {
    const v = p.get(clave)
    if (v !== null) campos[nombre] = v
  }
  return campos
}

/**
 * Clasifica una carga decodificada. No decide nada sobre su veracidad: solo dice que forma tiene.
 *
 * Ojo con `url`: se devuelve el destino para MOSTRARLO. Abrirlo es el fraude entero.
 */
export function analizaCarga(carga: string): CargaAnalizada {
  const limpia = carga.trim()

  if (/^https?:\/\//i.test(limpia)) {
    let url: URL
    try {
      url = new URL(limpia)
    } catch {
      return { tipo: 'texto', cruda: carga, campos: {} }
    }
    if (CFDI.test(url.hostname)) {
      return { tipo: 'cfdi', cruda: carga, campos: camposCfdi(url), destino: url.href }
    }
    return { tipo: 'url', cruda: carga, campos: {}, destino: url.href }
  }

  if (FNSKU.test(limpia)) return { tipo: 'fnsku', cruda: carga, campos: { fnsku: limpia.toUpperCase() } }

  const gs1 = parseaGs1(limpia)
  if (Object.keys(gs1).length > 0) return { tipo: 'gs1', cruda: carga, campos: gs1 }

  if (/^\d{12}$/.test(limpia) && validaGuiaFedexExpress(limpia)) {
    return { tipo: 'guia', cruda: carga, campos: { guia: limpia, transportista: 'fedex' } }
  }

  return { tipo: 'texto', cruda: carga, campos: {} }
}

// --- Escaner HID -------------------------------------------------------------------------------

export interface OpcionesDeRafaga {
  /** Milisegundos maximos entre pulsaciones para considerarlo maquina y no persona. */
  msEntreTeclas: number
  /** Longitud minima; por debajo, distinguir de un tecleo humano es adivinar. */
  minimoCaracteres: number
}

/**
 * Heuristica de respaldo para distinguir un escaner de una persona tecleando.
 *
 * Es el PLAN B a proposito. Un escaner HID se puede programar con prefijo y sufijo, y entonces la
 * deteccion es determinista y no hay nada que adivinar. Esta funcion existe para el escaner que
 * llego sin configurar, y por eso los dos parametros son obligatorios: no hay valor por defecto
 * defendible sin medir el teclado de quien la use.
 */
export function esRafagaDeEscaner(
  marcasDeTiempo: readonly number[],
  opciones: OpcionesDeRafaga,
): boolean {
  const { msEntreTeclas, minimoCaracteres } = opciones
  if (msEntreTeclas <= 0) throw new RangeError('msEntreTeclas tiene que ser positivo')
  if (marcasDeTiempo.length < minimoCaracteres) return false
  for (let i = 1; i < marcasDeTiempo.length; i += 1) {
    if (marcasDeTiempo[i] - marcasDeTiempo[i - 1] > msEntreTeclas) return false
  }
  return true
}
