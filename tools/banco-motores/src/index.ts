/**
 * Banco de motores: la idea de Gradio, sin Gradio. Declaras una función con su esquema Zod y salen solas su
 * pantalla de bloques etiquetados (la pinta la app) y su ruta API. Núcleo puro: sin React, sin Next, sin Node.
 */
export type {
  Bloque, ContextoDeEjecucion, Descriptor, Ejemplo, EtapaDeFallo, Funcion, FuncionDeBanco, Problema, Resultado, TipoBloque,
} from './tipos.js';
export { describeEsquema, esquemaJson, humaniza } from './esquema.js';
export { defineFuncion, ejecuta, mensajeSeguro, problemasDe, type OpcionesDeEjecucion } from './ejecuta.js';
export { creaApi, describeFuncion, type OpcionesDeApi } from './api.js';
export { campoArchivo, campoAudio, campoImagen, bytesDeDataUrl } from './campos.js';
export { ETIQUETA_DE_ESTADO, resumeCasos, type CasoCorridoVisible, type CasoVisible, type EstadoDeCaso, type ResultadoVisible } from './casos.js';
export { FAMILIAS, catalogoDePeorCaso, peorCaso, type DatoDePeorCaso, type Familia } from './peor-caso.js';
