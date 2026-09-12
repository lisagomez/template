/**
 * Lectura de XML, y el CFDI 4.0 como primer esquema. TypeScript puro, CERO dependencias.
 *
 * Va en su propio subpath y no en el nucleo por una razon de vocabulario, no de peso: "esto es un
 * XML" es generico y vive en el nucleo, pero las direcciones del SAT no lo son. Un proyecto de
 * otro pais que instale la herramienta no tiene por que encontrarse `http://www.sat.gob.mx/cfd/4`
 * en su import raiz.
 *
 * Los lectores de complemento NO tienen un subpath cada uno, y eso es deliberado. Un subpath
 * existe cuando importarlo COMPROMETE al consumidor a algo: una dependencia, una salida de red, un
 * tiempo de ejecucion. Por eso lo tiene el motor de un proveedor. Un lector de complemento es puro
 * y no compromete a nada, y lo que hace que un proyecto pague solo por lo que usa no es el subpath
 * sino el registro: nada se registra por defecto.
 *
 * Como se usa:
 *
 *     import { leeCfdi40, registroDeEsquemas, lectorDeTimbre11 } from '@tu-scope/extractor-documental/xml'
 *
 *     const registro = registroDeEsquemas([lectorDeTimbre11])
 *     const lectura = leeCfdi40(bytes, registro)
 */

export { analizaLexico, decodificaEntidades } from './lexico.js'
export type { Pieza, AtributoCrudo } from './lexico.js'

export { analizaXml, hijo, hijos, atributo, atributoConEspacio } from './arbol.js'
export type { Elemento, Atributo, DocumentoXml } from './arbol.js'

export { registroDeEsquemas, avisoDeComplementos } from './registro.js'
export type {
  ClaveDeEsquema,
  LectorDeComplemento,
  LecturaDeComplemento,
  ComplementoLeido,
  ComplementoSinLector,
  ComplementosLeidos,
  RegistroDeEsquemas,
} from './registro.js'

export { CFDI_40, TIMBRE_11, PAGOS_20, COMERCIO_EXTERIOR_20, CARTA_PORTE_31, NOMINA_12, IMPUESTOS_LOCALES_10, LEYENDAS_FISCALES_10, DONATARIAS_11, SIN_LECTOR, nombreDelEsquema } from './cfdi/espacios.js'

export {
  leeCfdi40,
  camposParaCotejo,
  cotejaSelloConQr,
  avisoDelComprobante,
} from './cfdi/comprobante-40.js'
export type {
  LecturaDeCfdi,
  ConceptoLeido,
  AddendaPresente,
  SelloDelComprobante,
} from './cfdi/comprobante-40.js'

export { lectorDeTimbre11, INVENTARIO_TIMBRE } from './cfdi/timbre-11.js'
export { lectorDePagos20, INVENTARIO_PAGOS } from './cfdi/pagos-20.js'
export { lectorDeComercioExterior20, INVENTARIO_COMERCIO_EXTERIOR } from './cfdi/comercio-exterior-20.js'
export { lectorDeCartaPorte31, INVENTARIO_CARTA_PORTE } from './cfdi/carta-porte-31.js'
export { lectorDeNomina12, INVENTARIO_NOMINA, CLAVES_SENSIBLES_NOMINA, PREFIJOS_SENSIBLES_NOMINA } from './cfdi/nomina-12.js'
export { lectorDeImpuestosLocales10, INVENTARIO_IMPUESTOS_LOCALES, lectorDeLeyendasFiscales10, INVENTARIO_LEYENDAS_FISCALES, lectorDeDonatarias11, INVENTARIO_DONATARIAS } from './cfdi/menores.js'
export { lectorDeArbol, inventarioDe, claveDeAtributo } from './cfdi/lector-de-arbol.js'
export type { Rama, OpcionesDeLectorDeArbol } from './cfdi/lector-de-arbol.js'
export { INVENTARIO, OMITIDOS } from './cfdi/inventario.js'
