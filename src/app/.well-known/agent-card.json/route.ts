// La Agent Card, en la ruta que exporta el SDK (`AGENT_CARD_PATH`, sin barra inicial). Descubrimiento: sin clave.
import { tarjeta } from '../../../features/a2a/puente.ts'

export async function GET(): Promise<Response> {
  return Response.json(tarjeta(), { headers: { 'cache-control': 'no-cache' } })
}
