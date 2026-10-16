'use client';

/** La conversación: lo que dijo la persona, por dónde se resolvió y lo que contestó la máquina. */
import type { Entrada } from '../types/index.ts';

function Insignia({ e }: { e: Entrada }) {
  if (e.ruta === 'orden') return <span className="rounded bg-sky-400/15 px-1.5 text-[10px] font-semibold text-sky-300">orden local · sin LLM{e.orden ? ` · ${e.orden}` : ''}</span>;
  if (e.ruta === 'llm') return <span className="rounded bg-violet-500/15 px-1.5 text-[10px] font-semibold text-violet-300">cerebro · LLM</span>;
  return null;
}

export function Registro({ entradas }: { entradas: readonly Entrada[] }) {
  const ultimas = entradas.slice(-8);
  return (
    <ol className="space-y-2 text-sm" data-prueba="registro">
      {ultimas.length === 0 ? <li className="text-xs text-white/40">Di «oye mando», toca el micrófono o mantén ESPACIO.</li> : null}
      {ultimas.map((e) => (
        <li key={e.id} data-prueba={`entrada-${e.quien}`} data-ruta={e.ruta ?? ''} className={e.quien === 'sistema' ? 'text-xs text-amber-200/70' : ''}>
          {e.quien === 'sistema' ? (
            <span>· {e.texto}</span>
          ) : (
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-[11px] text-white/40">
                <span>{e.quien === 'persona' ? 'Tú' : 'Mando'}</span>
                {e.quien === 'persona' ? <Insignia e={e} /> : null}
                {e.interrumpida ? <span className="text-red-300">interrumpido</span> : null}
              </div>
              <p className={e.quien === 'persona' ? 'text-white' : 'text-white/75'}>{e.texto}</p>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
