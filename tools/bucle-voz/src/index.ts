/**
 * @tu-scope/bucle-voz — el bucle de un asistente de voz local, sin dependencias.
 *
 * Micrófono, detector de voz, transcriptor, cerebro, voz y reproductor se INYECTAN: el núcleo
 * corre igual en el navegador, en Node y en una prueba con reloj falso.
 */
export { creaBucle, type Bucle } from './bucle.js';
export { creaOido, DEFECTOS_OIDO, type EventoDetector, type OpcionesOido, type Oido } from './oido.js';
export { creaGestorTurnos, conSenal, type GestorTurnos, type Turno } from './turnos.js';
export { creaCanalVoz, type AudioFrase, type CanalVoz, type OpcionesCanal, type PiezaReproducir, type Sintetizador } from './canal-voz.js';
export { creaSeparador, limpiaParaVoz, ABREVIATURAS, DEFECTOS_SEPARADOR, type OpcionesSeparador, type Separador } from './separador.js';
export { creaEnrutadorLocal, parecidoFrases, VERBOS_ESCRITURA, DEFECTOS_ENRUTADOR, type ClaseOrden, type Decision, type DefinicionOrden, type Enrutador, type OpcionesEnrutador } from './enrutador.js';
export { ORDENES_ES } from './catalogo.js';
export { creaActivacion, pareceEco, DEFECTOS_ACTIVACION, type Activacion, type OpcionesActivacion, type ResultadoActivacion } from './activacion.js';
export { creaInterrupcion, DEFECTOS_INTERRUPCION, type AccionInterrupcion, type EstadoInterrupcion, type MaquinaInterrupcion, type MarcoEscucha, type OpcionesInterrupcion } from './interrupcion.js';
export { juzgaCierre, juzgaCierreConPregunta, juezPorTexto, juezConPregunta, DEFECTOS_CIERRE, type JuezCierre, type VeredictoCierre } from './cierre.js';
export { creaAcuse, claseDeAcuse, esTrivial, FRASES_ACUSE, REPERTORIO_ACUSE, ESTADO_ACUSE, type Acuse, type ClaseAcuse, type EleccionAcuse, type OpcionesAcuse } from './acuse.js';
export { creaTelemetria, latencia, latenciaRespuesta, tramos, percentil, resume, ETAPAS, type Etapa, type EstadoRegistro, type RegistroTurno, type Resumen, type Telemetria, type Tramo } from './telemetria.js';
export { creaRelojAudio, type RelojAudio } from './reloj-audio.js';
export { planControl, VELOCIDADES, type EstadoControl, type PlanControl } from './control.js';
export { horaEnPalabras, fechaEnPalabras, numeroEnPalabras, partesDe } from './hora.js';
export { aPcm16, dePcm16, codificaWav, nivelDb, nivelMaximoReciente, msPrimerSonido, recortaSilencio } from './audio.js';
export { palabras, pliega, parecido, distancia } from './texto.js';
export type { AudioTurno, Cerebro, CerebroModelo, PiezaModelo, EstadoBucle, EventoBucle, EventoReproductor, Lector, Mensaje, ModoBucle, OpcionesBucle, PiezaCerebro, Reproductor, TokensUso, Transcriptor } from './tipos.js';
