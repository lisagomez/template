/**
 * /api/ventas-whatsapp/a2a/{pedidos|atribucion} — la pasarela A2A de la fase 3 (JSON-RPC, SDK
 * oficial). LOCAL: exponerla a un partner o a internet es gate humano, con C3 + C4.
 */
import { vendedorDelServidor } from '@/features/ventas-whatsapp/services/servidor/runtime';

export const dynamic = 'force-dynamic';

export async function POST(peticion: Request): Promise<Response> {
  const v = vendedorDelServidor();
  if (!v.ok || !v.pasarela) return new Response('pasarela A2A apagada', { status: 503 });
  return v.pasarela.atiende(peticion);
}
