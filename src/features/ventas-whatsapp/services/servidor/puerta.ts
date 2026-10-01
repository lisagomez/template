/**
 * La puerta del panel (C3): `Authorization: Bearer <token>` comparado en tiempo constante. El
 * token decide el INQUILINO: el dueño del restaurante no puede pedir nada de la tienda, aunque
 * lo ponga en la petición.
 */
import { timingSafeEqual } from 'node:crypto';
import { configuracion } from './configuracion.ts';

export function inquilinoDelPanel(cabecera: string | null): { ok: true; inquilino: string } | { ok: false; status: number; error: string } {
  const c = configuracion();
  if (!c.ok) return { ok: false, status: 503, error: c.error };
  const token = (cabecera ?? '').startsWith('Bearer ') ? (cabecera ?? '').slice(7) : '';
  for (const [valido, inquilino] of c.valor.panel) {
    const a = Buffer.from(valido);
    const b = Buffer.from(token);
    if (a.length === b.length && timingSafeEqual(a, b)) return { ok: true, inquilino };
  }
  return { ok: false, status: 401, error: 'token del panel inválido' };
}

/** La puerta de la plataforma (N-01, N-02): un solo token, de quien opera; no da acceso a ningún panel de pyme. */
export function esPlataforma(cabecera: string | null): { ok: true } | { ok: false; status: number; error: string } {
  const c = configuracion();
  if (!c.ok) return { ok: false, status: 503, error: c.error };
  const valido = c.valor.VENTAS_WA_PLATAFORMA_TOKEN;
  if (!valido) return { ok: false, status: 503, error: 'sin token de plataforma configurado' };
  const token = (cabecera ?? '').startsWith('Bearer ') ? (cabecera ?? '').slice(7) : '';
  const a = Buffer.from(valido);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b) ? { ok: true } : { ok: false, status: 401, error: 'token de plataforma inválido' };
}
