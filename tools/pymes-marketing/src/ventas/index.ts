/**
 * Ventas normalizadas: de los CFDI (XML) y los CSV que la pyme ya tiene, a líneas en pesos con su
 * origen auditable, y un resumen para decidir contenido. Para leer los XML:
 *
 *   import { leeCfdi40 } from '@tu-scope/extractor-documental/xml'
 *   import { ventasDesdeCfdi, resumeVentas } from '@tu-scope/pymes-marketing/ventas'
 *   const ventas = ventasDesdeCfdi(xmls.map((x) => leeCfdi40(x)), { rfcPropio: 'EKU9003173C9' })
 */
export { ventasDesdeCfdi } from './cfdi.js';
export { ventasDesdeCsv, juntaVentas } from './csv.js';
export { resumeVentas, PERIODO_DIAS, VENTANA_DIAS, UMBRAL_MOVIMIENTO, type ResumenDeVentas, type ResumenDeProducto, type Metrica } from './resumen.js';
export type { LineaDeVenta, VentasNormalizadas, CfdiLeido, Exclusion } from './tipos.js';
