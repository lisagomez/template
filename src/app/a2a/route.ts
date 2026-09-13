// JSON-RPC A2A. Solo POST: el resto lo rechaza Next con 405 sin tocar nada del interior.
import { atiendeJsonRpc } from '../../features/a2a/puente.ts'

export async function POST(request: Request): Promise<Response> {
  return atiendeJsonRpc(request)
}
