/**
 * Los avisos: se PROGRAMAN al confirmar (con id derivado de cita + canal + clase: programar dos veces no
 * duplica) y los DESPACHA un despachador que se puede correr cuantas veces se quiera (un envio por aviso;
 * un `limite` se reintenta con espera; un resultado desconocido queda «incierto» y no se reintenta solo).
 * Antes de cada envio se vuelve a mirar el consentimiento: tras una baja, cero newsletters.
 */
import type { Aviso, Cita, Paciente } from '../almacen.js';
import type { CanalAviso, ClaseAviso } from '../eventos.js';
import { idDeClave } from '../seudonimo.js';
import { HORA_MS, vigentes, type Contexto } from './contexto.js';

const CLASES_POR_CANAL: Record<CanalAviso, ClaseAviso[]> = {
  correo: ['confirmacion', 'recordatorio_24h', 'recordatorio_2h'],
  telegram: ['confirmacion', 'recordatorio_2h'],
  // Lo que hace el mercado (Doctoralia, AgendaPro): confirmacion al agendar, recordatorio el dia antes y horas antes.
  whatsapp: ['confirmacion', 'recordatorio_24h', 'recordatorio_2h'],
};

/** Sin vincular, el aviso espera (no se pierde): Telegram hasta que se inicie el bot, WhatsApp hasta confirmar el numero. */
const sinVinculo = (p: Paciente, canal: CanalAviso): boolean =>
  (canal === 'telegram' && p.telegram.chatId === null) || (canal === 'whatsapp' && !p.whatsapp?.waId);
const ANTES: Partial<Record<ClaseAviso, number>> = { recordatorio_24h: 24 * HORA_MS, recordatorio_2h: 2 * HORA_MS };

async function programa(ctx: Contexto, p: Paciente, a: Omit<Aviso, 'clinica' | 'paciente' | 'estado' | 'intentos' | 'proximoIntento' | 'motivo' | 'actualizado'>) {
  if (await ctx.almacen.aviso(p.clinica, a.id)) return;
  const esperaVinculo = sinVinculo(p, a.canal);
  const aviso: Aviso = { ...a, clinica: p.clinica, paciente: p.seudonimo, estado: esperaVinculo ? 'esperando_vinculo' : 'programado', intentos: 0, proximoIntento: a.para, motivo: null, actualizado: ctx.reloj() };
  await ctx.almacen.guardaAviso(aviso);
  await ctx.emite({ clinica: p.clinica, sujeto: p.seudonimo, tipo: 'aviso_programado', aviso: a.id, cita: a.cita, canal: a.canal, clase: a.clase, para: new Date(a.para).toISOString() }, `programado|${a.id}`);
}

export async function programaAvisosDeCita(ctx: Contexto, p: Paciente, cita: Cita): Promise<void> {
  const ahora = ctx.reloj();
  for (const canal of cita.canales) {
    for (const clase of CLASES_POR_CANAL[canal]) {
      const para = clase === 'confirmacion' ? ahora : cita.inicio - (ANTES[clase] ?? 0);
      if (clase !== 'confirmacion' && para <= ahora) continue;
      await programa(ctx, p, { id: idDeClave('avi', `${cita.id}|${canal}|${clase}`), cita: cita.id, canal, clase, para, edicion: null });
    }
  }
}

export async function programaCancelacion(ctx: Contexto, p: Paciente, cita: Cita): Promise<void> {
  for (const canal of cita.canales.filter((x): x is 'correo' | 'whatsapp' => x === 'correo' || x === 'whatsapp')) {
    if (canal === 'whatsapp' && !p.whatsapp?.waId) continue;
    await programa(ctx, p, { id: idDeClave('avi', `${cita.id}|${canal}|cancelacion`), cita: cita.id, canal, clase: 'cancelacion', para: ctx.reloj(), edicion: null });
  }
}

/**
 * RESPALDO: un aviso de WhatsApp que falla para siempre (numero sin WhatsApp, plantilla pausada, numero de la
 * clinica desconectado) no deja a la persona sin su recordatorio: si su cita no lo llevaba ya por correo y
 * tiene los recordatorios activos, sale por correo (a la direccion de su registro, verificada al crear la cuenta).
 */
export async function programaRespaldoCorreo(ctx: Contexto, a: Aviso): Promise<boolean> {
  if (a.canal !== 'whatsapp' || !a.cita || a.clase === 'newsletter') return false;
  const p = await ctx.almacen.pacientePorSeudonimo(a.clinica, a.paciente);
  const cita = await ctx.almacen.cita(a.clinica, a.cita);
  if (!p || !cita || cita.canales.includes('correo') || (await vigentes(ctx, a.clinica, a.paciente)).recordatorios !== true) return false;
  if (a.clase !== 'cancelacion' && (cita.estado !== 'confirmada' || cita.inicio <= ctx.reloj())) return false;
  await programa(ctx, p, { id: idDeClave('avi', `${cita.id}|correo|${a.clase}|respaldo`), cita: cita.id, canal: 'correo', clase: a.clase, para: ctx.reloj(), edicion: null });
  return true;
}

export const edicionDelMes = (ms: number): string => `newsletter-${new Date(ms).toISOString().slice(0, 7)}`;

/** Una edicion del newsletter para un paciente suscrito: una sola vez por edicion. */
export async function programaNewsletter(ctx: Contexto, p: Paciente, edicion: string): Promise<boolean> {
  if ((await vigentes(ctx, p.clinica, p.seudonimo)).newsletter !== true) return false;
  await programa(ctx, p, { id: idDeClave('avi', `${p.seudonimo}|newsletter|${edicion}`), cita: null, canal: 'correo', clase: 'newsletter', para: ctx.reloj(), edicion });
  return true;
}

export async function cancelaAvisos(ctx: Contexto, clinica: string, paciente: string, filtro: (a: Aviso) => boolean, motivo: 'cita_cancelada' | 'cita_reprogramada' | 'baja' | 'consentimiento_retirado') {
  for (const a of await ctx.almacen.avisos(clinica, paciente)) {
    if (!filtro(a) || !['programado', 'esperando_vinculo'].includes(a.estado)) continue;
    await ctx.almacen.guardaAviso({ ...a, estado: 'cancelado', motivo, actualizado: ctx.reloj() });
    await ctx.emite({ clinica, sujeto: paciente, tipo: 'aviso_cancelado', aviso: a.id, canal: a.canal, clase: a.clase, motivo }, `cancelado|${a.id}`);
  }
}
