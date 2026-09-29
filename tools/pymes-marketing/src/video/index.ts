/**
 * Video corto por código, SIN PERSONAS: escena declarativa → cuadro SVG de cualquier instante →
 * efectos de sonido sintetizados. El render a MP4 (fotografiar cada cuadro y codificar) necesita un
 * navegador sin ventana y ffmpeg: vive FUERA de este paquete, en el proyecto (ver el SDD de generación
 * de contenido). Aquí todo es puro y determinista: misma escena, mismos cuadros, mismo sonido.
 */
export { escenaDePromo, planDeRender, TIPOS_DE_CAPA, type Escena, type Capa, type Animacion, type TipoDeCapa } from './escena.js';
export { cuadroSvg, hojaDeCuadrosSvg } from './cuadro.js';
export { sonidoDeEscena, wavDe, FRECUENCIA_DE_MUESTREO } from './sonido.js';
export { revisaEscena, type ObservacionDeVideo } from './revision.js';
export { TEMPORADAS_FIRMADAS, tarjetaDeTemporada, type IdDeTemporada, type PiezaDeTemporada } from './tarjetas.js';
