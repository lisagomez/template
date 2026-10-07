import { NextResponse, type NextRequest } from 'next/server';
import { conSesion, type Contexto } from '@/lib/supabase/sesion';
import { soyMiembro } from './buzon';

/**
 * Toda ruta del buzón: sesión (y, para escribir, mismo origen) y ser miembro del despacho. El RLS lo vuelve a
 * exigir; esto lo dice antes y claro. Las rutas de `/api/buzon` NO pasan por `src/proxy.ts`: ahí Next 16 corta
 * el cuerpo a 10 MB sin dar error, y un documento puede pesar hasta 20.
 */
export async function entra(p: NextRequest, escribe: boolean): Promise<Contexto | Response> {
  const ctx = await conSesion(p, escribe);
  if (ctx instanceof Response) return ctx;
  if (!(await soyMiembro(ctx.supabase))) return NextResponse.json({ error: 'tu cuenta no es miembro de este despacho' }, { status: 403 });
  return ctx;
}

export const responde = <T>(r: { ok: true; datos: T } | { ok: false; estado: number; aviso: string }) =>
  r.ok ? NextResponse.json(r.datos) : NextResponse.json({ error: r.aviso }, { status: r.estado });
