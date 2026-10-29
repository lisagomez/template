/** Las celdas del tablero por tipo de campo: lo que se ve sin abrir el editor. */
import type { ItemTablero } from '../../../../tools/agora/dist/index.js';
import { ESTADO, PRIORIDAD, fecha, mxn } from '@/features/agora/services/formato';
import { Quien } from '@/features/agora/components/insignia';

export const Estado = ({ e }: { e: string }) => (
  <span className={`inline-flex min-w-[84px] justify-center rounded px-2 py-0.5 text-[11.5px] font-semibold text-white ${ESTADO[e]?.clase ?? 'bg-slate-400'}`}>{ESTADO[e]?.nombre ?? e}</span>
);
export const Prioridad = ({ p }: { p: string }) => (
  <span className="inline-flex items-center gap-1.5 text-[12.5px]"><i className={`h-2 w-2 rounded-sm ${PRIORIDAD[p]?.clase}`} />{PRIORIDAD[p]?.nombre ?? p}</span>
);
export const Progreso = ({ v }: { v: number }) => (
  <span className="flex w-full min-w-[70px] items-center gap-2"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"><span className={`block h-full rounded-full ${v >= 100 ? 'bg-emerald-600' : 'bg-slate-700'}`} style={{ width: `${v}%` }} /></span><span className="w-8 text-right text-[11px] tabular-nums text-slate-500">{v}%</span></span>
);
export function Fecha({ d, hoy, listo }: { d: string | null; hoy: string; listo: boolean }) {
  if (!d) return <span className="text-slate-400">—</span>;
  const tarde = !listo && d < hoy;
  const pronto = !listo && !tarde && Date.parse(d) - Date.parse(hoy) <= 3 * 864e5;
  return <span className={`tabular-nums ${tarde ? 'font-semibold text-rose-700' : pronto ? 'font-semibold text-amber-700' : ''}`}>{fecha(d)}{tarde ? ' · atrasado' : ''}</span>;
}
export const Cronograma = ({ i }: { i: ItemTablero }) => <span className="tabular-nums text-[12.5px]">{fecha(i.inicio)} – {fecha(i.fin)}</span>;
export const Monto = ({ i }: { i: ItemTablero }) => (
  <span className="block text-right tabular-nums" title={`comprometido ${mxn(i.comprometido)} · ejercido ${mxn(i.ejercido)}`}>{i.monto === null ? <span className="text-slate-400">—</span> : mxn(i.monto, false)}</span>
);
export const PorEjercer = ({ i }: { i: ItemTablero }) => <span className="block text-right tabular-nums text-slate-600">{Number(i.comprometido) ? mxn(i.comprometido, false) : '—'}</span>;
export const Responsable = ({ i }: { i: ItemTablero }) => <Quien q={i.responsable} />;
export const Etiquetas = ({ t }: { t: string[] }) => (
  <span className="flex flex-wrap gap-1">{t.map((x) => <span key={x} className="rounded bg-slate-100 px-1.5 py-px text-[11px] text-slate-700">{x}</span>)}</span>
);
