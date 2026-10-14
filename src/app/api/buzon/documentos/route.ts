import { NextResponse, type NextRequest } from 'next/server';
import { ingresa } from '@/features/buzon-cfdi/services/servidor/buzon';
import { entra, responde } from '@/features/buzon-cfdi/services/servidor/ruta';
import { UUID_DB } from '@/features/buzon-cfdi/types';

export const dynamic = 'force-dynamic';
const MAX_BYTES = 20 * 1024 * 1024;

/** Un documento por petición: entra solo si su pyme consiente, se lee, se coteja y se guarda su lectura (no el archivo). */
export async function POST(p: NextRequest): Promise<Response> {
  const ctx = await entra(p, true);
  if (ctx instanceof Response) return ctx;
  const form = await p.formData().catch(() => null);
  const archivo = form?.get('archivo');
  const pyme = String(form?.get('pyme_id') ?? '');
  if (!UUID_DB.test(pyme) || !(archivo instanceof File)) return NextResponse.json({ error: 'falta la pyme o el documento' }, { status: 400 });
  if (archivo.size > MAX_BYTES) return NextResponse.json({ error: 'el documento pesa más de 20 MB' }, { status: 413 });
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  return responde(await ingresa(ctx.supabase, pyme, { bytes, nombre: archivo.name, tipoMime: archivo.type || 'application/octet-stream' }));
}
