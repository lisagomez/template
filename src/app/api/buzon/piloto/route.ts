import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { avanzaPiloto } from '@/features/buzon-cfdi/services/servidor/buzon';
import { entra, responde } from '@/features/buzon-cfdi/services/servidor/ruta';

export const dynamic = 'force-dynamic';
const accion = z.object({ accion: z.enum(['parar', 'cerrar']) });

/** Parar (RF-25) o cerrar (RF-27) el piloto. Solo avanza; cerrar borra todo lo generado y deja la constancia. */
export async function POST(p: NextRequest): Promise<Response> {
  const ctx = await entra(p, true);
  if (ctx instanceof Response) return ctx;
  const a = accion.safeParse(await p.json().catch(() => null));
  if (!a.success) return NextResponse.json({ error: 'acción no válida: parar o cerrar' }, { status: 400 });
  return responde(await avanzaPiloto(ctx.supabase, a.data.accion));
}
