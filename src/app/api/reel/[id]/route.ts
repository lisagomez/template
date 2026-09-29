import { NextResponse, type NextRequest } from 'next/server';
import { borraCarpeta, carpetaDe, lista } from '@/features/reel/services/servidor/almacen';
import { conSesion, UUID } from '@/features/reel/services/servidor/sesion';

export const dynamic = 'force-dynamic';

/** «Borrar proyecto» verificable: bruto, transcripción, máster y registros, en Supabase y en el disco. */
export async function DELETE(p: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  const ctx = await conSesion(p, true);
  if (ctx instanceof Response) return ctx;
  const carpeta = carpetaDe(ctx.usuario.id, id);
  const antes = await lista(carpeta);
  const { data, error } = await ctx.supabase.from('reel_proyectos').delete().eq('id', id).select('id');
  if (error || !data?.length) return NextResponse.json({ error: 'no encontrado' }, { status: 404 });
  await borraCarpeta(carpeta);
  return NextResponse.json({ borrado: id, archivosAntes: antes.length, archivosDespues: (await lista(carpeta)).length });
}
