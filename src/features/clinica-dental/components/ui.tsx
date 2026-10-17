/** Piezas de formulario accesibles y con la marca de la clinica (etiqueta, ayuda y error ligados por id). */
import type { InputHTMLAttributes, ReactNode } from 'react';

export const clasesEntrada = 'mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base shadow-sm focus:border-[color:var(--c1)] focus:outline-none focus:ring-2 focus:ring-[color:var(--c1)]/40 aria-[invalid=true]:border-red-600';
export const clasesBoton = 'inline-flex min-h-11 items-center justify-center rounded-lg bg-[color:var(--c1)] px-5 font-semibold text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[color:var(--c1)] disabled:cursor-not-allowed disabled:opacity-50';
export const clasesBotonSecundario = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 font-medium hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--c1)]';

interface PropsCampo extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  etiqueta: string;
  ayuda?: ReactNode;
  error?: string;
  opcional?: boolean;
}

export function Campo({ id, etiqueta, ayuda, error, opcional, ...resto }: PropsCampo) {
  const ids = [ayuda ? `${id}-ayuda` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {etiqueta} {opcional ? <span className="font-normal text-slate-500">(opcional)</span> : null}
      </label>
      <input id={id} name={id} aria-invalid={error ? true : undefined} aria-describedby={ids} className={clasesEntrada} {...resto} />
      {ayuda ? <p id={`${id}-ayuda`} className="mt-1 text-sm text-slate-600">{ayuda}</p> : null}
      {error ? <p id={`${id}-error`} className="mt-1 text-sm font-medium text-red-700">{error}</p> : null}
    </div>
  );
}

export function Aviso({ tono = 'info', children }: { tono?: 'info' | 'error' | 'ok'; children: ReactNode }) {
  const color = tono === 'error' ? 'border-red-300 bg-red-50 text-red-900' : tono === 'ok' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-300 bg-slate-50 text-slate-800';
  return <div role={tono === 'error' ? 'alert' : 'status'} className={`rounded-lg border p-3 text-sm ${color}`}>{children}</div>;
}
