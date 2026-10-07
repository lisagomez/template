import { NextResponse, type NextRequest } from 'next/server';
import { revisa } from '@/features/buzon-cfdi/services/servidor/buzon';
import { entra, responde } from '@/features/buzon-cfdi/services/servidor/ruta';
import { revision, UUID_DB } from '@/features/buzon-cfdi/types';

export const dynamic = 'force-dynamic';

/** Revisar un campo, dar por revisada una discrepancia o confirmar ESTE CFDI. No hay «confirmar todos». */
export async function PATCH(p: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await entra(p, true);
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  const r = revision.safeParse(await p.json().catch(() => null));
  if (!UUID_DB.test(id) || !r.success) return NextResponse.json({ error: 'revisión no válida' }, { status: 400 });
  return responde(await revisa(ctx.supabase, id, r.data));
}
