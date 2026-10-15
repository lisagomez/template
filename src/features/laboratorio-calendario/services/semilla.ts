/**
 * Los datos del laboratorio: SINTETICOS y declarados. Dos calendarios de una cuenta inventada, una
 * semana tipica y un scheduler de mentira. Nada de esto sale de este navegador.
 */
import type { Calendario, EntradaEvento, EntradaReglas, RefCalendario, TrabajoProgramado } from '../../../../tools/calendario/dist/index.js';

export const CUENTA = 'agenda@laboratorio.mx';
export const ZONA = 'America/Mexico_City';
export const TRABAJO: RefCalendario = { cuenta: CUENTA, calendario: 'trabajo' };
export const PERSONAL: RefCalendario = { cuenta: CUENTA, calendario: 'personal' };

/** El reloj del laboratorio arranca el lunes 19 de octubre de 2026 a las 8:30 y avanza en tiempo real. */
export const INICIO_DEL_RELOJ = '2026-10-19T08:30:00-06:00';
export const SEMANA = '2026-10-19';

export const CALENDARIOS: Calendario[] = [
  { cuenta: CUENTA, id: 'trabajo', nombre: 'Trabajo', color: '#2563eb', zona: ZONA, rol: 'propietario', principal: true, visible: true },
  { cuenta: CUENTA, id: 'personal', nombre: 'Personal', color: '#16a34a', zona: ZONA, rol: 'propietario', principal: false, visible: true },
];

type Semilla = { ref: RefCalendario; evento: EntradaEvento };
const ev = (ref: RefCalendario, titulo: string, inicio: string, fin: string, extra: Partial<EntradaEvento> = {}): Semilla =>
  ({ ref, evento: { titulo, inicio, fin, zona: ZONA, ...extra } });

export const EVENTOS: Semilla[] = [
  ev(TRABAJO, 'Stand-up', '2026-10-19T15:30:00.000Z', '2026-10-19T15:45:00.000Z', { recurrencia: ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'] }),
  ev(PERSONAL, 'Gimnasio', '2026-10-19T13:00:00.000Z', '2026-10-19T14:00:00.000Z', { recurrencia: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'] }),
  ev(TRABAJO, 'Taller con el equipo', '2026-10-19T18:00:00.000Z', '2026-10-19T19:30:00.000Z'),
  ev(TRABAJO, 'Revisión con proveedor', '2026-10-20T17:00:00.000Z', '2026-10-20T18:00:00.000Z', { lugar: 'Sala 2' }),
  ev(PERSONAL, 'Comida con Ana', '2026-10-21T20:00:00.000Z', '2026-10-21T21:00:00.000Z'),
  ev(TRABAJO, 'Planeación trimestral', '2026-10-22T16:00:00.000Z', '2026-10-22T17:30:00.000Z'),
  ev(PERSONAL, 'Llamada con el despacho', '2026-10-22T16:30:00.000Z', '2026-10-22T17:00:00.000Z'),
  ev(TRABAJO, 'Entrega del cierre', '2026-10-23', '2026-10-24', { todoElDia: true, transparencia: 'ocupado' }),
  ev(PERSONAL, 'Dentista', '2026-10-23T22:00:00.000Z', '2026-10-23T23:00:00.000Z'),
];

const trabajo = (id: string, nombre: string, expresion: string, grupo: string, duracionMin: number, pausado = false): TrabajoProgramado =>
  ({ id, nombre, expresion, zona: ZONA, grupo, duracionMin, pausado });

/** Un scheduler de mentira: lo que la capa de actividad pinta. El pausado no sale salvo que se pida. */
export const TRABAJOS: TrabajoProgramado[] = [
  trabajo('sync-espejo', 'Sincroniza el espejo', '0 */3 * * *', 'Espejo', 5),
  trabajo('respaldo', 'Respaldo del espejo', '30 2 * * *', 'Espejo', 20),
  trabajo('informe', 'Informe matutino', '0 8 * * 1-5', 'Operacion', 10),
  trabajo('recordatorios', 'Recordatorios de citas', '0 9,13,17 * * 1-5', 'Ventas', 5),
  trabajo('seguimiento', 'Seguimiento de leads', '30 11 * * 1-5', 'Ventas', 15),
  trabajo('limpieza', 'Limpieza semanal', '0 6 * * 0', 'Operacion', 30, true),
];

/** Lo que ofrece el negocio a quien agenda: L-V de 9 a 14 y de 16 a 18, citas de 45 min con 15 de margen. */
export const REGLAS: EntradaReglas = {
  zona: ZONA,
  horario: [1, 2, 3, 4, 5].flatMap((dia) => [{ dia, desde: '09:00', hasta: '14:00' }, { dia, desde: '16:00', hasta: '18:00' }]),
  duracionMin: 45, intervaloMin: 60, margenDespuesMin: 15, avisoMinimoMin: 60, horizonteDias: 14,
};
