/**
 * Complemento de Comercio Exterior 2.0: el que acompana a una factura de EXPORTACION.
 *
 * POR QUE IMPORTA. En una exportacion el tronco del CFDI dice el total en pesos y poco mas; lo
 * que la aduana y el comprador extranjero necesitan vive aqui: la clave de pedimento, el
 * INCOTERM, el tipo de cambio y el total en dolares, el registro fiscal del receptor en su pais,
 * y la lista de mercancias con su fraccion arancelaria y su valor en dolares. Sin este lector,
 * una factura de exportacion entra como una factura nacional a la que le faltan datos, y nadie
 * ve que faltan.
 *
 * ESTRUCTURA (del XSD publicado por el SAT, `ComercioExterior20.xsd`, `targetNamespace`
 * `http://www.sat.gob.mx/ComercioExterior20`, leido el 2026-09-12):
 *
 *   ComercioExterior @Version="2.0" @ClaveDePedimento @CertificadoOrigen @TipoCambioUSD @TotalUSD
 *                    [@MotivoTraslado @NumCertificadoOrigen @NumeroExportadorConfiable @Incoterm @Observaciones]
 *     Emisor? [@Curp]            → Domicilio (1)
 *     Propietario* @NumRegIdTrib @ResidenciaFiscal
 *     Receptor? [@NumRegIdTrib]  → Domicilio?
 *     Destinatario* [@NumRegIdTrib @Nombre] → Domicilio+
 *     Mercancias → Mercancia+ @NoIdentificacion @ValorDolares [@FraccionArancelaria @CantidadAduana @UnidadAduana @ValorUnitarioAduana]
 *                    → DescripcionesEspecificas* @Marca [@Modelo @SubModelo @NumeroSerie]
 *
 * ESTADO DE LA EVIDENCIA: escrito contra el esquema oficial, NO verificado contra una factura de
 * exportacion real. Es la misma distincion que marca `espacios.ts` para pagos. El comprobador
 * de deriva (`medicion/deriva.mjs`) coteja este inventario contra el XSD publicado.
 *
 * Las listas (propietarios, destinatarios, mercancias, descripciones) van con clave numerada,
 * como en pagos: aplanarlas sin indice haria que la ultima mercancia pisara a las demas.
 */
import type { CampoExtraido } from '../../tipos.js'
import type { Elemento } from '../arbol.js'
import { atributo, hijo, hijos } from '../arbol.js'
import type { LectorDeComplemento } from '../registro.js'
import { COMERCIO_EXTERIOR_20 } from './espacios.js'

const DE_LA_RAIZ: readonly (readonly [string, string])[] = [
  ['MotivoTraslado', 'motivo_traslado'],
  ['ClaveDePedimento', 'clave_de_pedimento'],
  ['CertificadoOrigen', 'certificado_origen'],
  ['NumCertificadoOrigen', 'num_certificado_origen'],
  ['NumeroExportadorConfiable', 'numero_exportador_confiable'],
  ['Incoterm', 'incoterm'],
  ['Observaciones', 'observaciones'],
  ['TipoCambioUSD', 'tipo_cambio_usd'],
  ['TotalUSD', 'total_usd'],
]

const DEL_DOMICILIO: readonly (readonly [string, string])[] = [
  ['Calle', 'calle'],
  ['NumeroExterior', 'numero_exterior'],
  ['NumeroInterior', 'numero_interior'],
  ['Colonia', 'colonia'],
  ['Localidad', 'localidad'],
  ['Referencia', 'referencia'],
  ['Municipio', 'municipio'],
  ['Estado', 'estado'],
  ['Pais', 'pais'],
  ['CodigoPostal', 'codigo_postal'],
]

const DEL_PROPIETARIO: readonly (readonly [string, string])[] = [
  ['NumRegIdTrib', 'num_reg_id_trib'],
  ['ResidenciaFiscal', 'residencia_fiscal'],
]

const DEL_DESTINATARIO: readonly (readonly [string, string])[] = [
  ['NumRegIdTrib', 'num_reg_id_trib'],
  ['Nombre', 'nombre'],
]

const DE_LA_MERCANCIA: readonly (readonly [string, string])[] = [
  ['NoIdentificacion', 'no_identificacion'],
  ['FraccionArancelaria', 'fraccion_arancelaria'],
  ['CantidadAduana', 'cantidad_aduana'],
  ['UnidadAduana', 'unidad_aduana'],
  ['ValorUnitarioAduana', 'valor_unitario_aduana'],
  ['ValorDolares', 'valor_dolares'],
]

const DE_LA_DESCRIPCION: readonly (readonly [string, string])[] = [
  ['Marca', 'marca'],
  ['Modelo', 'modelo'],
  ['SubModelo', 'submodelo'],
  ['NumeroSerie', 'numero_serie'],
]

/**
 * Se comparan por igualdad exacta, nunca por parecido. Un numero de registro fiscal extranjero,
 * un numero de serie o una clave de producto que difieren en un caracter son cosas distintas.
 * La fraccion arancelaria tambien: es un codigo de catalogo, no un texto.
 */
const SON_IDENTIFICADOR = new Set([
  'num_reg_id_trib',
  'num_certificado_origen',
  'numero_exportador_confiable',
  'no_identificacion',
  'fraccion_arancelaria',
  'numero_serie',
  'clave_de_pedimento',
])

function recoge(nodo: Elemento, tabla: readonly (readonly [string, string])[], prefijo: string, destino: CampoExtraido[]): void {
  for (const [delSat, sufijo] of tabla) {
    const valor = atributo(nodo, delSat)
    if (valor === null) continue
    const campo: CampoExtraido = { clave: prefijo === '' ? sufijo : `${prefijo}_${sufijo}`, valor, confianza: 1, procedencia: 'xml' }
    if (SON_IDENTIFICADOR.has(sufijo)) campo.formato = 'identificador'
    destino.push(campo)
  }
}

/** Lo que este lector mapea, para el comprobador de deriva. Aqui SI se mapea todo el esquema. */
export const INVENTARIO_COMERCIO_EXTERIOR: Readonly<Record<string, readonly string[]>> = {
  ComercioExterior: ['Version', ...DE_LA_RAIZ.map(([delSat]) => delSat)],
  Emisor: ['Curp'],
  Domicilio: DEL_DOMICILIO.map(([delSat]) => delSat),
  Propietario: DEL_PROPIETARIO.map(([delSat]) => delSat),
  Receptor: ['NumRegIdTrib'],
  Destinatario: DEL_DESTINATARIO.map(([delSat]) => delSat),
  Mercancias: [],
  Mercancia: DE_LA_MERCANCIA.map(([delSat]) => delSat),
  DescripcionesEspecificas: DE_LA_DESCRIPCION.map(([delSat]) => delSat),
}

export const lectorDeComercioExterior20: LectorDeComplemento = {
  clave: { espacio: COMERCIO_EXTERIOR_20, nombreLocal: 'ComercioExterior', version: '2.0' },
  nombre: 'Complemento de comercio exterior 2.0',

  lee(nodo: Elemento) {
    const campos: CampoExtraido[] = []
    const noLeido = new Set<string>()

    /** Un atributo que el esquema no anticipa se declara: no se pierde en silencio. */
    const declara = (elemento: Elemento, cuales: readonly string[]): void => {
      const conocidos = new Set(cuales)
      for (const a of elemento.atributos) {
        if (a.espacio === null && !conocidos.has(a.nombreLocal)) noLeido.add(`${elemento.nombreLocal}/@${a.nombreLocal}`)
      }
    }
    const domicilio = (padre: Elemento, prefijo: string): void => {
      hijos(padre, COMERCIO_EXTERIOR_20, 'Domicilio').forEach((d, i, todos) => {
        const clave = todos.length > 1 ? `${prefijo}_domicilio_${i + 1}` : `${prefijo}_domicilio`
        recoge(d, DEL_DOMICILIO, clave, campos)
        declara(d, INVENTARIO_COMERCIO_EXTERIOR['Domicilio'])
      })
    }

    recoge(nodo, DE_LA_RAIZ, '', campos)
    declara(nodo, INVENTARIO_COMERCIO_EXTERIOR['ComercioExterior'])

    const emisor = hijo(nodo, COMERCIO_EXTERIOR_20, 'Emisor')
    if (emisor !== null) {
      recoge(emisor, [['Curp', 'curp']], 'emisor', campos)
      declara(emisor, INVENTARIO_COMERCIO_EXTERIOR['Emisor'])
      domicilio(emisor, 'emisor')
    }

    hijos(nodo, COMERCIO_EXTERIOR_20, 'Propietario').forEach((p, i) => {
      recoge(p, DEL_PROPIETARIO, `propietario_${i + 1}`, campos)
      declara(p, INVENTARIO_COMERCIO_EXTERIOR['Propietario'])
    })

    const receptor = hijo(nodo, COMERCIO_EXTERIOR_20, 'Receptor')
    if (receptor !== null) {
      recoge(receptor, [['NumRegIdTrib', 'num_reg_id_trib']], 'receptor', campos)
      declara(receptor, INVENTARIO_COMERCIO_EXTERIOR['Receptor'])
      domicilio(receptor, 'receptor')
    }

    hijos(nodo, COMERCIO_EXTERIOR_20, 'Destinatario').forEach((d, i) => {
      const prefijo = `destinatario_${i + 1}`
      recoge(d, DEL_DESTINATARIO, prefijo, campos)
      declara(d, INVENTARIO_COMERCIO_EXTERIOR['Destinatario'])
      domicilio(d, prefijo)
    })

    const mercancias = hijo(nodo, COMERCIO_EXTERIOR_20, 'Mercancias')
    const lista = mercancias === null ? [] : hijos(mercancias, COMERCIO_EXTERIOR_20, 'Mercancia')
    if (mercancias !== null) declara(mercancias, INVENTARIO_COMERCIO_EXTERIOR['Mercancias'])
    // El conteo va siempre, tambien a cero: una exportacion sin mercancias es un dato, no un hueco.
    campos.push({ clave: 'numero_de_mercancias', valor: String(lista.length), confianza: 1, procedencia: 'xml' })
    lista.forEach((m, i) => {
      const prefijo = `mercancia_${i + 1}`
      recoge(m, DE_LA_MERCANCIA, prefijo, campos)
      declara(m, INVENTARIO_COMERCIO_EXTERIOR['Mercancia'])
      hijos(m, COMERCIO_EXTERIOR_20, 'DescripcionesEspecificas').forEach((e, j) => {
        recoge(e, DE_LA_DESCRIPCION, `${prefijo}_descripcion_${j + 1}`, campos)
        declara(e, INVENTARIO_COMERCIO_EXTERIOR['DescripcionesEspecificas'])
      })
    })

    return { campos, noLeido: [...noLeido] }
  },
}
