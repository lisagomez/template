/**
 * Entry point `./sinteticos`: las dos pymes sintéticas del laboratorio, su libro y la VERDAD
 * PLANTADA. Lo usan las pruebas y el laboratorio; el núcleo nunca lo importa.
 */
export { pymeSintetica, ESPEC_DISTRIBUIDORA, ESPEC_TIENDA, type IdDePyme, type PymeSintetica } from './pymes.js';
export { verdadDelPuente, type VerdadDelPuente } from './verdad.js';
export type { Libro, Plantado, Venta } from './libro.js';
export { comprobanteXml, textoDe, type ComprobanteXml } from './xml.js';
export { variantesSucias, conInyeccion, type VarianteSucia } from './sucio.js';
