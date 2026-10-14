import { NextResponse, type NextRequest } from 'next/server';
import { registraConsentimiento, revocaConsentimiento } from '@/features/buzon-cfdi/services/servidor/buzon';
import { entra, responde } from '@/features/buzon-cfdi/services/servidor/ruta';
import { consentimiento, UUID_DB } from '@/features/buzon-cfdi/types';

export const dynamic = 'force-dynamic';
const MAX_BYTES = 20 * 1024 * 1024;

/** Registra el consentimiento escrito de una pyme (RF-1). Del archivo firmado se guarda solo su huella. */
export async function POST(p: NextRequest): Promise<Response> {
  const ctx = await entra(p, true);
  if (ctx instanceof Response) return ctx;
  const form = await p.formData().catch(() => null);
  const archivo = form?.get('archivo');
  const d = consentimiento.safeParse({ pyme_id: form?.get('pyme_id'), firmado_en: form?.get('firmado_en') });
  if (!d.success || !(archivo instanceof File) || archivo.size === 0) return NextResponse.json({ error: 'falta la pyme, la fecha de firma o el documento firmado' }, { status: 400 });
  if (archivo.size > MAX_BYTES) return NextResponse.json({ error: 'el documento firmado pesa más de 20 MB' }, { status: 413 });
  return responde(await registraConsentimiento(ctx.supabase, { ...d.data, bytes: new Uint8Array(await archivo.arrayBuffer()) }));
}

/** Revoca el consentimiento vigente: la base borra lo de la pyme y deja la constancia (RF-3, RF-4). */
export async function DELETE(p: NextRequest): Promise<Response> {
  const ctx = await entra(p, true);
  if (ctx instanceof Response) return ctx;
  const pyme = p.nextUrl.searchParams.get('pyme') ?? '';
  if (!UUID_DB.test(pyme)) return NextResponse.json({ error: 'pyme no válida' }, { status: 400 });
  return responde(await revocaConsentimiento(ctx.supabase, pyme));
}
