/**
 * Las palancas del LABORATORIO (solo con CLINICA_LABORATORIO=1 y mismo origen): avanzar el reloj, despachar los
 * avisos vencidos, mandar una edición del newsletter, simular la asistencia, que un paciente sintético abra el
 * deep link de Telegram, sellar el libro y verificarlo. Nada de esto existe fuera del laboratorio.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { CLINICAS, firmaSello, verificaSello } from '../../../../../tools/clinica-dental/dist/servidor.js';
import { rechazoDeBorde } from '@/features/clinica-dental/services/servidor/borde';
import { despacha, runtime } from '@/features/clinica-dental/services/servidor/runtime';

export const dynamic = 'force-dynamic';
const clinica = z.enum(CLINICAS.map((c) => c.id) as [string, ...string[]]);
const accion = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('avanza'), ms: z.number().int().min(0).max(120 * 86_400_000) }),
  z.object({ accion: z.literal('fija'), iso: z.string().datetime() }),
  z.object({ accion: z.literal('despacha') }),
  z.object({ accion: z.literal('newsletter'), clinica, edicion: z.string().regex(/^newsletter-\d{4}-\d{2}$/) }),
  z.object({ accion: z.literal('asistencia'), clinica, cita: z.string().regex(/^cit_[0-9a-f]{20}$/), asistio: z.boolean() }),
  z.object({ accion: z.literal('abre-telegram'), enlace: z.string().regex(/^https:\/\/t\.me\/[A-Za-z0-9_]+\?start=[A-Za-z0-9_-]{1,64}$/), chatId: z.number().int(), nombre: z.string().max(40) }),
  z.object({ accion: z.literal('sella') }),
  z.object({ accion: z.literal('verifica') }),
]);

export async function POST(p: NextRequest): Promise<NextResponse> {
  const rechazo = rechazoDeBorde(p, true);
  if (rechazo) return rechazo;
  const a = accion.safeParse(await p.json().catch(() => null));
  if (!a.success) return NextResponse.json({ error: 'acción inválida' }, { status: 400 });
  const rt = await runtime();
  const d = a.data;
  if (d.accion === 'avanza') await rt.avanzaReloj(d.ms);
  if (d.accion === 'fija') await rt.avanzaReloj(Date.parse(d.iso) - rt.reloj());
  if (d.accion === 'newsletter') await rt.portal.enviaNewsletter(d.clinica, d.edicion);
  if (d.accion === 'asistencia') await rt.portal.simulaAsistencia(d.clinica, d.cita, d.asistio);
  if (d.accion === 'abre-telegram') {
    const u = new URL(d.enlace);
    await rt.telegram.abreEnlace(u.pathname.slice(1), u.searchParams.get('start') ?? '', { id: d.chatId, nombre: d.nombre });
  }
  if (d.accion === 'sella' || d.accion === 'verifica') {
    const firma = firmaSello(rt.llaves.selloPrivada);
    const resultados = [];
    for (const c of CLINICAS) {
      if (d.accion === 'sella') await rt.portal.ctx.libro.sella(c.id, firma);
      resultados.push({ clinica: c.id, ...(await rt.portal.ctx.libro.verifica(c.id, verificaSello(rt.llaves.selloPublica))) });
    }
    return NextResponse.json({ ok: true, libro: resultados });
  }
  const despacho = d.accion === 'avanza' || d.accion === 'fija' || d.accion === 'despacha' || d.accion === 'newsletter' || d.accion === 'abre-telegram' ? await despacha() : null;
  return NextResponse.json({ ok: true, ahora: new Date(rt.reloj()).toISOString(), despacho });
}
