/** Los veredictos de quien prueba: leer, guardar y exportar el informe (Markdown). Bearer obligatorio. */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { piezas } from '@/features/laboratorio-voz/services/servidor/dictado-cli';
import { agregaVeredicto, informeMarkdown, leeVeredictos } from '@/features/laboratorio-voz/services/servidor/veredictos';
import { rechazoSinToken } from '@/shared/lib/token-dictado';

export const dynamic = 'force-dynamic';

const esquema = z.object({
  caso: z.number().int().min(1).max(20),
  resultado: z.enum(['funciono', 'a-medias', 'no']),
  nota: z.string().trim().max(1_000),
  estado: z.enum(['listo', 'reglas', 'puerta']),
});

export async function GET(peticion: NextRequest): Promise<NextResponse> {
  const rechazo = rechazoSinToken(peticion);
  if (rechazo) return rechazo;
  const veredictos = await leeVeredictos();
  if (peticion.nextUrl.searchParams.get('formato') === 'md') {
    return new NextResponse(informeMarkdown(veredictos, await piezas()), { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
  }
  return NextResponse.json({ veredictos });
}

export async function POST(peticion: NextRequest): Promise<NextResponse> {
  const rechazo = rechazoSinToken(peticion);
  if (rechazo) return rechazo;
  const cuerpo = esquema.safeParse(await peticion.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: 'veredicto invalido' }, { status: 400 });
  return NextResponse.json({ veredicto: await agregaVeredicto(cuerpo.data) });
}
