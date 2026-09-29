import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { NextResponse, type NextRequest } from 'next/server';
import { carpetaDe } from '@/features/reel/services/servidor/almacen';
import { conSesion, UUID } from '@/features/reel/services/servidor/sesion';

export const dynamic = 'force-dynamic';

/**
 * El máster (o su hoja de cuadros) para la sala. Solo si el proyecto es de quien pide: se comprueba con
 * RLS antes de tocar el disco. Soporta `Range` (Safari en iPhone no reproduce video sin él).
 */
export async function GET(p: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  const ctx = await conSesion(p, false);
  if (ctx instanceof Response) return ctx;
  const { data } = await ctx.supabase.from('reel_proyectos').select('id').eq('id', id).maybeSingle();
  if (!data) return NextResponse.json({ error: 'no encontrado' }, { status: 404 });
  const hoja = p.nextUrl.searchParams.get('tipo') === 'hoja';
  const ruta = join(carpetaDe(ctx.usuario.id, id), hoja ? 'hoja.png' : 'master.mp4');
  const info = await stat(ruta).catch(() => null);
  if (!info) return NextResponse.json({ error: 'aún no hay máster' }, { status: 404 });
  const tipo = hoja ? 'image/png' : 'video/mp4';
  const rango = /^bytes=(\d*)-(\d*)$/.exec(p.headers.get('range') ?? '');
  const base = { 'content-type': tipo, 'accept-ranges': 'bytes', 'cache-control': 'no-store' };
  if (!rango || hoja) return new Response(Readable.toWeb(createReadStream(ruta)) as ReadableStream, { headers: { ...base, 'content-length': String(info.size) } });
  const inicio = rango[1] ? Number(rango[1]) : 0, fin = rango[2] ? Math.min(Number(rango[2]), info.size - 1) : info.size - 1;
  if (inicio > fin || inicio >= info.size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${info.size}` } });
  return new Response(Readable.toWeb(createReadStream(ruta, { start: inicio, end: fin })) as ReadableStream, {
    status: 206, headers: { ...base, 'content-length': String(fin - inicio + 1), 'content-range': `bytes ${inicio}-${fin}/${info.size}` },
  });
}
