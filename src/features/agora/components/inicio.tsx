/**
 * El inicio de la organización: sus workspaces (cada uno con su tablero, su buzón y sus cifras a un clic), lo que
 * espera el clic de quien mira y el estado del laboratorio. Sin montos aquí: las cifras viven en Costos.
 */
import Link from 'next/link';
import type { NodoArbol, Pendiente, Yo } from '../../../../tools/agora/dist/index.js';
import { fecha } from '../services/formato';

const MODULOS = [
  { ruta: '/agora/tablero', nombre: 'Tablero', que: 'Tabla, kanban y Gantt; los agentes solo proponen' },
  { ruta: '/agora/buzon', nombre: 'Buzón', que: 'El canal interno único: un hilo por categoría' },
  { ruta: '/agora/costos', nombre: 'Costos', que: 'Presupuesto, comprometido, ejercido y disponible por centro' },
  { ruta: '/agora/contabilidad', nombre: 'Contabilidad', que: 'Cierre del periodo y póliza propuesta' },
  { ruta: '/agora/agentes', nombre: 'Agentes y Puerta', que: 'idCard, topes, suspender y revocar; la Puerta cerrada' },
  { ruta: '/agora/metricas', nombre: 'Métricas', que: 'Capa semántica: cada cifra cuadra con el libro' },
];

export function Inicio({ yo, arbol, espera, resumen }: { yo: Yo; arbol: NodoArbol[]; espera: Pendiente[]; resumen: string }) {
  const workspaces = arbol.filter((n) => n.tipo === 'workspace');
  const de = (ws: string) => {
    const doms = arbol.filter((n) => n.padre === ws);
    const cats = arbol.filter((n) => doms.some((d) => d.id === n.padre));
    return { doms, items: cats.reduce((s, c) => s + c.items, 0), pendientes: cats.reduce((s, c) => s + c.pendientes, 0), alertas: cats.reduce((s, c) => s + c.alertas, 0) };
  };
  const decidir = espera.filter((x) => x.tipo !== 'aviso').length;
  return (
    <div className="space-y-6 p-6" data-agora-inicio>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{yo.org.nombre}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Hola, {yo.nombre.split(' ')[0]}</h1>
          <p className="text-sm text-slate-600">{yo.titulo}. {decidir ? `Tienes ${decidir} decisión(es) esperando tu clic.` : 'Nada espera tu clic ahora.'}</p>
        </div>
        <div className="flex gap-2 text-xs text-slate-600">
          <span className="rounded-md bg-slate-100 px-2 py-1">Umbral de Finanzas: montos sobre el umbral de la organización</span>
          <span className={`rounded-md px-2 py-1 ${yo.config.segregacion ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>Segregación de funciones {yo.config.segregacion ? 'activa' : 'desactivada'}</span>
        </div>
      </header>
      <section className="grid gap-4 md:grid-cols-2">
        {workspaces.map((w) => {
          const x = de(w.id);
          return (
            <article key={w.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-workspace={w.slug}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{w.nombre}</h2>
                  <p className="text-xs text-slate-500">{fecha(w.inicio)} – {fecha(w.fin)} · {x.doms.map((d) => d.nombre).join(' · ')}</p>
                </div>
                <div className="flex gap-1 text-[11px]">
                  {x.pendientes ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">{x.pendientes} por aprobar</span> : null}
                  {x.alertas ? <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-700">{x.alertas} alertas</span> : null}
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-700">{x.items} ítems en {arbol.filter((n) => x.doms.some((d) => d.id === n.padre)).length} categorías</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Link className="rounded-md bg-slate-900 px-2.5 py-1.5 font-medium text-white" href={`/agora/tablero?ws=${w.id}`}>Tablero</Link>
                <Link className="rounded-md border border-slate-300 px-2.5 py-1.5" href={`/agora/tablero?ws=${w.id}&vista=gantt`}>Gantt</Link>
                <Link className="rounded-md border border-slate-300 px-2.5 py-1.5" href={`/agora/costos?ws=${w.id}`}>Costos</Link>
              </div>
            </article>
          );
        })}
      </section>
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Módulos</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {MODULOS.map((m) => (
            <Link key={m.ruta} href={m.ruta} className="rounded-lg border border-slate-200 bg-white p-3 hover:border-slate-300 hover:bg-slate-50">
              <span className="block text-sm font-semibold text-slate-900">{m.nombre}</span>
              <span className="block text-xs text-slate-600">{m.que}</span>
            </Link>
          ))}
        </div>
      </section>
      <p className="text-[11.5px] text-slate-500" data-resumen-agenda>
        Lo que Ágora le cuenta a tu agenda (solo conteos y enlaces, validado por la capa; no sale de la máquina): {resumen}
      </p>
    </div>
  );
}
