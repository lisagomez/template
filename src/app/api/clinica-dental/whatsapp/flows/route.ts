/**
 * El endpoint de datos de los Flows de WhatsApp (agendar, reprogramar, cancelar). Cifrado (RSA-OAEP + AES-128-GCM)
 * y firmado; la respuesta va cifrada en texto plano base64. 432 firma, 421 no descifra, 427 `flow_token` inválido o
 * de un número ya no vinculado. Meta da 10 s por petición: todo es local. En el laboratorio el simulador llama en
 * proceso al mismo endpoint; esta ruta es la del canal real (que no abre sin su gate) y la del borde.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { atiendeEndpointFlows } from '../../../../../../tools/clinica-dental/dist/servidor.js';
import { esLaboratorio } from '@/features/clinica-dental/services/servidor/datos';
import { runtime } from '@/features/clinica-dental/services/servidor/runtime';

export const dynamic = 'force-dynamic';

export async function POST(p: NextRequest): Promise<NextResponse> {
  if (!esLaboratorio()) return new NextResponse('', { status: 404 });
  const cuerpo = await p.text();
  if (cuerpo.length > 256 * 1024) return new NextResponse('', { status: 413 });
  const rt = await runtime();
  const r = await atiendeEndpointFlows(rt.whatsapp.flows(), cuerpo, p.headers.get('x-hub-signature-256'));
  return new NextResponse(r.cuerpo, { status: r.status, headers: { 'content-type': 'text/plain' } });
}
