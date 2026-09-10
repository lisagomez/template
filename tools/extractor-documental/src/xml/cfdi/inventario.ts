/**
 * QUE SABE MAPEAR ESTE LECTOR, declarado como dato.
 *
 * Vive aparte del lector a proposito. Las tablas de aqui contestan "que conocemos"; `comprobante-40`
 * contesta "como se lee". Separarlas es lo que permite que un tercero —`medicion/deriva.mjs`—
 * compare lo primero contra el esquema publicado del SAT sin arrastrar nada del segundo.
 *
 * Es la idea de `ESPEJO_DE_LA_MIGRACION` del banco de pruebas: una traduccion a mano diverge sola,
 * asi que se declara y se compara contra la fuente. La diferencia, y decide el diseno: aquella
 * fuente es un fichero SQL del repositorio, y esta vive FUERA del perimetro, en la red. Por eso
 * quien compara es un script que se ejecuta a mano, y nunca este modulo ni el lector.
 */
import type { Elemento } from '../arbol.js'

export const DEL_COMPROBANTE: readonly (readonly [string, string])[] = [
  ['Version', 'version'],
  ['Serie', 'serie'],
  ['Folio', 'folio'],
  ['Fecha', 'fecha'],
  ['FormaPago', 'forma_pago'],
  ['MetodoPago', 'metodo_pago'],
  ['CondicionesDePago', 'condiciones_de_pago'],
  ['Moneda', 'moneda'],
  ['TipoCambio', 'tipo_cambio'],
  ['SubTotal', 'subtotal'],
  ['Descuento', 'descuento'],
  ['Total', 'total'],
  ['TipoDeComprobante', 'tipo_de_comprobante'],
  ['Exportacion', 'exportacion'],
  ['LugarExpedicion', 'lugar_expedicion'],
  ['NoCertificado', 'no_certificado_emisor'],
  // Lo trae un comprobante cuyo importe o fecha caen fuera del rango que el certificador
  // admite sin mas: sin el, ese comprobante no se pudo timbrar de forma ordinaria.
  ['Confirmacion', 'confirmacion'],
  // `Certificado` NO se lee, y no es un olvido. Ese atributo lleva el X.509 entero en base64, y
  // dentro van el nombre completo, el correo y los identificadores fiscales de quien firma. Se
  // extrae su NUMERO, que es lo que identifica sin exponer nada: para saber con que certificado
  // se firmo basta el numero, y volcar el certificado seria sacar datos personales a un campo
  // que despues viaja a una base, a un CSV y a la pantalla de cualquiera que revise.
]

export const DEL_EMISOR: readonly (readonly [string, string])[] = [
  ['Rfc', 'rfc_emisor'],
  ['Nombre', 'nombre_emisor'],
  ['RegimenFiscal', 'regimen_fiscal_emisor'],
  // Factura emitida por cuenta del adquirente: quien emite no es quien vende.
  ['FacAtrAdquirente', 'fac_atr_adquirente'],
]

export const DEL_RECEPTOR: readonly (readonly [string, string])[] = [
  ['Rfc', 'rfc_receptor'],
  ['Nombre', 'nombre_receptor'],
  ['DomicilioFiscalReceptor', 'domicilio_fiscal_receptor'],
  ['RegimenFiscalReceptor', 'regimen_fiscal_receptor'],
  ['UsoCFDI', 'uso_cfdi'],
  // Los dos de un receptor extranjero. Sin ellos, una factura de exportacion pierde
  // justo lo que la distingue de una nacional.
  ['ResidenciaFiscal', 'residencia_fiscal_receptor'],
  ['NumRegIdTrib', 'num_reg_id_trib_receptor'],
]

export const DEL_CONCEPTO: readonly (readonly [string, string])[] = [
  ['ClaveProdServ', 'clave_prod_serv'],
  ['NoIdentificacion', 'no_identificacion'],
  ['Cantidad', 'cantidad'],
  ['ClaveUnidad', 'clave_unidad'],
  ['Unidad', 'unidad'],
  ['Descripcion', 'descripcion'],
  ['ValorUnitario', 'valor_unitario'],
  ['Importe', 'importe'],
  ['Descuento', 'descuento'],
  ['ObjetoImp', 'objeto_imp'],
]

export const DEL_TRASLADO: readonly (readonly [string, string])[] = [
  ['Base', 'base'],
  ['Impuesto', 'impuesto'],
  ['TipoFactor', 'tipo_factor'],
  ['TasaOCuota', 'tasa_o_cuota'],
  ['Importe', 'importe'],
]

const nombres = (tabla: readonly (readonly [string, string])[]): readonly string[] =>
  tabla.map(([delSat]) => delSat)

/**
 * QUE MAPEA ESTE LECTOR, declarado como DATO y no como lista aparte.
 *
 * Es la idea de `ESPEJO_DE_LA_MIGRACION`: una traduccion a mano diverge sola, asi que se declara y
 * se compara contra la fuente. Aqui la fuente es el esquema publicado del SAT, que vive FUERA del
 * perimetro — por eso quien compara es `medicion/deriva.mjs`, a mano y con red, y no este modulo,
 * que no sale a la red nunca.
 *
 * Se construye de las mismas tablas que usa la lectura, a proposito: un inventario escrito aparte
 * seria justo la segunda copia que esto existe para evitar.
 *
 * Un nombre con lista vacia es un CONTENEDOR: se reconoce, y no tiene atributos que traducir.
 */
export const INVENTARIO: Readonly<Record<string, readonly string[]>> = {
  Comprobante: [...nombres(DEL_COMPROBANTE), 'Sello'],
  Emisor: nombres(DEL_EMISOR),
  Receptor: nombres(DEL_RECEPTOR),
  Conceptos: [],
  Concepto: nombres(DEL_CONCEPTO),
  Impuestos: ['TotalImpuestosTrasladados', 'TotalImpuestosRetenidos'],
  Traslados: [],
  Traslado: nombres(DEL_TRASLADO),
  Retenciones: [],
  Retencion: nombres(DEL_TRASLADO),
  Complemento: [],
  Addenda: [],
}

/**
 * Lo que el lector VE y omite a proposito. No es deriva: es decision, y por eso se separa.
 *
 * `Certificado` lleva el X.509 entero, con el nombre, el correo y los identificadores fiscales de
 * quien firma. Se lee su NUMERO, que identifica sin exponer nada.
 */
export const OMITIDOS: Readonly<Record<string, readonly string[]>> = {
  Comprobante: ['Certificado'],
}

const CONOCIDOS: Readonly<Record<string, ReadonlySet<string>>> = Object.fromEntries(
  Object.entries(INVENTARIO).map(([elemento, atributos]) => [
    elemento,
    new Set([...atributos, ...(OMITIDOS[elemento] ?? [])]),
  ]),
)

/** No se baja aqui dentro: el complemento es del registro, y la addenda no se interpreta. */
const NO_SE_RECORRE = new Set(['Complemento', 'Addenda'])

/**
 * Todo lo que el lector VIO en el tronco y no traduce: elementos y ATRIBUTOS.
 *
 * Los atributos costaron un agujero propio. Cuando un CFDI real destapo que el bloque de impuestos
 * se perdia entero, se arreglo para los ELEMENTOS y quedo abierto para los atributos: un atributo
 * que el SAT anadiera manana seguia desapareciendo en silencio. Es la misma regla, y no vale a
 * medias — que es la forma en que estos huecos sobreviven a su propio arreglo.
 *
 * De un elemento desconocido NO se baja a sus hijos: si el padre ya esta declarado, listar tambien
 * lo que lleva dentro es ruido que entierra la senal.
 */
export function sinTraducir(raiz: Elemento): readonly string[] {
  const salida = new Set<string>()
  const pila: Elemento[] = [raiz]
  while (pila.length > 0) {
    const nodo = pila.pop() as Elemento
    const conocidos = CONOCIDOS[nodo.nombreLocal]
    if (conocidos === undefined) {
      salida.add(nodo.nombreLocal)
      continue
    }
    for (const atributo of nodo.atributos) {
      // Los atributos CON espacio son fontaneria del esquema (`xsi:schemaLocation` y compania),
      // no datos del comprobante. Declararlos seria gritar en cada documento del mundo.
      if (atributo.espacio === null && !conocidos.has(atributo.nombreLocal)) {
        salida.add(`${nodo.nombreLocal}/@${atributo.nombreLocal}`)
      }
    }
    if (!NO_SE_RECORRE.has(nodo.nombreLocal)) pila.push(...nodo.hijos)
  }
  return [...salida]
}
