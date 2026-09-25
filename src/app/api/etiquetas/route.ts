/**
 * /api/etiquetas — GET: el estado (catalogo, sitios, impresoras, existencias). POST: una accion
 * validada con Zod (catalogo, configuracion, impresora, SSCC, etiquetado, recepcion, ticket
 * para el agente). Bearer + operador obligatorios (`puerta`).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { esquemaAccion } from '@/features/etiquetas/services/esquemas';
import { ejecuta, leeEstado } from '@/features/etiquetas/services/servidor/acciones';
import { puerta } from '@/features/etiquetas/services/servidor/puerta';

export const dynamic = 'force-dynamic';

export async function GET(peticion: NextRequest): Promise<NextResponse> {
  const p = puerta(peticion);
  if (p instanceof NextResponse) return p;
  const r = await leeEstado();
  return NextResponse.json(r.cuerpo, { status: r.status });
}

export async function POST(peticion: NextRequest): Promise<NextResponse> {
  const p = puerta(peticion);
  if (p instanceof NextResponse) return p;
  const cuerpo = esquemaAccion.safeParse(await peticion.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: 'petición inválida', detalle: cuerpo.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  try {
    const r = await ejecuta(cuerpo.data, p.operador);
    const error = typeof r.cuerpo === 'object' && r.cuerpo !== null && 'error' in r.cuerpo;
    return NextResponse.json(r.cuerpo, { status: error && r.status === 200 ? 422 : r.status });
  } catch {
    return NextResponse.json({ error: 'no se pudo completar la acción' }, { status: 500 });
  }
}
