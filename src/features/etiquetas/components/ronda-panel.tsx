'use client';

/**
 * La ronda de HOY en la pantalla de escanear: las tareas en orden de recorrido, primero las de la
 * zona donde esta la persona. Ninguna tiene boton «hecho»: se cierra con el escaneo que la prueba
 * (el lote correcto en la ubicacion correcta) y queda en la cadena. Sin cantidades.
 */
import { useEffect, useState } from 'react';
import { nombreZona, type TareaConEstado, type Zona } from '../services/nucleo.ts';
import { accion } from '../services/cliente.ts';
import { tarjeta } from './marco.tsx';

export type RespRonda = { ronda: { id: string; sitio: string; fecha: string; generada: string }; tareas: TareaConEstado[]; hora: string };

export const COLOR_TAREA: Record<TareaConEstado['estado'], string> = {
  pendiente: 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100',
  atrasada: 'bg-red-600 text-white',
  hecha: 'bg-emerald-600 text-white',
  'ya-no-aplica': 'bg-neutral-300 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200',
};
export const TEXTO_TAREA: Record<TareaConEstado['estado'], string> = { pendiente: 'Pendiente', atrasada: 'Atrasada', hecha: 'Hecha', 'ya-no-aplica': 'Ya no aplica' };
const TIPO: Record<TareaConEstado['tipo'], string> = { retirar: 'Retirar', resurtir: 'Resurtir FEFO', promover: 'Promover', confirmar: 'Confirmar', ubicar: 'Ubicar', contar: 'Contar' };

export function FilaTarea({ t }: { t: TareaConEstado }) {
  return (
    <li className="flex items-start gap-2 py-1.5" data-prueba="tarea" data-estado={t.estado} data-tipo={t.tipo}>
      <span className="w-6 shrink-0 text-right font-mono text-xs text-neutral-500">{t.orden}</span>
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${COLOR_TAREA[t.estado]}`}>{TEXTO_TAREA[t.estado]}</span>
      <span className="min-w-0 text-sm"><b>{TIPO[t.tipo]}</b> · {t.ubicacion}{t.descripcion ? ` · ${t.descripcion}` : ''}<br /><span className="text-xs text-neutral-600 dark:text-neutral-300">{t.estado === 'hecha' || t.estado === 'ya-no-aplica' ? t.motivo ?? `cerrada por ${t.evidencia?.operador ?? '—'}` : `${t.instruccion} Antes de las ${t.hasta}.`}</span></span>
    </li>
  );
}

export function RondaPanel({ sitio, zona, version }: { sitio: string; zona?: Zona; version: number }) {
  const [r, setR] = useState<RespRonda | null>(null);
  const [todas, setTodas] = useState(false);
  useEffect(() => { void accion<RespRonda>({ accion: 'ronda', sitio }).then(setR, () => undefined); }, [sitio, version]);
  if (!r) return null;
  const abiertas = (t: TareaConEstado) => t.estado === 'pendiente' || t.estado === 'atrasada';
  const deZona = zona ? r.tareas.filter((t) => t.zona === zona) : r.tareas;
  const lista = todas ? r.tareas : deZona;
  const hechas = r.tareas.filter((t) => !abiertas(t)).length;
  return (
    <section className={`${tarjeta} space-y-2`} data-prueba="ronda" data-hechas={hechas} data-total={r.tareas.length}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">Ronda de hoy · {hechas}/{r.tareas.length}</h2>
        {zona ? <button type="button" className="text-xs font-semibold underline" onClick={() => setTodas((x) => !x)}>{todas ? `Solo ${nombreZona(zona).toLowerCase()}` : 'Ver todas las zonas'}</button> : null}
      </header>
      <div className="h-2 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800"><div className="h-full bg-emerald-600" style={{ width: `${r.tareas.length ? Math.round((100 * hechas) / r.tareas.length) : 100}%` }} /></div>
      {lista.length === 0 ? <p className="text-sm text-neutral-500">{zona && !todas ? `Nada pendiente en ${nombreZona(zona).toLowerCase()}.` : 'La ronda de hoy no tiene tareas.'}</p> : null}
      <ol className="divide-y divide-neutral-200 dark:divide-neutral-800">{[...lista].sort((a, b) => Number(abiertas(b)) - Number(abiertas(a)) || a.orden - b.orden).map((t) => <FilaTarea key={t.id} t={t} />)}</ol>
      <p className="text-xs text-neutral-500">Cada tarea se cierra sola con el escaneo que la prueba.</p>
    </section>
  );
}
