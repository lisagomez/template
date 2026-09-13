// Health MUDO: exactamente esto y nada mas. Un health que reporta versiones o colas es reconocimiento gratis.
export async function GET(): Promise<Response> {
  return Response.json({ status: 'ok' })
}
