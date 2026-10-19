'use server';

/**
 * Las acciones de WhatsApp del portal: pedir el código, confirmar o rechazar el número que lo mandó, y desvincular.
 * Identidad desde la sesión, Zod en la entrada; el núcleo decide (nada se le manda a un número que la persona no
 * confirmó desde aquí).
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { CLINICAS } from '../../../../../tools/clinica-dental/dist/index.js';
import { exigeLaboratorio } from './datos';
import { despacha, runtime } from './runtime';
import { usuarioActual } from './sesion';
import type { ResultadoAccion } from './acciones';

const idClinica = z.enum(CLINICAS.map((c) => c.id) as [string, ...string[]]);
const ultimos4 = z.string().regex(/^\d{4}$/, 'Escribe los 4 últimos dígitos del número').optional();

async function sesion(clinica: unknown): Promise<{ c: string; usuario: string } | null> {
  exigeLaboratorio();
  const usuario = await usuarioActual();
  return usuario ? { c: idClinica.parse(clinica), usuario } : null;
}

const sinSesion = { ok: false as const, error: 'Tu sesión terminó: vuelve a entrar.', sinSesion: true };

export async function codigoWhatsapp(clinica: unknown): Promise<ResultadoAccion<{ codigo: string; enlace: string }>> {
  const s = await sesion(clinica);
  if (!s) return sinSesion;
  try {
    const r = await (await runtime()).portal.whatsapp.codigo(s.c, s.usuario);
    revalidatePath(`/clinica/${s.c}/mis-citas`);
    return { ok: true, valor: { codigo: r.codigo, enlace: r.enlace } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo generar el código.' };
  }
}

export async function confirmaWhatsapp(clinica: unknown, digitos: unknown): Promise<ResultadoAccion<{ ultimos4: string }>> {
  const s = await sesion(clinica);
  if (!s) return sinSesion;
  const d = ultimos4.safeParse(digitos || undefined);
  if (!d.success) return { ok: false, error: d.error.issues[0]?.message ?? 'Dígitos inválidos' };
  const r = await (await runtime()).portal.whatsapp.confirma(s.c, s.usuario, d.data ? { ultimos4: d.data } : {});
  if (!r.ok) return { ok: false, error: r.mensaje };
  await despacha();
  revalidatePath(`/clinica/${s.c}/mis-citas`);
  return { ok: true, valor: { ultimos4: r.ultimos4 } };
}

export async function rechazaWhatsapp(clinica: unknown): Promise<ResultadoAccion> {
  const s = await sesion(clinica);
  if (!s) return sinSesion;
  await (await runtime()).portal.whatsapp.rechaza(s.c, s.usuario);
  revalidatePath(`/clinica/${s.c}/mis-citas`);
  return { ok: true, valor: undefined };
}

export async function desvinculaWhatsapp(clinica: unknown): Promise<ResultadoAccion> {
  const s = await sesion(clinica);
  if (!s) return sinSesion;
  await (await runtime()).portal.whatsapp.desvincula(s.c, s.usuario);
  revalidatePath(`/clinica/${s.c}/mis-citas`);
  return { ok: true, valor: undefined };
}
