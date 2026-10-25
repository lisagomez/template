/**
 * La agenda del mostrador: el motor de verdad de `tools/calendario` (simulador de Google, espejo en memoria, una
 * sola pluma, el lector y `Reservas`, que impide la doble reserva y respeta el horario) con la semilla SINTÉTICA
 * del negocio. Sin React y sin la capa: la usan igual la pestaña (la ranura de plan, el lienzo y las intenciones) y
 * el servidor (la lectura de solo conteos).
 *
 * Cancelar es irreversible y avisa a quien tenía la cita: aquí solo se llega DESPUÉS del freno de la capa (la cita
 * textual y el clic), y por eso se pasa `confirmaNotificar`, la confirmación humana que la pluma exige para avisar.
 * Si lo pedido no señala UNA cita, no se cancela ninguna: se dice cuáles hay.
 */
import { Lector, Pluma, Reservas, fechaEnZona, instanteDesdeLocal, sincroniza, sumaDias, textoFecha, type Calendario, type Instancia, type Reloj } from '../../../../tools/calendario/dist/index.js';
import { SimuladorGoogle } from '../../../../tools/calendario/dist/simulador/index.js';
import { AlmacenEnMemoria } from '../../../../tools/calendario/dist/almacenes/memoria.js';
import { CITA, HORARIO, REF_AGENDA, SEMILLA, ZONA } from '../datos.ts';

const MINUTO = 60_000;
const DIA = 86_400_000;
/** Lo que se lee del espejo: dos semanas desde hoy (la vista de agenda del lienzo pinta 14 días). */
const VENTANA_DIAS = 14;

export interface Foto { instancias: readonly Instancia[]; ahora: number }
export const FOTO_VACIA: Foto = { instancias: [], ahora: 0 };

/** El calendario del negocio en el simulador (y sus colores en la UI de tools/calendario). */
export const CALENDARIO_DEL_MOSTRADOR: Calendario = {
  cuenta: REF_AGENDA.cuenta, id: REF_AGENDA.calendario, nombre: 'Citas del mostrador', color: '#b45309', zona: ZONA, rol: 'propietario', principal: true, visible: true,
};

export const horaDe = (ms: number): string =>
  new Intl.DateTimeFormat('es-MX', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);

/** «lunes 26 de octubre». */
export const fechaDe = (ms: number): string =>
  new Intl.DateTimeFormat('es-MX', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long' }).format(ms);

/** Medianoche local del día `dias` (0 hoy, 1 mañana…) contado desde `ahora`. */
export function inicioDelDia(ahora: number, dias: number): number {
  return instanteDesdeLocal({ ...sumaDias(fechaEnZona(ahora, ZONA), dias), hora: 0, minuto: 0, segundo: 0 }, ZONA) ?? ahora;
}

/** Las citas vivas de un día de la foto (0 hoy, 1 mañana…), en orden. Una sola definición: la usan la ranura,
 *  las intenciones y la lectura de conteos. */
export function citasDelDia(foto: Foto, dias: number): Instancia[] {
  const dia = textoFecha(sumaDias(fechaEnZona(foto.ahora, ZONA), dias));
  return foto.instancias
    .filter((i) => i.estado !== 'cancelado' && textoFecha(fechaEnZona(i.inicioMs, ZONA)) === dia)
    .sort((a, b) => a.inicioMs - b.inicioMs);
}

export type ResultadoCancela =
  | { ok: true; cita: Instancia; avisados: string[] }
  | { ok: false; motivo: 'ninguna' | 'varias' | 'otra-hora'; citas: Instancia[] };

export type ResultadoReserva =
  | { ok: true; inicioMs: number; finMs: number }
  | { ok: false; motivo: string; detalle: string };

export type ResultadoHuecos = { ok: true; inicios: number[] } | { ok: false; detalle: string };

export interface Agenda {
  listo: Promise<void>;
  foto(): Foto;
  suscribe(fn: () => void): () => void;
  reserva(inicioMs: number, titulo: string): Promise<ResultadoReserva>;
  /** `hora` en «HH:MM», o null para «la» cita del día (solo si hay una). */
  cancela(dias: number, hora: string | null): Promise<ResultadoCancela>;
  huecos(dias: number): Promise<ResultadoHuecos>;
  /** Cuántos avisos registró el simulador (nunca sale un correo de verdad). */
  avisos(): number;
}

function siembra(sim: SimuladorGoogle, ahora: number): void {
  const hoy = fechaEnZona(ahora, ZONA);
  for (const s of SEMILLA) {
    const inicio = instanteDesdeLocal({ ...sumaDias(hoy, s.dias), hora: s.hora, minuto: s.minuto, segundo: 0 }, ZONA) ?? ahora;
    sim.siembra({ ...REF_AGENDA }, {
      titulo: `${s.servicio} · ${s.cliente}`,
      inicio: new Date(inicio).toISOString(),
      fin: new Date(inicio + s.minutos * MINUTO).toISOString(),
      zona: ZONA,
      invitados: [{ correo: s.correo, nombre: s.cliente }],
    });
  }
}

export function creaAgenda(o: { ahora?: () => number } = {}): Agenda {
  const reloj: Reloj = { ahora: o.ahora ?? Date.now, espera: (ms) => new Promise((r) => setTimeout(r, ms)) };
  const ref = { ...REF_AGENDA };
  const sim = new SimuladorGoogle({ reloj });
  const almacen = new AlmacenEnMemoria();
  const pluma = new Pluma({ proveedor: sim, almacen, reloj });
  const lector = new Lector({ almacen, reloj });
  const reservas = new Reservas({
    almacen, pluma, lector, recurso: ref, reloj,
    reglas: { zona: ZONA, horario: HORARIO, duracionMin: CITA.minutos, intervaloMin: CITA.cadaMinutos, avisoMinimoMin: CITA.avisoMinimoMinutos, horizonteDias: 30 },
  });
  sim.agregaCalendario({ ...CALENDARIO_DEL_MOSTRADOR });
  siembra(sim, reloj.ahora());

  let foto: Foto = FOTO_VACIA;
  let n = 0;
  const oyentes = new Set<() => void>();
  const refresca = async () => {
    const ahora = reloj.ahora();
    const desde = inicioDelDia(ahora, 0);
    const { instancias } = await lector.consulta({ calendarios: [ref], desde, hasta: desde + VENTANA_DIAS * DIA, zona: ZONA });
    foto = { instancias, ahora };
    oyentes.forEach((f) => f());
  };
  const listo = sincroniza({ proveedor: sim, almacen, reloj }, ref).then(refresca);

  return {
    listo,
    foto: () => foto,
    suscribe(fn) {
      oyentes.add(fn);
      return () => { oyentes.delete(fn); };
    },
    avisos: () => sim.notificaciones.length,
    async reserva(inicioMs, titulo) {
      await listo;
      const clave = `recepcion-${inicioMs}-${reloj.ahora().toString(36)}-${n++}`;
      const t = await reservas.tentativa({ inicio: new Date(inicioMs).toISOString(), referencia: 'mostrador', clave: `${clave}-t` });
      if (!t.ok) return { ok: false, motivo: t.motivo, detalle: t.detalle };
      const c = await reservas.confirma(t.reserva.id, { titulo, clave: `${clave}-c` });
      if (!c.ok) return { ok: false, motivo: c.motivo, detalle: c.detalle };
      await refresca();
      return { ok: true, inicioMs: c.reserva.inicio, finMs: c.reserva.fin };
    },
    async cancela(dias, hora) {
      await listo;
      await refresca();
      const delDia = citasDelDia(foto, dias);
      if (!delDia.length) return { ok: false, motivo: 'ninguna', citas: [] };
      const blanco = hora ? delDia.filter((i) => horaDe(i.inicioMs) === hora) : delDia;
      if (hora && !blanco.length) return { ok: false, motivo: 'otra-hora', citas: delDia };
      if (blanco.length !== 1) return { ok: false, motivo: 'varias', citas: delDia };
      const cita = blanco[0]!;
      const antes = sim.notificaciones.length;
      await pluma.borra({ ...ref, id: cita.id, etag: cita.etag }, { clave: `recepcion-cancela-${cita.id}`, notificar: 'todos', confirmaNotificar: true });
      await refresca();
      return { ok: true, cita, avisados: sim.notificaciones.slice(antes).map((x) => x.para) };
    },
    async huecos(dias) {
      await listo;
      const desde = inicioDelDia(reloj.ahora(), dias);
      const r = await reservas.huecos({ desde, hasta: desde + DIA, maximo: 200 });
      return r.tipo === 'huecos' ? { ok: true, inicios: r.huecos.map((h) => h.inicioMs) } : { ok: false, detalle: r.detalle };
    },
  };
}
