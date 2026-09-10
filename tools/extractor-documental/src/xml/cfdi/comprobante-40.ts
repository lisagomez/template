/**
 * El comprobante CFDI 4.0: el tronco que comparten una factura, un pago y una nomina.
 *
 * NO es un lector registrado, es el ANFITRION. Meterlo en el registro haria opcional la raiz, y un
 * documento cuyo lector de raiz nadie registro daria cero campos sin decir por que.
 *
 * Esta funcion NUNCA lanza. `analizaXml` si lanza —es la primitiva, y medio arbol es peor que
 * ninguno—, pero quien lee un lote de trescientos ficheros no puede permitir que uno roto aborte
 * los otros doscientos noventa y nueve. Aqui el fallo se convierte en `motivo`, exactamente como
 * hace `leeCapaCero`.
 *
 * LO QUE ESTE LECTOR NO HACE, Y NO ES UNA CARENCIA TEMPORAL:
 *
 *  - No verifica el sello del emisor ni el del SAT. Eso exige criptografia, el certificado del
 *    emisor y una cadena de confianza que esta herramienta no tiene. Analizar no es validar, y
 *    validar no es autenticar. El tipo lo garantiza: ver `SelloDelComprobante`.
 *  - No descarga ningun esquema por red. Una herramienta que necesita internet para leer un
 *    fichero local deja de servir justo donde estos documentos se procesan.
 *  - No consulta el servicio de estatus del SAT. Eso mandaria el identificador y los registros
 *    fiscales de DOS terceros a un servicio externo, revelando su relacion comercial. La spec ya
 *    lo deja fuera de alcance.
 *  - No convierte los importes a numero. `1160.00` se conserva como cadena: pasar por `number`
 *    pierde el cero final y abre la puerta al redondeo binario.
 *  - No traduce los codigos del SAT a etiquetas. Emite `03`, nunca "Transferencia electronica".
 *    Un catalogo embarcado envejece y etiqueta mal en silencio; resolver un codigo contra las
 *    tablas del proyecto es lo que hace `reconciliacion.ts`, y en un proyecto con grafo poblado,
 *    ese grafo.
 */
import type { CampoExtraido } from '../../tipos.js'
import type { Elemento } from '../arbol.js'
import { analizaXml, atributo, hijo, hijos } from '../arbol.js'
import type { ComplementosLeidos, RegistroDeEsquemas } from '../registro.js'
import { registroDeEsquemas } from '../registro.js'
import { CFDI_40 } from './espacios.js'
import {
  DEL_COMPROBANTE,
  DEL_EMISOR,
  DEL_RECEPTOR,
  DEL_CONCEPTO,
  DEL_TRASLADO,
  sinTraducir,
} from './inventario.js'

/**
 * Los dos sellos, y la afirmacion de que nadie los comprobo.
 *
 * `verificado` es el literal `false`, NO un booleano, y esa eleccion de tipo es el control. Con un
 * booleano alguien lo pondria a `true` "cuando implementemos la verificacion"; con el literal,
 * ponerlo a `true` no compila sin cambiar el contrato, y cambiar un contrato se ve en la revision.
 */
export interface SelloDelComprobante {
  readonly emisor: string | null
  readonly sat: string | null
  readonly verificado: false
}

/** Un renglon. Sus campos van aparte para que dos renglones no se pisen la clave. */
export interface ConceptoLeido {
  readonly indice: number
  readonly campos: readonly CampoExtraido[]
}

/** La addenda no tiene esquema del SAT: se declara que esta, y no se convierte en campos. */
export interface AddendaPresente {
  readonly hijos: readonly string[]
  readonly leida: false
}

export interface LecturaDeCfdi {
  readonly esCfdi: boolean
  /** Por que no se pudo leer. `null` cuando `esCfdi` es `true`. */
  readonly motivo: string | null
  readonly version: string | null
  /** `I` ingreso, `E` egreso, `T` traslado, `N` nomina, `P` pago. Codigo, no etiqueta. */
  readonly tipoDeComprobante: string | null
  readonly campos: readonly CampoExtraido[]
  readonly conceptos: readonly ConceptoLeido[]
  readonly complementos: ComplementosLeidos
  readonly addenda: AddendaPresente | null
  /**
   * Elementos del tronco que este lector vio y NO tradujo.
   *
   * Existe por un defecto real: hasta que un CFDI de honorarios con retenciones paso por aqui, el
   * bloque de impuestos se perdia entero y en silencio, y el aviso decia que no habia nada que
   * advertir. La regla que gobierna los complementos —declarar, no descartar— no se estaba
   * aplicando al tronco, que es donde menos se nota y mas duele.
   */
  readonly noLeido: readonly string[]
  readonly sello: SelloDelComprobante
  /** `false` cuando el comprobante no trae timbre. Es un HECHO, no un campo que falta. */
  readonly timbrado: boolean
}

const SIN_SELLO: SelloDelComprobante = { emisor: null, sat: null, verificado: false }

function sinCfdi(motivo: string): LecturaDeCfdi {
  return {
    esCfdi: false,
    motivo,
    version: null,
    tipoDeComprobante: null,
    campos: [],
    conceptos: [],
    complementos: { leidos: [], sinLector: [] },
    addenda: null,
    noLeido: [],
    sello: SIN_SELLO,
    timbrado: false,
  }
}

/**
 * Atributo del comprobante a clave del campo.
 *
 * `Total`, el registro del emisor y el del receptor salen con las MISMAS claves que emite
 * `camposCfdi` para el codigo impreso del SAT. Esa coincidencia es lo que permite que `corrobora`
 * cotee las tres fuentes sin una linea nueva, y hay una prueba que la fija: si alguien renombra
 * una de las dos partes, el cotejo dejaria de encontrar nada y reportaria cero discrepancias, que
 * es indistinguible de que todo coincide.
 */
/** Lo que se compara por igualdad exacta y NUNCA por parecido. */
const SON_IDENTIFICADOR = new Set([
  'rfc_emisor',
  'rfc_receptor',
  'uuid',
  'folio',
  'serie',
  'no_certificado_emisor',
  'clave_prod_serv',
  'no_identificacion',
  'clave_unidad',
])

function recoge(
  nodo: Elemento | null,
  tabla: readonly (readonly [string, string])[],
  destino: CampoExtraido[],
  prefijo = '',
): void {
  if (nodo === null) return
  for (const [delSat, sufijo] of tabla) {
    const valor = atributo(nodo, delSat)
    if (valor === null) continue
    const clave = `${prefijo}${sufijo}`
    const campo: CampoExtraido = { clave, valor, confianza: 1, procedencia: 'xml' }
    if (SON_IDENTIFICADOR.has(clave)) campo.formato = 'identificador'
    destino.push(campo)
  }
}

/**
 * El bloque de impuestos, que sirve igual para el tronco y para un renglon.
 *
 * Se lee porque sin el la aritmetica del comprobante no cierra. En una factura de honorarios con
 * retenciones el total NO es el subtotal: es el subtotal mas lo trasladado menos lo retenido, y
 * quien mire una extraccion sin esos dos numeros ve un hueco que no sabe explicar. Ademas lo
 * retenido es lo que alguien tiene que enterar al SAT, asi que perderlo no es perder un detalle.
 *
 * Las claves van numeradas porque un comprobante puede llevar varias retenciones —esta factura
 * real lleva dos, de dos impuestos distintos— y aplanarlas sin indice haria que la ultima pisara
 * a la anterior.
 */
function recogeImpuestos(nodo: Elemento | null, destino: CampoExtraido[]): void {
  if (nodo === null) return
  const simple = (clave: string, valor: string | null): void => {
    if (valor !== null) destino.push({ clave, valor, confianza: 1, procedencia: 'xml' })
  }
  simple('total_impuestos_trasladados', atributo(nodo, 'TotalImpuestosTrasladados'))
  simple('total_impuestos_retenidos', atributo(nodo, 'TotalImpuestosRetenidos'))

  for (const [contenedor, hoja, prefijo] of [
    ['Traslados', 'Traslado', 'traslado'],
    ['Retenciones', 'Retencion', 'retencion'],
  ] as const) {
    const grupo = hijo(nodo, CFDI_40, contenedor)
    if (grupo === null) continue
    hijos(grupo, CFDI_40, hoja).forEach((linea, i) => {
      recoge(linea, DEL_TRASLADO, destino, `${prefijo}_${i + 1}_`)
    })
  }
}

const DECLARACION = /<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i

/**
 * Decodifica como UTF-8, y se niega a adivinar cualquier otra cosa.
 *
 * Un CFDI es UTF-8 por norma. Si el documento declara otra codificacion, decodificarlo como UTF-8
 * de todos modos produciria acentos rotos en el nombre de una persona sin dar ningun error — y un
 * nombre mal escrito en una factura es un dato equivocado, no un detalle de presentacion.
 */
function texto(fuente: string | Uint8Array): { valor: string } | { motivo: string } {
  let valor: string
  if (typeof fuente === 'string') {
    valor = fuente
  } else {
    try {
      valor = new TextDecoder('utf-8', { fatal: true }).decode(fuente)
    } catch {
      return { motivo: 'los bytes no son UTF-8 valido: un CFDI lo es por norma' }
    }
  }
  const declarada = DECLARACION.exec(valor.slice(0, 200))
  if (declarada !== null && !/^utf-?8$/i.test(declarada[1].trim())) {
    return { motivo: `el documento declara la codificacion "${declarada[1]}" y este lector solo lee UTF-8` }
  }
  return { valor }
}

/**
 * Lee un CFDI 4.0.
 *
 * El registro es opcional: sin el se lee el tronco igual y TODOS los complementos salen
 * declarados como no leidos, que es informacion util y no un fallo.
 */
export function leeCfdi40(
  fuente: string | Uint8Array,
  registro: RegistroDeEsquemas = registroDeEsquemas([]),
): LecturaDeCfdi {
  const decodificado = texto(fuente)
  if ('motivo' in decodificado) return sinCfdi(decodificado.motivo)

  let raiz: Elemento
  try {
    raiz = analizaXml(decodificado.valor).raiz
  } catch (error) {
    return sinCfdi(error instanceof Error ? error.message : 'no se pudo analizar el XML')
  }

  if (raiz.nombreLocal !== 'Comprobante') {
    return sinCfdi(`la raiz es <${raiz.nombreLocal}>, y un CFDI empieza por <Comprobante>`)
  }
  if (raiz.espacio !== CFDI_40) {
    // El sintoma de resolver por prefijo seria justo NO llegar aqui. Se nombra la direccion que
    // trajo el documento porque es lo primero que hay que mirar cuando "un CFDI no es un CFDI".
    return sinCfdi(
      `el comprobante declara el espacio de nombres "${raiz.espacio ?? '(ninguno)'}" y este lector lee ${CFDI_40}`,
    )
  }

  const version = atributo(raiz, 'Version')
  if (version !== '4.0') {
    return sinCfdi(
      version === null
        ? 'el comprobante no declara version'
        : `el comprobante es version ${version} y este lector solo lee la 4.0`,
    )
  }

  const campos: CampoExtraido[] = []
  recoge(raiz, DEL_COMPROBANTE, campos)
  recoge(hijo(raiz, CFDI_40, 'Emisor'), DEL_EMISOR, campos)
  recoge(hijo(raiz, CFDI_40, 'Receptor'), DEL_RECEPTOR, campos)
  recogeImpuestos(hijo(raiz, CFDI_40, 'Impuestos'), campos)

  const nodoConceptos = hijo(raiz, CFDI_40, 'Conceptos')
  const conceptos: ConceptoLeido[] =
    nodoConceptos === null
      ? []
      : hijos(nodoConceptos, CFDI_40, 'Concepto').map((nodo, indice) => {
          const suyos: CampoExtraido[] = []
          recoge(nodo, DEL_CONCEPTO, suyos)
          recogeImpuestos(hijo(nodo, CFDI_40, 'Impuestos'), suyos)
          return { indice, campos: suyos }
        })

  const nodoComplemento = hijo(raiz, CFDI_40, 'Complemento')
  const complementos: ComplementosLeidos =
    nodoComplemento === null ? { leidos: [], sinLector: [] } : registro.lee(nodoComplemento)

  const nodoAddenda = hijo(raiz, CFDI_40, 'Addenda')
  const addenda: AddendaPresente | null =
    nodoAddenda === null
      ? null
      : { hijos: nodoAddenda.hijos.map((h) => h.nombreLocal), leida: false }

  const delTimbre = complementos.leidos.flatMap((c) => c.campos)
  const timbrado =
    delTimbre.some((c) => c.clave === 'uuid') ||
    complementos.sinLector.some((c) => c.nombreLocal === 'TimbreFiscalDigital')

  // `CfdiRelacionados` e `InformacionGlobal` caen aqui hoy, y cualquier elemento o atributo que el
  // SAT anada manana tambien: declarado en vez de desaparecido, que es la unica forma de enterarse
  // sin leer la norma cada trimestre.
  const noLeido = sinTraducir(raiz)

  return {
    esCfdi: true,
    motivo: null,
    version,
    tipoDeComprobante: atributo(raiz, 'TipoDeComprobante'),
    campos,
    conceptos,
    complementos,
    addenda,
    noLeido,
    sello: {
      emisor: atributo(raiz, 'Sello'),
      sat: delTimbre.find((c) => c.clave === 'sello_sat')?.valor ?? null,
      verificado: false,
    },
    timbrado,
  }
}

/**
 * Los campos del tronco MAS los de los complementos leidos, en una sola lista.
 *
 * Es lo que se le pasa a `corrobora` para cotear el XML contra el codigo impreso y contra el
 * reconocimiento del PDF. El identificador unico vive en el timbre, asi que sin esta union el
 * cotejo se quedaria sin el campo mas importante.
 */
export function camposParaCotejo(lectura: LecturaDeCfdi): readonly CampoExtraido[] {
  return [...lectura.campos, ...lectura.complementos.leidos.flatMap((c) => c.campos)]
}

/**
 * Cotea el sello contra los ocho caracteres que lleva el codigo impreso del SAT.
 *
 * Va aparte de `corrobora` a proposito, y por dos motivos independientes: el codigo trae solo el
 * final del sello, y `corrobora` pliega mayusculas antes de comparar. Lo segundo es correcto para
 * un registro fiscal y falso para base64 — dejaria pasar por identicos dos sellos que difieren en
 * el caso de una letra, y el sello es justo el campo que existe para detectar una sustitucion.
 */
export function cotejaSelloConQr(selloDelXml: string | null, finalDelQr: string | null): boolean {
  if (selloDelXml === null || finalDelQr === null) return false
  const recortado = finalDelQr.trim()
  if (recortado.length === 0) return false
  return selloDelXml.trim().endsWith(recortado)
}

/**
 * Un aviso en espanol sobre lo que quedo sin leer, o `null` si no quedo nada.
 *
 * El caso de tipo `P` merece su propio parrafo. Un recibo de pago lleva `Total="0"`: TODO el dinero
 * esta en el complemento. Un lector que solo lea el tronco produce un registro de cero pesos con
 * apariencia de exacto, que es la clase de fallo que la capa cero describe como incomparablemente
 * peor que el contrario.
 */
export function avisoDelComprobante(lectura: LecturaDeCfdi): string | null {
  const avisos: string[] = []

  if (lectura.esCfdi && !lectura.timbrado) {
    avisos.push(
      'Este comprobante NO trae timbre fiscal: no esta timbrado, o le quitaron el complemento. ' +
        'Sin timbre no tiene identificador unico y el SAT no lo reconoce como emitido.',
    )
  }

  const sinLeer = lectura.complementos.sinLector
  if (sinLeer.length > 0) {
    const nombres = sinLeer.map((c) => `"${c.nombreLocal}" (${c.motivo})`).join('; ')
    const critico = lectura.tipoDeComprobante === 'P' || lectura.tipoDeComprobante === 'N'
    avisos.push(
      critico
        ? `Este comprobante es de tipo ${lectura.tipoDeComprobante} y sus importes viven en un complemento que NO se leyo: ${nombres}. Lo que aqui figura como total no es lo que se pago.`
        : `Trae ${sinLeer.length} complemento(s) que no se leyeron: ${nombres}. Sus datos NO estan en el resultado.`,
    )
  }

  if (lectura.noLeido.length > 0) {
    avisos.push(
      `El comprobante trae ${lectura.noLeido.join(', ')} en su tronco, y este lector no lo traduce. ` +
        'Sus datos NO estan en el resultado.',
    )
  }

  if (lectura.addenda !== null) {
    avisos.push(
      `Trae una addenda con ${lectura.addenda.hijos.length} elemento(s). No tiene esquema del SAT ` +
        'y no se convierte en campos: la define el receptor, y solo el proyecto sabe que hay ahi.',
    )
  }

  return avisos.length === 0 ? null : avisos.join(' ')
}
