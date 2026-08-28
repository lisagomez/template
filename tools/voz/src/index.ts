/**
 * Nucleo de `@tu-scope/voz`: TypeScript puro, CERO dependencias.
 *
 * Aqui vive el algoritmo entero —troceado, remuestreo, maquina de estados del VAD, reparto
 * por canal, agrupamiento de hablantes— y ni una sola linea que sepa de ONNX, de React o
 * del navegador. Esa es la regla que hace que una herramienta se pueda instalar en
 * cualquier proyecto: si el nucleo necesitara un runtime, dejaria de ser una herramienta y
 * seria un trozo de una app concreta con otro nombre.
 *
 * Los modelos se inyectan por `./browser` o `./node`. Para probar, `modeloEnergia()` no
 * necesita ninguno.
 */

export type {
  EventoVoz,
  ModeloHablante,
  ModeloVoz,
  Muestras,
  OpcionesDetector,
  Transcriptor,
  Turno,
} from './types.js';

export { aMono, creaRemuestreador, type Remuestreador } from './audio/remuestreo.js';
export { concatena, creaRelleno, creaTroceador } from './audio/marcos.js';
export { fbank, type OpcionesFbank } from './audio/fbank.js';

export { creaDetectorVoz, type DetectorVoz } from './vad/detector.js';
export { modeloEnergia, type OpcionesEnergia } from './vad/energia.js';

export { creaDetectorPorCanal, type DetectorPorCanal, type OpcionesPorCanal } from './canales/por-canal.js';

export { agrupa, calibraUmbral, distanciaCoseno, type OpcionesAgrupar } from './diar/agrupacion.js';
export { creaDiarizador, type Diarizador, type OpcionesDiarizador } from './diar/diarizador.js';

export { transcribeTurnos, type OpcionesTranscripcion } from './asr/adaptador.js';

/**
 * Junta los turnos contiguos del mismo hablante separados por menos de `huecoMs`.
 *
 * El VAD corta por silencio y la gente respira a mitad de frase: sin esto, un acta sale con
 * quince turnos de la misma persona donde hubo una intervencion.
 */
export function fusionaTurnos(
  turnos: readonly import('./types.js').Turno[],
  huecoMs = 600,
): import('./types.js').Turno[] {
  const salida: import('./types.js').Turno[] = [];
  for (const turno of turnos) {
    const ultimo = salida[salida.length - 1];
    if (ultimo && ultimo.hablante === turno.hablante && turno.inicioMs - ultimo.finMs <= huecoMs) {
      ultimo.finMs = turno.finMs;
      if (ultimo.texto || turno.texto) ultimo.texto = [ultimo.texto, turno.texto].filter(Boolean).join(' ');
      continue;
    }
    salida.push({ ...turno });
  }
  return salida;
}
