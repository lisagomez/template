/**
 * /api/ventas-whatsapp/flows — el endpoint de datos de los Flows dinámicos. Cuerpo cifrado de ida
 * y vuelta; 421, 427 y 432 según la guía de Meta. La respuesta viaja como texto (base64).
 */
import { vendedorDelServidor } from '@/features/ventas-whatsapp/services/servidor/runtime';

export const dynamic = 'force-dynamic';

export async function POST(peticion: Request): Promise<Response> {
  const v = vendedorDelServidor();
  if (!v.ok) return new Response('', { status: 503 });
  const r = await v.vendedor.flows.endpoint(await peticion.text(), peticion.headers.get('x-hub-signature-256'));
  return new Response(r.cuerpo, { status: r.status, headers: { 'content-type': 'text/plain' } });
}
