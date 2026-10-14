/** La Agent Card firmada (JWS) del dominio. */
import { vendedorDelServidor } from '@/features/ventas-whatsapp/services/servidor/runtime';

export const dynamic = 'force-dynamic';

export async function GET(peticion: Request): Promise<Response> {
  const v = vendedorDelServidor();
  if (!v.ok || !v.pasarela) return new Response('pasarela A2A apagada', { status: 503 });
  return v.pasarela.atiende(peticion);
}
