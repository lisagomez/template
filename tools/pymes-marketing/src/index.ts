/**
 * @tu-scope/pymes-marketing — núcleo común de la familia. Cada herramienta vive en su subpath:
 *
 *   import { capturaDeSitio } from '@tu-scope/pymes-marketing/marca'
 *   import { ventasDesdeCfdi } from '@tu-scope/pymes-marketing/ventas'
 *   import { estrategiaDe30Dias } from '@tu-scope/pymes-marketing/contenido'
 *   import { analizaResenas } from '@tu-scope/pymes-marketing/resenas'
 *   import { auditaVisibilidad } from '@tu-scope/pymes-marketing/visibilidad'
 *   import { briefDelLunes } from '@tu-scope/pymes-marketing/pulso'
 *
 * Aquí: el contrato de «sin datos», dinero MXN, fechas y temporada de México, texto de terceros,
 * datos personales, CSV, la voz del dueño y el redactor inyectable. CERO dependencias.
 */
export { ok, sinDatos, esOk, type Dato } from './comun/dato.js';
export { leeImporte, formatoDinero, formatoPesosRedondo, sumaPorMoneda, type Importe, type LecturaDeImporte } from './comun/dinero.js';
export { decodificaTexto } from './comun/decodifica.js';
export { leeDia, ordenDeFechas, sumaDias, diasEntre, diaDeSemana, nombreDeDia, fechaLarga, fechaCorta, lunesDe, finDeMes, diaDe, type Dia } from './comun/fechas.js';
export { fechasComercialesMx, fechasEnVentana, quincenas, pascua, enesimo, type FechaComercial } from './comun/temporada.js';
export { revisaTextoDeTerceros, tieneInstruccionIncrustada, type TextoRevisado, type AlertaDeContenido, type TipoDeAlerta } from './comun/no-confiable.js';
export { minimizaDatosPersonales, nombreCorto, hayDatosPersonales, type Minimizado, type TipoDatoPersonal } from './comun/datos-personales.js';
export { leeCsv, columna, type TablaCsv, type FilaCsv } from './comun/csv.js';
export { normaliza, huella, azarDe, recorta, capitaliza, escapaXml } from './comun/texto.js';
export { construyeVoz, prohibeFrase, revisaContraVoz, VOZ_NEUTRA, CLICHES_CANDIDATOS, type PerfilDeVoz, type FaltaDeVoz, type Trato, type Frecuencia } from './comun/voz.js';
export { finalizaRedaccion, type Redactor, type Redaccion, type PeticionDeRedaccion, type TareaDeRedaccion, type UsoDeRedaccion } from './comun/redactor.js';
export { redactorDePlantillas } from './comun/redactor-plantillas.js';
export { seccionSinDatos, type SeccionDelLunes, type AccionSugerida, type FuenteDelLunes } from './comun/lunes.js';
