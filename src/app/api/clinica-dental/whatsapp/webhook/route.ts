/**
 * El webhook de WhatsApp de la clínica (Cloud API). GET: el saludo de la suscripción (`hub.challenge` solo con el
 * token de verificación, comparado en tiempo constante). POST: la firma `X-Hub-Signature-256` se verifica sobre los
 * BYTES CRUDOS (se lee `text()`, nunca el JSON re-serializado), el cuerpo entra a la cola durable y se contesta 200;
 * el proceso va después. En el laboratorio el simulador entrega en proceso por el mismo receptor; esta ruta existe
 * para el canal real, que no abre sin su gate, y para probar el borde (una firma falsa es 401).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { respondeVerificacion } from '../../../../../../tools/ventas-whatsapp/dist/index.js';
import { esLaboratorio, VERIFICA_WA } from '@/features/clinica-dental/services/servidor/datos';
import { runtime } from '@/features/clinica-dental/services/servidor/runtime';

export const dynamic = 'force-dynamic';
const MAX_BYTES = 512 * 1024;

export async function GET(p: NextRequest): Promise<NextResponse> {
  if (!esLaboratorio()) return new NextResponse('no disponible', { status: 404 });
  const r = respondeVerificacion(p.nextUrl.searchParams, VERIFICA_WA);
  return new NextResponse(r.cuerpo, { status: r.status, headers: { 'content-type': 'text/plain' } });
}

export async function POST(p: NextRequest): Promise<NextResponse> {
  if (!esLaboratorio()) return NextResponse.json({ ok: false }, { status: 404 });
  const cuerpo = await p.text();
  if (cuerpo.length > MAX_BYTES) return NextResponse.json({ ok: false }, { status: 413 });
  const rt = await runtime();
  const r = await rt.whatsapp.receptor().recibe(cuerpo, p.headers.get('x-hub-signature-256'));
  return NextResponse.json({ ok: r.status === 200 }, { status: r.status });
}
