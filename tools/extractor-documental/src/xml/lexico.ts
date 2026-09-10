/**
 * Analisis lexico de XML. Puro: recibe una cadena, devuelve una lista de piezas.
 *
 * No valida contra ningun esquema y no sabe nada del SAT — eso empieza en `arbol.ts`. Aqui solo se
 * decide que es una etiqueta, que es texto, y que esta mal escrito.
 *
 * LA DECISION QUE ORDENA EL MODULO: `<!DOCTYPE` se rechaza, y con el toda declaracion `<!`.
 *
 * Un extractor documental lee ficheros que manda un tercero: un proveedor, un cliente, cualquiera.
 * La entidad externa es el ataque clasico contra eso — el XML declara una entidad que apunta a un
 * fichero del servidor, el analizador la resuelve, y el contenido de ese fichero termina dentro de
 * un campo de la factura. Aqui no hay bandera que desactivarlo porque NO HAY CODIGO que lo haga:
 * este modulo no sabe resolver una entidad declarada, y por eso no se le puede convencer de que lo
 * haga. Una bandera se puede volver a encender; un codigo que no existe, no.
 *
 * Un CFDI valido no lleva DOCTYPE, asi que el rechazo no cuesta ni un documento legitimo.
 *
 * Este modulo LANZA. Es la primitiva, y un documento mal formado no es un valor: devolver medio
 * arbol seria peor que no devolver nada. Quien lee un lote entero envuelve esto y convierte el
 * fallo en un motivo, como hace `leeCapaCero` — asi un fichero roto no aborta los otros
 * doscientos noventa y nueve.
 */

export interface AtributoCrudo {
  /** El nombre tal cual viene, prefijo incluido. Resolverlo contra un espacio es de `arbol.ts`. */
  readonly nombre: string
  readonly valor: string
}

export type Pieza =
  | {
      readonly tipo: 'apertura'
      readonly nombre: string
      readonly atributos: readonly AtributoCrudo[]
      /** `true` para `<a/>`: abre y cierra en la misma pieza. */
      readonly vacio: boolean
      readonly linea: number
    }
  | { readonly tipo: 'cierre'; readonly nombre: string; readonly linea: number }
  | { readonly tipo: 'texto'; readonly valor: string; readonly linea: number }

/**
 * Todo fallo pasa por aqui, y todo fallo lleva linea.
 *
 * Un error de XML sin numero de linea obliga a leer el documento entero a ojo, y estos documentos
 * vienen en una sola linea de treinta mil caracteres mas veces de las que uno querria.
 */
function malFormado(mensaje: string, linea: number): never {
  throw new SyntaxError(`XML mal formado en la linea ${linea}: ${mensaje}`)
}

/** Las cinco que el estandar define sin que nadie las declare. No hay una sexta legal aqui. */
const PREDEFINIDAS: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
}

const SOLO_DIGITOS = /^[0-9]+$/
const SOLO_HEXADECIMAL = /^[0-9A-Fa-f]+$/

function resuelveEntidad(cuerpo: string, linea: number): string {
  const predefinida = PREDEFINIDAS[cuerpo]
  if (predefinida !== undefined) return predefinida

  if (cuerpo.startsWith('#')) {
    const hexadecimal = cuerpo[1] === 'x' || cuerpo[1] === 'X'
    const digitos = hexadecimal ? cuerpo.slice(2) : cuerpo.slice(1)
    const patron = hexadecimal ? SOLO_HEXADECIMAL : SOLO_DIGITOS
    if (digitos.length === 0 || !patron.test(digitos)) {
      malFormado(`referencia numerica ilegible: "&${cuerpo};"`, linea)
    }
    const punto = Number.parseInt(digitos, hexadecimal ? 16 : 10)
    if (!Number.isFinite(punto) || punto < 1 || punto > 0x10ffff) {
      malFormado(`referencia numerica fuera de rango: "&${cuerpo};"`, linea)
    }
    return String.fromCodePoint(punto)
  }

  // Una entidad declarada por el documento exigiria un DOCTYPE, que este lector rechaza. Dejarla
  // pasar como texto literal seria peor que fallar: corromperia un valor en silencio, que es
  // exactamente el fallo que el modulo de saneado existe para no cometer.
  return malFormado(
    `entidad desconocida "&${cuerpo};": solo se admiten las cinco predefinidas y las referencias ` +
      'numericas. Declarar una propia exigiria un DOCTYPE, y aqui el DOCTYPE se rechaza',
    linea,
  )
}

/** Decodifica el texto de un nodo o el valor de un atributo. Un "&" suelto es documento roto. */
export function decodificaEntidades(texto: string, linea: number): string {
  if (!texto.includes('&')) return texto
  let salida = ''
  let i = 0
  while (i < texto.length) {
    const ampersand = texto.indexOf('&', i)
    if (ampersand === -1) {
      salida += texto.slice(i)
      break
    }
    salida += texto.slice(i, ampersand)
    const final = texto.indexOf(';', ampersand)
    if (final === -1) {
      malFormado('un "&" sin su ";": en XML se escribe "&amp;" incluso dentro de una URL', linea)
    }
    salida += resuelveEntidad(texto.slice(ampersand + 1, final), linea)
    i = final + 1
  }
  return salida
}

/**
 * El final de una etiqueta NO es el primer `>`: dentro de un valor entrecomillado no cuenta.
 *
 * `<cfdi:Concepto Descripcion="Servicio &gt; 100 kg"/>` lleva un `>` legitimo dentro del valor. El
 * atajo de buscar `indexOf('>')` parte la etiqueta por la mitad y produce un atributo truncado sin
 * dar ningun error, que es la peor forma de equivocarse.
 */
function finDeEtiqueta(fuente: string, desde: number, linea: number): number {
  let comilla: string | null = null
  for (let k = desde + 1; k < fuente.length; k++) {
    const caracter = fuente[k]
    if (comilla !== null) {
      if (caracter === comilla) comilla = null
      continue
    }
    if (caracter === '"' || caracter === "'") {
      comilla = caracter
      continue
    }
    if (caracter === '>') return k
  }
  return malFormado('una etiqueta que se abre y nunca se cierra con ">"', linea)
}

/** Nombre y valor entrecomillado. Un valor sin comillas es HTML, no XML, y aqui no pasa. */
const ATRIBUTO = /([^\s=/>]+)\s*=\s*("[^"]*"|'[^']*')/g

function leeAtributos(resto: string, etiqueta: string, linea: number): readonly AtributoCrudo[] {
  const atributos: AtributoCrudo[] = []
  const vistos = new Set<string>()
  let consumido = 0
  ATRIBUTO.lastIndex = 0

  let encontrado = ATRIBUTO.exec(resto)
  while (encontrado !== null) {
    if (resto.slice(consumido, encontrado.index).trim().length > 0) {
      malFormado(`algo ilegible entre los atributos de <${etiqueta}>`, linea)
    }
    const nombre = encontrado[1]
    if (vistos.has(nombre)) {
      // Quedarse con el ultimo elegiria un valor en silencio, y en un comprobante ese valor puede
      // ser el total. Que el documento venga roto no autoriza a adivinar cual de los dos vale.
      malFormado(`el atributo "${nombre}" aparece dos veces en <${etiqueta}>`, linea)
    }
    vistos.add(nombre)
    atributos.push({ nombre, valor: decodificaEntidades(encontrado[2].slice(1, -1), linea) })
    consumido = encontrado.index + encontrado[0].length
    encontrado = ATRIBUTO.exec(resto)
  }

  if (resto.slice(consumido).trim().length > 0) {
    malFormado(`atributo mal escrito en <${etiqueta}>: falta un "=" o las comillas`, linea)
  }
  return atributos
}

const ESPACIO = /\s/

function leeEtiqueta(
  interior: string,
  linea: number,
): { nombre: string; atributos: readonly AtributoCrudo[] } {
  const recortado = interior.trim()
  const corte = recortado.search(ESPACIO)
  const nombre = corte === -1 ? recortado : recortado.slice(0, corte)
  if (nombre.length === 0) malFormado('una etiqueta sin nombre', linea)
  const resto = corte === -1 ? '' : recortado.slice(corte)
  return { nombre, atributos: leeAtributos(resto, nombre, linea) }
}

const BOM = 0xfeff
const SALTO = 10

/**
 * Recorre la fuente y devuelve las piezas en orden. Comentarios e instrucciones de proceso se
 * saltan: se comprueba que cierren, y no aportan dato ninguno.
 *
 * El texto que es solo espacio entre etiquetas se descarta. En un comprobante no hay contenido
 * mixto —el texto vive en las hojas, nunca entre dos hijos—, asi que ese espacio es sangrado del
 * generador. Lo que viene dentro de un CDATA se conserva entero aunque sea espacio: ahi el
 * documento pidio explicitamente que no se tocara.
 */
export function analizaLexico(fuente: string): readonly Pieza[] {
  const piezas: Pieza[] = []
  const total = fuente.length
  let i = fuente.charCodeAt(0) === BOM ? 1 : 0
  let linea = 1

  const avanzaLineas = (desde: number, hasta: number): void => {
    for (let k = desde; k < hasta; k++) if (fuente.charCodeAt(k) === SALTO) linea++
  }

  while (i < total) {
    if (fuente[i] !== '<') {
      const siguiente = fuente.indexOf('<', i)
      const hasta = siguiente === -1 ? total : siguiente
      const crudo = fuente.slice(i, hasta)
      if (crudo.trim().length > 0) {
        piezas.push({ tipo: 'texto', valor: decodificaEntidades(crudo, linea), linea })
      }
      avanzaLineas(i, hasta)
      i = hasta
      continue
    }

    if (fuente.startsWith('<!--', i)) {
      const final = fuente.indexOf('-->', i + 4)
      if (final === -1) malFormado('un comentario sin cerrar se traga el resto del documento', linea)
      avanzaLineas(i, final + 3)
      i = final + 3
      continue
    }

    if (fuente.startsWith('<![CDATA[', i)) {
      const final = fuente.indexOf(']]>', i + 9)
      if (final === -1) malFormado('una seccion CDATA sin cerrar', linea)
      piezas.push({ tipo: 'texto', valor: fuente.slice(i + 9, final), linea })
      avanzaLineas(i, final + 3)
      i = final + 3
      continue
    }

    if (fuente.startsWith('<!DOCTYPE', i)) {
      malFormado(
        'DOCTYPE no admitido. Un CFDI valido no lleva, y admitirlo es lo que hace posible que un ' +
          'documento de un tercero lea ficheros del servidor. No hay opcion para permitirlo: no ' +
          'existe la bandera que alguien pudiera reactivar',
        linea,
      )
    }

    if (fuente.startsWith('<!', i)) {
      malFormado('declaracion no admitida: este lector solo acepta elementos, texto y CDATA', linea)
    }

    if (fuente.startsWith('<?', i)) {
      const final = fuente.indexOf('?>', i + 2)
      if (final === -1) malFormado('una instruccion de proceso sin cerrar', linea)
      avanzaLineas(i, final + 2)
      i = final + 2
      continue
    }

    if (fuente[i + 1] === '/') {
      const final = fuente.indexOf('>', i + 2)
      if (final === -1) malFormado('una etiqueta de cierre sin ">"', linea)
      const nombre = fuente.slice(i + 2, final).trim()
      if (nombre.length === 0) malFormado('una etiqueta de cierre sin nombre', linea)
      piezas.push({ tipo: 'cierre', nombre, linea })
      avanzaLineas(i, final + 1)
      i = final + 1
      continue
    }

    const final = finDeEtiqueta(fuente, i, linea)
    let interior = fuente.slice(i + 1, final)
    const vacio = interior.endsWith('/')
    if (vacio) interior = interior.slice(0, -1)
    const { nombre, atributos } = leeEtiqueta(interior, linea)
    piezas.push({ tipo: 'apertura', nombre, atributos, vacio, linea })
    avanzaLineas(i, final + 1)
    i = final + 1
  }

  return piezas
}
