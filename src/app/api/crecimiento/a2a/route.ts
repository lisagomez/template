/**
 * /api/crecimiento/a2a — el agente `crecimiento-demostrado` por A2A (JSON-RPC, SDK oficial).
 * Apagado sin CRECIMIENTO_A2A_SECRETO y CRECIMIENTO_A2A_LLAVE. LOCAL: exponerlo a un partner o a
 * internet es gate humano, con C3 + C4.
 */
import { pasarelaDelServidor } from '@/features/crecimiento-demostrado/services/servidor';

export const dynamic = 'force-dynamic';

export async function POST(peticion: Request): Promise<Response> {
  const p = pasarelaDelServidor(new URL(peticion.url).origin + '/api/crecimiento');
  return p ? p.atiende(peticion) : new Response('pasarela A2A apagada: falta CRECIMIENTO_A2A_SECRETO o CRECIMIENTO_A2A_LLAVE', { status: 503 });
}
