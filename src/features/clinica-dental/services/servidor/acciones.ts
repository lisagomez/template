'use server';

/**
 * Las acciones del portal del paciente. Cada una: Zod sobre la entrada (el servidor no confia en lo que valido
 * el navegador), identidad desde la sesion, y el nucleo hace el resto. Las escrituras SOLO pasan por aqui, con
 * el clic de la persona: el asistente nunca llama a estas acciones.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { aDataLayer, CANALES_ADQUISICION, CLINICAS, esquemaCuenta, validaRegistro, type ErroresCampo, type EventoDataLayer } from '../../../../../tools/clinica-dental/dist/index.js';
import { createClient } from '@/lib/supabase/server';
import { exigeLaboratorio, URL_PORTAL } from './datos';
import { despacha, runtime } from './runtime';
import { enEspanol, usuarioActual } from './sesion';

const idClinica = z.enum(CLINICAS.map((c) => c.id) as [string, ...string[]]);
const credenciales = z.object({ correo: z.string().trim().toLowerCase().email('Escribe un correo válido').max(254), contrasena: z.string().min(8, 'La contraseña lleva al menos 8 caracteres').max(72) });
const siguienteSeguro = (clinica: string, s: unknown) => (typeof s === 'string' && new RegExp(`^/clinica/${clinica}(/[a-z-]*)?(\\?[a-z=&-]*)?$`).test(s) ? s : `/clinica/${clinica}/mis-citas`);

export interface EstadoEntrar { error: string | null }

export async function entrar(clinica: string, _previo: EstadoEntrar, datos: FormData): Promise<EstadoEntrar> {
  exigeLaboratorio();
  const c = idClinica.parse(clinica);
  const r = credenciales.safeParse({ correo: datos.get('correo'), contrasena: datos.get('contrasena') });
  if (!r.success) return { error: r.error.issues[0]?.message ?? 'Datos inválidos' };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: r.data.correo, password: r.data.contrasena });
  if (error) return { error: enEspanol(error.message) };
  revalidatePath(`/clinica/${c}`, 'layout');
  redirect(siguienteSeguro(c, datos.get('siguiente')));
}

export interface EstadoRecuperar { enviado: boolean; error: string | null }

/** Siempre la misma respuesta, exista o no la cuenta (no se enumeran correos). El correo va al buzon LOCAL. */
export async function recuperar(clinica: string, _previo: EstadoRecuperar, datos: FormData): Promise<EstadoRecuperar> {
  exigeLaboratorio();
  const c = idClinica.parse(clinica);
  const correo = credenciales.shape.correo.safeParse(datos.get('correo'));
  if (!correo.success) return { enviado: false, error: 'Escribe un correo válido.' };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(correo.data, { redirectTo: `${URL_PORTAL}/clinica/${c}/entrar` });
  return { enviado: true, error: null };
}

const meta = z.object({
  visitante: z.string().regex(/^vis_[0-9a-f]{20}$/).nullable(),
  via: z.enum(['escrito', 'voz']),
  canal: z.enum(CANALES_ADQUISICION),
  segundos: z.number().int().min(0).max(86_400).nullable(),
});

export type ResultadoRegistro =
  | { ok: true; descartadoPadecimiento: boolean; dataLayer: EventoDataLayer[] }
  | { ok: false; errores: ErroresCampo };

/** Valida TODO antes de crear la cuenta: un registro invalido no deja una cuenta huerfana. Sin PII en los metadatos de auth. */
export async function registrar(clinica: string, entrada: unknown, contrasena: string, metadatos: unknown): Promise<ResultadoRegistro> {
  exigeLaboratorio();
  const c = idClinica.parse(clinica);
  const v = validaRegistro(entrada);
  const cuenta = esquemaCuenta.safeParse({ contrasena });
  const m = meta.safeParse(metadatos);
  if (!v.ok || !cuenta.success || !m.success) {
    return { ok: false, errores: { ...(v.ok ? {} : v.errores), ...(cuenta.success ? {} : { contrasena: cuenta.error.issues[0]?.message ?? 'Contraseña inválida' }), ...(m.success ? {} : { formulario: 'Vuelve a cargar la página' }) } };
  }
  let usuario = await usuarioActual();
  if (!usuario) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({ email: v.registro.correo, password: cuenta.data.contrasena });
    if (error) return { ok: false, errores: { correo: enEspanol(error.message) } };
    if (!data.session || !data.user) return { ok: false, errores: { formulario: 'La cuenta se creó pero falta confirmarla por correo.' } };
    usuario = data.user.id;
  }
  const rt = await runtime();
  const r = await rt.portal.registra({ clinica: c, usuario, entrada, visitante: m.data.visitante, via: m.data.via, canal: m.data.canal, segundos: m.data.segundos });
  if (!r.ok) return { ok: false, errores: r.errores };
  const eventos = await rt.portal.ctx.libro.eventos(c);
  const suyos = eventos.filter((e) => e.tipo === 'paciente_registrado' && e.sujeto === r.paciente.seudonimo).map(aDataLayer).filter((x): x is EventoDataLayer => x !== null);
  // Sin revalidar: la página de registro redirige a quien ya es paciente, y revalidar aquí taparía la confirmación
  // (con el aviso de lo descartado). El siguiente paso es una navegación completa, que ya trae la sesión.
  return { ok: true, descartadoPadecimiento: r.descartado.padecimiento, dataLayer: suyos };
}

export async function salir(clinica: string): Promise<void> {
  const c = idClinica.parse(clinica);
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath(`/clinica/${c}`, 'layout');
  redirect(`/clinica/${c}`);
}

const reservaEntrada = z.object({
  servicio: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
  inicio: z.string().datetime(),
  canales: z.array(z.enum(['correo', 'telegram'])).max(2),
  newsletter: z.boolean(),
  clave: z.string().regex(/^[a-z0-9-]{8,64}$/),
}).strict();

export type ResultadoAccion<T = undefined> = { ok: true; valor: T; dataLayer?: EventoDataLayer[] } | { ok: false; error: string; sinSesion?: boolean };

async function exigeUsuario(): Promise<string | null> {
  exigeLaboratorio();
  return usuarioActual();
}

export async function reservar(clinica: string, entrada: unknown): Promise<ResultadoAccion<{ cita: string; telegramPorVincular: boolean }>> {
  const c = idClinica.parse(clinica);
  const usuario = await exigeUsuario();
  if (!usuario) return { ok: false, error: 'Entra con tu cuenta para confirmar la cita.', sinSesion: true };
  const e = reservaEntrada.safeParse(entrada);
  if (!e.success) return { ok: false, error: 'Revisa el horario y los avisos elegidos.' };
  const rt = await runtime();
  if (!(await rt.portal.paciente(c, usuario))) return { ok: false, error: 'Primero completa tu registro en esta clínica.' };
  const r = await rt.portal.reserva({ clinica: c, usuario, ...e.data });
  if (!r.ok) return { ok: false, error: r.motivo === 'ocupado' ? 'Alguien acaba de apartar ese horario. Elige otro, por favor.' : r.detalle };
  await despacha();
  const evento = (await rt.portal.ctx.libro.eventos(c)).find((x) => x.tipo === 'cita_confirmada' && x.cita === r.cita.id);
  revalidatePath(`/clinica/${c}/mis-citas`);
  return { ok: true, valor: { cita: r.cita.id, telegramPorVincular: r.telegramPorVincular }, dataLayer: evento ? [aDataLayer(evento)].filter((x): x is EventoDataLayer => x !== null) : [] };
}

const idCita = z.string().regex(/^cit_[0-9a-f]{20}$/);

export async function cancelar(clinica: string, cita: unknown): Promise<ResultadoAccion> {
  const c = idClinica.parse(clinica);
  const usuario = await exigeUsuario();
  if (!usuario) return { ok: false, error: 'Tu sesión terminó: vuelve a entrar.', sinSesion: true };
  const id = idCita.safeParse(cita);
  if (!id.success) return { ok: false, error: 'Cita inválida.' };
  try {
    await (await runtime()).portal.cancela(c, usuario, id.data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo cancelar.' };
  }
  await despacha();
  revalidatePath(`/clinica/${c}/mis-citas`);
  return { ok: true, valor: undefined };
}

export async function reprogramar(clinica: string, cita: unknown, inicio: unknown): Promise<ResultadoAccion<{ cita: string }>> {
  const c = idClinica.parse(clinica);
  const usuario = await exigeUsuario();
  if (!usuario) return { ok: false, error: 'Tu sesión terminó: vuelve a entrar.', sinSesion: true };
  const id = idCita.safeParse(cita);
  const nuevo = z.string().datetime().safeParse(inicio);
  if (!id.success || !nuevo.success) return { ok: false, error: 'Revisa la cita y el nuevo horario.' };
  try {
    const r = await (await runtime()).portal.reprograma(c, usuario, id.data, nuevo.data, `${id.data}-${nuevo.data}`);
    if (!r.ok) return { ok: false, error: r.motivo === 'ocupado' ? 'Ese horario ya no está libre. Elige otro.' : r.detalle };
    await despacha();
    revalidatePath(`/clinica/${c}/mis-citas`);
    return { ok: true, valor: { cita: r.cita.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo cambiar.' };
  }
}

const tipoConsentimiento = z.enum(['datos_salud', 'recordatorios', 'newsletter', 'telegram']);

export async function cambiarConsentimiento(clinica: string, tipo: unknown, otorgado: unknown): Promise<ResultadoAccion> {
  const c = idClinica.parse(clinica);
  const usuario = await exigeUsuario();
  if (!usuario) return { ok: false, error: 'Tu sesión terminó: vuelve a entrar.', sinSesion: true };
  const t = tipoConsentimiento.safeParse(tipo);
  const o = z.boolean().safeParse(otorgado);
  if (!t.success || !o.success) return { ok: false, error: 'Petición inválida.' };
  await (await runtime()).portal.cambiaConsentimiento(c, usuario, t.data, o.data);
  revalidatePath(`/clinica/${c}/mis-citas`);
  return { ok: true, valor: undefined };
}

export async function enlaceTelegram(clinica: string): Promise<ResultadoAccion<{ enlace: string; expira: number }>> {
  const c = idClinica.parse(clinica);
  const usuario = await exigeUsuario();
  if (!usuario) return { ok: false, error: 'Tu sesión terminó: vuelve a entrar.', sinSesion: true };
  return { ok: true, valor: await (await runtime()).portal.enlaceTelegram(c, usuario) };
}
