/**
 * La liga de alta y el origen del mensaje (C3, «alta fraudulenta»).
 *
 * Embedded Signup no lleva un `state` propio (FB.login solo acepta `config_id`, `response_type`,
 * `override_default_response_type` y `extras.setup`), así que la sesión se ata en NUESTRA página:
 * la liga que le damos a una pyme lleva su inquilino, un nonce y una fecha de vencimiento, firmados
 * con HMAC. Sirve una vez: quien la usa da de alta a ESA pyme y a nadie más.
 *
 * El origen: la muestra de Meta acepta `event.origin.endsWith('facebook.com')`, que también deja
 * pasar `https://evilfacebook.com`. Aquí se exige https y que el host sea facebook.com o un
 * subdominio suyo (developers.facebook.com/…/embedded-signup/implementation, consultado el 2026-10-01).
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DIA, esObjeto, texto } from '../comun/base.js';

/** Lo que manda la ventana de Embedded Signup (evento de sesión `WA_EMBEDDED_SIGNUP`). */
export type EventoSignup =
  | { tipo: 'fin'; wabaId: string; phoneNumberId?: string; businessId: string; datasetIds: string[]; catalogIds: string[]; coexistencia: boolean }
  | { tipo: 'abandono'; paso: string }
  | { tipo: 'error'; mensaje: string; codigo?: string };

/** Lee el `message` que la ventana de Embedded Signup manda a nuestra página (la página lo reenvía). */
export function leeEventoSignup(v: unknown): EventoSignup | null {
  if (!esObjeto(v) || v.type !== 'WA_EMBEDDED_SIGNUP' || !esObjeto(v.data)) return null;
  const d = v.data;
  const ids = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === 'string') : []);
  if (v.event === 'CANCEL') return { tipo: 'abandono', paso: texto(d.current_step) ?? 'desconocido' };
  if (v.event === 'ERROR') return { tipo: 'error', mensaje: texto(d.error_message) ?? 'error sin mensaje', codigo: texto(d.error_code) };
  const wabaId = texto(d.waba_id);
  const businessId = texto(d.business_id);
  if (!wabaId || !businessId || typeof v.event !== 'string' || !v.event.startsWith('FINISH')) return null;
  return {
    tipo: 'fin', wabaId, businessId, phoneNumberId: v.event === 'FINISH_ONLY_WABA' ? undefined : texto(d.phone_number_id),
    datasetIds: ids(d.dataset_ids), catalogIds: ids(d.catalog_ids), coexistencia: v.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
  };
}

export const VIDA_LIGA_ALTA_MS = 7 * DIA;
export interface LigaAlta { inquilinoId: string; nonce: string; expira: number }

const firma = (secreto: string, datos: string) => createHmac('sha256', secreto).update(`liga-alta|${datos}`).digest('base64url');

export function emiteLigaAlta(secreto: string, inquilinoId: string, ahora: number, vidaMs = VIDA_LIGA_ALTA_MS): string {
  const datos = Buffer.from(JSON.stringify({ i: inquilinoId, n: randomBytes(12).toString('base64url'), e: ahora + vidaMs })).toString('base64url');
  return `${datos}.${firma(secreto, datos)}`;
}

export function leeLigaAlta(secreto: string, liga: string, ahora: number): LigaAlta | null {
  const [datos, f] = liga.split('.');
  if (!datos || !f) return null;
  const a = Buffer.from(f);
  const b = Buffer.from(firma(secreto, datos));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const v: unknown = JSON.parse(Buffer.from(datos, 'base64url').toString('utf8'));
    if (!esObjeto(v) || typeof v.i !== 'string' || typeof v.n !== 'string' || typeof v.e !== 'number' || v.e < ahora) return null;
    return { inquilinoId: v.i, nonce: v.n, expira: v.e };
  } catch {
    return null;
  }
}

export function esOrigenDeMeta(origen: string): boolean {
  try {
    const u = new URL(origen);
    return u.protocol === 'https:' && u.port === '' && (u.hostname === 'facebook.com' || u.hostname.endsWith('.facebook.com'));
  } catch {
    return false;
  }
}

/** Lo que nuestra página recibe por `postMessage` (Meta lo manda como texto JSON); solo vale con origen de Meta. */
export function filtraMensajeSignup(origen: string, data: unknown): EventoSignup | null {
  if (!esOrigenDeMeta(origen)) return null;
  let v = data;
  if (typeof data === 'string') { try { v = JSON.parse(data); } catch { return null; } }
  return leeEventoSignup(v);
}
