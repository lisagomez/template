/**
 * El id de la conversación es un SEUDÓNIMO del teléfono (HMAC con el secreto de la app), no el
 * teléfono: viaja como `contextId` de A2A, en las trazas y en la cadena de hashes.
 */
import { createHmac } from 'node:crypto';
import type { Conversacion } from '../modelo.js';

export const idConversacionDe = (secretoApp: string, waId: string) => `conv_${createHmac('sha256', secretoApp).update(`conversacion|${waId}`).digest('hex').slice(0, 20)}`;

export function nuevaConversacion(id: string, waId: string, instante: number): Conversacion {
  return {
    id, contextId: `ctx_${id}`, waId, abiertaEn: instante, ultimoMensajeEn: instante, ventanas: {},
    origen: { tipo: 'directo', registradoEn: instante }, historialOrigenes: [], estado: 'agente', fallosComprension: 0,
    turnos: 0, tokens: 0, leadReportado: false, intencionCompra: false,
  };
}
