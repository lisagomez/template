/**
 * La agenda de una clinica, montada SOBRE las `Reservas` de `@tu-scope/calendario` (no las reimplementa).
 *
 * Una clinica tiene sillones y cada servicio una duracion. Cada sillon es un calendario de la clinica; cada
 * par (sillon, duracion) es una instancia de `Reservas` con las reglas del horario. La doble reserva la impide
 * el almacen de `Reservas` (comprueba e inserta en un solo paso por sillon), asi que dos pacientes que
 * confirman el mismo hueco a la vez no pueden quedarse con el mismo sillon: el segundo prueba el siguiente
 * sillon y, si no queda ninguno, recibe `ocupado`.
 *
 * El calendario se INYECTA (`reservasPara`): este modulo solo conoce la forma de `Reservas`, no su paquete.
 */
import type { Clinica, Servicio } from './clinicas.js';
import { servicio as servicioDe } from './clinicas.js';

export interface HuecoReservas { inicio: string; fin: string; inicioMs: number; finMs: number }
export type ResultadoHuecosReservas =
  | { tipo: 'huecos'; huecos: HuecoReservas[] }
  | { tipo: 'sin-hueco'; motivo: string; detalle: string; revisadoHasta: string };
export interface ReservaReservas { id: string; inicio: number; fin: number; estado: 'tentativa' | 'confirmada' | 'liberada'; evento: string | null }
export type ResultadoReservas = { ok: true; reserva: ReservaReservas; repetida: boolean } | { ok: false; motivo: string; detalle: string };

/** La forma de `Reservas` (tools/calendario/src/reserva.ts) que usa la agenda. */
export interface PuertoReservas {
  huecos(op?: { desde?: number; hasta?: number; maximo?: number }): Promise<ResultadoHuecosReservas>;
  tentativa(p: { inicio: string; referencia: string; clave: string }): Promise<ResultadoReservas>;
  confirma(id: string, p: { titulo: string; clave: string; descripcion?: string }): Promise<ResultadoReservas>;
  libera(id: string, p: { clave: string }): Promise<ResultadoReservas>;
}

/** Las reglas de `Reservas` para un servicio de la clinica (forma `EntradaReglas` de calendario). */
export function reglasDe(c: Clinica, s: Servicio) {
  return {
    zona: c.zona,
    horario: c.horario,
    duracionMin: s.duracionMin,
    intervaloMin: c.intervaloMin,
    margenDespuesMin: c.margenDespuesMin,
    avisoMinimoMin: c.avisoMinimoMin,
    horizonteDias: c.horizonteDias,
    fechasBloqueadas: c.fechasBloqueadas,
  };
}

export interface HuecoClinica { inicio: string; inicioMs: number; finMs: number; sillones: string[] }
export interface DiaDisponible { fecha: string; horas: { hora: string; inicio: string; sillones: number }[] }

export type ResultadoAparta =
  | { ok: true; sillon: string; reservaId: string; inicioMs: number; finMs: number; repetida: boolean }
  | { ok: false; motivo: 'ocupado' | 'fuera-de-regla' | 'otro'; detalle: string };

export interface DepsAgenda {
  clinica: Clinica;
  reservasPara: (sillon: string, servicio: Servicio) => PuertoReservas;
}

const fechaLocal = (ms: number, zona: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
export const horaLocal = (ms: number, zona: string) =>
  new Intl.DateTimeFormat('es-MX', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));

/** Une los huecos de todos los sillones por instante de inicio. */
function une(porSillon: { sillon: string; r: ResultadoHuecosReservas }[]): HuecoClinica[] {
  const mapa = new Map<number, HuecoClinica>();
  for (const { sillon, r } of porSillon) {
    if (r.tipo !== 'huecos') continue;
    for (const h of r.huecos) {
      const previo = mapa.get(h.inicioMs);
      if (previo) previo.sillones.push(sillon);
      else mapa.set(h.inicioMs, { inicio: h.inicio, inicioMs: h.inicioMs, finMs: h.finMs, sillones: [sillon] });
    }
  }
  return [...mapa.values()].sort((a, b) => a.inicioMs - b.inicioMs);
}

export function creaAgenda(d: DepsAgenda) {
  const c = d.clinica;

  async function huecos(idServicio: string, op: { desde?: number; hasta?: number } = {}): Promise<HuecoClinica[]> {
    const s = servicioDe(c, idServicio);
    const porSillon = await Promise.all(c.sillones.map(async (sillon) => ({ sillon, r: await d.reservasPara(sillon, s).huecos({ ...op, maximo: 2_000 }) })));
    return une(porSillon);
  }

  /** Los dias del rango con al menos un hueco, con sus horas locales: lo que pinta el calendario mensual. */
  async function dias(idServicio: string, desde: number, hasta: number): Promise<DiaDisponible[]> {
    const porDia = new Map<string, DiaDisponible>();
    for (const h of await huecos(idServicio, { desde, hasta })) {
      const fecha = fechaLocal(h.inicioMs, c.zona);
      const dia = porDia.get(fecha) ?? { fecha, horas: [] };
      dia.horas.push({ hora: horaLocal(h.inicioMs, c.zona), inicio: h.inicio, sillones: h.sillones.length });
      porDia.set(fecha, dia);
    }
    return [...porDia.values()];
  }

  /**
   * Aparta el hueco en el primer sillon libre, en orden fijo. La clave de `Reservas` es por sillon; la
   * idempotencia de la CITA (un reintento no aparta un segundo sillon) la lleva el portal, que guarda la
   * cita por su clave antes de devolverla.
   */
  async function aparta(idServicio: string, inicio: string, referencia: string, clave: string): Promise<ResultadoAparta> {
    const s = servicioDe(c, idServicio);
    let ultimo: ResultadoAparta = { ok: false, motivo: 'ocupado', detalle: 'Ese horario ya no está disponible.' };
    for (const sillon of c.sillones) {
      const r = await d.reservasPara(sillon, s).tentativa({ inicio, referencia, clave: `${clave}:${sillon}` });
      if (r.ok) return { ok: true, sillon, reservaId: r.reserva.id, inicioMs: r.reserva.inicio, finMs: r.reserva.fin, repetida: r.repetida };
      if (r.motivo === 'fuera-de-regla') return { ok: false, motivo: 'fuera-de-regla', detalle: r.detalle };
      ultimo = { ok: false, motivo: r.motivo === 'ocupado' ? 'ocupado' : 'otro', detalle: r.detalle };
    }
    return ultimo;
  }

  async function confirma(sillon: string, idServicio: string, reservaId: string, cita: string, clave: string) {
    // El evento del calendario de la clinica lleva una REFERENCIA, no datos del paciente (C4): quien atiende
    // busca la cita en el portal. Sin invitados: `Reservas` escribe con la Pluma y sin notificar a nadie.
    return d.reservasPara(sillon, servicioDe(c, idServicio)).confirma(reservaId, { titulo: `Cita ${cita} · ${sillon}`, clave });
  }

  async function libera(sillon: string, idServicio: string, reservaId: string, clave: string) {
    return d.reservasPara(sillon, servicioDe(c, idServicio)).libera(reservaId, { clave });
  }

  return { clinica: c, huecos, dias, aparta, confirma, libera };
}

export type Agenda = ReturnType<typeof creaAgenda>;
