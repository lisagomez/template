'use client';

/** Piezas comunes del estudio: la sección con su compuerta de laboratorio, copiar y etiquetas. */
import { useState, type ReactNode } from 'react';
import Link from 'next/link';

export function Seccion({ id, titulo, subtitulo, aprobada, children }: { id: string; titulo: string; subtitulo: string; aprobada: boolean; children: ReactNode }) {
  return (
    <section id={id} data-prueba={`seccion-${id}`} className="scroll-mt-4 rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
      <header className="mb-4">
        <h2 className="text-xl font-bold">{titulo}</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{subtitulo}</p>
      </header>
      {aprobada ? children : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Esta herramienta sigue en el <Link href="/laboratorio-pymes" className="underline">laboratorio</Link>: no pasó todos sus casos, así que aquí no se usa.
        </p>
      )}
    </section>
  );
}

export function Copiar({ texto, etiqueta = 'Copiar' }: { texto: string; etiqueta?: string }) {
  const [hecho, setHecho] = useState(false);
  return (
    <button type="button" className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
      onClick={() => void navigator.clipboard.writeText(texto).then(() => { setHecho(true); setTimeout(() => setHecho(false), 1500); })}>
      {hecho ? 'Copiado' : etiqueta}
    </button>
  );
}

export function Pastilla({ children, tono = 'neutro' }: { children: ReactNode; tono?: 'neutro' | 'bien' | 'revisar' | 'problema' | 'sin' }) {
  const estilo = {
    neutro: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
    bien: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    revisar: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
    problema: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    sin: 'border border-dashed border-neutral-400 text-neutral-600 dark:text-neutral-300',
  }[tono];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${estilo}`}>{children}</span>;
}

export function AreaDeTexto({ valor, cambia, filas = 4, marcador, prueba, mono = true }: { valor: string; cambia: (v: string) => void; filas?: number; marcador?: string; prueba?: string; mono?: boolean }) {
  return <textarea data-prueba={prueba} value={valor} onChange={(e) => cambia(e.target.value)} rows={filas} placeholder={marcador} className={`w-full rounded-lg border border-neutral-300 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-950 ${mono ? 'font-mono text-xs' : 'text-sm'}`} />;
}

export function Lista({ titulo, elementos }: { titulo: string; elementos: readonly string[] }) {
  if (elementos.length === 0) return null;
  return (
    <div className="text-sm">
      <p className="mb-1 font-semibold">{titulo}</p>
      <ul className="list-disc space-y-0.5 pl-5 text-neutral-700 dark:text-neutral-300">{elementos.map((e, i) => <li key={i}>{e}</li>)}</ul>
    </div>
  );
}
