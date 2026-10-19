/**
 * Las LECTURAS de una nota o un turno de voz para las urgencias: el motor principal del demonio (Parakeet, con su anclaje
 * para frases cortas) y el de respaldo (Whisper, con el vocabulario de alarma como pista). Una urgencia no puede
 * depender de que UN motor oiga cada palabra; la regla corre sobre todas las lecturas (`detectaUrgenciaEnVoz`). Medido
 * en `scripts/clinica-dental/whatsapp/mide-voz-urgencias.ts`, que usa estas mismas funciones.
 */
import { PISTA_VOZ_URGENCIAS, traeSenalDeAlarma } from '../../../../../tools/clinica-dental/dist/servidor.js';
import { transcribeRespaldo, transcribeTurno, type Transcripcion } from '../../../centro-de-mando/services/servidor/transcribe.ts';

const sinRepetir = (xs: readonly string[]): string[] => [...new Set(xs.filter((x) => x.trim()))];

/** WhatsApp: siempre las dos lecturas. Cuesta ~1.5 s más, y por WhatsApp nadie espera la respuesta en vivo. */
export async function leeNotaDeVoz(pcm: Uint8Array, senal: AbortSignal): Promise<string[]> {
  const [turno, respaldo] = await Promise.all([transcribeTurno(pcm, senal), transcribeRespaldo(pcm, senal, PISTA_VOZ_URGENCIAS).catch(() => '')]);
  return sinRepetir([...turno.candidatos, respaldo]);
}

/**
 * El portal, en vivo: la segunda lectura solo si la primera ya trae una señal de alarma (leída con la corrección), para
 * no cobrar 1.5 s en cada turno de la conversación. La lectura extra va al final: la guía y el enrutador siguen usando
 * la primera.
 */
export async function leeTurnoDelPortal(pcm: Uint8Array, senal: AbortSignal): Promise<Transcripcion> {
  const turno = await transcribeTurno(pcm, senal);
  if (!traeSenalDeAlarma(turno.candidatos)) return turno;
  const respaldo = await transcribeRespaldo(pcm, senal, PISTA_VOZ_URGENCIAS).catch(() => '');
  return { ...turno, candidatos: sinRepetir([...turno.candidatos, respaldo]) };
}
