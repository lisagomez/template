/**
 * La identidad del paciente sale de la auth de la casa (Supabase), nunca del cuerpo de una peticion. El nucleo
 * recibe el id de la cuenta y de ahi deriva el seudonimo por clinica: un paciente no puede pedir lo de otro.
 */
import { createClient } from '@/lib/supabase/server';

export async function usuarioActual(): Promise<string | null> {
  if (!process.env['NEXT_PUBLIC_SUPABASE_URL'] || !process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Los mensajes de Supabase llegan en inglés; al paciente se le dicen en español y sin detalles internos. */
export function enEspanol(mensaje: string): string {
  if (/invalid login credentials/i.test(mensaje)) return 'Correo o contraseña incorrectos.';
  if (/already registered|already exists/i.test(mensaje)) return 'Ese correo ya tiene cuenta: entra con él.';
  if (/rate limit|too many/i.test(mensaje)) return 'Demasiados intentos; espera un momento.';
  if (/password/i.test(mensaje)) return 'La contraseña no cumple los requisitos (al menos 8 caracteres).';
  return 'No se pudo completar; intenta de nuevo.';
}
