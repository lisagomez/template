'use client';

/**
 * Una propuesta en el hilo: qué cambia (antes → después), su huella, su nivel y quién la puede decidir. Aprobar es un
 * CLIC HUMANO sobre ESA huella: un Enter, la voz o un `click()` sintético no deciden nada, y quien no tiene el rol
 * de la matriz ve el botón apagado con el porqué. La base lo vuelve a comprobar todo al insertar la fila.
 */
import { useState, useTransition, type MouseEvent } from 'react';
import { esClicHumano } from '../../../../tools/capa/dist/index.js';
import type { Propuesta } from '../../../../tools/agora/dist/index.js';
import { decidePropuesta } from '../services/acciones';
import { corta, fecha, mxn } from '../services/formato';
import { Quien } from './insignia';

const CAMPO: Record<string, string> = { monto_mxn: 'Monto', fin: 'Fecha', inicio: 'Inicio', responsable_persona: 'Responsable', responsable_agente: 'Responsable', progreso: 'Progreso',
  etiquetas: 'Etiquetas', prioridad: 'Prioridad', nombre: 'Nombre', estado: 'Estado', vinculo: 'Vínculo' };
const ESTADO: Record<string, string> = { pendiente: 'bg-amber-100 text-amber-800', aprobada: 'bg-emerald-100 text-emerald-800', aplicada: 'bg-emerald-100 text-emerald-800',
  rechazada: 'bg-rose-100 text-rose-700', a_revision: 'bg-violet-100 text-violet-700', congelada: 'bg-slate-200 text-slate-700', retirada: 'bg-slate-200 text-slate-700', vencida: 'bg-slate-200 text-slate-700' };

function valor(campo: string, v: unknown, nombres: Record<string, string>) {
  if (v === null || v === undefined) return '—';
  if (campo === 'monto_mxn') return mxn(v as number, false);
  if (campo === 'fin' || campo === 'inicio') return fecha(String(v));
  if (campo.startsWith('responsable')) return nombres[String(v)] ?? 'otra persona';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

export function TarjetaPropuesta({ p, nombres, compacta }: { p: Propuesta; nombres: Record<string, string>; compacta?: boolean }) {
  const [motivo, setMotivo] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, empieza] = useTransition();
  const cambios = (p.payload.cambios as Array<{ item: string; campo: string; antes: unknown; despues: unknown }> | undefined) ?? [];
  const nuevos = (p.payload.nuevos as Array<{ nombre: string; fin?: string; monto_mxn?: number }> | undefined) ?? [];
  const decide = (decision: 'aprobar' | 'rechazar' | 'a_revision') => (e: MouseEvent<HTMLButtonElement>) => {
    if (!esClicHumano(e.nativeEvent)) { setAviso('Decidir pide tu clic: ni el teclado ni un clic simulado deciden.'); return; }
    if (decision !== 'aprobar' && motivo.trim().length < 3) { setAviso('Para devolver o rechazar, escribe el motivo.'); return; }
    empieza(async () => {
      const r = await decidePropuesta({ propuesta: p.id, sha256: p.sha256, decision, motivo: motivo.trim() || undefined });
      setAviso(r.ok ? (r.valor.estado === 'aplicada' ? 'Aprobada y aplicada: lo aprobado es exactamente lo que se aplicó.' : `Registrada tu firma (${r.valor.rol}). Estado: ${r.valor.estado}.`) : `La base no lo permitió: ${r.motivo}`);
    });
  };
  const puede = p.puedo?.puede === true;
  return (
    <div className={`rounded-lg border bg-white p-3 ${p.estado === 'pendiente' ? 'border-amber-300' : 'border-slate-200'}`} data-propuesta={p.id} data-estado={p.estado} data-sha256={p.sha256}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${ESTADO[p.estado] ?? 'bg-slate-100'}`}>{p.estado.replace('_', ' ')}</span>
        <span className="text-[11px] font-medium text-slate-500">{p.clase.replace(/_/g, ' ')} · {p.nivel}</span>
        {p.monto ? <span className="text-[11px] font-semibold tabular-nums text-slate-700">{mxn(p.monto, false)}</span> : null}
        <span className="ml-auto font-mono text-[10.5px] text-slate-400" title={p.sha256}>sha256 {corta(p.sha256)}</span>
      </div>
      <p className="mt-1.5 text-[13px] font-medium text-slate-900">{p.resumen}</p>
      {!compacta && cambios.length ? (
        <ul className="mt-1.5 space-y-0.5 text-[12.5px] text-slate-700">
          {cambios.map((c, k) => (
            <li key={k}><span className="text-slate-500">{nombres[c.item] ?? 'ítem'} · {CAMPO[c.campo] ?? c.campo}:</span>{' '}
              <span className="text-slate-400 line-through">{valor(c.campo, c.antes, nombres)}</span> → <b className="font-semibold">{valor(c.campo, c.despues, nombres)}</b></li>
          ))}
        </ul>
      ) : null}
      {!compacta && nuevos.length ? <ul className="mt-1.5 list-disc pl-5 text-[12.5px] text-slate-700">{nuevos.map((n, k) => <li key={k}>{n.nombre}{n.fin ? ` · ${fecha(n.fin)}` : ''}{n.monto_mxn ? ` · ${mxn(n.monto_mxn, false)}` : ''}</li>)}</ul> : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-500">
        <span className="inline-flex items-center gap-1">Propone <Quien q={p.autor} /></span>
        {p.solicitadaPor ? <span>· la pidió {p.solicitadaPor}</span> : null}
        {p.decisiones.map((d, k) => <span key={k} className={d.decision === 'aprobar' ? 'text-emerald-700' : 'text-rose-700'}>· {d.decision === 'aprobar' ? 'firmó' : d.decision.replace('_', ' ')} {d.persona} ({d.rol}){d.motivo ? `: «${d.motivo}»` : ''}</span>)}
      </div>
      {p.estado === 'pendiente' && !compacta ? (
        <div className="mt-2 border-t border-slate-100 pt-2">
          {puede ? (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={ocupado} onClick={decide('aprobar')} data-decide="aprobar" className="rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">Aprobar como {p.puedo?.rol}</button>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (para devolver o rechazar)" className="min-w-[180px] flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs" />
              <button type="button" disabled={ocupado} onClick={decide('a_revision')} data-decide="a_revision" className="rounded-md border border-violet-300 px-2.5 py-1 text-xs font-medium text-violet-700">A revisión</button>
              <button type="button" disabled={ocupado} onClick={decide('rechazar')} data-decide="rechazar" className="rounded-md border border-rose-300 px-2.5 py-1 text-xs font-medium text-rose-700">Rechazar</button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-slate-500" data-no-puede>No te toca decidirla: {p.puedo?.motivo ?? 'tu rol no decide propuestas'}.</p>
              {/* Laboratorio: mandar la firma igual, para ver que quien lo impide es la BASE y no este botón apagado. */}
              <button type="button" disabled={ocupado} onClick={decide('aprobar')} data-decide="intentar" className="rounded border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-500 hover:border-rose-300 hover:text-rose-700">Intentar aprobar igual (laboratorio)</button>
            </div>
          )}
        </div>
      ) : null}
      {aviso ? <p role="status" className="mt-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-700" data-aviso-decision>{aviso}</p> : null}
    </div>
  );
}
