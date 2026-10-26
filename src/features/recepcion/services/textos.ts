/**
 * Cómo dice las cosas el mostrador: listas en español, días («hoy», «mañana», «el jueves…») y el horario de la
 * semana armado desde los datos (no escrito a mano: si cambia el horario, cambia lo que dice).
 */
import { fechaEnZona } from '../../../../tools/calendario/dist/index.js';
import { HORARIO, ZONA } from '../datos.ts';
import { fechaDe } from './agenda.ts';

export const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export const lista = (xs: readonly string[]): string => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);
export const mayuscula = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** Cierra con punto sin duplicarlo («Andrés G.» no gana otro). */
export const cierra = (s: string): string => (s.endsWith('.') ? s : `${s}.`);

/** 0 domingo … 6 sábado, del día local de `ms` en la zona del negocio. */
export function diaSemana(ms: number): number {
  const f = fechaEnZona(ms, ZONA);
  return new Date(Date.UTC(f.anio, f.mes - 1, f.dia)).getUTCDay();
}

/** «hoy», «mañana», «pasado mañana» o «el jueves, 29 de octubre». */
export const queDia = (dias: number, inicio: number): string =>
  dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : dias === 2 ? 'pasado mañana' : `el ${fechaDe(inicio)}`;

/** El horario de la semana desde los datos, agrupando los días con las mismas horas (la semana empieza en lunes). */
export function horarioDeLaSemana(): string {
  const orden = (d: number) => (d + 6) % 7;
  const grupos = new Map<string, number[]>();
  for (const f of HORARIO) grupos.set(`${f.desde} a ${f.hasta}`, [...(grupos.get(`${f.desde} a ${f.hasta}`) ?? []), f.dia]);
  const dias = (ds: number[]) => {
    const xs = [...ds].sort((a, b) => orden(a) - orden(b));
    return xs.length > 2 ? `de ${NOMBRES_DIA[xs[0]!]} a ${NOMBRES_DIA[xs.at(-1)!]}` : `el ${lista(xs.map((d) => NOMBRES_DIA[d]!))}`;
  };
  const semana = [...grupos].sort(([, a], [, b]) => Math.min(...a.map(orden)) - Math.min(...b.map(orden)));
  return lista(semana.map(([horas, ds]) => `${dias(ds)} de ${horas}`));
}
