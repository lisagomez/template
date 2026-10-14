/** La Agent Card firmada (JWS ES256) del agente `crecimiento-demostrado`. */
import { pasarelaDelServidor } from '@/features/crecimiento-demostrado/services/servidor';

export const dynamic = 'force-dynamic';

export async function GET(peticion: Request): Promise<Response> {
  const p = pasarelaDelServidor(new URL(peticion.url).origin + '/api/crecimiento');
  return p ? p.atiende(peticion) : new Response('pasarela A2A apagada', { status: 503 });
}
