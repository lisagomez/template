import { NextResponse, type NextRequest } from 'next/server';
import { pendientesEnCsv } from '@/features/buzon-cfdi/services/servidor/buzon';
import { entra } from '@/features/buzon-cfdi/services/servidor/ruta';

export const dynamic = 'force-dynamic';

/** La lista de lo que vuelve a captura manual (RF-26), para el despacho. No sale de su máquina. */
export async function GET(p: NextRequest): Promise<Response> {
  const ctx = await entra(p, false);
  if (ctx instanceof Response) return ctx;
  return new NextResponse(await pendientesEnCsv(ctx.supabase), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="para-captura-manual.csv"', 'cache-control': 'no-store' },
  });
}
