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
import { flujosDeContenido, aLatin1, indiceDe } from './pdf-flujos.js'
import { saneaTextoExtraido } from './saneado.js'
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
 * Distancia vertical minima, en unidades del PDF, para considerar que empieza una linea nueva.
 *
 * MEDIDO sobre un CFDI real de 163 posiciones: los saltos verticales van de 0,02 a 235, con
 * mediana 7,2, y solo DOS quedan por debajo de 0,5 — diferencias de redondeo dentro del mismo
 * renglon. Por debajo de este valor los fragmentos son columnas de la misma linea y se separan con
 * un espacio; por encima, son renglones distintos.
 */
const SALTO_DE_LINEA_MINIMO = 0.5

/**
 * Distancia horizontal minima, en la misma linea, para considerar que empieza otra COLUMNA.
 *
 * MEDIDO sobre el mismo CFDI, en los 51 pares que comparten altura: doce quedan entre 0 y 3
 * —letras de una misma palabra que el PDF dibuja una a una, como el titulo de una seccion—, dos
 * entre 3 y 6, **ninguno entre 6 y 10**, y de ahi para arriba son columnas de verdad ("Lugar de
 * expedicion" -> "45609", a 72 unidades).
 *
 * Sin esta distincion, la primera version de este arreglo separaba TODOS los fragmentos de la misma
 * linea y convertia un titulo en "S E C C I O N D E C O N C E P T O S". Arreglar el pegado vertical
 * y romper la palabra en horizontal es cambiar un fallo por otro.
 *
 * Un desplazamiento NEGATIVO —el texto vuelve hacia atras— es siempre otra columna, nunca la
 * continuacion de una palabra.
 */
const SALTO_DE_COLUMNA_MINIMO = 6

/** Los seis numeros de un `Tm`: los dos ultimos son la traslacion (x, y). */
function traslacionDe(numeros: readonly number[]): { x: number; y: number } | null {
  if (numeros.length < 6) return null
  return { x: numeros[numeros.length - 2], y: numeros[numeros.length - 1] }
}

/**
 * Saca el texto de un flujo de contenido ya descomprimido.
 *
 * Recorre los operadores de mostrado —`Tj`, `TJ`, `'` y `"`— y toma sus argumentos. Los
 * operadores de posicion producen separacion: sin eso, una factura entera sale como un unico
 * renglon y deja de ser legible para quien la revise.
 *
 * **`Tm` es de posicion y faltaba, y es el que mas se usa.** La primera version solo miraba `Td`,
 * `TD`, `T*` y `ET`. En un CFDI real habia **164 `Tm` frente a 20 `Td`**: el 89 % de los
 * posicionamientos era invisible para este codigo, asi que concatenaba fragmento tras fragmento y
 * el resultado pegaba campos que en el papel estan en renglones distintos —el nombre del emisor
 * con su RFC, "Factura" con su tipo—. No se veia como un fallo de extraccion, se veia como un dato
 * raro, que es peor.
 *
 * Y `Tm` no siempre significa renglon nuevo: fija una posicion absoluta, asi que dos `Tm` con la
 * MISMA altura son dos columnas de la misma linea. De ahi que se compare la Y y se separe con
 * espacio o con salto segun el caso — pegar dos columnas es el mismo fallo en horizontal.
 */
export function extraeTextoDeContenido(contenido: string): string {
  let salida = ''
  let pendiente: string[] = []
  let numeros: number[] = []
  let anterior: { x: number; y: number } | null = null
  let i = 0

  /** Vuelca lo acumulado y añade el separador que toque. */
  const vuelca = (separador: string): void => {
    salida += pendiente.join('') + separador
    pendiente = []
  }

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
      vuelca('\n')
      numeros = []
      i++
      continue
    }
    // Los numeros se acumulan porque son los argumentos del operador que viene detras.
    const numero = /^-?\d+(?:\.\d+)?/.exec(contenido.slice(i))
    if (numero !== null && /[-\d]/.test(c)) {
      numeros.push(Number(numero[0]))
      i += numero[0].length
      continue
    }
    if (/[A-Za-z*]/.test(c)) {
      const operador = contenido.slice(i).match(/^[A-Za-z][A-Za-z0-9*]*/)?.[0] ?? ''
      if (operador === 'Tj' || operador === 'TJ') {
        vuelca('')
      } else if (operador === 'Tm') {
        const posicion = traslacionDe(numeros)
        // Misma altura: son columnas del mismo renglon y va un espacio. Altura distinta: renglon
        // nuevo. Sin posicion anterior no hay con que comparar, y no se separa nada.
        const separador =
          posicion === null || anterior === null
            ? ''
            : Math.abs(posicion.y - anterior.y) >= SALTO_DE_LINEA_MINIMO
              ? '\n'
              : // Misma altura: o es la palabra que continua, o es la columna de al lado.
                posicion.x - anterior.x >= 0 && posicion.x - anterior.x < SALTO_DE_COLUMNA_MINIMO
                ? ''
                : ' '
        vuelca(separador)
        if (posicion !== null) anterior = posicion
      } else if (operador === 'Td' || operador === 'TD' || operador === 'T*' || operador === 'ET') {
        vuelca('\n')
      } else if (operador === 'BT') {
        pendiente = []
      }
      numeros = []
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

  const { flujos, filtrosDesconocidos } = await flujosDeContenido(pdf)

  /**
   * Un candidato tiene que ser lo bastante largo para SER una capa de texto.
   *
   * Con `> 0` bastaban cuatro bytes de basura de un flujo que no era de contenido para que el
   * documento dejara de parecer un escaneo, y el motivo pasaba de "es una imagen" —que es la
   * verdad y dice que hacer— a "lo extraido no supera la prueba de imprimibilidad", que no le
   * dice nada a nadie. El umbral ya existia en `pareceTexto`; solo se aplicaba tarde.
   */
  const candidatos = flujos
    .map(extraeTextoDeContenido)
    .filter((t) => t.replace(/\s/g, '').length >= TEXTO_MINIMO)
  if (candidatos.length === 0) {
    return sinCapa(
      filtrosDesconocidos > 0
        ? `sin texto legible y ${filtrosDesconocidos} flujo(s) con filtro no soportado`
        : 'sin capa de texto: es un escaneo o una imagen',
    )
  }

  /**
   * La prueba de imprimibilidad va POR FLUJO, nunca sobre el agregado.
   *
   * Juzgar el conjunto parecia equivalente y no lo es, y costo un falso negativo caro: un CFDI real
   * traia CINCO flujos —el contenido de pagina legible al 94 %, mas una fuente embebida, un mapa
   * ToUnicode y dos de glifos CID—. Como esos cuatro no son texto y nunca lo fueron, el promedio
   * caia al 52 % y **se rechazaban los cinco, incluido el bueno**. La factura se resolvia sin motor
   * y se mandaba al motor igual.
   *
   * No es un caso raro: CUALQUIER PDF con fuentes embebidas tiene flujos que como texto son ruido,
   * o sea casi todas las facturas generadas por software — justo la clase que esta capa existe para
   * ahorrar. Un flujo de fuente no es "texto malo" que baje la media: es que no es texto, y
   * promediarlo con el bueno compara cosas distintas.
   *
   * La asimetria del modulo se respeta igual: lo que se descarta se descarta entero, asi que sigue
   * sin colarse un solo caracter dudoso entre los buenos.
   */
  const paginas = candidatos.filter((t) => pareceTexto(t))
  if (paginas.length === 0) return sinCapa('lo extraido no supera la prueba de imprimibilidad')
  return { hayTexto: true, paginas, motivo: null }
}

/**
 * Cuenta las paginas de un PDF, o devuelve `null` si no lo puede saber con certeza.
 *
 * El `null` es la parte importante y no un caso de borde: quien trocea por paginas necesita saber
 * cuantas hay, y **adivinar mal el numero parte el documento por donde no toca**. Devolver un
 * numero inventado convertiria un troceo en una perdida de paginas silenciosa; devolver `null`
 * hace que quien llama mande el documento entero y deje decidir a la API, que es lo correcto
 * cuando no se sabe.
 *
 * Se prefiere `/Count` del nodo raiz del arbol de paginas; si no aparece, se cuentan los objetos
 * `/Type /Page`. Si las dos vias discrepan, tampoco se sabe: `null`.
 */
export function cuentaPaginasPdf(pdf: Uint8Array): number | null {
  if (pdf.length < 5 || aLatin1(pdf.subarray(0, 5)) !== '%PDF-') return null
  const texto = aLatin1(pdf)
  const cuentas = [...texto.matchAll(/\/Type\s*\/Pages\b[^]{0,400}?\/Count\s+(\d+)/g)].map((m) => Number(m[1]))
  const objetos = [...texto.matchAll(/\/Type\s*\/Page(?![sA-Za-z])/g)].length
  const porCount = cuentas.length > 0 ? Math.max(...cuentas) : null
  if (porCount !== null && objetos > 0 && porCount !== objetos) return null
  if (porCount !== null) return porCount
  return objetos > 0 ? objetos : null
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

/**
 * El resultado de la capa 0 en forma serializable, ya saneado.
 *
 * Existe porque "texto corrido en pantalla" y "dato que un sistema consume" no son lo mismo, y
 * hasta ahora solo habia lo primero. Esto se copia, se guarda, se compara entre dos corridas y se
 * mete en un script sin volver a parsear prosa.
 *
 * LO QUE DELIBERADAMENTE **NO** LLEVA: campos con `confianza`. La capa 0 no estima nada — su texto
 * es exacto, asi que no hay score que poner, y un `0.99` inventado aqui seria justo el numero falso
 * que TAR-17 existe para impedir. Lo que hay son LINEAS; convertirlas en campos con su confianza
 * es trabajo del motor o de la persona que revisa, y ahi es donde se decide que significan.
 */
export interface CapaCeroEnJson {
  /** `true` si se resolvio sin motor. */
  hayTexto: boolean
  /** Por que se descarto, o `null` si fue bien. */
  motivo: string | null
  /** Cuantos flujos de contenido aportaron texto. */
  bloques: number
  /** El texto, una entrada por linea, ya limpio. */
  lineas: readonly string[]
  /** Que se quito al sanear. Los invisibles son una senal sobre el documento, no ruido. */
  saneado: {
    controles: number
    invisibles: number
    lineasVacias: number
    lineasDescartadas: readonly string[]
  }
}

/**
 * Convierte el resultado de `leeCapaCero` en un objeto serializable, saneando de paso.
 *
 * Sanea aqui dentro y no lo deja al que llama a proposito: si el saneado fuera opcional, la mitad
 * de los consumidores acabaria serializando el texto crudo —con sus controles y sus invisibles— y
 * el problema volveria por la puerta de atras.
 */
export function capaCeroComoJson(resultado: ResultadoCapaCero): CapaCeroEnJson {
  const limpio = saneaTextoExtraido(resultado.paginas.join('\n'))
  return {
    hayTexto: resultado.hayTexto,
    motivo: resultado.motivo,
    bloques: resultado.paginas.length,
    lineas: limpio.texto.length === 0 ? [] : limpio.texto.split('\n'),
    saneado: {
      controles: limpio.controles,
      invisibles: limpio.invisibles,
      lineasVacias: limpio.lineasVacias,
      lineasDescartadas: limpio.lineasDescartadas,
    },
  }
}
