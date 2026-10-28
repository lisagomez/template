/** Formatos de Ágora: dinero en MXN con centavos exactos (la cifra viene como texto de la base), fechas cortas. */
const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MXN0 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const mxn = (x: string | number | null | undefined, centavos = true): string =>
  x === null || x === undefined || x === '' || Number.isNaN(Number(x)) ? '—' : (centavos ? MXN : MXN0).format(Number(x));
export const fecha = (d: string | null | undefined): string => (d ? `${Number(d.slice(8, 10))} ${MES[Number(d.slice(5, 7)) - 1]}` : '—');
export const periodoLargo = (p: string): string => `${MES_LARGO[Number(p.slice(5, 7)) - 1]} de ${p.slice(0, 4)}`;
export const pct = (uso: number, tope: number): number => (tope > 0 ? Math.round((100 * uso) / tope) : 0);
export const corta = (h: string | null | undefined): string => (h ? `${h.slice(0, 4)}…${h.slice(-4)}` : '—');
export const ESTADO: Record<string, { nombre: string; clase: string }> = {
  todo: { nombre: 'Por hacer', clase: 'bg-slate-500' }, doing: { nombre: 'En curso', clase: 'bg-blue-600' }, review: { nombre: 'En revisión', clase: 'bg-violet-600' },
  block: { nombre: 'Bloqueado', clase: 'bg-rose-600' }, done: { nombre: 'Listo', clase: 'bg-emerald-600' },
};
export const PRIORIDAD: Record<string, { nombre: string; clase: string }> = {
  alta: { nombre: 'Alta', clase: 'bg-rose-500' }, media: { nombre: 'Media', clase: 'bg-amber-500' }, baja: { nombre: 'Baja', clase: 'bg-slate-400' },
};
