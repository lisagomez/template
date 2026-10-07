import { NextResponse, type NextRequest } from 'next/server';
import { altaDePyme } from '@/features/buzon-cfdi/services/servidor/buzon';
import { entra, responde } from '@/features/buzon-cfdi/services/servidor/ruta';
import { altaDePyme as esquema } from '@/features/buzon-cfdi/types';

export const dynamic = 'force-dynamic';

/** Alta de una pyme del despacho. Todavía no entra nada suyo: falta su consentimiento escrito. */
export async function POST(p: NextRequest): Promise<Response> {
  const ctx = await entra(p, true);
  if (ctx instanceof Response) return ctx;
  const d = esquema.safeParse(await p.json().catch(() => null));
  if (!d.success) return NextResponse.json({ error: d.error.issues[0]?.message ?? 'datos no válidos' }, { status: 400 });
  return responde(await altaDePyme(ctx.supabase, d.data));
}
