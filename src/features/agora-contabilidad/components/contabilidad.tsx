'use client';

/**
 * El paquete para Contabilidad. Finanzas cierra los costos del periodo por el FRENO de la capa (lo escribe en la
 * conversación: su cita textual y su clic); el cierre deja la póliza PROPUESTA con el contrato de ERP-5B: partida
 * doble, código agrupador SAT por cuenta y el UUID de cada CFDI. Contabilidad la acepta o la devuelve, sobre su
 * huella, y la asienta en SU sistema. Ágora no asienta, no cierra la contabilidad y no presenta nada ante el SAT.
 */
import { useState, useTransition, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { esClicHumano } from '../../../../tools/capa/dist/index.js';
import { decideLaPoliza } from '@/features/agora/services/acciones';
import { corta, mxn, periodoLargo } from '@/features/agora/services/formato';
import type { DatosContables } from '../services/lecturas';

export function Contabilidad({ d }: { d: DatosContables }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, empieza] = useTransition();
  const p = d.poliza;
  const actual = d.periodos.find((x) => x.periodo === d.periodo);
  const cargos = d.movimientos.filter((m) => m.naturaleza === 'cargo').reduce((s, m) => s + Math.round(Number(m.importe) * 100), 0);
  const abonos = d.movimientos.filter((m) => m.naturaleza === 'abono').reduce((s, m) => s + Math.round(Number(m.importe) * 100), 0);
  const decide = (decision: 'acepta' | 'devuelve') => (e: MouseEvent<HTMLButtonElement>) => {
    if (!esClicHumano(e.nativeEvent)) { setAviso('Decidir pide tu clic.'); return; }
    if (!p) return;
    if (decision === 'devuelve' && motivo.trim().length < 5) { setAviso('Para devolverla, escribe el motivo.'); return; }
    empieza(async () => {
      const r = await decideLaPoliza({ poliza: p.id, sha256: p.sha256, decision, motivo: motivo.trim() || undefined });
      setAviso(r.ok ? `Póliza ${r.valor.estado}. ${decision === 'acepta' ? 'Ahora la asienta Contabilidad en su sistema (Ágora no asienta).' : ''}` : `La base no lo permitió: ${r.motivo}`);
    });
  };
  const descarga = () => {
    const blob = new Blob([JSON.stringify(d.export, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${p?.folio ?? 'poliza'}.erp-5b.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="space-y-5 p-5" data-agora-contabilidad={d.periodo}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Paquete para Contabilidad · contrato ERP-5B</p>
          <h1 className="text-xl font-semibold text-slate-900">Cierre de {periodoLargo(d.periodo)}</h1>
        </div>
        <nav className="flex flex-wrap gap-1.5" aria-label="Periodos">
          {d.periodos.map((x) => (
            <button key={x.periodo} type="button" onClick={() => router.push(`/agora/contabilidad?periodo=${x.periodo}`)} aria-current={x.periodo === d.periodo ? 'page' : undefined}
              className={`rounded-full border px-2.5 py-1 text-[12px] ${x.periodo === d.periodo ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-700'}`}>
              {periodoLargo(x.periodo)} · {x.estado === 'cerrado' ? 'cerrado' : x.vencido ? 'por cerrar' : 'en curso'}
            </button>
          ))}
        </nav>
      </header>

      {actual?.estado !== 'cerrado' ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4" data-por-cerrar>
          <h2 className="text-sm font-semibold text-slate-900">{actual?.vencido ? 'Este periodo espera su cierre de costos' : 'El periodo sigue en curso: se cierra cuando termine'}</h2>
          <p className="mt-1 text-[13px] text-slate-700">Al cerrar entran a la póliza {d.previa.costos} costo(s) ejercido(s) por {mxn(d.previa.importe)} y el gasto de modelo con costo; {d.previa.sinCosto} llamada(s) sin datos de uso quedan declaradas, no en cero.{d.previa.pendientes ? ` Hay ${d.previa.pendientes} costo(s) sin evidencia: nada queda pendiente al cierre.` : ''}</p>
          {d.yo.finanzas && actual?.vencido ? (
            <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900" data-instruccion-freno>
              Cerrar no tiene vuelta atrás: va por el freno. Escríbelo TÚ en la conversación, por ejemplo <b>«cierra los costos de {periodoLargo(d.periodo)}»</b>, revisa tu cita y dale clic a «Confirmar». Ni la voz ni un botón de aquí lo confirman.
            </p>
          ) : <p className="mt-2 text-[12px] text-slate-500">Cerrar es de Finanzas.</p>}
        </section>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-700" data-cerrado>
          Cerrado por <b>{actual.cerradoPor}</b> el {actual.cerradoEn?.slice(0, 10)} con su cita: <q className="italic">{actual.cita}</q>. Después del cierre solo cabe reclasificar en el periodo abierto.
        </section>
      )}

      {p ? (
        <section className="rounded-xl border border-slate-200 bg-white" data-poliza={p.id} data-estado-poliza={p.estado}>
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
            <h2 className="text-base font-semibold text-slate-900">Póliza {p.folio}</h2>
            <span className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase ${p.estado === 'propuesta' ? 'bg-amber-100 text-amber-800' : p.estado === 'aceptada' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'}`}>{p.estado}</span>
            <span className="text-[12px] text-slate-500">{p.tipo} · origen automática · {p.concepto}</span>
            <span className="ml-auto font-mono text-[11px] text-slate-500" title={p.sha256}>sha256 {corta(p.sha256)}</span>
            <button type="button" onClick={descarga} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium">Exportar (ERP-5B, JSON)</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[12.5px]">
              <thead className="bg-slate-50 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500"><tr>
                <th className="px-3 py-2">#</th><th>Cuenta</th><th>Código agrupador SAT</th><th className="text-right">Cargo</th><th className="text-right">Abono</th><th className="pl-3">UUID del CFDI</th><th>Concepto</th>
              </tr></thead>
              <tbody>{d.movimientos.map((m) => (
                <tr key={m.orden} className="border-t border-slate-100" data-movimiento={m.naturaleza}>
                  <td className="px-3 py-1.5 text-slate-400">{m.orden}</td>
                  <td><span className="font-mono">{m.cuenta}</span> <span className="text-slate-600">{m.nombre}</span></td>
                  <td className="font-mono">{m.codigo_agrupador}</td>
                  <td className="text-right tabular-nums">{m.naturaleza === 'cargo' ? mxn(m.importe) : ''}</td>
                  <td className="text-right tabular-nums">{m.naturaleza === 'abono' ? mxn(m.importe) : ''}</td>
                  <td className="pl-3 font-mono text-[11px] text-slate-600">{m.uuid_cfdi ?? '—'}</td>
                  <td className="text-slate-600">{m.concepto}{m.categoria ? ` · ${m.categoria}` : ''}</td>
                </tr>
              ))}</tbody>
              <tfoot><tr className="border-t-2 border-slate-300 font-semibold">
                <td colSpan={3} className="px-3 py-2">{cargos === abonos ? <span className="text-emerald-700" data-cuadra>Cuadra: cargos = abonos (partida doble estructural)</span> : <span className="text-rose-700">No cuadra</span>}</td>
                <td className="text-right tabular-nums">{mxn(cargos / 100)}</td><td className="text-right tabular-nums">{mxn(abonos / 100)}</td><td colSpan={2} className="pl-3 text-[11.5px] font-normal text-amber-800">{p.sinCostear ? `${p.sinCostear} llamada(s) de modelo sin costo declaradas: no entran como cero` : ''}</td>
              </tr></tfoot>
            </table>
          </div>
          <div className="border-t border-slate-100 px-4 py-3">
            {p.decisiones.map((x, k) => <p key={k} className="text-[12.5px] text-slate-700">{x.decision === 'acepta' ? 'Aceptada' : 'Devuelta'} por <b>{x.persona}</b>{x.motivo ? `: «${x.motivo}»` : ''}.</p>)}
            {p.estado === 'propuesta' ? (d.yo.puedeAceptar.puede ? (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={ocupado} onClick={decide('acepta')} data-acepta className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">Aceptar la póliza (sha256 {corta(p.sha256)})</button>
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo para devolverla" className="min-w-[220px] flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                <button type="button" disabled={ocupado} onClick={decide('devuelve')} className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700">Devolver</button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[12.5px] text-slate-500" data-no-acepta>No te toca: {d.yo.puedeAceptar.motivo}.</p>
                <button type="button" disabled={ocupado} onClick={decide('acepta')} data-acepta-igual className="rounded border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-500">Intentar aceptar igual (laboratorio)</button>
              </div>
            )) : null}
            {aviso ? <p role="status" className="mt-2 rounded bg-slate-900 px-3 py-1.5 text-[12.5px] text-white" data-aviso-poliza>{aviso}</p> : null}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4" data-balanza>
          <h2 className="text-sm font-semibold text-slate-900">Balanza de costos del periodo</h2>
          <table className="mt-2 w-full text-[12.5px]"><thead className="text-left text-[10.5px] uppercase tracking-wider text-slate-500"><tr><th>Cuenta</th><th>Agrupador</th><th className="text-right">Cargos</th><th className="text-right">Abonos</th><th className="text-right">Saldo</th></tr></thead>
            <tbody>{d.balanza.map((b) => <tr key={b.cuenta} className="border-t border-slate-100"><td className="py-1"><span className="font-mono">{b.cuenta}</span> {b.nombre}</td><td className="font-mono">{b.codigo_agrupador}</td><td className="text-right tabular-nums">{mxn(b.cargos)}</td><td className="text-right tabular-nums">{mxn(b.abonos)}</td><td className="text-right tabular-nums">{mxn(b.saldo)}</td></tr>)}
              {d.balanza.length ? null : <tr><td colSpan={5} className="py-2 text-slate-500">Sin póliza en este periodo todavía.</td></tr>}</tbody></table>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4" data-comparativo>
          <h2 className="text-sm font-semibold text-slate-900">Presupuesto contra real</h2>
          <table className="mt-2 w-full text-[12.5px]"><thead className="text-left text-[10.5px] uppercase tracking-wider text-slate-500"><tr><th>Categoría</th><th className="text-right">Presupuesto</th><th className="text-right">Ejercido</th><th className="text-right">Comprometido</th><th className="text-right">Desviación</th></tr></thead>
            <tbody>{d.comparativo.map((c) => <tr key={c.categoria} className="border-t border-slate-100"><td className="py-1">{c.categoria}</td><td className="text-right tabular-nums">{mxn(c.presupuesto)}</td><td className="text-right tabular-nums">{mxn(c.ejercido)}</td><td className="text-right tabular-nums">{mxn(c.comprometido)}</td><td className={`text-right tabular-nums ${Number(c.desviacion) > 0 ? 'text-rose-700' : 'text-slate-500'}`}>{c.desviacion === null ? '—' : `${c.desviacion} %`}</td></tr>)}</tbody></table>
        </section>
      </div>
    </div>
  );
}
