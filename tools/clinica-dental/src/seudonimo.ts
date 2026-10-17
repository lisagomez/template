/**
 * Seudonimos e identificadores, como en `tools/ventas-whatsapp` (HMAC, no SHA a secas: un identificador se
 * adivinaria por fuerza bruta). El paciente es `pac_` + HMAC de (clinica, usuario de la cuenta): el mismo
 * paciente da el mismo seudonimo en su clinica y otro distinto en la otra, y sin la llave no se revierte.
 * El visitante sin cuenta es `vis_` + azar: no se deriva de nada suyo.
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';

export const sha256Hex = (s: string | Uint8Array): string => createHash('sha256').update(s).digest('hex');

/** `prefijo_` + 20 hex derivados de la clave: el mismo evento, la misma cita o el mismo aviso, el mismo id. */
export const idDeClave = (prefijo: 'evt' | 'cit' | 'avi' | 'cnv' | 'tok', clave: string): string => `${prefijo}_${sha256Hex(clave).slice(0, 20)}`;

export const visitanteNuevo = (): string => `vis_${randomBytes(10).toString('hex')}`;
export const conversacionNueva = (): string => `cnv_${randomBytes(10).toString('hex')}`;

export function creaSeudonimos(llave: string) {
  if (llave.length < 32) throw new Error('la llave de seudonimos necesita al menos 32 caracteres');
  const hmac = (s: string) => createHmac('sha256', llave).update(s).digest('hex');
  return {
    paciente: (clinica: string, usuario: string): string => `pac_${hmac(`paciente|${clinica}|${usuario}`).slice(0, 20)}`,
    /** Token firmado para enlaces (baja del newsletter, vinculo de Telegram): no adivinable, verificable. */
    firma: (contenido: string): string => hmac(`firma|${contenido}`).slice(0, 32),
  };
}

export type Seudonimos = ReturnType<typeof creaSeudonimos>;
