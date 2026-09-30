/**
 * /api/ventas-whatsapp/webhook — el webhook de Meta. GET: la verificación de la suscripción.
 * POST: firma sobre el cuerpo CRUDO, 200 inmediato y el trabajo en cola (el acuse no espera al
 * agente). Sin canal configurado: 503.
 */
import { vendedorDelServidor } from '@/features/ventas-whatsapp/services/servidor/runtime';

export const dynamic = 'force-dynamic';

export async function GET(peticion: Request): Promise<Response> {
  const v = vendedorDelServidor();
  if (!v.ok) return new Response(v.error, { status: 503 });
  const r = v.vendedor.webhook.verifica(new URL(peticion.url).searchParams);
  return new Response(r.cuerpo, { status: r.status });
}

export async function POST(peticion: Request): Promise<Response> {
  const v = vendedorDelServidor();
  if (!v.ok) return new Response(v.error, { status: 503 });
  const r = v.vendedor.webhook.recibe(await peticion.text(), peticion.headers.get('x-hub-signature-256'));
  return new Response(r.cuerpo, { status: r.status });
}
