/** Los dias y horas libres de un servicio, para el calendario de la agenda. Publico (sin datos de nadie). */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { CLINICAS } from '../../../../../tools/clinica-dental/dist/index.js';
import { rechazoDeBorde } from '@/features/clinica-dental/services/servidor/borde';
import { runtime } from '@/features/clinica-dental/services/servidor/runtime';

export const dynamic = 'force-dynamic';

const esquema = z.object({
  clinica: z.enum(CLINICAS.map((c) => c.id) as [string, ...string[]]),
  servicio: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
  dias: z.coerce.number().int().min(1).max(62).default(42),
});

export async function GET(p: NextRequest): Promise<NextResponse> {
  const rechazo = rechazoDeBorde(p, false);
  if (rechazo) return rechazo;
  const q = esquema.safeParse(Object.fromEntries(p.nextUrl.searchParams));
  if (!q.success) return NextResponse.json({ error: 'consulta inválida' }, { status: 400 });
  const c = CLINICAS.find((x) => x.id === q.data.clinica)!;
  if (!c.servicios.some((s) => s.id === q.data.servicio)) return NextResponse.json({ error: 'servicio desconocido' }, { status: 404 });
  const rt = await runtime();
  const ahora = rt.reloj();
  const dias = await rt.portal.ctx.agenda(c.id).dias(q.data.servicio, ahora, ahora + q.data.dias * 86_400_000);
  return NextResponse.json({ ahora, zona: c.zona, dias }, { headers: { 'cache-control': 'no-store' } });
}
