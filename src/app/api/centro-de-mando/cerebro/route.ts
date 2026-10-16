/**
 * Centro de mando: la conversación al cerebro (OpenRouter, modelo pineado por el routing), en
 * flujo NDJSON. Solo sale TEXTO, y solo el que el enrutador mandó aquí. Comprueba la llave y el
 * tope de gasto antes de abrir el flujo. Si la página corta, la señal corta la conexión con el
 * proveedor (no se sigue pagando una respuesta que nadie va a oír).
 * C3: Bearer obligatorio. C8: clase `cerebro-de-voz` (CDC pendiente de firma).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { compruebaCerebro, flujoCerebro, SinLlave, SinPresupuesto } from '@/features/centro-de-mando/services/servidor/cerebro';
import { rechazoSinToken } from '@/shared/lib/token-dictado';

export const dynamic = 'force-dynamic';

const esquema = z.object({
  mensajes: z.array(z.object({ rol: z.enum(['usuario', 'asistente']), texto: z.string().trim().min(1).max(4_000) })).min(1).max(17),
});

export async function POST(peticion: NextRequest): Promise<Response> {
  const rechazo = rechazoSinToken(peticion);
  if (rechazo) return rechazo;
  const cuerpo = esquema.safeParse(await peticion.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: 'mensajes inválidos' }, { status: 400 });
  if (cuerpo.data.mensajes.at(-1)?.rol !== 'usuario') return NextResponse.json({ error: 'el último mensaje tiene que ser de la persona' }, { status: 400 });
  try {
    await compruebaCerebro();
  } catch (e) {
    if (e instanceof SinPresupuesto) return NextResponse.json({ error: e.message }, { status: 402 });
    if (e instanceof SinLlave) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: 'no se pudo comprobar el presupuesto' }, { status: 500 });
  }
  return new Response(flujoCerebro(cuerpo.data.mensajes, peticion.signal), { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } });
}
