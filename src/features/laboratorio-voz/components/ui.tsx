'use client';

/** Piezas visuales minimas del laboratorio, con el mismo lenguaje neutro de /dictar. */
import { useEffect, useMemo, type ReactNode } from 'react';

type Variante = 'primario' | 'secundario' | 'suave';

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900',
  secundario: 'border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100',
  suave: 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100',
};

export function Boton({ children, variante = 'secundario', onClick, disabled, title, type = 'button', className = '', 'data-prueba': dataPrueba }: { children: ReactNode; variante?: Variante; onClick?: () => void; disabled?: boolean; title?: string; type?: 'button' | 'submit'; className?: string; 'data-prueba'?: string }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} data-prueba={dataPrueba} className={`rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTES[variante]} ${className}`}>
      {children}
    </button>
  );
}

export function Metrica({ nombre, valor, pista }: { nombre: string; valor: string | number; pista?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800" title={pista}>
      <p className="text-[11px] uppercase tracking-wide text-neutral-500">{nombre}</p>
      <p className="text-base font-semibold tabular-nums">{valor}</p>
      {pista ? <p className="text-[11px] text-neutral-400">{pista}</p> : null}
    </div>
  );
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'info' | 'error' | 'ok' | 'honesto'; children: ReactNode }) {
  const estilo = {
    info: 'border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300',
    error: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
    honesto: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200',
  }[tipo];
  return <div className={`rounded-lg border px-3 py-2 text-sm ${estilo}`}>{children}</div>;
}

export function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-neutral-500">{etiqueta}</span>
      {children}
    </label>
  );
}

export const claseEntrada = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900';

export function Ocupado({ texto }: { texto: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-neutral-500">
      <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-amber-500" /> {texto}
    </p>
  );
}

export function Reproductor({ audio, etiqueta }: { audio: Blob | undefined; etiqueta?: string }) {
  const url = useMemo(() => (audio ? URL.createObjectURL(audio) : undefined), [audio]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  if (!url) return null;
  return (
    <div className="flex flex-col gap-1">
      {etiqueta ? <span className="text-xs text-neutral-500">{etiqueta}</span> : null}
      <audio controls src={url} className="w-full" />
    </div>
  );
}
