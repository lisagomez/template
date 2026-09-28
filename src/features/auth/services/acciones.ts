'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { destinoSeguro } from './destino';

export interface EstadoDeCuenta { error: string | null }

const credenciales = z.object({
  correo: z.string().trim().toLowerCase().email('Escribe un correo válido').max(254),
  contrasena: z.string().min(8, 'La contraseña lleva al menos 8 caracteres').max(72),
});

/** Los mensajes de Supabase llegan en inglés; al dueño se le dicen en español y sin detalles internos. */
function enEspanol(mensaje: string): string {
  if (/invalid login credentials/i.test(mensaje)) return 'Correo o contraseña incorrectos';
  if (/already registered|already exists/i.test(mensaje)) return 'Ese correo ya tiene cuenta: entra con él';
  if (/rate limit|too many/i.test(mensaje)) return 'Demasiados intentos; espera un momento';
  if (/password/i.test(mensaje)) return 'La contraseña no cumple los requisitos';
  return 'No se pudo completar; intenta de nuevo';
}

function lee(datos: FormData) {
  return credenciales.safeParse({ correo: datos.get('correo'), contrasena: datos.get('contrasena') });
}

export async function entrar(_previo: EstadoDeCuenta, datos: FormData): Promise<EstadoDeCuenta> {
  const r = lee(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? 'Datos inválidos' };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: r.data.correo, password: r.data.contrasena });
  if (error) return { error: enEspanol(error.message) };
  revalidatePath('/', 'layout');
  redirect(destinoSeguro(datos.get('siguiente')));
}

export async function crearCuenta(_previo: EstadoDeCuenta, datos: FormData): Promise<EstadoDeCuenta> {
  const r = lee(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? 'Datos inválidos' };
  const nombre = z.string().trim().max(80).safeParse(datos.get('nombre') ?? '');
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: r.data.correo,
    password: r.data.contrasena,
    options: { data: { full_name: nombre.success && nombre.data ? nombre.data : null } },
  });
  if (error) return { error: enEspanol(error.message) };
  // Sin confirmación por correo (proyecto de desarrollo) la sesión llega aquí mismo. Si algún día se
  // vuelve a pedir confirmación, no hay sesión y se dice, en vez de fingir que entró.
  if (!data.session) return { error: 'Cuenta creada; falta confirmarla por correo antes de entrar' };
  revalidatePath('/', 'layout');
  redirect(destinoSeguro(datos.get('siguiente')));
}

export async function salir(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
