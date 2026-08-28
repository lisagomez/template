/**
 * El enchufe de transcripcion. La herramienta NO transcribe.
 *
 * Es deliberado: el ASR es la pieza mas pesada de las tres (los modelos utiles van de
 * decenas a cientos de MB) y la que mas cambia entre proyectos. Metiendolo dentro, todos
 * los proyectos que instalen esto cargarian ese peso aunque solo uno lo use, y cambiar de
 * modelo obligaria a publicar una version nueva de la herramienta.
 *
 * Asi, cada consumidor conecta el suyo —Whisper local, un servicio alojado, o ninguno— y la
 * herramienta se limita a entregar turnos limpios, que es lo que sabe hacer.
 */

import type { Transcriptor, Turno } from '../types.js';

export interface OpcionesTranscripcion {
  frecuenciaHz: number;
  /**
   * Que hacer si el transcriptor falla en un turno. Por defecto se sigue y ese turno queda
   * sin texto: en una reunion de dos horas, un fallo de red no puede tirar el trabajo
   * entero. Con `false` se propaga la excepcion.
   */
  continuaSiFalla?: boolean;
}

/**
 * Transcribe los turnos que lleven audio, en orden, y devuelve copias con `texto`.
 *
 * En serie a proposito: los transcriptores locales saturan la CPU con una sola instancia, y
 * los alojados cobran por minuto y suelen limitar la concurrencia. Quien quiera paralelizar
 * tiene los turnos en la mano y sabe mejor que esta herramienta cuanto puede pedir.
 */
export async function transcribeTurnos(
  turnos: readonly Turno[],
  transcriptor: Transcriptor,
  opciones: OpcionesTranscripcion,
): Promise<Turno[]> {
  const continuaSiFalla = opciones.continuaSiFalla ?? true;
  const salida: Turno[] = [];
  for (const turno of turnos) {
    const copia = { ...turno };
    if (copia.audio) {
      try {
        copia.texto = (await transcriptor.transcribe(copia.audio, opciones.frecuenciaHz)).texto;
      } catch (error) {
        if (!continuaSiFalla) throw error;
      }
    }
    salida.push(copia);
  }
  return salida;
}

export type { Transcriptor };
