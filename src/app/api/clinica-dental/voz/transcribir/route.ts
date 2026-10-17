/**
 * Voz → texto para la guía de registro y el chatbot, contra el demonio LOCAL de `tools/dictado` (el mismo
 * camino que el centro de mando: dos pasadas ancladas para frases cortas). El audio va de la página a este
 * servidor y de aquí a 127.0.0.1: NO sale de la máquina ni se escribe a disco. Sin APIs de voz de terceros.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { DemonioCaido, transcribeTurno } from '@/features/centro-de-mando/services/servidor/transcribe';
import { excedeLimite, ipDe, rechazoDeBorde } from '@/features/clinica-dental/services/servidor/borde';

export const dynamic = 'force-dynamic';
const MAX_BYTES = 30 * 16_000 * 2;

export async function POST(p: NextRequest): Promise<NextResponse> {
  const rechazo = rechazoDeBorde(p, true);
  if (rechazo) return rechazo;
  if (excedeLimite(`asr|${ipDe(p)}`, 60)) return NextResponse.json({ error: 'demasiadas peticiones' }, { status: 429 });
  if (p.headers.get('x-frecuencia-hz') !== '16000') return NextResponse.json({ error: 'se espera PCM16 a 16000 Hz' }, { status: 400 });
  const pcm = new Uint8Array(await p.arrayBuffer());
  if (pcm.length < 2 || pcm.length % 2 !== 0) return NextResponse.json({ error: 'audio vacío' }, { status: 400 });
  if (pcm.length > MAX_BYTES) return NextResponse.json({ error: 'turno demasiado largo (máximo 30 s)' }, { status: 413 });
  try {
    return NextResponse.json(await transcribeTurno(pcm, p.signal));
  } catch (e) {
    if (p.signal.aborted) return NextResponse.json({ error: 'cancelado' }, { status: 499 });
    if (e instanceof DemonioCaido) return NextResponse.json({ error: 'el motor de voz local no responde' }, { status: 503 });
    return NextResponse.json({ error: 'no se pudo transcribir' }, { status: 500 });
  }
}
