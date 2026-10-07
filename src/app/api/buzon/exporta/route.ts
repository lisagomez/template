import { NextResponse, type NextRequest } from 'next/server';
import { exporta } from '@/features/buzon-cfdi/services/servidor/buzon';
import { entra } from '@/features/buzon-cfdi/services/servidor/ruta';
import { UUID_DB } from '@/features/buzon-cfdi/types';

export const dynamic = 'force-dynamic';

/** Los CFDI confirmados de una pyme, en CSV para el sistema contable del despacho. Solo los confirmados (RF-16). */
export async function GET(p: NextRequest): Promise<Response> {
  const ctx = await entra(p, false);
  if (ctx instanceof Response) return ctx;
  const pyme = p.nextUrl.searchParams.get('pyme') ?? '';
  if (!UUID_DB.test(pyme)) return NextResponse.json({ error: 'pyme no válida' }, { status: 400 });
  return new NextResponse(await exporta(ctx.supabase, pyme), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="cfdi-confirmados.csv"', 'cache-control': 'no-store' },
  });
}
