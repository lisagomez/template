/**
 * Centro de mando: la voz de UNA frase (Piper local por el demonio de dictado), PCM16LE en flujo. Es la ruta del
 * laboratorio sin su consulta de voces disponibles: esa consulta lanza un proceso cada vez que caduca su caché (10 s)
 * y costaba 200-500 ms en la primera frase de cada respuesta (medido el 2026-10-16). Aquí la voz es de una lista
 * cerrada (Zod) y el demonio rechaza lo que no tenga cargado. Si la página corta, la síntesis se corta.
 * C3: Bearer obligatorio. C4: nada sale de la máquina.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { rechazoSinToken } from '@/shared/lib/token-dictado';
import { sintetizaEnFlujo } from '@/shared/lib/transcriptor-local';

export const dynamic = 'force-dynamic';

const esquema = z.object({
  texto: z.string().trim().min(1).max(600),
  voz: z.enum(['es_MX-claude-high', 'es_ES-davefx-medium', 'es_MX-ald-medium']).default('es_MX-claude-high'),
  velocidad: z.number().min(0.6).max(1.6).default(0.9),
});

export async function POST(peticion: NextRequest): Promise<Response> {
  const rechazo = rechazoSinToken(peticion);
  if (rechazo) return rechazo;
  const cuerpo = esquema.safeParse(await peticion.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: 'frase inválida (1 a 600 caracteres, voz de la lista)' }, { status: 400 });
  try {
    const flujo = await sintetizaEnFlujo(cuerpo.data.texto, cuerpo.data.voz, cuerpo.data.velocidad, peticion.signal);
    return new Response(flujo.cuerpo, { headers: { 'content-type': 'application/octet-stream', 'x-frecuencia-hz': String(flujo.frecuenciaHz), 'x-voz': flujo.voz, 'x-via': flujo.via, 'cache-control': 'no-store' } });
  } catch {
    if (peticion.signal.aborted) return NextResponse.json({ error: 'cancelado' }, { status: 499 });
    return NextResponse.json({ error: 'no se pudo generar la voz' }, { status: 500 });
  }
}
