'use client';

import { ETIQUETA_ESTADO, EXPLICACION_ESTADO } from '../services/estado-casos.ts';
import type { EstadoCaso } from '../types/index.ts';

export const COLOR_ESTADO: Record<EstadoCaso, { punto: string; fondo: string }> = {
  listo: { punto: 'bg-emerald-500', fondo: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300' },
  reglas: { punto: 'bg-amber-500', fondo: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200' },
  puerta: { punto: 'bg-neutral-400', fondo: 'border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300' },
};

export function Semaforo({ estado, grande = false }: { estado: EstadoCaso; grande?: boolean }) {
  const c = COLOR_ESTADO[estado];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${c.fondo} ${grande ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'}`} title={EXPLICACION_ESTADO[estado]}>
      <span className={`h-2 w-2 rounded-full ${c.punto}`} />
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}

export function Leyenda() {
  return (
    <ul className="grid gap-2 sm:grid-cols-3">
      {(['listo', 'reglas', 'puerta'] as EstadoCaso[]).map((e) => (
        <li key={e} className="flex items-start gap-2 text-sm text-neutral-600 dark:text-neutral-300">
          <Semaforo estado={e} />
          <span>{EXPLICACION_ESTADO[e]}</span>
        </li>
      ))}
    </ul>
  );
}
