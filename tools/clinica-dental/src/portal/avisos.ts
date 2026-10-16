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
};
const ANTES: Partial<Record<ClaseAviso, number>> = { recordatorio_24h: 24 * HORA_MS, recordatorio_2h: 2 * HORA_MS };

async function programa(ctx: Contexto, p: Paciente, a: Omit<Aviso, 'clinica' | 'paciente' | 'estado' | 'intentos' | 'proximoIntento' | 'motivo' | 'actualizado'>) {
  if (await ctx.almacen.aviso(p.clinica, a.id)) return;
  const esperaVinculo = a.canal === 'telegram' && p.telegram.chatId === null;
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
  if (!cita.canales.includes('correo')) return;
  await programa(ctx, p, { id: idDeClave('avi', `${cita.id}|correo|cancelacion`), cita: cita.id, canal: 'correo', clase: 'cancelacion', para: ctx.reloj(), edicion: null });
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
