/** La voz de UNA frase (Piper es_MX local, por el demonio de dictado), PCM16LE en flujo. Nada sale de la máquina. */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { sintetizaEnFlujo } from '@/shared/lib/transcriptor-local';
import { excedeLimite, ipDe, rechazoDeBorde } from '@/features/clinica-dental/services/servidor/borde';

export const dynamic = 'force-dynamic';
const esquema = z.object({ texto: z.string().trim().min(1).max(600), velocidad: z.number().min(0.6).max(1.6).default(0.95) }).strict();

export async function POST(p: NextRequest): Promise<Response> {
  const rechazo = rechazoDeBorde(p, true);
  if (rechazo) return rechazo;
  if (excedeLimite(`tts|${ipDe(p)}`, 240)) return NextResponse.json({ error: 'demasiadas peticiones' }, { status: 429 });
  const c = esquema.safeParse(await p.json().catch(() => null));
  if (!c.success) return NextResponse.json({ error: 'frase inválida' }, { status: 400 });
  try {
    const f = await sintetizaEnFlujo(c.data.texto, 'es_MX-claude-high', c.data.velocidad, p.signal);
    return new Response(f.cuerpo, { headers: { 'content-type': 'application/octet-stream', 'x-frecuencia-hz': String(f.frecuenciaHz), 'x-via': f.via, 'cache-control': 'no-store' } });
  } catch {
    if (p.signal.aborted) return NextResponse.json({ error: 'cancelado' }, { status: 499 });
    return NextResponse.json({ error: 'no se pudo generar la voz' }, { status: 503 });
  }
}
