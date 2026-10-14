import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { importaLista69B } from '@/features/buzon-cfdi/services/servidor/buzon';
import { entra, responde } from '@/features/buzon-cfdi/services/servidor/ruta';

export const dynamic = 'force-dynamic';
const MAX_BYTES = 20 * 1024 * 1024;
const fuente = z.string().trim().min(1).max(300);

/** Importa el listado 69-B que el operador bajó del SAT fuera del despacho (RF-18). Todo o nada. */
export async function POST(p: NextRequest): Promise<Response> {
  const ctx = await entra(p, true);
  if (ctx instanceof Response) return ctx;
  const form = await p.formData().catch(() => null);
  const archivo = form?.get('archivo');
  const f = fuente.safeParse(form?.get('fuente'));
  if (!f.success || !(archivo instanceof File) || archivo.size === 0) return NextResponse.json({ error: 'falta el archivo del listado o su fuente' }, { status: 400 });
  if (archivo.size > MAX_BYTES) return NextResponse.json({ error: 'el listado pesa más de 20 MB' }, { status: 413 });
  return responde(await importaLista69B(ctx.supabase, { bytes: new Uint8Array(await archivo.arrayBuffer()), fuente: f.data }));
}
