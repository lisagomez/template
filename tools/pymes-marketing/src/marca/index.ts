/**
 * Marca y voz (adaptado de `brand-style` y `shared/voice-profile`). La voz vive en el núcleo
 * porque la usan todas las herramientas; aquí se reexporta para tener la marca completa en un
 * solo import.
 */
export { capturaDeDescripcion, capturaDeSitio, ajustaMarca, confirmaMarca, cssDeMarca, MARCA_POR_DEFECTO, type PerfilDeMarca } from './perfil.js';
export { contraste, luminancia, aclara, asegurarContraste, leeHex, esNeutro, COLORES_ES, type Hex } from './colores.js';
export { construyeVoz, prohibeFrase, revisaContraVoz, VOZ_NEUTRA, type PerfilDeVoz } from '../comun/voz.js';
