/**
 * El `flow_token`: opaco para el cliente, firmado por nosotros. Dice de qué inquilino, qué
 * conversación, qué Flow y (si aplica) qué pedido. Sin él válido, el endpoint no da datos (427):
 * así un Flow no puede pedir la agenda o el carrito de otro inquilino.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type TipoFlow = 'entrega' | 'reserva' | 'lead' | 'checkout';

export interface DatosTokenFlow {
  t: string;
  c: string;
  w: string;
  f: TipoFlow;
  p?: string;
  /** Vence (ms). */
  e: number;
}

const b64 = (s: string) => Buffer.from(s).toString('base64url');

export function firmaTokenFlow(secreto: string, d: DatosTokenFlow): string {
  const cuerpo = b64(JSON.stringify(d));
  return `${cuerpo}.${createHmac('sha256', secreto).update(cuerpo).digest('base64url')}`;
}

export function leeTokenFlow(secreto: string, token: string, ahora: number): DatosTokenFlow | null {
  const [cuerpo, firma] = token.split('.');
  if (!cuerpo || !firma) return null;
  const esperada = Buffer.from(createHmac('sha256', secreto).update(cuerpo).digest('base64url'));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const d = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as DatosTokenFlow;
    return typeof d.t === 'string' && typeof d.c === 'string' && d.e > ahora ? d : null;
  } catch {
    return null;
  }
}
