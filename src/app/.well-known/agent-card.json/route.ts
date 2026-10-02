// La Agent Card, en la ruta que exporta el SDK (`AGENT_CARD_PATH`, sin barra inicial). Descubrimiento: sin clave.
// Con el puente apagado (produccion sin clave) no se anuncia un agente que no atiende.
import { puenteApagado, tarjeta } from '../../../features/a2a/puente.ts'

export async function GET(): Promise<Response> {
  if (puenteApagado()) return Response.json({ error: 'puente A2A apagado' }, { status: 503 })
  return Response.json(tarjeta(), { headers: { 'cache-control': 'no-cache' } })
}
