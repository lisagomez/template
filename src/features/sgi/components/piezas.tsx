/** Piezas visuales sin estado: aviso, barra de avance, insignia. */
export function Aviso({ aviso, error }: { aviso?: string; error?: string }) {
  if (!aviso && !error) return null;
  return (
    <p role={error ? 'alert' : 'status'} data-prueba={error ? 'error' : 'aviso'}
      className={`rounded-lg px-4 py-3 text-sm ${error ? 'bg-red-50 text-red-800 ring-1 ring-red-200' : 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200'}`}>
      {error ?? aviso}
    </p>
  );
}

export function Barra({ pct, etiqueta, color = 'var(--sgi-primario)' }: { pct: number; etiqueta?: string; color?: string }) {
  return (
    <div className="space-y-1" aria-label={etiqueta ? `${etiqueta}: ${pct}%` : `${pct}%`}>
      {etiqueta && <div className="flex justify-between text-xs text-gray-700"><span>{etiqueta}</span><span className="font-semibold tabular-nums">{pct}%</span></div>}
      <div className="h-2 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
    </div>
  );
}

export function Insignia({ children, tono = 'gris' }: { children: React.ReactNode; tono?: 'gris' | 'verde' | 'ambar' | 'rojo' | 'azul' }) {
  const t = { gris: 'bg-gray-100 text-gray-700', verde: 'bg-emerald-100 text-emerald-800', ambar: 'bg-amber-100 text-amber-900', rojo: 'bg-red-100 text-red-800', azul: 'bg-sky-100 text-sky-800' }[tono];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${t}`}>{children}</span>;
}

export function Tarjeta({ titulo, children, accion }: { titulo: string; children: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
      <div className="mb-3 flex items-start justify-between gap-3"><h2 className="text-base font-semibold">{titulo}</h2>{accion}</div>
      {children}
    </section>
  );
}
