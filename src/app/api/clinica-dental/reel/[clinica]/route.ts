/** El reel de la clínica (MP4 sintético), para verlo en el simulador de Telegram del laboratorio. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { CLINICAS } from '../../../../../../tools/clinica-dental/dist/index.js';
import { esLaboratorio, RUTAS } from '@/features/clinica-dental/services/servidor/datos';

export const dynamic = 'force-dynamic';

export async function GET(_p: NextRequest, { params }: { params: Promise<{ clinica: string }> }): Promise<Response> {
  const { clinica } = await params;
  if (!esLaboratorio() || !CLINICAS.some((c) => c.id === clinica)) return NextResponse.json({ error: 'no encontrado' }, { status: 404 });
  const bytes = await readFile(/*turbopackIgnore: true*/ join(RUTAS.reel, `${clinica}.mp4`)).catch(() => null);
  if (!bytes) return NextResponse.json({ error: 'falta el reel: corre node scripts/clinica-dental/reel.ts' }, { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: { 'content-type': 'video/mp4', 'cache-control': 'no-store' } });
}
