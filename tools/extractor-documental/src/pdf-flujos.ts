/**
 * Sacar los flujos de CONTENIDO de un PDF. Nada mas: no interpreta lo que hay dentro.
 *
 * Vive aparte de `capa-cero.ts` porque son dos preguntas distintas. Aqui: que trozos del fichero
 * son contenido de pagina y como se descomprimen. Alli: si lo que sale de ellos es texto.
 *
 * Las dos decisiones de este modulo salieron de PDF reales, y las dos caen del lado seguro de la
 * asimetria que gobierna la capa 0: ante la duda, no devolver texto — un falso negativo cuesta
 * una llamada al motor, y un falso positivo mete datos corruptos con apariencia de exactos.
 */

/** Latin-1: cada byte es un punto de codigo. Es lo que asumen las fuentes simples de PDF. */
export function aLatin1(bytes: Uint8Array): string {
  let salida = ''
  for (const b of bytes) salida += String.fromCharCode(b)
  return salida
}

export function indiceDe(heno: Uint8Array, aguja: string, desde: number): number {
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

interface FlujoCrudo {
  readonly cabecera: string
  readonly datos: Uint8Array
}

/**
 * Recorre los flujos del fichero y devuelve cada uno con SU diccionario.
 *
 * Existe factorizado porque hay dos preguntas distintas que necesitan el mismo recorrido —cual es
 * el contenido de pagina, y cuales son las imagenes— y dos copias de esta logica divergirian. Los
 * dos recortes de abajo costaron un fallo cada uno.
 */
function* recorreFlujos(pdf: Uint8Array): Generator<FlujoCrudo> {
  let posicion = 0
  while (true) {
    const inicio = indiceDe(pdf, 'stream', posicion)
    if (inicio < 0) return
    const fin = indiceDe(pdf, 'endstream', inicio)
    if (fin < 0) return

    /**
     * El diccionario del objeto va justo antes de `stream` y declara el filtro. Lo importante es
     * DONDE se corta hacia atras: en la apertura del propio objeto, nunca a una distancia fija.
     *
     * Una ventana de tamano fijo cruza la frontera y lee el diccionario del objeto VECINO. Medido
     * sobre un PDF escaneado real: su bloque de metadatos XMP —texto plano, sin filtro ninguno—
     * quedaba a menos de 400 bytes de un objeto que si declaraba `/FlateDecode`, asi que se
     * intentaba inflar, fallaba, y se contaba como "filtro no soportado". El sintoma que veia
     * quien usaba la herramienta era un motivo que no tenia nada que ver con su documento.
     */
    const desde = Math.max(0, inicio - 1200)
    const bruto = aLatin1(pdf.subarray(desde, inicio))
    const abre = bruto.lastIndexOf('obj')
    const cabecera = abre === -1 ? bruto : bruto.slice(abre)
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

    yield { cabecera, datos }
    posicion = fin + 'endstream'.length
  }
}

export interface FlujosDelPdf {
  /** El contenido de pagina, ya descomprimido. */
  readonly flujos: readonly string[]
  /** Flujos de contenido con un filtro que no se sabe deshacer. Se declaran, no se callan. */
  readonly filtrosDesconocidos: number
}

/** Trocea el PDF y devuelve SOLO sus flujos de contenido de pagina. */
export async function flujosDeContenido(pdf: Uint8Array): Promise<FlujosDelPdf> {
  const flujos: string[] = []
  let filtrosDesconocidos = 0
  for (const { cabecera, datos } of recorreFlujos(pdf)) {
    /**
     * Solo se mira el CONTENIDO de pagina. Todo lo demas se salta, aunque se pueda inflar.
     *
     * Un flujo de contenido se declara `<</Length N/Filter/FlateDecode>>` y NO lleva `/Type` ni
     * `/Subtype`. Los que si lo llevan son la fontaneria del fichero —tabla de referencias,
     * flujos de objetos, metadatos, fuentes, imagenes— y todos inflan a bytes que no son texto.
     *
     * Se descubrio con un PDF escaneado real: sus flujos de estructura producian 85 caracteres de
     * basura en Latin-1 alto que `pareceTexto` DABA POR BUENOS, porque ese rango cuenta como
     * imprimible. O sea un falso positivo — meter datos corruptos con apariencia de exactos, que
     * es el unico error que este modulo no admite.
     *
     * `DecodeParms` se salta por lo mismo: declara un predictor que aqui no se aplica, asi que lo
     * que saldria del inflado no seria lo que el fichero dice.
     *
     * Y si algun generador raro etiquetara su flujo de contenido, esto lo saltaria y se llamaria
     * al motor. Es el lado correcto de la asimetria: un falso negativo cuesta una llamada.
     */
    const esFontaneria = /\/Type\s*\/|\/Subtype\s*\/|\/DecodeParms/.test(cabecera)

    if (esFontaneria) {
      // Ni cuenta como filtro fallido: no se esperaba texto de aqui.
    } else if (/\/Filter\s*\/FlateDecode/.test(cabecera)) {
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
  }

  return { flujos, filtrosDesconocidos }
}

export interface ImagenDelPdf {
  readonly bytes: Uint8Array
  /** `image/jpeg` hoy. Si algun dia se soportan mas, aqui es donde se dicen. */
  readonly tipoMime: string
  readonly ancho: number | null
  readonly alto: number | null
}

const entero = (cabecera: string, clave: string): number | null => {
  const encontrado = new RegExp(`/${clave}\\s+(\\d+)`).exec(cabecera)
  return encontrado === null ? null : Number(encontrado[1])
}

const esJpeg = (b: Uint8Array): boolean => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff

/**
 * Las imagenes de pagina incrustadas en el PDF.
 *
 * PARA QUE. Un escaneo no tiene capa de texto: hay que pasarlo por un motor de OCR, y un motor de
 * vision espera una IMAGEN. Mandarle el PDF entero como si fuera una no funciona. Rasterizar la
 * pagina pediria una dependencia de render, que este nucleo no tiene ni va a tener.
 *
 * Pero resulta que no hace falta: un PDF escaneado es, casi siempre, un JPEG por pagina metido
 * dentro. Sacarlo es leer el flujo y deshacer sus filtros, y eso ya se sabe hacer aqui. Verificado
 * sobre un escaneo real: 181 KB comprimidos que inflan a un JPEG de 212 KB, valido.
 *
 * QUE NO HACE. Ni rasteriza, ni recompone una pagina de varias imagenes, ni deshace JPEG2000,
 * CCITT ni JBIG2 — para eso haria falta un decodificador que no esta. Esas se omiten y quien
 * llama vera menos imagenes que paginas, que es visible; devolver bytes que no son una imagen
 * seria peor.
 */
export async function imagenesDelPdf(pdf: Uint8Array): Promise<readonly ImagenDelPdf[]> {
  const salida: ImagenDelPdf[] = []
  for (const { cabecera, datos } of recorreFlujos(pdf)) {
    if (!/\/Subtype\s*\/Image/.test(cabecera)) continue

    // El orden de los filtros es el orden en que se aplicaron. `[/FlateDecode /DCTDecode]` es un
    // JPEG comprimido otra vez con zlib, que es lo que produce mas de un escaner.
    let bytes: Uint8Array | null = datos
    if (/\/Filter\s*\[?[^\]]*\/FlateDecode/.test(cabecera)) bytes = await inflar(datos)
    if (bytes === null) continue
    if (!esJpeg(bytes)) continue

    salida.push({
      bytes,
      tipoMime: 'image/jpeg',
      ancho: entero(cabecera, 'Width'),
      alto: entero(cabecera, 'Height'),
    })
  }
  return salida
}
