/**
 * Capa 0: el PDF que YA trae su texto, y por tanto no necesita motor.
 *
 * Entre el 30 % y el 50 % de un corpus tipico son PDF generados por software (facturas emitidas
 * por un ERP, estados de cuenta, remisiones) que llevan su capa de texto dentro. Pasarlos por un
 * motor de OCR es pagar dos veces: la llamada y la perdida de fidelidad, porque el texto nativo es
 * exacto y el reconocido es una estimacion.
 *
 * LA ASIMETRIA QUE GOBIERNA TODO ESTE ARCHIVO:
 *
 *   - Un falso negativo (decir "no hay texto" cuando lo hay) cuesta una llamada al motor. Dinero.
 *   - Un falso positivo (decir "hay texto" cuando lo que se lee es basura) mete datos corruptos en
 *     la base con apariencia de exactos, y nadie lo revisa porque la capa 0 no pasa por la cola.
 *
 * No son comparables. Por eso cada duda de este modulo se resuelve DEVOLVIENDO `false`: PDF
 * cifrado, filtro que no se sabe deshacer, xref por flujo de objetos, texto que no parece texto.
 * Se prefiere gastar la llamada a inventarse el contenido.
 *
 * Lo que este modulo NO es: un extractor de PDF completo. No resuelve fuentes con codificacion
 * propia (CID sin ToUnicode), no ordena por posicion, no reconstruye tablas. Cuando el resultado
 * no supera la prueba de imprimibilidad, se declara sin capa util y decide el motor.
 *
 * Cero dependencias: `DecompressionStream` es API web y existe igual en Node 18+ y en el
 * navegador, que es la condicion para que el nucleo siga siendo instalable en cualquier proyecto.
 */
import type { PaginaExtraida } from './tipos.js'
import type { MotorOcr, OpcionesDeExtraccion } from './puertos.js'

/** Texto minimo para considerar que la capa existe. Menos que esto es ruido de metadatos. */
const TEXTO_MINIMO = 16

/** Fraccion de caracteres que tienen que ser legibles para fiarse de lo extraido. */
const IMPRIMIBLE_MINIMO = 0.8

export interface ResultadoCapaCero {
  /** `true` solo si se pudo leer texto Y ese texto supero la prueba de imprimibilidad. */
  hayTexto: boolean
  /** Texto por flujo de contenido, en orden de documento. Vacio cuando `hayTexto` es falso. */
  paginas: readonly string[]
  /** Por que se descarto. `null` cuando `hayTexto` es verdadero. Se dice, no se calla. */
  motivo: string | null
}

const sinCapa = (motivo: string): ResultadoCapaCero => ({ hayTexto: false, paginas: [], motivo })

/** Latin-1: cada byte es un punto de codigo. Es lo que asumen las fuentes simples de PDF. */
function aLatin1(bytes: Uint8Array): string {
  let salida = ''
  for (const b of bytes) salida += String.fromCharCode(b)
  return salida
}

function indiceDe(heno: Uint8Array, aguja: string, desde: number): number {
  const patron = new Uint8Array(aguja.length)
  for (let i = 0; i < aguja.length; i++) patron[i] = aguja.charCodeAt(i)
  bucle: for (let i = desde; i <= heno.length - patron.length; i++) {
    for (let j = 0; j < patron.length; j++) if (heno[i + j] !== patron[j]) continue bucle
    return i
  }
  return -1
}

/** Inflado zlib por API web. PDF usa Flate CON cabecera zlib, que es el modo `deflate`. */
async function inflar(datos: Uint8Array): Promise<Uint8Array | null> {
  try {
    const entrada = new Blob([datos as BlobPart]).stream()
    const salida = entrada.pipeThrough(new DecompressionStream('deflate'))
    return new Uint8Array(await new Response(salida).arrayBuffer())
  } catch {
    return null
  }
}

/**
 * Decodifica una cadena literal de PDF: `(texto con \(escapes\))`.
 * Devuelve el texto y el indice justo despues del parentesis de cierre.
 */
function leeLiteral(fuente: string, inicio: number): { texto: string; fin: number } {
  let profundidad = 1
  let i = inicio
  let texto = ''
  while (i < fuente.length && profundidad > 0) {
    const c = fuente[i]
    if (c === '\\') {
      const siguiente = fuente[i + 1] ?? ''
      const simples: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }
      if (siguiente in simples) {
        texto += simples[siguiente]
        i += 2
      } else if (siguiente >= '0' && siguiente <= '7') {
        const octal = fuente.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)?.[0] ?? ''
        texto += String.fromCharCode(parseInt(octal, 8))
        i += 1 + octal.length
      } else if (siguiente === '\n' || siguiente === '\r') {
        i += 2 // continuacion de linea: no produce caracter
      } else {
        texto += siguiente
        i += 2
      }
      continue
    }
    if (c === '(') profundidad++
    else if (c === ')') {
      profundidad--
      if (profundidad === 0) break
    }
    texto += c
    i++
  }
  return { texto, fin: i + 1 }
}

/** Decodifica `<48656C6C6F>`. Con BOM FEFF se lee como UTF-16BE, que es lo que marca el estandar. */
function leeHexadecimal(cuerpo: string): string {
  const limpio = cuerpo.replace(/[^0-9A-Fa-f]/g, '')
  const par = limpio.length % 2 === 0 ? limpio : limpio + '0'
  const bytes: number[] = []
  for (let i = 0; i < par.length; i += 2) bytes.push(parseInt(par.slice(i, i + 2), 16))
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let texto = ''
    for (let i = 2; i + 1 < bytes.length; i += 2) texto += String.fromCharCode((bytes[i] << 8) | bytes[i + 1])
    return texto
  }
  return bytes.map((b) => String.fromCharCode(b)).join('')
}

/**
 * Saca el texto de un flujo de contenido ya descomprimido.
 *
 * Recorre los operadores de mostrado —`Tj`, `TJ`, `'` y `"`— y toma sus argumentos. Los
 * operadores de posicion (`Td`, `TD`, `T*`, `ET`) producen salto de linea: sin eso, una factura
 * entera sale como un unico renglon y deja de ser legible para quien la revise.
 */
export function extraeTextoDeContenido(contenido: string): string {
  let salida = ''
  let pendiente: string[] = []
  let i = 0
  while (i < contenido.length) {
    const c = contenido[i]
    if (c === '(') {
      const { texto, fin } = leeLiteral(contenido, i + 1)
      pendiente.push(texto)
      i = fin
      continue
    }
    if (c === '<' && contenido[i + 1] !== '<') {
      const cierre = contenido.indexOf('>', i)
      if (cierre < 0) break
      pendiente.push(leeHexadecimal(contenido.slice(i + 1, cierre)))
      i = cierre + 1
      continue
    }
    if (c === "'" || c === '"') {
      salida += pendiente.join('') + '\n'
      pendiente = []
      i++
      continue
    }
    if (/[A-Za-z*]/.test(c)) {
      const operador = contenido.slice(i).match(/^[A-Za-z][A-Za-z0-9*]*/)?.[0] ?? ''
      if (operador === 'Tj' || operador === 'TJ') {
        salida += pendiente.join('')
        pendiente = []
      } else if (operador === 'Td' || operador === 'TD' || operador === 'T*' || operador === 'ET') {
        salida += pendiente.join('') + '\n'
        pendiente = []
      } else if (operador === 'BT') {
        pendiente = []
      }
      i += Math.max(operador.length, 1)
      continue
    }
    i++
  }
  return salida + pendiente.join('')
}

/** Un texto de verdad es mayoritariamente imprimible. Basura inflada, no. */
export function pareceTexto(texto: string): boolean {
  const util = texto.replace(/\s/g, '')
  if (util.length < TEXTO_MINIMO) return false
  let legibles = 0
  for (const ch of util) {
    const punto = ch.codePointAt(0) ?? 0
    if ((punto >= 0x20 && punto <= 0x7e) || (punto >= 0xa0 && punto <= 0x24f)) legibles++
  }
  return legibles / util.length >= IMPRIMIBLE_MINIMO
}

/**
 * Lee la capa de texto de un PDF sin llamar a ningun motor.
 *
 * Devuelve `hayTexto: false` con su motivo ante cualquier duda; el motivo se conserva para que
 * quien depure sepa POR QUE se gasto una llamada, en vez de verla aparecer sin explicacion.
 */
export async function leeCapaCero(pdf: Uint8Array): Promise<ResultadoCapaCero> {
  if (pdf.length < 5 || aLatin1(pdf.subarray(0, 5)) !== '%PDF-') {
    return sinCapa('no es un PDF: la capa 0 solo aplica a PDF')
  }
  // Un PDF cifrado exige la clave para descomprimir sus flujos. Intentarlo produce basura que
  // pasaria por texto si nadie mira, que es exactamente el falso positivo que no se admite.
  if (indiceDe(pdf, '/Encrypt', 0) >= 0) return sinCapa('PDF cifrado: la capa 0 no descifra')

  const flujos: string[] = []
  let posicion = 0
  let filtrosDesconocidos = 0
  while (true) {
    const inicio = indiceDe(pdf, 'stream', posicion)
    if (inicio < 0) break
    const fin = indiceDe(pdf, 'endstream', inicio)
    if (fin < 0) break

    // El diccionario del objeto va justo antes de `stream` y declara el filtro.
    const cabecera = aLatin1(pdf.subarray(Math.max(0, inicio - 400), inicio))
    let datos = pdf.subarray(inicio + 'stream'.length, fin)
    // Tras `stream` va CRLF o LF, y no forma parte de los datos.
    let recorte = 0
    if (datos[0] === 0x0d && datos[1] === 0x0a) recorte = 2
    else if (datos[0] === 0x0a || datos[0] === 0x0d) recorte = 1
    datos = datos.subarray(recorte)
    // Y el salto que precede a `endstream` tampoco. En texto plano sobra sin mas; en un flujo
    // comprimido es un byte de mas al final que hace fallar el inflado entero — y el fallo se
    // presenta como "este PDF no tiene texto", que es un falso negativo silencioso.
    let cola = datos.length
    if (cola >= 2 && datos[cola - 2] === 0x0d && datos[cola - 1] === 0x0a) cola -= 2
    else if (cola >= 1 && (datos[cola - 1] === 0x0a || datos[cola - 1] === 0x0d)) cola -= 1
    datos = datos.subarray(0, cola)

    if (/\/Filter\s*\/FlateDecode/.test(cabecera)) {
      const crudo = await inflar(datos)
      if (crudo === null) filtrosDesconocidos++
      else flujos.push(aLatin1(crudo))
    } else if (/\/Filter/.test(cabecera)) {
      // DCTDecode (un JPEG incrustado) es lo normal en un escaneo: no es texto y no cuenta como
      // filtro fallido. Cualquier otro filtro si es un hueco que se declara.
      if (!/\/DCTDecode|\/JPXDecode|\/CCITTFaxDecode|\/JBIG2Decode/.test(cabecera)) filtrosDesconocidos++
    } else {
      flujos.push(aLatin1(datos))
    }
    posicion = fin + 'endstream'.length
  }

  const paginas = flujos.map(extraeTextoDeContenido).filter((t) => t.trim().length > 0)
  const todo = paginas.join('\n')
  if (todo.trim().length === 0) {
    return sinCapa(
      filtrosDesconocidos > 0
        ? `sin texto legible y ${filtrosDesconocidos} flujo(s) con filtro no soportado`
        : 'sin capa de texto: es un escaneo o una imagen',
    )
  }
  if (!pareceTexto(todo)) return sinCapa('lo extraido no supera la prueba de imprimibilidad')
  return { hayTexto: true, paginas, motivo: null }
}

export interface ExtraccionConCapaCero {
  paginas: PaginaExtraida[]
  /** `true` cuando se resolvio sin gastar una llamada al motor. */
  porCapaCero: boolean
  /** Por que hubo que llamar al motor. `null` cuando no se llamo. */
  motivo: string | null
}

/**
 * Resuelve un documento saltandose el motor cuando el PDF ya trae su texto.
 *
 * EL MATIZ QUE DECIDE SI ESTO ES CORRECTO: la capa 0 devuelve TEXTO, no campos estructurados. En
 * cuanto se pide un `esquemaDeAnotacion` —que es como se piden campos con su confianza y su
 * region— la capa 0 deja de poder responder, y se llama al motor aunque el PDF tenga texto de
 * sobra. Devolver los campos vacios "porque habia texto" seria dar por extraida una factura de la
 * que no se saco ni un dato.
 *
 * Los campos van vacios a proposito en la via de capa 0: el texto es exacto, pero convertirlo en
 * campos es trabajo de anotacion. Y `confianza` no se inventa — un campo que nadie extrajo no
 * tiene confianza 1, no tiene confianza.
 */
export async function extraeConCapaCero(
  motor: MotorOcr,
  documento: Uint8Array,
  opciones?: OpcionesDeExtraccion,
): Promise<ExtraccionConCapaCero> {
  if (opciones?.esquemaDeAnotacion !== undefined) {
    const paginas = await motor.extrae(documento, opciones)
    return { paginas, porCapaCero: false, motivo: 'se pidieron anotaciones: la capa 0 da texto, no campos' }
  }
  const capa = await leeCapaCero(documento)
  if (capa.hayTexto) {
    return {
      paginas: capa.paginas.map((markdown, indice) => ({ indice, markdown, campos: [] })),
      porCapaCero: true,
      motivo: null,
    }
  }
  const paginas = await motor.extrae(documento, opciones)
  return { paginas, porCapaCero: false, motivo: capa.motivo }
}
