/**
 * Contenido: brief de 30 días (empujar, mantener, reposicionar, temporada, ofertas), calendario vivo
 * con reuso por canal y textos en la voz del dueño, y la imagen generada por código con su marca.
 * Todo en borrador: aprobar no publica.
 */
export { estrategiaDe30Dias, briefEnTexto, type EstrategiaDe30Dias, type Empuje, type Reposicion, type Temporada, type Oferta } from './estrategia.js';
export { calendarioDe30Dias, extiendeCalendario, estadoDelCalendario, marcaFila, describeFila, DIAS_POR_CADENCIA, type FilaDeCalendario, type Canal, type Angulo, type Cadencia, type OpcionesDeCalendario } from './calendario.js';
export { piezaSvg, piezaComoDataUrl, disposicion, lineasDeTitular, type DatosDePieza, type Disposicion } from './pieza-svg.js';
export { FORMATOS, FORMATO_POR_CANAL, cajaSegura, type Formato, type FormatoDePieza, type CajaSegura } from './formatos.js';
export { revisaPieza, hayProblemas, anchoAproximado, formatoSugerido, type Observacion, type Gravedad, type ContextoDeRevision } from './revision-visual.js';
export { carruselDeTemporada, carruselDePaquete, carruselDeTip, type Carrusel, type Lamina, type OpcionesDeCarrusel } from './carrusel.js';
