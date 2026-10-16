/**
 * Centro de mando: las órdenes de LECTURA que necesitan el servidor (agenda, gasto). Lista
 * cerrada por Zod: no hay forma de pedir aquí nada que escriba. C3: Bearer obligatorio.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { leeAgenda } from '@/features/centro-de-mando/services/servidor/agenda';
import { estadoGasto } from '@/features/centro-de-mando/services/servidor/gasto';
import { rechazoSinToken } from '@/shared/lib/token-dictado';

export const dynamic = 'force-dynamic';

const esquema = z.object({ orden: z.enum(['agenda-hoy', 'agenda-manana', 'gasto']) });

const centavos = (usd: number) => `${(usd * 100).toFixed(2).replace('.', ' punto ')} centavos de dólar`;

export async function POST(peticion: NextRequest): Promise<NextResponse> {
  const rechazo = rechazoSinToken(peticion);
  if (rechazo) return rechazo;
  const cuerpo = esquema.safeParse(await peticion.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: 'orden de lectura desconocida' }, { status: 400 });
  try {
    if (cuerpo.data.orden === 'gasto') {
      const g = await estadoGasto();
      const sinCosto = g.filasSinCosto > 0 ? ` Hay ${g.filasSinCosto} llamadas sin costear: la cifra real es mayor.` : '';
      return NextResponse.json({ texto: `Llevo gastados ${centavos(g.gastadoUsd)} de un tope de ${g.presupuestoUsd} dólar.${sinCosto}` });
    }
    return NextResponse.json({ texto: await leeAgenda(cuerpo.data.orden === 'agenda-hoy' ? 'hoy' : 'mañana') });
  } catch {
    return NextResponse.json({ error: 'no se pudo leer' }, { status: 500 });
  }
}
