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
