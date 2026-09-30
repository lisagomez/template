/**
 * Entorno de la Supabase LOCAL (Docker, CLI pineado). Devuelve solo la URL y la llave ANÓNIMA: la siembra y las pruebas
 * entran con sesiones de usuarios sintéticos, así que ejercitan las mismas políticas RLS que la app y nunca usan
 * service_role (C7). Nada de esto se imprime.
 */
import { execFileSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

export const CLI_SUPABASE = 'supabase@2.118.0';

export function entornoLocal(): { url: string; anon: string } {
  const salida = execFileSync('npx', ['-y', CLI_SUPABASE, 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const j = JSON.parse(salida.slice(salida.indexOf('{'))) as Record<string, string>;
  if (!j.API_URL?.startsWith('http://127.0.0.1') || !j.ANON_KEY) throw new Error('Supabase local no está corriendo: npx -y supabase@2.118.0 start');
  return { url: j.API_URL, anon: j.ANON_KEY };
}

export function clienteAnonimo(e = entornoLocal()): SupabaseClient {
  return createClient(e.url, e.anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface Cuenta { readonly c: SupabaseClient; readonly id: string; readonly correo: string; readonly clave: string }

/** Alta de una cuenta sintética (@example.com: dominio reservado, ningún correo llega a nadie). */
export async function altaCuenta(etiqueta: string, e = entornoLocal(), correo?: string, clave?: string): Promise<Cuenta> {
  const c = clienteAnonimo(e);
  const mail = correo ?? `sgi-${etiqueta}-${Date.now()}-${randomBytes(3).toString('hex')}@example.com`;
  const pass = clave ?? randomBytes(18).toString('base64url');
  let r = await c.auth.signUp({ email: mail, password: pass });
  if (r.error?.message.includes('already registered')) r = await c.auth.signInWithPassword({ email: mail, password: pass }) as typeof r;
  if (r.error || !r.data.session || !r.data.user) throw new Error(`no se pudo crear la cuenta ${etiqueta}: ${r.error?.message ?? 'sin sesión'}`);
  return { c, id: r.data.user.id, correo: mail, clave: pass };
}
