/**
 * /api/ventas-whatsapp/pagos — el webhook del procesador de pagos: firma verificada, idempotente
 * por id de pago (un webhook repetido no cobra dos veces) y enrutado por la referencia del pedido.
 */
import { vendedorDelServidor } from '@/features/ventas-whatsapp/services/servidor/runtime';

export const dynamic = 'force-dynamic';

export async function POST(peticion: Request): Promise<Response> {
  const v = vendedorDelServidor();
  if (!v.ok) return new Response(v.error, { status: 503 });
  const r = await v.vendedor.pagos.recibe(await peticion.text(), peticion.headers.get('x-procesador-firma'));
  return new Response(r.cuerpo, { status: r.status });
}
