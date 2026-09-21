/**
 * Texto → voz EN FLUJO: PCM16LE mono que llega frase a frase mientras se sintetiza (demonio) o de
 * una vez al final (CLI de respaldo). Cabeceras: `x-frecuencia-hz`, `x-voz`, `x-via`. Solo voces
 * ya descargadas: una peticion web jamas baja pesos. Si el navegador corta (interrupcion), la
 * senal de la peticion corta tambien la sintesis en el demonio.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { vocesDisponibles } from '@/features/laboratorio-voz/services/servidor/dictado-cli';
import { rechazoSinToken } from '@/shared/lib/token-dictado';
import { sintetizaEnFlujo } from '@/shared/lib/transcriptor-local';

export const dynamic = 'force-dynamic';

const esquema = z.object({
  texto: z.string().trim().min(1).max(2_000),
  voz: z.string().max(60).optional(),
  velocidad: z.number().min(0.6).max(1.6).optional(),
});

export async function POST(peticion: NextRequest): Promise<Response> {
  const rechazo = rechazoSinToken(peticion);
  if (rechazo) return rechazo;
  const cuerpo = esquema.safeParse(await peticion.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: 'texto invalido (1 a 2000 caracteres)' }, { status: 400 });
  const voces = await vocesDisponibles();
  const voz = cuerpo.data.voz ?? voces[0];
  if (!voz || !voces.includes(voz)) return NextResponse.json({ error: 'esa voz no esta descargada en esta maquina' }, { status: 409 });
  try {
    const flujo = await sintetizaEnFlujo(cuerpo.data.texto, voz, cuerpo.data.velocidad ?? 1, peticion.signal);
    return new Response(flujo.cuerpo, {
      headers: { 'content-type': 'application/octet-stream', 'x-frecuencia-hz': String(flujo.frecuenciaHz), 'x-voz': flujo.voz, 'x-via': flujo.via, 'cache-control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'no se pudo generar la voz' }, { status: 500 });
  }
}
