/**
 * Entry point `./laboratorio`: las trampas, el cotejo contra la verdad plantada, los sucios, la
 * inyección y el replay. Lo usan las pruebas y la página del laboratorio; necesita el lector de
 * CFDI del extractor (inyectado).
 */
export { TRAMPAS, correTrampa, correTrampas, type Trampa, type ResultadoDeTrampa } from './trampas.js';
export { cotejaConLaVerdad, correSucios, replayDeGamma, hechosConInyeccion, CLASES_COTEJADAS, type FilaDeCotejo, type FilaDeSucio } from './cotejo.js';
export { huellasDeCorrida, PREGUNTAS_DEL_REPLAY, type HuellasDeCorrida, type HuellaDeRespuesta } from './replay.js';
export { preparaPyme, construyeDe, gammaConInyeccion, type PymeLista } from './preparacion.js';
