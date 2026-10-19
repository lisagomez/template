/**
 * Citas: reservar, cancelar, reprogramar y la vista del paciente. Toda operacion lleva (clinica, usuario de la
 * sesion): un paciente no puede tocar ni ver una cita que no es suya, y una clinica no ve las de la otra.
 *
 * El selector de notificacion ES el momento del opt-in: elegir correo o Telegram otorga el consentimiento de
 * recordatorios (y el de Telegram); marcar el newsletter otorga el suyo. Nada viene marcado.
 */
import type { Aviso, Cita } from '../almacen.js';
import { servicio as servicioDe } from '../clinicas.js';
import type { CanalAviso } from '../eventos.js';
import { idDeClave } from '../seudonimo.js';
import { cancelaAvisos, edicionDelMes, programaAvisosDeCita, programaCancelacion, programaNewsletter } from './avisos.js';
import { ErrorPortal, HORA_MS, vigentes, type Contexto } from './contexto.js';
import { cambiaConsentimiento } from './registro.js';

export interface EntradaReserva { clinica: string; usuario: string; servicio: string; inicio: string; canales: CanalAviso[]; newsletter: boolean; clave: string; via?: 'portal' | 'asistente' | 'whatsapp'; /** La cita que se está reprogramando: no cuenta como empalme consigo misma. */ reprogramaDe?: string }
export type ResultadoReserva =
  | { ok: true; cita: Cita; repetida: boolean; telegramPorVincular: boolean; whatsappPorVincular?: boolean }
  | { ok: false; motivo: 'ocupado' | 'fuera-de-regla' | 'empalme' | 'otro'; detalle: string };

export const LIMITE_CAMBIO_HORAS = 24;

async function otorgaPorSelector(ctx: Contexto, e: EntradaReserva): Promise<void> {
  if (e.canales.length > 0) await cambiaConsentimiento(ctx, e.clinica, e.usuario, 'recordatorios', true);
  if (e.canales.includes('telegram')) await cambiaConsentimiento(ctx, e.clinica, e.usuario, 'telegram', true);
  if (e.canales.includes('whatsapp')) await cambiaConsentimiento(ctx, e.clinica, e.usuario, 'whatsapp', true);
  if (e.newsletter) await cambiaConsentimiento(ctx, e.clinica, e.usuario, 'newsletter', true);
}

export async function reserva(ctx: Contexto, e: EntradaReserva): Promise<ResultadoReserva> {
  const p = await ctx.exigePaciente(e.clinica, e.usuario);
  const c = ctx.clinica(e.clinica);
  const s = servicioDe(c, e.servicio);
  const id = idDeClave('cit', `${e.clinica}|${p.seudonimo}|${e.clave}`);
  const previa = await ctx.almacen.cita(e.clinica, id);
  if (previa) return { ok: true, cita: previa, repetida: true, telegramPorVincular: previa.canales.includes('telegram') && p.telegram.chatId === null };
  const inicioMs = Date.parse(e.inicio);
  const fin = inicioMs + s.duracionMin * 60_000;
  const suyas = (await ctx.almacen.citas(e.clinica, p.seudonimo)).filter((x) => x.estado === 'confirmada' && x.id !== e.reprogramaDe);
  if (suyas.some((x) => x.inicio < fin && x.fin > inicioMs)) return { ok: false, motivo: 'empalme', detalle: 'Ya tienes una cita a esa hora.' };
  await ctx.emite({ clinica: e.clinica, sujeto: p.seudonimo, tipo: 'cita_solicitada', cita: id, categoria: s.categoria, servicio: s.id }, `solicitada|${id}`);
  const ag = ctx.agenda(e.clinica);
  const apartado = await ag.aparta(s.id, e.inicio, id, id);
  if (!apartado.ok) return { ok: false, motivo: apartado.motivo, detalle: apartado.detalle };
  const conf = await ag.confirma(apartado.sillon, s.id, apartado.reservaId, id, id);
  if (!conf.ok) {
    await ag.libera(apartado.sillon, s.id, apartado.reservaId, `${id}:libera`);
    return { ok: false, motivo: conf.motivo === 'ocupado' ? 'ocupado' : 'otro', detalle: conf.detalle };
  }
  await otorgaPorSelector(ctx, e);
  const ahora = ctx.reloj();
  const cita: Cita = { id, clinica: e.clinica, paciente: p.seudonimo, servicio: s.id, categoria: s.categoria, sillon: apartado.sillon, reservaId: apartado.reservaId, inicio: apartado.inicioMs, fin: apartado.finMs, estado: 'confirmada', canales: [...new Set(e.canales)], clave: e.clave, creada: ahora, anterior: null, origen: id, secuencia: 0 };
  await ctx.almacen.guardaCita(cita);
  await ctx.emite({ clinica: e.clinica, sujeto: p.seudonimo, tipo: 'cita_confirmada', cita: id, categoria: s.categoria, servicio: s.id, inicio: new Date(cita.inicio).toISOString(), duracion_min: s.duracionMin, anticipacion_horas: Math.round(((cita.inicio - ahora) / HORA_MS) * 10) / 10, canales: cita.canales, via: e.via ?? 'portal' }, `confirmada|${id}`);
  const actual = (await ctx.almacen.paciente(e.clinica, e.usuario)) ?? p;
  await programaAvisosDeCita(ctx, actual, cita);
  await programaNewsletter(ctx, actual, (ctx.edicionNewsletter ?? (() => edicionDelMes(ctx.reloj())))());
  return { ok: true, cita, repetida: false, telegramPorVincular: cita.canales.includes('telegram') && actual.telegram.chatId === null, whatsappPorVincular: cita.canales.includes('whatsapp') && !actual.whatsapp?.waId };
}

async function citaPropia(ctx: Contexto, clinica: string, usuario: string, id: string): Promise<Cita> {
  const p = await ctx.exigePaciente(clinica, usuario);
  const cita = await ctx.almacen.cita(clinica, id);
  if (!cita || cita.paciente !== p.seudonimo) throw new ErrorPortal('no-encontrada', 'No encontramos esa cita en tu cuenta.');
  if (cita.estado !== 'confirmada') throw new ErrorPortal('estado', 'Esa cita ya no está activa.');
  const horas = (cita.inicio - ctx.reloj()) / HORA_MS;
  if (horas < LIMITE_CAMBIO_HORAS) throw new ErrorPortal('politica', `Faltan menos de ${LIMITE_CAMBIO_HORAS} horas: para cancelar o cambiar, llama a la clínica.`);
  return cita;
}

export async function cancela(ctx: Contexto, clinica: string, usuario: string, id: string, via: 'portal' | 'whatsapp' = 'portal'): Promise<Cita> {
  const cita = await citaPropia(ctx, clinica, usuario, id);
  await ctx.agenda(clinica).libera(cita.sillon, cita.servicio, cita.reservaId, `${id}:cancela`);
  const cancelada: Cita = { ...cita, estado: 'cancelada' };
  await ctx.almacen.guardaCita(cancelada);
  await cancelaAvisos(ctx, clinica, cita.paciente, (a) => a.cita === id, 'cita_cancelada');
  await ctx.emite({ clinica, sujeto: cita.paciente, tipo: 'cita_cancelada', cita: id, motivo: 'paciente', horas_antes: Math.round(((cita.inicio - ctx.reloj()) / HORA_MS) * 10) / 10, via }, `cancelada|${id}`);
  const p = await ctx.exigePaciente(clinica, usuario);
  if ((await vigentes(ctx, clinica, p.seudonimo)).recordatorios === true) await programaCancelacion(ctx, p, cancelada);
  return cancelada;
}

/** Aparta el hueco nuevo ANTES de soltar el viejo: si el nuevo no se puede, la cita original sigue intacta. */
export async function reprograma(ctx: Contexto, clinica: string, usuario: string, id: string, nuevoInicio: string, clave: string, via: 'portal' | 'whatsapp' = 'portal'): Promise<ResultadoReserva> {
  const vieja = await citaPropia(ctx, clinica, usuario, id);
  const nueva = await reserva(ctx, { clinica, usuario, servicio: vieja.servicio, inicio: nuevoInicio, canales: vieja.canales, newsletter: false, clave: `${clave}|reprograma|${id}`, reprogramaDe: vieja.id, via });
  if (!nueva.ok || nueva.repetida) return nueva;
  await ctx.agenda(clinica).libera(vieja.sillon, vieja.servicio, vieja.reservaId, `${id}:reprograma`);
  await ctx.almacen.guardaCita({ ...vieja, estado: 'reprogramada' });
  const actualizada: Cita = { ...nueva.cita, anterior: vieja.id, origen: vieja.origen, secuencia: vieja.secuencia + 1 };
  await ctx.almacen.guardaCita(actualizada);
  await cancelaAvisos(ctx, clinica, vieja.paciente, (a) => a.cita === vieja.id, 'cita_reprogramada');
  await ctx.emite({ clinica, sujeto: vieja.paciente, tipo: 'cita_reprogramada', cita: actualizada.id, cita_anterior: vieja.id, inicio_anterior: new Date(vieja.inicio).toISOString(), inicio_nuevo: new Date(actualizada.inicio).toISOString(), via }, `reprogramada|${vieja.id}`);
  await ctx.emite({ clinica, sujeto: vieja.paciente, tipo: 'cita_cancelada', cita: vieja.id, motivo: 'reprogramada', horas_antes: Math.round(((vieja.inicio - ctx.reloj()) / HORA_MS) * 10) / 10, via }, `cancelada|${vieja.id}`);
  return { ...nueva, cita: actualizada };
}

export interface VistaAviso { id: string; canal: CanalAviso; clase: Aviso['clase']; estado: Aviso['estado']; para: number; motivo: string | null; accion: 'vincular_telegram' | 'vincular_whatsapp' | 'revisar_whatsapp' | 'resuscribir' | 'revisar_correo' | null }
export interface VistaCita { cita: Cita; servicio: string; avisos: VistaAviso[]; puedeCambiar: boolean }

function accionDe(a: Aviso): VistaAviso['accion'] {
  if (a.canal === 'whatsapp' && (a.estado === 'esperando_vinculo' || a.motivo === 'sin_vincular')) return 'vincular_whatsapp';
  if (a.canal === 'whatsapp' && a.estado === 'fallido') return 'revisar_whatsapp';
  if (a.estado === 'esperando_vinculo' || a.motivo === 'sin_vincular' || a.motivo === 'bot_no_iniciado') return 'vincular_telegram';
  if (a.estado === 'cancelado' && a.motivo === 'baja') return 'resuscribir';
  if (a.motivo === 'rebote') return 'revisar_correo';
  return null;
}

/** Sus citas por venir y lo que se programo, envio, entrego o fallo para cada una. Solo las del paciente. */
export async function proximas(ctx: Contexto, clinica: string, usuario: string): Promise<{ citas: VistaCita[]; newsletter: VistaAviso[] }> {
  const p = await ctx.exigePaciente(clinica, usuario);
  const c = ctx.clinica(clinica);
  const ahora = ctx.reloj();
  const avisos = await ctx.almacen.avisos(clinica, p.seudonimo);
  const vista = (a: Aviso): VistaAviso => ({ id: a.id, canal: a.canal, clase: a.clase, estado: a.estado, para: a.para, motivo: a.motivo, accion: accionDe(a) });
  const citas = (await ctx.almacen.citas(clinica, p.seudonimo)).filter((x) => x.estado === 'confirmada' && x.fin > ahora).sort((a, b) => a.inicio - b.inicio);
  return {
    citas: citas.map((x) => ({ cita: x, servicio: servicioDe(c, x.servicio).nombre, avisos: avisos.filter((a) => a.cita === x.id).sort((a, b) => a.para - b.para).map(vista), puedeCambiar: (x.inicio - ahora) / HORA_MS >= LIMITE_CAMBIO_HORAS })),
    newsletter: avisos.filter((a) => a.clase === 'newsletter').sort((a, b) => b.para - a.para).map(vista),
  };
}

/** Solo laboratorio: marca la asistencia (simulada) de una cita ya pasada. */
export async function simulaAsistencia(ctx: Contexto, clinica: string, id: string, asistio: boolean): Promise<void> {
  const cita = await ctx.almacen.cita(clinica, id);
  if (!cita || cita.estado !== 'confirmada') return;
  await ctx.almacen.guardaCita({ ...cita, estado: asistio ? 'atendida' : 'inasistencia' });
  await ctx.emite({ clinica, sujeto: cita.paciente, tipo: 'cita_asistencia', cita: id, asistio, simulada: true }, `asistencia|${id}`);
}
