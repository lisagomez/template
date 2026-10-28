'use client';

/**
 * La ranura de conversación de la ventana, llenada por el buzón: el hilo de la categoría abierta. Lo que le dices a
 * un agente en el compositor de la capa («dile al coordinador que…») se vuelve un mensaje AQUÍ, no un chat aparte;
 * lo que resuelve el enrutador sin LLM (ir a una pantalla, leer una cifra del libro) no es conversación con un agente.
 */
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { leeHilo, type HiloCorto } from '../services/acciones';
import { useAgora } from '@/features/agora/components/contexto';
import { Avatar } from '@/features/agora/components/insignia';

export function HiloDeLaCategoria() {
  const datos = useAgora();
  const params = useSearchParams();
  const ruta = usePathname();
  const router = useRouter();
  const cat = params.get('cat');
  const [leido, setLeido] = useState<{ cat: string; hilo: HiloCorto | null } | null>(null);
  const sello = datos.apagada ? '' : datos.espera.length + ':' + datos.arbol.reduce((s, n) => s + n.pendientes, 0);
  useEffect(() => {
    let vivo = true;
    if (!cat || datos.apagada) return;
    void leeHilo(cat).then((r) => { if (vivo) setLeido({ cat, hilo: r.ok ? r.valor : null }) });
    return () => { vivo = false };
  }, [cat, datos.apagada, sello, ruta]);
  if (datos.apagada) return null;
  const hilo = cat && leido?.cat === cat ? leido.hilo : null;
  if (!hilo) return <p className="capa-aviso" data-agora-hilo="ninguno">Abre una categoría y su hilo aparece aquí: lo que le digas a un agente queda en él.</p>;
  return (
    <div className="border-b border-slate-200 px-3 py-2" data-agora-hilo={hilo.categoria.id}>
      <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        <span># {hilo.categoria.nombre}</span>
        <a href={`/agora/buzon?cat=${hilo.categoria.id}`} onClick={(e) => { e.preventDefault(); router.push(`/agora/buzon?cat=${hilo.categoria.id}`) }} className="normal-case tracking-normal text-blue-700">
          {hilo.pendientes ? `${hilo.pendientes} por decidir · ` : ''}abrir buzón</a>
      </div>
      <ul className="max-h-48 space-y-1.5 overflow-auto">
        {hilo.mensajes.map((m) => (
          <li key={m.id} className="flex gap-1.5 text-[12px] leading-snug">
            <Avatar tipo={m.autor.tipo} iniciales={m.autor.iniciales} chico />
            <span className="min-w-0"><b className="font-semibold">{m.autor.nombre.split(' ')[0]}:</b> <span className="text-slate-700">{m.cuerpo.length > 140 ? `${m.cuerpo.slice(0, 140)}…` : m.cuerpo}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
