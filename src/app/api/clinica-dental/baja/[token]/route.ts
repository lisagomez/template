/**
 * La baja del newsletter (RFC 8058). POST = el clic único: el token basta, SIN sesión, cookies ni pasos extra
 * (Gmail hace el POST desde sus servidores) y sin redirección. GET NUNCA da de baja (los escáneres de enlaces
 * hacen GET): muestra una página con un botón que hace el POST. Idempotente.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { runtime } from '@/features/clinica-dental/services/servidor/runtime';
import { esLaboratorio } from '@/features/clinica-dental/services/servidor/datos';

export const dynamic = 'force-dynamic';
const TOKEN = /^tok_[0-9a-f]{20}$/;
const html = (cuerpo: string, status = 200) => new Response(`<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Baja del newsletter</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5;color:#1f2937">${cuerpo}</body></html>`, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

export async function GET(_p: NextRequest, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  if (!esLaboratorio() || !TOKEN.test(token)) return html('<h1>Enlace inválido</h1>', 404);
  return html(`<h1>¿Te das de baja del newsletter?</h1><p>Dejarás de recibir las novedades y promociones. Los recordatorios de tus citas no cambian.</p><form method="post"><input type="hidden" name="List-Unsubscribe" value="One-Click"><button type="submit" style="font-size:1rem;padding:.75rem 1.25rem;border-radius:.5rem;border:0;background:#111827;color:#fff;cursor:pointer">Sí, darme de baja</button></form>`);
}

export async function POST(p: NextRequest, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  if (!esLaboratorio() || !TOKEN.test(token)) return NextResponse.json({ ok: false }, { status: 404 });
  const r = await (await runtime()).portal.baja(token, 'un_clic');
  if (!r.ok) return NextResponse.json({ ok: false }, { status: 404 });
  return (p.headers.get('accept') ?? '').includes('text/html')
    ? html('<h1>Listo: te diste de baja</h1><p>No recibirás más el newsletter. Puedes volver a suscribirte desde «Mis citas» en el portal.</p>')
    : NextResponse.json({ ok: true });
}
