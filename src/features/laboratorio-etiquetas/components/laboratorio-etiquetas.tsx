'use client';

/**
 * El laboratorio de la herramienta de etiquetas GS1: cada caso ya corrió en el servidor al abrir la
 * página, con datos sintéticos y declarados (y, si esta máquina lo tiene, el motor local y el corpus
 * real). Lo que no está medido no se disfraza, y solo lo que pasa completo queda aprobado: una pantalla
 * de /etiquetas cuya herramienta no está aprobada se apaga.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Aviso, Metrica } from '@/features/laboratorio-voz/components/ui';
import type { CasoCorrido, Herramienta, IdHerramienta } from '../services/tipos.ts';
import { TarjetaCaso } from './tarjeta-caso.tsx';

interface Props {
  readonly corridos: readonly CasoCorrido[];
  readonly herramientas: readonly Herramienta[];
  readonly aprobadas: readonly IdHerramienta[];
  readonly cuando: string;
  readonly maquina: { readonly motor: string | null; readonly corpusReal: boolean };
}

function Resumen({ corridos, herramientas, aprobadas, elegir }: Pick<Props, 'corridos' | 'herramientas' | 'aprobadas'> & { elegir: (id: IdHerramienta) => void }) {
  return (
    <table className="hidden w-full min-w-[46rem] text-sm md:table" data-prueba="tabla-herramientas">
      <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
        <tr><th className="py-2">Herramienta</th><th>Pantallas</th><th className="text-right">Casos</th><th className="text-right">Pasan</th><th className="text-right">No medidos</th><th className="text-right">Fallan</th><th className="text-right">Trampas</th><th className="pl-4">Para la app</th></tr>
      </thead>
      <tbody>
        {herramientas.map((h) => {
          const suyos = corridos.filter((c) => c.caso.herramienta === h.id);
          const n = (e: string) => suyos.filter((c) => c.resultado.estado === e).length;
          const ok = aprobadas.includes(h.id);
          return (
            <tr key={h.id} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-2"><button type="button" onClick={() => elegir(h.id)} className="font-medium underline-offset-2 hover:underline">{h.nombre}</button><p className="text-xs text-neutral-500">{h.queHace}</p></td>
              <td className="text-xs text-neutral-500">{h.pantallas.length ? h.pantallas.map((p) => p.replace('/etiquetas', '') || '/').join(' ') : 'el motor de recibir'}</td>
              <td className="text-right tabular-nums">{suyos.length}</td>
              <td className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">{n('pasa')}</td>
              <td className="text-right tabular-nums text-amber-700 dark:text-amber-300">{n('no-medido')}</td>
              <td className="text-right tabular-nums text-red-700 dark:text-red-400">{n('falla')}</td>
              <td className="text-right tabular-nums">{suyos.filter((c) => c.caso.trampa).length}</td>
              <td className="pl-4"><span data-prueba={`aprobada-${h.id}`} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ok ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>{ok ? 'aprobada' : 'en laboratorio'}</span></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** En el celular, una tarjeta corta por herramienta: lo que importa (¿la usa la app?) sin desplazar la tabla. */
function ResumenCorto({ corridos, herramientas, aprobadas, elegir }: Pick<Props, 'corridos' | 'herramientas' | 'aprobadas'> & { elegir: (id: IdHerramienta) => void }) {
  return (
    <ul className="grid gap-2 md:hidden" data-prueba="lista-herramientas">
      {herramientas.map((h) => {
        const suyos = corridos.filter((c) => c.caso.herramienta === h.id);
        const n = (e: string) => suyos.filter((c) => c.resultado.estado === e).length;
        const ok = aprobadas.includes(h.id);
        return (
          <li key={h.id} className="flex items-center justify-between gap-2 border-t border-neutral-200 pt-2 text-sm first:border-t-0 first:pt-0 dark:border-neutral-800">
            <button type="button" onClick={() => elegir(h.id)} className="min-w-0 text-left"><span className="font-medium">{h.nombre}</span><span className="block text-xs text-neutral-500">{n('pasa')} pasan · {n('no-medido')} no medidos · {n('falla')} fallan · {suyos.filter((c) => c.caso.trampa).length} trampas</span></button>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${ok ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>{ok ? 'aprobada' : 'en laboratorio'}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function LaboratorioEtiquetas({ corridos, herramientas, aprobadas, cuando, maquina }: Props) {
  const [elegida, setElegida] = useState<IdHerramienta | 'todas'>('todas');
  const [soloTrampas, setSoloTrampas] = useState(false);
  const visibles = useMemo(() => corridos.filter((c) => (elegida === 'todas' || c.caso.herramienta === elegida) && (!soloTrampas || c.caso.trampa)), [corridos, elegida, soloTrampas]);
  const n = (e: string) => corridos.filter((c) => c.resultado.estado === e).length;
  const discrepan = corridos.filter((c) => !c.coincide).length;
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6">
      <header className="mb-6 pr-32">
        <p className="text-xs uppercase tracking-widest text-neutral-500">Laboratorio de etiquetas GS1 y caducidades</p>
        <h1 className="text-3xl font-bold">Qué hace de verdad, caso por caso</h1>
        <p className="mt-3 max-w-3xl text-neutral-700 dark:text-neutral-300">
          {corridos.length} casos corrieron al abrir esta página ({cuando}), con datos sintéticos (prefijo 952, el que GS1 reserva para ejemplos) y declarados. Cada herramienta tiene casos-trampa: dígitos malos, códigos que no son GS1, fechas ambiguas, cantidades que no debe ver quien cuenta, cadenas reescritas. Solo lo que pasa completo queda aprobado para <Link className="underline" href="/etiquetas">la app de etiquetas</Link>.
        </p>
        <p className="mt-2 text-sm text-neutral-500" data-prueba="maquina">Esta máquina: {maquina.motor ? `motor local ${maquina.motor}` : 'sin motor local de fechas'} · {maquina.corpusReal ? 'con el corpus de fotos reales' : 'sin el corpus de fotos reales'}.</p>
      </header>
      <section className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-6" data-prueba="metricas">
        <Metrica nombre="Casos" valor={corridos.length} />
        <Metrica nombre="Pasan" valor={n('pasa')} />
        <Metrica nombre="No medidos" valor={n('no-medido')} pista="se dice por qué" />
        <Metrica nombre="Fallan" valor={n('falla')} />
        <Metrica nombre="Trampas" valor={corridos.filter((c) => c.caso.trampa).length} />
        <Metrica nombre="Aprobadas" valor={`${aprobadas.length} de ${herramientas.length}`} />
      </section>
      {discrepan > 0 ? <div className="mb-4"><Aviso tipo="error">{discrepan} caso(s) no dieron el estado que declaran: la suite de validación está en rojo.</Aviso></div> : null}
      <section className="mb-8 overflow-x-auto rounded-xl border border-neutral-200 p-4 dark:border-neutral-800" data-prueba="seccion-herramientas">
        <Resumen corridos={corridos} herramientas={herramientas} aprobadas={aprobadas} elegir={setElegida} />
        <ResumenCorto corridos={corridos} herramientas={herramientas} aprobadas={aprobadas} elegir={setElegida} />
      </section>
      <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {(['todas', ...herramientas.map((h) => h.id)] as const).map((id) => (
          <button key={id} type="button" onClick={() => setElegida(id)} className={`rounded-full border px-3 py-1 ${elegida === id ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900' : 'border-neutral-300 dark:border-neutral-700'}`}>
            {id === 'todas' ? 'Todas' : herramientas.find((h) => h.id === id)?.nombre}
          </button>
        ))}
        <label className="ml-2 inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-300"><input type="checkbox" checked={soloTrampas} onChange={(e) => setSoloTrampas(e.target.checked)} /> solo trampas</label>
      </nav>
      <section className="grid gap-3">{visibles.map((c) => <TarjetaCaso key={c.caso.id} corrido={c} />)}</section>
    </main>
  );
}
