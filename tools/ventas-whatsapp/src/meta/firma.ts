/**
 * Firma y verificación de los webhooks de Meta.
 *
 * Fuente (consultada el 2026-09-30): developers.facebook.com/docs/graph-api/webhooks/getting-started
 *  - verificación: GET con `hub.mode=subscribe`, `hub.verify_token` y `hub.challenge`; se responde
 *    el challenge si el token coincide;
 *  - eventos: `X-Hub-Signature-256: sha256=<hex>`, HMAC-SHA256 de los BYTES CRUDOS del cuerpo con
 *    el secreto de la app. Se firma el cuerpo tal cual llegó: re-serializar el JSON rompe la firma.
 * El endpoint de datos de los Flows usa la misma cabecera (guía «Implementing your Flow endpoint»).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const CABECERA_FIRMA = 'x-hub-signature-256';

export function firmaMeta(secreto: string, cuerpo: string | Uint8Array): string {
  return `sha256=${createHmac('sha256', secreto).update(cuerpo).digest('hex')}`;
}

/** Comparación en tiempo constante. Una cabecera ausente o mal formada es `false`, no una excepción. */
export function verificaFirmaMeta(secreto: string, cuerpo: string | Uint8Array, cabecera: string | null | undefined): boolean {
  if (!secreto || typeof cabecera !== 'string' || !cabecera.startsWith('sha256=')) return false;
  const esperada = Buffer.from(firmaMeta(secreto, cuerpo));
  const recibida = Buffer.from(cabecera);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

export interface RespuestaHttp {
  status: number;
  cuerpo: string;
}

/** El saludo GET de la suscripción. Devuelve el challenge solo si el token es el nuestro. */
export function respondeVerificacion(
  parametros: URLSearchParams | Record<string, string | undefined>,
  tokenEsperado: string,
): RespuestaHttp {
  const lee = (k: string) => (parametros instanceof URLSearchParams ? parametros.get(k) : parametros[k]) ?? '';
  const modo = lee('hub.mode');
  const token = lee('hub.verify_token');
  const reto = lee('hub.challenge');
  if (modo !== 'subscribe' || !tokenEsperado || token.length !== tokenEsperado.length) return { status: 403, cuerpo: 'prohibido' };
  if (!timingSafeEqual(Buffer.from(token), Buffer.from(tokenEsperado))) return { status: 403, cuerpo: 'prohibido' };
  return { status: 200, cuerpo: reto };
}
