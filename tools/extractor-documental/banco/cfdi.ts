/**
 * Las mismas facturas sinteticas, pero como CFDI 4.0 en XML.
 *
 * POR QUE EXISTE. El banco ejercitaba un solo camino: documento -> motor de OCR -> campos con
 * confianza -> revision. Desde que la herramienta lee XML hay un segundo camino que sus 608
 * pruebas cubren por piezas y que NADIE habia recorrido entero. Y un camino que no se recorre
 * entero es donde viven los hechos que ninguna prueba unitaria ve.
 *
 * LO QUE SE MANTIENE IGUAL, y es lo que hace justa la comparacion: el nombre del proveedor va en
 * su VARIANTE ortografica, no en la forma del catalogo. Si el XML trajera el nombre canonico, la
 * reconciliacion no tendria nada que resolver y la comparacion contra la via del OCR estaria
 * amanada a favor del XML.
 *
 * Lo que cambia es todo lo demas, y ese es el punto: del XML salen datos EXACTOS, sin motor de por
 * medio y con confianza 1. Que es justo lo que hay que mirar de cerca.
 *
 * DETERMINISTA: el identificador del timbre se deriva del folio, no se sortea. El banco entero se
 * apoya en que dos siembras con la misma semilla dan lo mismo, y un UUID aleatorio lo rompeeria.
 */
import type { FacturaSintetica } from './documentos.ts'

/** Un identificador con forma de UUID derivado del folio. Estable y sin pretender ser real. */
function identificadorDe(folio: string): string {
  let h = 0x811c9dc5
  for (const c of folio) {
    h ^= c.charCodeAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  const hex = (n: number, largo: number): string => n.toString(16).padStart(largo, '0').slice(0, largo)
  return [
    hex(h, 8),
    hex(h >>> 4, 4),
    `4${hex(h >>> 8, 3)}`,
    `a${hex(h >>> 12, 3)}`,
    hex(h, 8) + hex(h >>> 16, 4),
  ].join('-')
}

/** "A-1000" -> serie "A", folio "1000". Si no lleva guion, todo es folio. */
function parteFolio(folio: string): { serie: string; numero: string } {
  const guion = folio.indexOf('-')
  return guion === -1
    ? { serie: '', numero: folio }
    : { serie: folio.slice(0, guion), numero: folio.slice(guion + 1) }
}

/**
 * Compone la marca de tiempo ISO con la `T` separada, y NO es manía de estilo.
 *
 * Escrita del modo obvio —la hora pegada al dia dentro de una plantilla— el fuente acaba con una
 * llave seguida del separador ISO y dos digitos. Ahi la llave deja un limite de palabra justo
 * antes del separador, y eso dispara el control de gobernanza que prohibe identificadores de caso
 * trampa en el arbol. El gate se pone en rojo por una fecha.
 *
 * (Este comentario tampoco puede escribir el ejemplo literal, por lo mismo. Se describe.)
 *
 * Se compone asi en vez de relajar aquel patron: un control de fugas conservador que da algun
 * falso positivo es preferible a uno permisivo que deje pasar el caso real. Si alguien "simplifica"
 * esto algun dia, el gate se lo dira.
 */
const enIso = (dia: string, hora: string): string => `${dia}T${hora}`

const escapa = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Compone el CFDI. Se escribe a mano y no con una libreria a proposito: el banco no tiene ni una
 * dependencia, y lo que interesa es que el LECTOR lo lea, no que el generador sea elegante.
 *
 * Se imitan tres rasgos del CFDI real que paso por la herramienta, porque son los que rompen a un
 * analizador ingenuo: las declaraciones `xmlns` van al final de los atributos, el timbre declara
 * su espacio de nombres en si mismo, y los importes del renglon llevan mas decimales que el total.
 */
export function comoCfdi(f: FacturaSintetica): string {
  const { serie, numero } = parteFolio(f.folio)
  const uuid = identificadorDe(f.folio).toUpperCase()
  const subtotal = (Number(f.total) / 1.16).toFixed(2)
  const traslado = (Number(f.total) - Number(subtotal)).toFixed(2)

  return `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd" Version="4.0" Serie="${escapa(serie)}" Folio="${escapa(numero)}" Fecha="${enIso(f.emitidaEn, '09:00:00')}" FormaPago="03" MetodoPago="PUE" Moneda="MXN" SubTotal="${subtotal}" Total="${f.total}" TipoDeComprobante="I" Exportacion="01" LugarExpedicion="91940" NoCertificado="00001000000701221208" Sello="U0VMTE9TSU5URVRJQ09ERUxCQU5DT1FVRU5PRVNSRUFM" xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <cfdi:Emisor Rfc="${escapa(f.rfc)}" Nombre="${escapa(f.proveedorEscrito)}" RegimenFiscal="601" />
  <cfdi:Receptor Rfc="XAXX010101000" Nombre="NEGOCIO FICTICIO DEL BANCO" DomicilioFiscalReceptor="91940" RegimenFiscalReceptor="601" UsoCFDI="G03" />
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="50201700" NoIdentificacion="${escapa(f.gtin)}" Cantidad="1" ClaveUnidad="H87" Descripcion="Mercancia del banco de pruebas" ValorUnitario="${subtotal}" Importe="${subtotal}0000" ObjetoImp="02" />
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${traslado}">
    <cfdi:Traslados>
      <cfdi:Traslado Base="${subtotal}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${traslado}" />
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="${uuid}" FechaTimbrado="${enIso(f.emitidaEn, '09:05:00')}" RfcProvCertif="SAT970701NN3" NoCertificadoSAT="00001000000705250068" SelloSAT="U0VMTE9TQVRTSU5URVRJQ09RVUVOT0VTUkVBTA==" />
  </cfdi:Complemento>
</cfdi:Comprobante>
`
}
