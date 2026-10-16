'use client';

/** Piezas pequeñas del HUD: el panel de vidrio, el estado de la máquina y el emparejamiento. */
import { useState, type ReactNode } from 'react';
import type { EstadoServidor } from '../types/index.ts';

export function Panel({ titulo, children, className = '' }: { titulo: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-white/[0.035] p-4 backdrop-blur-md ${className}`}>
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">{titulo}</h2>
      {children}
    </section>
  );
}

function Punto({ ok, texto, titulo }: { ok: boolean; texto: string; titulo: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/60" title={titulo}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
      {texto}
    </span>
  );
}

export function Estado({ servidor }: { servidor: EstadoServidor | undefined }) {
  if (!servidor) return <span className="text-xs text-white/40">comprobando la máquina…</span>;
  const g = servidor.gasto;
  return (
    <div className="flex flex-wrap items-center gap-2" data-prueba="estado-servidor">
      <Punto ok={servidor.demonio} texto={servidor.demonio ? 'voz local lista' : 'voz local caída'} titulo="Demonio de tools/dictado: Parakeet (oír) y Piper (hablar), en 127.0.0.1" />
      <Punto ok={servidor.llave && g.nivel !== 'excedido'} texto={`cerebro ${servidor.modelo.split('/').pop() ?? ''}`} titulo={`Prompt ${servidor.prompt}`} />
      <Punto ok={g.nivel === 'ok'} texto={`US$${g.gastadoUsd.toFixed(4)} de ${g.topeUsd}`} titulo={g.filasSinCosto ? `${g.filasSinCosto} llamadas sin costear` : 'Gasto del cerebro contra el tope del laboratorio'} />
      <Punto ok={servidor.agenda} texto={servidor.agenda ? 'agenda (solo lectura)' : 'sin agenda'} titulo="Espejo local del calendario: se lee, nunca se escribe" />
    </div>
  );
}

export function Emparejar({ empareja, error }: { empareja: (token: string) => Promise<boolean>; error: string | undefined }) {
  const [token, setToken] = useState('');
  return (
    <form
      className="flex flex-col gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/5 p-4 sm:flex-row sm:items-center"
      data-prueba="emparejar"
      onSubmit={(e) => {
        e.preventDefault();
        void empareja(token.trim());
      }}
    >
      <p className="text-sm text-amber-100/80 sm:flex-1">Empareja este navegador con la llave del dictado (la misma del celular). Se teclea una vez y no se muestra.</p>
      <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="token" autoComplete="off" className="rounded-full border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-sm" />
      <button type="submit" disabled={token.trim().length < 16} className="rounded-full bg-amber-300/20 px-4 py-1.5 text-sm disabled:opacity-40">
        Emparejar
      </button>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </form>
  );
}
