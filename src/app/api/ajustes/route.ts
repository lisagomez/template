/**
 * Los ajustes del dictado para la pagina /ajustes: leer (GET) y cambiar (POST por `orden`:
 * pon, quita, restablece). Todo por `maquina.mjs`, que usa las MISMAS piezas que
 * `dictado ajustes` (validacion incluida: un motor que no esta instalado se rechaza con la
 * lista). Bearer obligatorio: son las decisiones de la persona sobre su microfono. Aqui no
 * pasa ningun secreto: `ajustes.json` no los lleva y el token no se devuelve.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { EstadoAjustes } from '@/features/ajustes/services/tipos';
import { maquina } from '@/features/laboratorio-voz/services/servidor/dictado-cli';
import { rechazoSinToken } from '@/shared/lib/token-dictado';

export const dynamic = 'force-dynamic';

const esquemaOrden = z.discriminatedUnion('orden', [
  z.object({ orden: z.literal('pon'), clave: z.string().trim().min(1).max(40), valor: z.union([z.string().max(80), z.number(), z.boolean()]) }),
  z.object({ orden: z.literal('quita'), clave: z.string().trim().min(1).max(40) }),
  z.object({ orden: z.literal('restablece'), confirmo: z.literal(true) }),
]);

type Respuesta = { ok: true; valor?: unknown; estado: EstadoAjustes } | { ok: false; error: string };

export async function GET(peticion: NextRequest): Promise<NextResponse> {
  const rechazo = rechazoSinToken(peticion);
  if (rechazo) return rechazo;
  try {
    return NextResponse.json(await maquina<EstadoAjustes>('ajustes-lee'));
  } catch {
    return NextResponse.json({ error: 'no se pudieron leer los ajustes' }, { status: 500 });
  }
}

export async function POST(peticion: NextRequest): Promise<NextResponse> {
  const rechazo = rechazoSinToken(peticion);
  if (rechazo) return rechazo;
  const cuerpo = esquemaOrden.safeParse(await peticion.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: 'orden invalida' }, { status: 400 });
  const o = cuerpo.data;
  try {
    if (o.orden === 'restablece') {
      const r = await maquina<{ ruta: string; estado: EstadoAjustes }>('ajustes-restablece');
      return NextResponse.json({ ok: true, estado: r.estado });
    }
    const r = await maquina<Respuesta>(o.orden === 'pon' ? 'ajustes-pon' : 'ajustes-quita', o.orden === 'pon' ? { clave: o.clave, valor: o.valor } : { clave: o.clave });
    // Un valor rechazado por la validacion es 422: la pagina lo ensena junto al campo.
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 });
    return NextResponse.json(r);
  } catch {
    return NextResponse.json({ error: 'no se pudo aplicar la orden' }, { status: 500 });
  }
}
