/**
 * El webhook del bot de la clínica. Telegram firma cada entrega con `X-Telegram-Bot-Api-Secret-Token` (el que se
 * fija en `setWebhook`): sin él, 401. Lo que llega es entrada NO autenticada de un tercero (C3): solo se acepta un
 * `/start <token>` de un solo uso; todo lo demás se ignora. En el laboratorio el simulador entrega aquí mismo.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { CLINICAS } from '../../../../../../tools/clinica-dental/dist/index.js';
import { esLaboratorio, SECRETO_WEBHOOK } from '@/features/clinica-dental/services/servidor/datos';
import { runtime } from '@/features/clinica-dental/services/servidor/runtime';

export const dynamic = 'force-dynamic';
const actualizacion = z.object({
  update_id: z.number().int(),
  message: z.object({ message_id: z.number().int(), date: z.number().int(), text: z.string().max(4096).optional(), chat: z.object({ id: z.number().int(), type: z.literal('private') }), from: z.object({ id: z.number().int(), is_bot: z.boolean(), first_name: z.string().max(64) }) }),
});

const iguales = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function POST(p: NextRequest, { params }: { params: Promise<{ clinica: string }> }): Promise<NextResponse> {
  const { clinica } = await params;
  if (!esLaboratorio() || !CLINICAS.some((c) => c.id === clinica)) return NextResponse.json({ ok: false }, { status: 404 });
  if (!iguales(p.headers.get('x-telegram-bot-api-secret-token') ?? '', SECRETO_WEBHOOK)) return NextResponse.json({ ok: false }, { status: 401 });
  const u = actualizacion.safeParse(await p.json().catch(() => null));
  if (!u.success) return NextResponse.json({ ok: true });
  const rt = await runtime();
  const r = await rt.portal.procesaActualizacion(clinica, u.data);
  await rt.guardaTelegram();
  return NextResponse.json({ ok: true, vinculado: r.ok });
}
