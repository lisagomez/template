'use client';

/**
 * Telemetría por etapa de cada turno, contada desde el FIN REAL del habla (no desde que el VAD
 * decide, que es lo que la fuente pintaba y le escondía ~1,5 s): cierre del VAD, transcripción,
 * enrutado, acuse, primer token, primera frase, voz lista, primer audio que suena y primer audio de
 * la respuesta. Un turno contestado por el cerebro SIMULADO (medición sin LLM) lo dice.
 */
import { latencia, latenciaRespuesta, resume, tramos, type Etapa, type RegistroTurno } from '../../../../tools/bucle-voz/dist/index.js';

const COLOR: Partial<Record<Etapa, string>> = {
  cierre: 'bg-slate-500',
  transcrito: 'bg-sky-400',
  enrutado: 'bg-white',
  acuse: 'bg-teal-400',
  primerToken: 'bg-violet-500',
  primeraFrase: 'bg-indigo-400',
  vozLista: 'bg-amber-400',
  suena: 'bg-orange-500',
  suenaRespuesta: 'bg-rose-500',
};

const NOMBRE: Partial<Record<Etapa, string>> = {
  cierre: 'cierre VAD',
  transcrito: 'transcripción',
  enrutado: 'enrutado',
  acuse: 'acuse',
  primerToken: '1er token',
  primeraFrase: '1a frase',
  vozLista: 'voz lista',
  suena: 'suena',
  suenaRespuesta: 'suena la respuesta',
};

const ms = (v: number | undefined) => (v === undefined ? '—' : `${Math.round(v)} ms`);

function Fila({ r, escala }: { r: RegistroTurno; escala: number }) {
  const total = latencia(r);
  const partes = tramos(r).filter((t) => t.etapa !== 'fin');
  const etiqueta = r.ruta === 'orden' ? `orden · ${r.orden ?? ''}` : r.ruta === 'llm' ? 'cerebro' : '—';
  return (
    <li className="space-y-1" data-prueba="turno-telemetria" data-ruta={r.ruta ?? ''} data-estado={r.estado}>
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="truncate text-white/60">
          #{r.id} <span className={r.ruta === 'llm' ? 'text-violet-300' : 'text-sky-300'}>{etiqueta}</span>
          {r.cierreAnticipado ? <span className="ml-1 text-emerald-300">cierre por sentido</span> : null}
          {r.acuse ? <span className="ml-1 text-teal-300" title={r.acuse}>acuse</span> : null}
          {r.cerebro === 'simulado' ? <span className="ml-1 rounded bg-amber-400/20 px-1 text-amber-200" data-prueba="cerebro-simulado">cerebro simulado</span> : null}
          {r.estado === 'interrumpido' ? <span className="ml-1 text-red-300">interrumpido</span> : null}
        </span>
        <span className={`font-mono ${total !== undefined && total < 1000 ? 'text-emerald-300' : 'text-orange-300'}`} title={r.acuse ? `respuesta: ${ms(latenciaRespuesta(r))}` : undefined}>
          {ms(total)}
          {r.acuse ? <span className="text-white/40"> · {ms(latenciaRespuesta(r))}</span> : null}
        </span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/5">
        {partes.map((t) => (
          <span key={t.etapa} title={`${NOMBRE[t.etapa] ?? t.etapa}: ${Math.round(t.ms)} ms`} className={`absolute top-0 h-full ${COLOR[t.etapa] ?? 'bg-white/40'}`} style={{ left: `${(t.desde / escala) * 100}%`, width: `${Math.max(0.6, (t.ms / escala) * 100)}%` }} />
        ))}
      </div>
    </li>
  );
}

export function Telemetria({ turnos }: { turnos: readonly RegistroTurno[] }) {
  const visibles = turnos.filter((t) => t.estado !== 'descartado' && t.marcas.cierre !== undefined).slice(-8).reverse();
  const escala = Math.max(1500, ...visibles.map((t) => latencia(t) ?? 0)) * 1.05;
  const orden = resume(turnos, 'orden');
  const llm = resume(turnos, 'llm');
  return (
    <section className="space-y-3" data-prueba="telemetria">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white/5 p-2">
          <p className="text-white/50">Órdenes locales · sin LLM</p>
          <p className="font-mono text-white">p50 {ms(orden.p50)} · p95 {ms(orden.p95)}</p>
          <p className="text-white/40">{orden.n} turnos</p>
        </div>
        <div className="rounded-lg bg-white/5 p-2">
          <p className="text-white/50">Conversación · cerebro</p>
          <p className="font-mono text-white">p50 {ms(llm.p50)} · p95 {ms(llm.p95)}</p>
          <p className="text-white/40">{llm.n} turnos</p>
        </div>
      </div>
      <p className="text-[11px] text-white/40">Fin real del habla → primer audio que suena (verde: menos de un segundo); con acuse, después del punto, la respuesta.</p>
      <ul className="space-y-2">{visibles.length === 0 ? <li className="text-xs text-white/40">Aún no hay turnos.</li> : visibles.map((r) => <Fila key={r.id} r={r} escala={escala} />)}</ul>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/50">
        {Object.entries(NOMBRE).map(([k, n]) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${COLOR[k as Etapa] ?? ''}`} />
            {n}
          </span>
        ))}
      </div>
    </section>
  );
}
