/**
 * GET /api/recepcion/resumen — la lectura de SOLO conteos de Recepción (citas de hoy y de mañana, y el enlace al
 * mostrador) para el job que la lleva al cerebro personal del laboratorio. Solo lectura, sin cuerpo y sin consulta:
 * lo que sale lo valida `validaResumen` de la capa contra la composición, y un texto libre se rechaza.
 *
 * En producción no se abre sin `RECEPCION_TOKEN_RESUMEN` (token de servicio de solo lectura, comparado en tiempo
 * constante); en desarrollo, sin token, responde a la máquina local con datos sintéticos.
 */
import { timingSafeEqual } from 'node:crypto';
import { validaResumen } from '../../../../../tools/capa/dist/index.js';
import recepcion from '../../../../../productos/composiciones/recepcion.json' with { type: 'json' };
import { resumenDeRecepcion } from '@/features/recepcion/services/resumen';

export const dynamic = 'force-dynamic';

function acceso(peticion: Request): 'si' | 'no' | 'sin-token' {
  const token = process.env.RECEPCION_TOKEN_RESUMEN;
  if (!token) return process.env.NODE_ENV === 'production' ? 'sin-token' : 'si';
  const dado = Buffer.from(peticion.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '');
  const esperado = Buffer.from(token);
  return dado.length === esperado.length && timingSafeEqual(dado, esperado) ? 'si' : 'no';
}

export async function GET(peticion: Request) {
  const a = acceso(peticion);
  if (a === 'sin-token') return Response.json({ error: 'la lectura de conteos no se abre en producción sin su token de servicio' }, { status: 503 });
  if (a === 'no') return Response.json({ error: 'no autorizado' }, { status: 401 });
  const r = validaResumen(await resumenDeRecepcion(), recepcion.resumen);
  if (!r.ok) return Response.json({ error: 'el resumen no pasó la validación de la capa', motivos: r.motivos }, { status: 500 });
  return Response.json(r.resumen, { headers: { 'cache-control': 'no-store' } });
}
