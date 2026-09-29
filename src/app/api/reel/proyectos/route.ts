import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { carpetaDe, guarda } from '@/features/reel/services/servidor/almacen';
import { reprocesa } from '@/features/reel/services/servidor/reproceso';
import { conSesion } from '@/features/reel/services/servidor/sesion';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 200 * 1024 * 1024;
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const datos = z.object({
  titulo: z.string().trim().min(1).max(120),
  negocio: z.string().trim().min(1).max(60),
  primario: hex,
  catalogo: z.string().max(2000),
  diccionario: z.string().max(1000).default(''),
});

/** «pan de muerto = 45» por línea → catálogo. Líneas que no entienda se ignoran. */
const leeCatalogo = (s: string) => s.split('\n').map((l) => /^\s*(.{2,60}?)\s*=\s*\$?\s*(\d{1,6}(?:[.,]\d{1,2})?)\s*$/.exec(l)).filter((m): m is RegExpExecArray => m !== null)
  .map((m) => ({ nombre: (m[1] ?? '').toLowerCase(), precio: Number((m[2] ?? '0').replace(',', '.')) })).slice(0, 50);
const leeDiccionario = (s: string) => Object.fromEntries(s.split('\n').map((l) => /^\s*([^=]{2,30})=\s*(.{2,40})\s*$/.exec(l)).filter((m): m is RegExpExecArray => m !== null).map((m) => [(m[1] ?? '').trim().toLowerCase(), (m[2] ?? '').trim()]));

/** Sube el clip del celular y lo procesa. El archivo va al almacén del servidor; a Supabase solo el proyecto. */
export async function POST(p: NextRequest): Promise<Response> {
  const ctx = await conSesion(p, true);
  if (ctx instanceof Response) return ctx;
  const form = await p.formData().catch(() => null);
  const archivo = form?.get('archivo');
  const d = datos.safeParse(Object.fromEntries([...(form?.entries() ?? [])].filter(([k]) => k !== 'archivo')));
  if (!d.success || !(archivo instanceof File)) return NextResponse.json({ error: 'faltan datos o el clip' }, { status: 400 });
  if (archivo.size > MAX_BYTES) return NextResponse.json({ error: 'el clip pesa más de 200 MB' }, { status: 413 });
  const { data: proyecto, error } = await ctx.supabase.from('reel_proyectos').insert({ titulo: d.data.titulo }).select('id').single();
  if (error || !proyecto) return NextResponse.json({ error: 'no se pudo crear el proyecto' }, { status: 500 });
  const carpeta = carpetaDe(ctx.usuario.id, String(proyecto.id));
  await guarda(carpeta, 'bruto.mp4', new Uint8Array(await archivo.arrayBuffer()));
  await guarda(carpeta, 'proyecto.json', JSON.stringify({
    titulo: d.data.titulo, catalogo: leeCatalogo(d.data.catalogo), diccionario: leeDiccionario(d.data.diccionario),
    marca: { nombre: d.data.negocio, colores: { primario: d.data.primario, texto: '#ffffff' }, tipografia: 'sans' },
  }));
  try {
    const r = await reprocesa(ctx.supabase, ctx.usuario.id, String(proyecto.id));
    return NextResponse.json({ id: proyecto.id, ...r });
  } catch (e) {
    const ocupado = e instanceof Error && e.message === 'ocupado';
    return NextResponse.json({ id: proyecto.id, error: ocupado ? 'hay otro reel en proceso; intenta en un minuto' : 'no se pudo procesar el clip' }, { status: ocupado ? 429 : 500 });
  }
}
