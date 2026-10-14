/**
 * Dominio `citas`: disponibilidad y reservas (en el restaurante del laboratorio, reservar mesa).
 * Único dueño de la agenda. La hora local del inquilino se toma con un desfase fijo (México centro
 * no tiene horario de verano desde 2022).
 */
import { DIA, HORA } from '../comun/base.js';
import { tarea, type AgenteDominio, type ContextoDominio, type Solicitud } from '../agente/a2a-modelo.js';
import type { Cita } from '../modelo.js';

export const DESFASE_LOCAL_MS = -6 * HORA;

/** «2026-10-02» local → medianoche local en ms UTC. */
const inicioDelDia = (dia: string) => Date.parse(dia) - DESFASE_LOCAL_MS;
export const diaLocal = (ms: number) => new Date(ms + DESFASE_LOCAL_MS).toISOString().slice(0, 10);
export const horaLocal = (ms: number) => new Date(ms + DESFASE_LOCAL_MS).toISOString().slice(11, 16);

export function horariosLibres(ctx: { politicas: ContextoDominio['inquilino']['politicas'] }, citas: Cita[], servicioId: string, dia: string, ahora: number): number[] {
  const conf = ctx.politicas.citas;
  const servicio = conf?.servicios.find((s) => s.id === servicioId);
  if (!conf || !servicio) return [];
  const base = inicioDelDia(dia);
  const diaSemana = new Date(base + 12 * HORA + DESFASE_LOCAL_MS).getUTCDay();
  if (!conf.diasAbiertos.includes(diaSemana)) return [];
  const libres: number[] = [];
  const paso = servicio.minutos * 60_000;
  for (let t = base + conf.apertura * HORA; t + paso <= base + conf.cierre * HORA; t += paso) {
    if (t < ahora + HORA) continue;
    const ocupadas = citas.filter((c) => c.estado === 'confirmada' && c.servicioId === servicioId && t < c.fin && c.inicio < t + paso).length;
    if (ocupadas < (servicio.capacidad ?? 1)) libres.push(t);
  }
  return libres;
}

async function disponibilidad(s: Solicitud, ctx: ContextoDominio) {
  const ahora = ctx.reloj();
  const servicioId = String(s.datos.servicioId ?? ctx.inquilino.politicas.citas?.servicios[0]?.id ?? '');
  const citas = await ctx.datos.lista('citas');
  const dias: Array<{ dia: string; horarios: Array<{ inicio: number; hora: string }> }> = [];
  for (let d = 0; d < 7 && dias.length < 3; d++) {
    const dia = s.datos.dia ? String(s.datos.dia) : diaLocal(ahora + d * DIA);
    const libres = horariosLibres({ politicas: ctx.inquilino.politicas }, citas, servicioId, dia, ahora);
    if (libres.length) dias.push({ dia, horarios: libres.slice(0, 10).map((inicio) => ({ inicio, hora: horaLocal(inicio) })) });
    if (s.datos.dia) break;
  }
  return tarea(s, 'citas', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'disponibilidad', datos: { servicioId, dias } }]);
}

async function reserva(s: Solicitud, ctx: ContextoDominio) {
  const ahora = ctx.reloj();
  const servicioId = String(s.datos.servicioId ?? '');
  const inicio = Number(s.datos.inicio);
  const servicio = ctx.inquilino.politicas.citas?.servicios.find((x) => x.id === servicioId);
  if (!servicio || !Number.isFinite(inicio)) return tarea(s, 'citas', 'TASK_STATE_REJECTED', ahora, ctx.ids, [], 'servicio u horario inválido');
  const citas = await ctx.datos.lista('citas');
  const libres = horariosLibres({ politicas: ctx.inquilino.politicas }, citas.filter((c) => c.id !== s.datos.citaId), servicioId, diaLocal(inicio), ahora);
  if (!libres.includes(inicio)) return tarea(s, 'citas', 'TASK_STATE_INPUT_REQUIRED', ahora, ctx.ids, [], 'horario ocupado');
  const previa = s.datos.citaId ? await ctx.datos.lee('citas', String(s.datos.citaId)) : undefined;
  const cita: Cita = {
    id: previa?.id ?? ctx.ids('cita'), conversacionId: String(s.datos.conversacionId ?? previa?.conversacionId ?? ''),
    waId: String(s.datos.waId ?? previa?.waId ?? ''), servicioId, inicio, fin: inicio + servicio.minutos * 60_000, estado: 'confirmada',
  };
  await ctx.datos.guarda('citas', cita.id, cita);
  return tarea(s, 'citas', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'cita', datos: { ...cita, servicio: servicio.nombre, dia: diaLocal(inicio), hora: horaLocal(inicio) } }]);
}

export const agenteCitas: AgenteDominio = {
  nombre: 'citas',
  descripcion: 'Disponibilidad, reservas y cambios de horario. Único dueño de la agenda.',
  skills: [
    { id: 'disponibilidad', nombre: 'Ver disponibilidad', descripcion: 'Horarios libres de los próximos días' },
    { id: 'reservar', nombre: 'Reservar', descripcion: 'Confirma un horario libre' },
    { id: 'reprogramar', nombre: 'Reprogramar', descripcion: 'Mueve una cita a otro horario libre' },
  ],
  async atiende(s, ctx) {
    if (s.skill === 'disponibilidad') return disponibilidad(s, ctx);
    if (s.skill === 'reservar' || s.skill === 'reprogramar') return reserva(s, ctx);
    return tarea(s, 'citas', 'TASK_STATE_REJECTED', ctx.reloj(), ctx.ids, [], `skill desconocida: ${s.skill}`);
  },
};
