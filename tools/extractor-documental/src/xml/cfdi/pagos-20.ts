/**
 * Complemento de recepcion de pagos 2.0 — el lector de REFERENCIA del registro.
 *
 * Esta aqui por dos motivos, y ninguno es que sea un ejemplo bonito.
 *
 * EL PRIMERO: sin el, un recibo de pago es una falsedad silenciosa. Un comprobante de tipo `P`
 * lleva `Total="0"` en el tronco, porque TODO el dinero vive en este complemento. Un lector que
 * solo leyera el tronco produciria un registro de cero pesos con apariencia de exacto, que es la
 * clase de fallo que la capa cero describe como incomparablemente peor que el contrario: no rompe
 * nada, no avisa de nada, y descuadra la cuenta de un proveedor que no participo en el error.
 *
 * EL SEGUNDO: estructuralmente es el mas exigente de los complementos comunes. Tiene un nodo de
 * totales, una lista de pagos, y dentro de cada pago otra lista de documentos relacionados. Si el
 * mecanismo del registro aguanta esto, aguanta los demas; probado solo contra el timbre, que es
 * plano, no habria demostrado nada.
 *
 * ESTADO DE LA EVIDENCIA: escrito contra la norma publicada, NO verificado contra un recibo real.
 * Es la misma distincion que marca `espacios.ts`, y aqui vale doble porque los nombres de atributo
 * de este complemento son largos y se parecen entre si. El dia que haya un REP de verdad, esto es
 * lo primero que hay que cotear.
 */
import type { CampoExtraido } from '../../tipos.js'
import type { Elemento } from '../arbol.js'
import { atributo, hijo, hijos } from '../arbol.js'
import type { LectorDeComplemento } from '../registro.js'
import { PAGOS_20 } from './espacios.js'

const DEL_PAGO: readonly (readonly [string, string])[] = [
  ['FechaPago', 'fecha'],
  ['FormaDePagoP', 'forma'],
  ['MonedaP', 'moneda'],
  ['TipoCambioP', 'tipo_cambio'],
  ['Monto', 'monto'],
  ['NumOperacion', 'num_operacion'],
  ['RfcEmisorCtaOrd', 'rfc_emisor_cuenta_ordenante'],
  ['CtaOrdenante', 'cuenta_ordenante'],
  ['RfcEmisorCtaBen', 'rfc_emisor_cuenta_beneficiaria'],
  ['CtaBeneficiario', 'cuenta_beneficiaria'],
]

const DEL_DOCUMENTO: readonly (readonly [string, string])[] = [
  ['IdDocumento', 'id_documento'],
  ['Serie', 'serie'],
  ['Folio', 'folio'],
  ['MonedaDR', 'moneda'],
  ['EquivalenciaDR', 'equivalencia'],
  ['NumParcialidad', 'num_parcialidad'],
  ['ImpSaldoAnt', 'imp_saldo_anterior'],
  ['ImpPagado', 'imp_pagado'],
  ['ImpSaldoInsoluto', 'imp_saldo_insoluto'],
  ['ObjetoImpDR', 'objeto_imp'],
]

/** Se comparan por igualdad exacta. `id_documento` es el identificador de la factura pagada. */
const SON_IDENTIFICADOR = new Set([
  'id_documento',
  'serie',
  'folio',
  'num_operacion',
  'rfc_emisor_cuenta_ordenante',
  'rfc_emisor_cuenta_beneficiaria',
])

function recoge(
  nodo: Elemento,
  tabla: readonly (readonly [string, string])[],
  prefijo: string,
  destino: CampoExtraido[],
): void {
  for (const [delSat, sufijo] of tabla) {
    const valor = atributo(nodo, delSat)
    if (valor === null) continue
    const campo: CampoExtraido = {
      // Las claves van numeradas porque un recibo puede saldar varias facturas. Aplanarlas sin
      // indice haria que el ultimo documento pisara a los anteriores y el importe que quedara
      // fuera el de uno cualquiera, sin que nada lo indicara.
      clave: `${prefijo}_${sufijo}`,
      valor,
      confianza: 1,
      procedencia: 'xml',
    }
    if (SON_IDENTIFICADOR.has(sufijo)) campo.formato = 'identificador'
    destino.push(campo)
  }
}

/**
 * Lo que este lector VE y decide no traducir: el desglose de impuestos, que tiene su propia forma
 * anidada y no se necesita para saber cuanto se pago.
 *
 * Se declara en vez de callarse. Es la misma regla que sostiene el registro entero, aplicada
 * dentro de un lector: quien mire el resultado tiene que poder ver que hay mas en el documento.
 */
const NO_TRADUCIDOS = ['ImpuestosP', 'ImpuestosDR']

/**
 * Lo que este lector mapea, para el comprobador de deriva.
 *
 * Va a salir CORTO contra el esquema, y esta bien que se vea: de este complemento solo se traduce
 * lo que dice cuanto se pago y contra que factura. El desglose de impuestos y los datos de banca
 * quedan fuera a proposito, y el comprobador los listara uno a uno en vez de dejarlos invisibles.
 */
export const INVENTARIO_PAGOS: Readonly<Record<string, readonly string[]>> = {
  Pagos: ['Version'],
  Totales: ['MontoTotalPagos'],
  Pago: DEL_PAGO.map(([delSat]) => delSat),
  DoctoRelacionado: DEL_DOCUMENTO.map(([delSat]) => delSat),
}

export const lectorDePagos20: LectorDeComplemento = {
  clave: { espacio: PAGOS_20, nombreLocal: 'Pagos', version: '2.0' },
  nombre: 'Complemento de pagos 2.0',

  lee(nodo: Elemento) {
    const campos: CampoExtraido[] = []
    const noLeido = new Set<string>()

    /**
     * Lo que este lector VE en un nodo y no traduce.
     *
     * Sin esto, los diez desgloses de impuesto de `Totales` y los cinco datos de banca de `Pago`
     * desaparecian en silencio, que es exactamente el agujero que el tronco ya se comio una vez.
     * No se mapean a ciegas —este complemento aun no ha pasado por un recibo real— pero perderlos
     * sin decirlo es otra cosa.
     */
    const declara = (elemento: Elemento, cuales: readonly string[]): void => {
      const conocidos = new Set(cuales)
      for (const atributo of elemento.atributos) {
        if (atributo.espacio === null && !conocidos.has(atributo.nombreLocal)) {
          noLeido.add(`${elemento.nombreLocal}/@${atributo.nombreLocal}`)
        }
      }
    }
    declara(nodo, INVENTARIO_PAGOS['Pagos'])

    // El monto total de los pagos: para un comprobante de tipo `P` este es EL importe, y el
    // `Total` del tronco vale cero.
    const totales = hijo(nodo, PAGOS_20, 'Totales')
    if (totales !== null) {
      declara(totales, INVENTARIO_PAGOS['Totales'])
      const monto = atributo(totales, 'MontoTotalPagos')
      if (monto !== null) {
        campos.push({
          clave: 'monto_total_pagos',
          valor: monto,
          confianza: 1,
          procedencia: 'xml',
        })
      }
    }

    const pagos = hijos(nodo, PAGOS_20, 'Pago')
    campos.push({
      clave: 'numero_de_pagos',
      valor: String(pagos.length),
      confianza: 1,
      procedencia: 'xml',
    })

    pagos.forEach((pago, i) => {
      const dePago = `pago_${i + 1}`
      recoge(pago, DEL_PAGO, dePago, campos)
      declara(pago, INVENTARIO_PAGOS['Pago'])

      hijos(pago, PAGOS_20, 'DoctoRelacionado').forEach((documento, j) => {
        recoge(documento, DEL_DOCUMENTO, `${dePago}_docto_${j + 1}`, campos)
        declara(documento, INVENTARIO_PAGOS['DoctoRelacionado'])
        for (const nombre of NO_TRADUCIDOS) {
          if (hijo(documento, PAGOS_20, nombre) !== null) noLeido.add(nombre)
        }
      })

      for (const nombre of NO_TRADUCIDOS) {
        if (hijo(pago, PAGOS_20, nombre) !== null) noLeido.add(nombre)
      }
    })

    return { campos, noLeido: [...noLeido] }
  },
}
