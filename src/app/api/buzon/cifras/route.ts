import { NextResponse, type NextRequest } from 'next/server';
import { cifrasEnCsv } from '@/features/buzon-cfdi/services/servidor/buzon';
import { entra } from '@/features/buzon-cfdi/services/servidor/ruta';

export const dynamic = 'force-dynamic';

/**
 * Las cifras agregadas para el laboratorio (RF-8): seudónimo y números, nada más. Si algo con forma de RFC, de folio
 * o de correo se colara, el archivo no sale (500 con el motivo).
 */
export async function GET(p: NextRequest): Promise<Response> {
  const ctx = await entra(p, false);
  if (ctx instanceof Response) return ctx;
  const r = await cifrasEnCsv(ctx.supabase);
  if (!r.ok) return NextResponse.json({ error: r.aviso }, { status: r.estado });
  return new NextResponse(r.datos, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="cifras-piloto.csv"', 'cache-control': 'no-store' },
  });
}
