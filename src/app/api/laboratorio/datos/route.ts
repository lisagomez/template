/**
 * Datos personales del dictado (diccionario, snippets, historial) para la interfaz: leer y las
 * cinco ordenes de escritura, por `maquina.mjs` (mismas piezas que el CLI). Bearer obligatorio:
 * el historial lleva lo dictado, y el diccionario, nombres de clientes.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { maquina } from '@/features/laboratorio-voz/services/servidor/dictado-cli';
import { rechazoSinToken } from '@/shared/lib/token-dictado';

export const dynamic = 'force-dynamic';

const esquema = z.discriminatedUnion('orden', [
  z.object({ orden: z.literal('diccionario-agrega'), terminos: z.array(z.string().trim().min(1).max(200)).min(1).max(50) }),
  z.object({ orden: z.literal('diccionario-quita'), termino: z.string().trim().min(1).max(200) }),
  z.object({ orden: z.literal('snippets-agrega'), disparador: z.string().trim().min(1).max(200), expansion: z.string().min(1).max(2000) }),
  z.object({ orden: z.literal('snippets-quita'), disparador: z.string().trim().min(1).max(200) }),
  z.object({ orden: z.literal('historial-corrige'), id: z.string().trim().min(1).max(60), texto: z.string().min(1).max(5000) }),
]);

export async function GET(peticion: NextRequest): Promise<NextResponse> {
  const rechazo = rechazoSinToken(peticion);
  if (rechazo) return rechazo;
  try {
    return NextResponse.json(await maquina('datos-lee'));
  } catch {
    return NextResponse.json({ error: 'no se pudieron leer los datos' }, { status: 500 });
  }
}

export async function POST(peticion: NextRequest): Promise<NextResponse> {
  const rechazo = rechazoSinToken(peticion);
  if (rechazo) return rechazo;
  const cuerpo = esquema.safeParse(await peticion.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: 'orden invalida' }, { status: 400 });
  try {
    const { orden, ...resto } = cuerpo.data;
    return NextResponse.json(await maquina(orden, resto));
  } catch {
    return NextResponse.json({ error: 'no se pudo aplicar la orden' }, { status: 500 });
  }
}
