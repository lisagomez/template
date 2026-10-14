/** Lo que toda página de /sgi/[org] necesita: sesión, contexto (o fuera) y el modo de lectura. */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { cargaContexto } from './contexto';
import type { Modo } from '../components/textos';

export async function modoActual(): Promise<Modo> {
  return (await cookies()).get('sgi_modo')?.value === 'pyme' ? 'pyme' : 'experto';
}

export async function contextoDePagina(orgId: string) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/login?siguiente=/sgi/${orgId}`);
  const ctx = /^[0-9a-f-]{36}$/.test(orgId) ? await cargaContexto(sb, orgId) : null;
  if (!ctx) redirect('/sgi?error=Esa%20organizaci%C3%B3n%20no%20existe%20o%20no%20tienes%20acceso');
  return { sb, ctx, modo: await modoActual() };
}

export type Busqueda = Promise<{ aviso?: string; error?: string }>;
