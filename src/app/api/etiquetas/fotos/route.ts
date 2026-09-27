/**
 * POST /api/etiquetas/fotos — sube una foto (el cuerpo son los bytes de la imagen). Se valida por
 * su FIRMA, no por su nombre ni su Content-Type: un SVG o un HTML se rechazan. Se normaliza
 * (orientada, sin EXIF ni GPS, 2000 px) y se guarda por su huella SHA-256. Solo dispositivos de
 * operacion: uno de conteo no sube nada.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { puerta } from '@/features/etiquetas/services/servidor/puerta';
import { subeFoto } from '@/features/etiquetas/services/servidor/fotos';

export const dynamic = 'force-dynamic';
const MAXIMO = 15 * 1024 * 1024;

export async function POST(peticion: NextRequest): Promise<NextResponse> {
  const p = puerta(peticion);
  if (p instanceof NextResponse) return p;
  if (p.rol !== 'operacion') return NextResponse.json({ error: 'este dispositivo es de conteo: solo puede contar' }, { status: 403 });
  if (Number(peticion.headers.get('content-length') ?? 0) > MAXIMO) return NextResponse.json({ error: 'la foto pesa más de 15 MB' }, { status: 413 });
  const bytes = new Uint8Array(await peticion.arrayBuffer());
  if (bytes.length > MAXIMO) return NextResponse.json({ error: 'la foto pesa más de 15 MB' }, { status: 413 });
  try {
    const r = await subeFoto(bytes);
    return 'error' in r ? NextResponse.json(r, { status: 415 }) : NextResponse.json(r);
  } catch {
    return NextResponse.json({ error: 'no se pudo leer la imagen (¿está dañada?)' }, { status: 415 });
  }
}
