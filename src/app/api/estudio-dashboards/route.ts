/**
 * La ruta del lienzo del Estudio (laboratorio). Cierra con 503 fuera del laboratorio (`ESTUDIO_LABORATORIO=1`), y la
 * acción que llama al modelo también cierra con 503 sin su llave en el servidor: así queda en producción mientras no
 * se decida otra cosa (fila en docs/REVISION-rutas-publicas.md). Mismo origen y un límite por minuto: una página
 * ajena no gasta OpenRouter ni la CPU de MetricFlow.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { accionEsquema, ejecuta } from '@/features/estudio-dashboards/services/servidor/acciones';
import { esLaboratorio } from '@/features/estudio-dashboards/services/servidor/runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ventanas = new Map<string, { desde: number; n: number }>();
function excede(clave: string, n: number): boolean {
  const ahora = Date.now();
  const v = ventanas.get(clave);
  if (!v || ahora - v.desde > 60_000) { ventanas.set(clave, { desde: ahora, n: 1 }); return false; }
  v.n++;
  return v.n > n;
}

export async function POST(p: NextRequest): Promise<NextResponse> {
  if (!esLaboratorio()) return NextResponse.json({ error: 'el Estudio es solo de laboratorio' }, { status: 503 });
  const origen = p.headers.get('origin');
  if (origen && new URL(origen).host !== p.headers.get('host')) return NextResponse.json({ error: 'origen no permitido' }, { status: 403 });
  const a = accionEsquema.safeParse(await p.json().catch(() => null));
  if (!a.success) return NextResponse.json({ error: 'acción inválida', detalle: a.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  const ip = p.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (excede(`${ip}:${a.data.accion === 'instruccion' ? 'agente' : 'datos'}`, a.data.accion === 'instruccion' ? 20 : 240)) {
    return NextResponse.json({ error: 'demasiadas peticiones: espera un minuto' }, { status: 429 });
  }
  try {
    const r = await ejecuta(a.data);
    return NextResponse.json(r.cuerpo, { status: r.status });
  } catch (e) {
    const nombre = e instanceof Error ? e.name : '';
    const errores = (e as { errores?: unknown }).errores;
    const status = nombre === 'RechazoEsquema' || nombre === 'ConsultaInvalida' ? 422 : nombre === 'FallaDeCapa' ? 502 : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), ...(errores ? { errores } : {}) }, { status });
  }
}
