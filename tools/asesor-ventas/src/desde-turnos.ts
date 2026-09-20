/**
 * El seam con el dictado. `@tu-scope/dictado` (con `@tu-scope/voz`) entrega una reunion cortada
 * en TURNOS diarizados: `{ inicioMs, finMs, hablante?, texto? }` (el `ResultadoLote.turnos` de
 * `dictado lote`). Aqui se mapean a la `Transcripcion` que el motor espera — SIN importar
 * `dictado`: se aceptan por su FORMA (duck typing), asi este nucleo sigue con cero dependencias.
 *
 * La confianza: el dictado ya decidio que se transcribe y que no (un turno sin texto es un turno
 * que el motor no pudo o no debio transcribir). Aqui eso se traduce al gate del asesor: turno
 * con texto → confianza 1; turno vacio → 0 (se marca [inaudible], nunca se adivina).
 */
import { UMBRAL_INAUDIBLE, type Reunion, type Segmento, type Transcripcion } from './tipos.js';

/** La forma minima de un turno diarizado (mirror estructural de `Turno` de `@tu-scope/dictado`). */
export interface TurnoDiarizado {
  inicioMs: number;
  finMs: number;
  hablante?: string;
  texto?: string;
}

export interface OpcionesDesdeTurnos {
  reunionId: string;
  /** Id del motor que transcribio (para el historial); por defecto 'desconocido'. */
  motor?: string;
  /** Id de la transcripcion; por defecto `${reunionId}-t`. */
  transcripcionId?: string;
}

/** Convierte los turnos de `dictado lote` en una `Transcripcion` lista para `analizarReunion`. */
export function transcripcionDesdeTurnos(turnos: readonly TurnoDiarizado[], opciones: OpcionesDesdeTurnos): Transcripcion {
  const segmentos: Segmento[] = turnos.map((t) => {
    const texto = t.texto?.trim() ?? '';
    const hayTexto = texto.length > 0;
    return {
      inicioS: t.inicioMs / 1000,
      finS: t.finMs / 1000,
      hablante: t.hablante && t.hablante.length > 0 ? t.hablante : 'desconocido',
      texto: hayTexto ? texto : '[inaudible]',
      // El dictado ya filtro: con texto es audible; sin texto queda bajo el umbral y no se adivina.
      confianza: hayTexto ? 1 : UMBRAL_INAUDIBLE - 0.1,
    };
  });
  return {
    id: opciones.transcripcionId ?? `${opciones.reunionId}-t`,
    reunionId: opciones.reunionId,
    motor: opciones.motor ?? 'desconocido',
    segmentos,
  };
}

/**
 * Ayuda para armar los `participantes` de la `Reunion` desde el mapa de hablantes de la
 * diarizacion. `voz` etiqueta hablantes ("Hablante 1", o un nombre si hay registro); aqui se
 * declara de que LADO esta cada uno (el motor necesita saber que es del cliente y que del
 * asesor). Los hablantes no listados quedan como 'cliente' por defecto — es lo prudente: el
 * asesor casi siempre se conoce, y un turno mal atribuido al cliente solo baja el score, no lo
 * infla.
 */
export function participantesDesdeHablantes(
  hablantes: readonly string[],
  lados: Record<string, { rol: string; lado: 'interno' | 'cliente' }>,
): Reunion['participantes'] {
  return hablantes.map((nombre) => {
    const conf = lados[nombre];
    return { nombre, rol: conf?.rol ?? 'Participante', lado: conf?.lado ?? 'cliente' };
  });
}
