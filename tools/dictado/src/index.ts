/**
 * Nucleo de `@tu-scope/dictado`: TypeScript puro, CERO dependencias.
 *
 * Aqui vive todo lo que decide —la maquina de estados, el posproceso, el diccionario, los
 * snippets, los comandos de voz, el historial, el WER— y ni una linea que sepa de ffmpeg, de
 * ONNX, de Python o de Windows. Eso va en `./node`; el transcriptor remoto, en `./remoto`.
 * El VAD lo pone `@tu-scope/voz`: este paquete no detecta voz, la consume.
 */

export type {
  Accion,
  DetectorVoz,
  EventoVoz,
  Limpiador,
  Motor,
  Muestras,
  OpcionesTranscribe,
  Pegador,
  Transcripcion,
  Transcriptor,
  Turno,
} from './types.js';

export { creaDictado, juntaTurnos, type Dictado, type Estado, type EventoDictado, type Modo, type OpcionesDictado } from './dictado.js';
export { creaPosproceso, type OpcionesPosproceso, type Posproceso, type ResultadoPosproceso } from './posproceso.js';
export { creaDiccionario, type Diccionario, type OpcionesDiccionario } from './diccionario.js';
export { creaSnippets, type Snippet, type Snippets } from './snippets.js';
export { aplicaComandos, aplicaComandosDeTexto, extraeAcciones, type Parte, type ResultadoComandos } from './comandos.js';
export { esSoloMuletilla, MULETILLAS_LEXICAS, MULETILLAS_NO_LEXICAS, quitaMuletillas, type ResultadoMuletillas } from './muletillas.js';
export {
  almacenEnMemoria,
  creaHistorial,
  fechaHaceDias,
  type Almacen,
  type EntradaHistorial,
  type EntradaNueva,
  type Historial,
} from './historial.js';
export { formateaActa, formateaTiempo, transcribeLote, type OpcionesLote, type ResultadoLote } from './lote.js';
export { cer, distanciaEdicion, percentil, wer, werAcumulado, type ResultadoWer } from './texto/wer.js';
export { cantidadEn, numerosACifras, parseaCantidad, parseaCantidades, primerNumero, tokenizaNumeros, type Cantidad } from './texto/numeros.js';
export { capitalizaInicio, normalizaParaComparar, quitaAcentos, regexDePalabra, tokeniza } from './texto/normaliza.js';
export { pareceOtroIdioma } from './texto/idioma.js';
export { campo, catalogo, CLAVES, DEFECTOS, ESQUEMA, GRUPOS, ID_MEDIDO, migra, pon, quita, resuelve, serializa, valida, valoresDe, VERSION_AJUSTES, type Ajustes, type AjustesResueltos, type Campo, type Clave, type EntradaCatalogo, type Grupo, type Medicion, type Origen, type Resolucion, type ValorResuelto } from './ajustes.js';
