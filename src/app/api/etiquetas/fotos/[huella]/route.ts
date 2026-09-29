/**
 * GET /api/etiquetas/fotos/<huella> — una foto guardada, por su huella. Con la misma puerta que
 * el resto (Bearer + operador); el navegador la pide con fetch y la muestra como blob. Se sirve
 * con su tipo real, `nosniff` y sin permiso para ejecutar nada.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { puerta } from '@/features/etiquetas/services/servidor/puerta';
import { fotosDelServidor } from '@/features/etiquetas/services/servidor/fotos';
import { CONTENT_TYPE } from '@/features/etiquetas/services/nucleo';

export const dynamic = 'force-dynamic';

export async function GET(peticion: NextRequest, { params }: { params: Promise<{ huella: string }> }): Promise<NextResponse> {
  const p = puerta(peticion);
  if (p instanceof NextResponse) return p;
  const { huella } = await params;
  const h = decodeURIComponent(huella);
  if (!/^sha256:[0-9a-f]{64}$/.test(h)) return NextResponse.json({ error: 'huella inválida' }, { status: 400 });
  const f = await fotosDelServidor().lee(h);
  if (!f) return NextResponse.json({ error: 'no hay una foto con esa huella' }, { status: 404 });
  return new NextResponse(Buffer.from(f.bytes), {
    headers: {
      'content-type': CONTENT_TYPE[f.tipo], 'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox",
    },
  });
}
