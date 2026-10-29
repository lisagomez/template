/** Quién es quién, a la vista: persona (azul, redonda), agente interno (verde) o externo (ocre), en todo Ágora. */
import type { Insignia as Tipo } from '../../../../tools/agora/dist/index.js';

const COLOR: Record<Tipo | 'sistema', string> = {
  humano: 'bg-blue-600 text-white rounded-full', interno: 'bg-emerald-600 text-white rounded-md', externo: 'bg-amber-600 text-white rounded-md', sistema: 'bg-slate-200 text-slate-600 rounded-md',
};
const ETIQUETA: Record<Tipo | 'sistema', string> = { humano: 'humano', interno: 'interno', externo: 'externo', sistema: 'sistema' };
const TINTA: Record<Tipo | 'sistema', string> = {
  humano: 'bg-blue-50 text-blue-700 ring-blue-200', interno: 'bg-emerald-50 text-emerald-700 ring-emerald-200', externo: 'bg-amber-50 text-amber-800 ring-amber-200', sistema: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export function Avatar({ tipo, iniciales, chico }: { tipo: Tipo | 'sistema'; iniciales: string; chico?: boolean }) {
  return <span aria-hidden className={`inline-grid shrink-0 place-items-center font-semibold ${chico ? 'h-5 w-5 text-[9px]' : 'h-7 w-7 text-[11px]'} ${COLOR[tipo]}`}>{iniciales}</span>;
}

export function Etiqueta({ tipo }: { tipo: Tipo | 'sistema' }) {
  return <span data-insignia={tipo} className={`inline-flex items-center rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${TINTA[tipo]}`}>{ETIQUETA[tipo]}</span>;
}

export function Quien({ q, sinEtiqueta }: { q: { tipo: Tipo | 'sistema'; nombre: string; iniciales: string } | null; sinEtiqueta?: boolean }) {
  if (!q) return <span className="text-xs text-slate-400">Sin responsable</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
      <Avatar tipo={q.tipo} iniciales={q.iniciales} chico />
      <span className="truncate text-[13px]">{q.nombre}</span>
      {sinEtiqueta || q.tipo === 'humano' ? null : <Etiqueta tipo={q.tipo} />}
    </span>
  );
}
