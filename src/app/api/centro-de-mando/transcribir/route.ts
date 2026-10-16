/**
 * Centro de mando: el audio de un turno (PCM16LE mono a 16 kHz, lo que ya captura la página) →
 * transcripciones candidatas, por el demonio LOCAL de dictado. Sin archivo temporal ni ffmpeg: el
 * cuerpo va directo al demonio. Si la página corta (interrupción, turno nuevo), la señal corta la
 * espera. C3: Bearer obligatorio. C4: el audio no sale de la máquina y no se escribe a disco.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { DemonioCaido, transcribeTurno } from '@/features/centro-de-mando/services/servidor/transcribe';
import { rechazoSinToken } from '@/shared/lib/token-dictado';

export const dynamic = 'force-dynamic';

/** 30 s a 16 kHz en PCM16: un turno de voz nunca pasa de aquí. */
const MAX_BYTES = 30 * 16_000 * 2;
const esquemaHz = z.literal('16000');

export async function POST(peticion: NextRequest): Promise<NextResponse> {
  const rechazo = rechazoSinToken(peticion);
  if (rechazo) return rechazo;
  if (!esquemaHz.safeParse(peticion.headers.get('x-frecuencia-hz')).success) return NextResponse.json({ error: 'se espera PCM16 a 16000 Hz (x-frecuencia-hz)' }, { status: 400 });
  const pcm = new Uint8Array(await peticion.arrayBuffer());
  if (pcm.length < 2 || pcm.length % 2 !== 0) return NextResponse.json({ error: 'audio vacío o PCM16 incompleto' }, { status: 400 });
  if (pcm.length > MAX_BYTES) return NextResponse.json({ error: 'turno demasiado largo (máximo 30 s)' }, { status: 413 });
  try {
    return NextResponse.json(await transcribeTurno(pcm, peticion.signal));
  } catch (e) {
    if (peticion.signal.aborted) return NextResponse.json({ error: 'cancelado' }, { status: 499 });
    if (e instanceof DemonioCaido) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: 'no se pudo transcribir' }, { status: 500 });
  }
}
