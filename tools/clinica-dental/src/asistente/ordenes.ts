/**
 * El catalogo de ordenes de la clinica para el enrutador SIN LLM de `@tu-scope/bucle-voz` (misma forma que
 * `DefinicionOrden`). Estas no llegan al cerebro: se contestan en local o ABREN un flujo de la UI, donde la
 * persona confirma. Lo que suena a escritura («cancela mi cita») el enrutador lo marca como escritura y
 * aqui solo se traduce a «abre la pantalla», nunca a hacerlo.
 */
import { normaliza } from './urgencias.js';

export interface OrdenClinica { id: string; clase: 'lectura'; ejemplos: readonly string[]; requiere?: readonly string[] }

export const ORDENES_CLINICA: readonly OrdenClinica[] = [
  { id: 'mis-citas', clase: 'lectura', ejemplos: ['mis citas', 'cuándo es mi cita', 'qué citas tengo', 'ver mis citas', 'a qué hora es mi cita', 'cuándo me toca', 'tengo cita'] },
  { id: 'agendar', clase: 'lectura', ejemplos: ['quiero agendar', 'quiero una cita nueva', 'hacer una cita', 'sacar cita', 'agendar cita', 'necesito una cita', 'apartar una cita', 'quiero ir al dentista'] },
  { id: 'cancelar', clase: 'lectura', ejemplos: ['cancelar mi cita', 'quiero cancelar', 'ya no puedo ir', 'no voy a poder ir', 'anular mi cita'] },
  { id: 'reprogramar', clase: 'lectura', ejemplos: ['cambiar mi cita', 'reprogramar', 'mover mi cita', 'cambiar la hora de mi cita', 'cambiar de día mi cita', 'otro día para mi cita'] },
  { id: 'horario', clase: 'lectura', ejemplos: ['a qué hora abren', 'horario', 'cuál es su horario', 'horario de atención', 'cuál es el horario', 'qué horario tienen', 'qué días abren', 'están abiertos', 'a qué hora cierran', 'abren los sábados'] },
  { id: 'ubicacion', clase: 'lectura', ejemplos: ['dónde están', 'dirección', 'cómo llego', 'ubicación', 'dónde queda la clínica', 'cuál es la dirección'] },
];

/**
 * Infinitivos que el catalogo general de bucle-voz no trae como verbos de escritura («quiero CAMBIAR mi cita»).
 * Se suman a `VERBOS_ESCRITURA` al crear el enrutador: lo que suena a escritura nunca va al cerebro.
 */
export const VERBOS_ESCRITURA_CLINICA: readonly string[] = ['agendar', 'cancelar', 'cambiar', 'reprogramar', 'mover', 'apartar', 'borrar', 'eliminar', 'mandar', 'enviar', 'pasar'];

export type AccionPropuesta =
  | { tipo: 'abrir_agenda'; servicio?: string }
  | { tipo: 'abrir_mis_citas' }
  | { tipo: 'abrir_cancelacion' }
  | { tipo: 'abrir_reprogramacion' };

/** Un verbo de escritura al inicio («agéndame», «cancela», «borra») → que pantalla abrir o por que no se hace. */
export function escrituraA(texto: string): { accion: AccionPropuesta | null; intencion: 'agendar' | 'cancelar' | 'reprogramar' | 'accion_no_permitida' } {
  const t = normaliza(texto);
  if (/\b(agenda|agendame|agendar|reserva|reservame|reservar|programa|programame|aparta|apartame|apartar)\b/.test(t)) return { accion: { tipo: 'abrir_agenda' }, intencion: 'agendar' };
  if (/\b(cancela|cancelame|cancelar|anula|anular)\b/.test(t)) return { accion: { tipo: 'abrir_cancelacion' }, intencion: 'cancelar' };
  if (/\b(cambia|cambiame|cambiar|mueve|mover|reprograma|reprogramar|pospon|posponer|recorre|recorrer|adelanta)\b/.test(t)) return { accion: { tipo: 'abrir_reprogramacion' }, intencion: 'reprogramar' };
  return { accion: null, intencion: 'accion_no_permitida' };
}

export const TEXTO_ACCION: Record<AccionPropuesta['tipo'], string> = {
  abrir_agenda: 'Te abro la agenda para que elijas día y hora; la cita se confirma ahí, con tu clic.',
  abrir_mis_citas: 'Aquí están tus próximas citas.',
  abrir_cancelacion: 'Te muestro tus citas: para cancelar, elige la cita y confirma en la pantalla.',
  abrir_reprogramacion: 'Te muestro tus citas: para cambiarla, elige la cita y el nuevo horario, y confirma en la pantalla.',
};

export const TEXTO_NO_PERMITIDA =
  'Eso no lo hago desde el chat: no envío mensajes, no borro datos ni hago pagos. Para tus datos personales (acceso, corrección o borrado) escribe a la clínica; para tus citas, usa «Mis citas».';
