/**
 * Contenido: brief de 30 días (empujar, mantener, reposicionar, temporada, ofertas), calendario vivo
 * con reuso por canal y textos en la voz del dueño, y la imagen generada por código con su marca.
 * Todo en borrador: aprobar no publica.
 */
export { estrategiaDe30Dias, briefEnTexto, type EstrategiaDe30Dias, type Empuje, type Reposicion, type Temporada, type Oferta } from './estrategia.js';
export { calendarioDe30Dias, extiendeCalendario, estadoDelCalendario, marcaFila, describeFila, DIAS_POR_CADENCIA, type FilaDeCalendario, type Canal, type Angulo, type Cadencia, type OpcionesDeCalendario } from './calendario.js';
export { piezaSvg, piezaComoDataUrl, type DatosDePieza, type FormatoDePieza } from './pieza-svg.js';
