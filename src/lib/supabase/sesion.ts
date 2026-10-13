import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * Una ruta de la API entra con la sesión de quien llama y la llave anónima: RLS decide (C7). Para escribir se
 * exige además `Origin` presente y del mismo sitio — sin él no se aprueba nada (la sonda de sfstudio
 * aprobó un post desde otro origen; aquí eso no pasa). Nació en el reel; la comparte el buzón (spec 015).
 */
export interface Contexto { supabase: SupabaseClient; usuario: User }

export async function conSesion(p: NextRequest, escribe: boolean): Promise<Contexto | Response> {
  if (escribe) {
    const origen = p.headers.get('origin');
    if (!origen || new URL(origen).host !== p.headers.get('host')) return NextResponse.json({ error: 'origen no permitido' }, { status: 403 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'sin sesión' }, { status: 401 });
  return { supabase, usuario: user };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
