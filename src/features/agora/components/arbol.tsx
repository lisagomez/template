'use client';

/**
 * El explorador de Ágora: la jerarquía workspace › dominio › categoría, que también es el árbol de centros de costo.
 * Cada categoría lleva sus pendientes y alertas; elegir una abre su tablero o su buzón según la pantalla en la que
 * estés. Lo que tienes abierto se recuerda (la preferencia, no los datos).
 */
import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCapa } from '../../../../tools/capa/dist/react/index.js';
import { recuerdaPreferencia } from '../services/preferencias';
import { useAgora } from './contexto';

export function ArbolDeAgora() {
  const datos = useAgora();
  const ruta = usePathname() ?? '/agora';
  const params = useSearchParams();
  const router = useRouter();
  const { memoria } = useCapa();
  const ws = params.get('ws');
  const cat = params.get('cat');
  useEffect(() => {
    if (ws) void recuerdaPreferencia(memoria, 'workspace-abierto', ws).catch(() => undefined);
    if (cat) void recuerdaPreferencia(memoria, 'categoria-abierta', cat).catch(() => undefined);
  }, [ws, cat, memoria]);
  if (datos.apagada) return <p className="px-2 text-xs text-slate-500">Ágora está apagada aquí.</p>;
  const nodos = datos.arbol;
  const hijos = (padre: string | null) => nodos.filter((n) => n.padre === padre);
  const destino = (n: (typeof nodos)[number]) => {
    const workspace = n.tipo === 'workspace' ? n.id : nodos.find((x) => x.id === (n.tipo === 'dominio' ? n.padre : nodos.find((d) => d.id === n.padre)?.padre))?.id
    if (n.tipo === 'categoria' && ruta.startsWith('/agora/buzon')) return `/agora/buzon?cat=${n.id}`;
    if (n.tipo === 'categoria') return `/agora/tablero?ws=${workspace}&cat=${n.id}`;
    return `/agora/tablero?ws=${workspace}`;
  };
  return (
    <div className="mb-3 border-b border-slate-200 pb-3" data-agora-arbol>
      <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{datos.yo.org.nombre}</div>
      {hijos(null).map((w) => (
        <div key={w.id} className="mb-2">
          <a href={destino(w)} onClick={(e) => { e.preventDefault(); router.push(destino(w)) }} data-nodo={w.slug}
            className={`flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] font-semibold ${ws === w.id && !cat ? 'bg-blue-50 text-blue-800' : 'text-slate-800 hover:bg-slate-100'}`}>
            <span className="truncate">{w.nombre}</span>
          </a>
          {hijos(w.id).map((d) => (
            <div key={d.id} className="ml-2">
              <div className="px-2 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{d.nombre}</div>
              {hijos(d.id).map((c) => (
                <a key={c.id} href={destino(c)} onClick={(e) => { e.preventDefault(); router.push(destino(c)) }} data-nodo={c.slug} aria-current={cat === c.id ? 'true' : undefined}
                  className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[13px] ${cat === c.id ? 'bg-blue-50 font-semibold text-blue-800' : 'text-slate-700 hover:bg-slate-100'}`}>
                  <span className="truncate">{c.nombre}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {c.pendientes ? <span title="propuestas pendientes" className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">{c.pendientes}</span> : null}
                    {c.alertas ? <span title="alertas" className="rounded-full bg-rose-100 px-1.5 text-[10px] font-semibold text-rose-700">{c.alertas}</span> : null}
                    <span className="text-[10px] tabular-nums text-slate-400">{c.items}</span>
                  </span>
                </a>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
