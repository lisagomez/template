/**
 * /api/ventas-whatsapp/openwa-webhook — el webhook de Meta para los números de la puerta de salida de OpenWA. GET: la
 * verificación de la suscripción. POST: firma `X-Hub-Signature-256` sobre el cuerpo CRUDO antes de leerlo; lo que
 * llega se vuelve eventos de OpenWA para los webhooks de cada sesión. Solo laboratorio: sin él, 503.
 */
import { respondeVerificacion } from '@/features/ventas-whatsapp/services/nucleo';
import { configuracion } from '@/features/ventas-whatsapp/services/servidor/configuracion';
import { fachadaOpenWA } from '@/features/ventas-whatsapp/services/servidor/openwa';

export const dynamic = 'force-dynamic';

export async function GET(peticion: Request): Promise<Response> {
  const c = configuracion();
  if (!c.ok) return new Response(c.error, { status: 503 });
  const r = respondeVerificacion(new URL(peticion.url).searchParams, c.valor.VENTAS_WA_VERIFY_TOKEN);
  return new Response(r.cuerpo, { status: r.status });
}

export async function POST(peticion: Request): Promise<Response> {
  const f = fachadaOpenWA(new URL(peticion.url).origin);
  if (!f.ok) return new Response(f.error, { status: 503 });
  const r = await f.fachada.recibeDeMeta(await peticion.text(), peticion.headers.get('x-hub-signature-256') ?? undefined);
  return new Response(null, { status: r.status });
}
