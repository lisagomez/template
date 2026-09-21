/**
 * El historial del dictado para la pagina /historial: leer con filtros (GET), corregir, borrar uno o
 * un rango, pegar en la PC, exportar y estadisticas (POST por `orden`). Todo por `maquina.mjs`
 * (mismas piezas que el CLI; el bundle no toca el disco del banco). Bearer obligatorio: es lo
 * dictado por la persona. Borrar exige `confirmo: true` ademas: la pantalla lo pide dos veces.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { calculaEstadisticas } from '@/features/historial/services/estadisticas';
import { exporta, TIPO_MIME } from '@/features/historial/services/exporta';
import type { Dictado, Pagina, TrayectoriaResumen } from '@/features/historial/services/tipos';
import { maquina } from '@/features/laboratorio-voz/services/servidor/dictado-cli';
import { rechazoSinToken } from '@/shared/lib/token-dictado';
import { pegaEnPc } from '@/shared/lib/transcriptor-local';

export const dynamic = 'force-dynamic';

const esquemaFiltros = z.object({
  consulta: z.string().max(200).optional(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  motor: z.string().max(120).optional(),
  soloCorregidos: z.boolean().optional(),
  latenciaMinMs: z.number().int().min(0).max(600_000).optional(),
});

const esquemaOrden = z.discriminatedUnion('orden', [
  z.object({ orden: z.literal('lee'), filtros: esquemaFiltros.default({}), desde: z.number().int().min(0).default(0), cuantos: z.number().int().min(1).max(500).default(100) }),
  z.object({ orden: z.literal('corrige'), id: z.string().trim().min(1).max(60), texto: z.string().min(1).max(5000) }),
  z.object({ orden: z.literal('borra-uno'), id: z.string().trim().min(1).max(60), confirmo: z.literal(true) }),
  z.object({ orden: z.literal('borra-rango'), antesDe: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), confirmo: z.literal(true) }),
  z.object({ orden: z.literal('pega'), texto: z.string().min(1).max(5000) }),
  z.object({ orden: z.literal('exporta'), filtros: esquemaFiltros.default({}), formato: z.enum(['md', 'csv', 'json']), hoy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ orden: z.literal('estadisticas'), hoy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
]);

const filtrosDeUrl = (url: URL) => {
  const q = (n: string) => url.searchParams.get(n) ?? undefined;
  return esquemaFiltros.safeParse({
    consulta: q('consulta'),
    desde: q('desde'),
    hasta: q('hasta'),
    motor: q('motor'),
    soloCorregidos: q('corregidos') === '1' ? true : undefined,
    latenciaMinMs: q('latenciaMin') ? Number(q('latenciaMin')) : undefined,
  });
};

/** GET /api/historial?consulta=…&desde=…&hasta=…&motor=…&corregidos=1&latenciaMin=…&pagina=0&cuantos=100 */
export async function GET(peticion: NextRequest): Promise<NextResponse> {
  const rechazo = rechazoSinToken(peticion);
  if (rechazo) return rechazo;
  const url = new URL(peticion.url);
  const filtros = filtrosDeUrl(url);
  if (!filtros.success) return NextResponse.json({ error: 'filtros invalidos' }, { status: 400 });
  const cuantos = Math.min(500, Math.max(1, Number(url.searchParams.get('cuantos') ?? 100) || 100));
  const desde = Math.max(0, Number(url.searchParams.get('desde') ?? 0) || 0);
  try {
    return NextResponse.json(await maquina<Pagina>('historial-lee', { filtros: filtros.data, desde, cuantos }));
  } catch {
    return NextResponse.json({ error: 'no se pudo leer el historial' }, { status: 500 });
  }
}

export async function POST(peticion: NextRequest): Promise<Response> {
  const rechazo = rechazoSinToken(peticion);
  if (rechazo) return rechazo;
  const cuerpo = esquemaOrden.safeParse(await peticion.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: 'orden invalida' }, { status: 400 });
  const o = cuerpo.data;
  try {
    switch (o.orden) {
      case 'lee':
        return NextResponse.json(await maquina<Pagina>('historial-lee', { filtros: o.filtros, desde: o.desde, cuantos: o.cuantos }));
      case 'corrige':
        return NextResponse.json(await maquina('historial-corrige', { id: o.id, texto: o.texto }));
      case 'borra-uno':
        return NextResponse.json(await maquina('historial-borra-uno', { id: o.id }));
      case 'borra-rango':
        return NextResponse.json(await maquina('historial-borra-rango', { antesDe: o.antesDe }));
      case 'pega':
        await pegaEnPc(o.texto);
        return NextResponse.json({ pegado: true });
      case 'exporta': {
        const { entradas } = await maquina<{ entradas: Dictado[] }>('historial-todo', { filtros: o.filtros });
        const cuerpoArchivo = exporta(entradas, o.formato, o.hoy);
        return new Response(cuerpoArchivo, { headers: { 'content-type': TIPO_MIME[o.formato], 'content-disposition': `attachment; filename="historial-dictado-${o.hoy}.${o.formato}"`, 'x-entradas': String(entradas.length) } });
      }
      case 'estadisticas': {
        const [{ entradas }, { trayectorias }] = await Promise.all([maquina<{ entradas: Dictado[] }>('historial-todo', { filtros: {} }), maquina<{ trayectorias: TrayectoriaResumen[] }>('historial-trayectorias')]);
        return NextResponse.json(calculaEstadisticas(entradas, trayectorias, o.hoy));
      }
    }
  } catch {
    return NextResponse.json({ error: 'no se pudo aplicar la orden' }, { status: 500 });
  }
}
