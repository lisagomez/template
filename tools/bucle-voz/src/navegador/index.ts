/**
 * Punto de entrada del navegador: el reproductor por `<audio>` nativo. El micrófono y el detector
 * los pone `@tu-scope/voz/browser` (`capturaMicrofono`, `creaDetectorVoz`); el pegamento entre los
 * dos es `creaOido`, del núcleo.
 */
export { creaReproductorNavegador, type OpcionesReproductorNavegador, type ReproductorNavegador } from './reproductor.js';
export { hablaConDispositivo, mejorVozLocal, SinVozLocal, type VozDispositivo } from './voz-dispositivo.js';
