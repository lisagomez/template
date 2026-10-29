'use client';

/**
 * El buzón de una categoría: el canal interno único. Hilos de un nivel (la base lo impone), cada mensaje con el sello
 * de quién lo escribió (persona, agente interno o externo con la huella corta de su tarjeta) y su cuerpo tratado como
 * DATO: se muestra como texto, nunca se interpreta. Las propuestas llegan aquí con su huella y se deciden aquí.
 */
import { useMemo, useState, useTransition } from 'react';
import type { Mensaje } from '../../../../tools/agora/dist/index.js';
import { publicaEnHilo } from '@/features/agora/services/acciones';
import { corta, fecha } from '@/features/agora/services/formato';
import { Avatar, Etiqueta } from '@/features/agora/components/insignia';
import { TarjetaPropuesta } from '@/features/agora/components/propuesta';
import type { DatosDelBuzon } from '../services/lecturas';

function Burbuja({ m, d, abierta }: { m: Mensaje; d: DatosDelBuzon; abierta: string | null }) {
  const p = m.propuesta ? d.propuestas.find((x) => x.id === m.propuesta) : null;
  const tipo = m.autor.tipo;
  return (
    <div className={`flex gap-2.5 ${m.hilo ? 'ml-9' : ''}`} data-mensaje={m.id} data-origen={m.origen}>
      <Avatar tipo={tipo} iniciales={m.autor.iniciales} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px]">
          <b className="font-semibold text-slate-900">{m.autor.nombre}</b>
          {tipo !== 'humano' ? <Etiqueta tipo={tipo} /> : null}
          {tipo === 'externo' ? <span className="font-mono text-[10.5px] text-amber-700" title="huella fijada de su Agent Card">tarjeta {corta(m.huellaTarjeta)} · verificada por la Puerta</span> : null}
          {m.origen.startsWith('espejo') ? <span className="text-[10.5px] text-slate-500">espejo de solo lectura ({m.origen.replace('espejo_', '')})</span> : null}
          <span className="text-[11px] text-slate-400">{fecha(m.creado.slice(0, 10))} {m.creado.slice(11, 16)}</span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-slate-800">{m.cuerpo}</p>
        {p ? <div className={`mt-2 ${abierta === p.id ? 'ring-2 ring-blue-400 ring-offset-2 rounded-lg' : ''}`}><TarjetaPropuesta p={p} nombres={d.nombres} /></div> : null}
      </div>
    </div>
  );
}

export function Buzon({ d, abierta }: { d: DatosDelBuzon; abierta: string | null }) {
  const [texto, setTexto] = useState('');
  const [respondeA, setRespondeA] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, empieza] = useTransition();
  const raices = useMemo(() => d.mensajes.filter((m) => !m.hilo), [d.mensajes]);
  const respuestas = (id: string) => d.mensajes.filter((m) => m.hilo === id);
  const sueltas = d.propuestas.filter((p) => !d.mensajes.some((m) => m.propuesta === p.id) && p.estado === 'pendiente');
  if (!d.categoria) return <p className="p-6 text-sm text-slate-600">No hay categorías visibles para ti.</p>;
  const manda = () => {
    const t = texto.trim();
    if (!t) return;
    empieza(async () => {
      const r = await publicaEnHilo({ categoria: d.categoria!.id, cuerpo: t, hilo: respondeA });
      if (r.ok) { setTexto(''); setRespondeA(null); setAviso(null) } else setAviso(`La base no lo permitió: ${r.motivo}`);
    });
  };
  return (
    <div className="flex h-full min-h-0 flex-col" data-agora-buzon={d.categoria.id}>
      <header className="border-b border-slate-200 bg-white px-5 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{d.categoria.workspace} › {d.categoria.dominio}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold text-slate-900"># {d.categoria.nombre}</h1>
          <div className="flex flex-wrap gap-1.5">
            {d.participantes.map((x, k) => (
              <span key={k} title={`${x.nombre} · ${x.rol}${x.huella ? ` · tarjeta ${corta(x.huella)}` : ''}`} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-0.5 pl-0.5 pr-2 text-[11px] text-slate-700">
                <Avatar tipo={x.tipo} iniciales={x.iniciales} chico />{x.nombre.split(' ')[0]}
              </span>
            ))}
          </div>
        </div>
        <p className="mt-1 text-[11.5px] text-slate-500">Canal interno único: todo lo de esta categoría se dice y se guarda aquí. Slack, Telegram o correo solo replican en lectura (en el laboratorio no hay ninguno conectado).</p>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto bg-slate-50/60 px-5 py-4">
        {sueltas.map((p) => <TarjetaPropuesta key={p.id} p={p} nombres={d.nombres} />)}
        {raices.length === 0 ? <p className="text-sm text-slate-500">Todavía no hay mensajes en esta categoría.</p> : null}
        {raices.map((m) => (
          <div key={m.id} className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3">
            <Burbuja m={m} d={d} abierta={abierta} />
            {respuestas(m.id).map((r) => <Burbuja key={r.id} m={r} d={d} abierta={abierta} />)}
            <button type="button" onClick={() => setRespondeA(m.id)} className="ml-9 text-[11.5px] font-medium text-blue-700 hover:underline">Responder en el hilo</button>
          </div>
        ))}
      </div>
      <form className="border-t border-slate-200 bg-white p-3" onSubmit={(e) => { e.preventDefault(); manda() }}>
        {respondeA ? <p className="mb-1 text-[11.5px] text-slate-600">Respondiendo en el hilo · <button type="button" className="text-blue-700" onClick={() => setRespondeA(null)}>escribir uno nuevo</button></p> : null}
        <div className="flex gap-2">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder={`Escribe en # ${d.categoria.nombre}: al equipo o a un agente («coordinador, …»)`} data-buzon-entrada
            className="min-h-[44px] flex-1 resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          <button type="submit" disabled={ocupado || !texto.trim()} className="self-end rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Publicar</button>
        </div>
        {aviso ? <p role="status" className="mt-1 text-xs text-rose-700">{aviso}</p> : null}
      </form>
    </div>
  );
}
