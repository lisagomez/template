/**
 * Pulso: anuncios desde la exportación (`ad-manager`, modo CSV), pulso de crecimiento
 * (`growth-pulse`) y el brief del lunes que funde todo (`marketing-monday`). Nada se ejecuta en las
 * cuentas del cliente: cada cambio sale como bloque «cómo hacerlo tú».
 */
export { leeAnuncios, campanas, type Campana, type Veredicto, type LecturaDeAnuncios, type Fila } from './anuncios.js';
export { recomendaciones, senales, variantes, briefCreativo, type BloqueDeCambio, type SenalDeCuenta, type VarianteDeAnuncio, type BriefCreativo } from './recomienda.js';
export { pulsoDeCrecimiento, pulsoParaElLunes, type Pulso, type Vista, type EstadoDeVista, type EntradaDePulso } from './pulso.js';
export { briefDelLunes, leeNotasDeCompetencia, competenciaParaElLunes, anunciosParaElLunes, type BriefDelLunes, type NotaDeCompetencia } from './lunes.js';
export { resenasParaElLunes } from '../resenas/index.js';
export { visibilidadParaElLunes } from '../visibilidad/index.js';
