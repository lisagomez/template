import { NextResponse, type NextRequest } from 'next/server';
import { registraHoras } from '@/features/buzon-cfdi/services/servidor/buzon';
import { entra, responde } from '@/features/buzon-cfdi/services/servidor/ruta';
import { horasDelMes } from '@/features/buzon-cfdi/types';

export const dynamic = 'force-dynamic';

/** Registra o corrige las horas de captura de un mes de una pyme (RF-20). No se guarda quién (RF-21). */
export async function POST(p: NextRequest): Promise<Response> {
  const ctx = await entra(p, true);
  if (ctx instanceof Response) return ctx;
  const d = horasDelMes.safeParse(await p.json().catch(() => null));
  if (!d.success) return NextResponse.json({ error: d.error.issues[0]?.message ?? 'datos no válidos' }, { status: 400 });
  return responde(await registraHoras(ctx.supabase, d.data));
}
