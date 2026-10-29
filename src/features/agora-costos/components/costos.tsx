'use client';

/**
 * Costos por centro: la jerarquía ES el árbol de centros de costo. Por cada uno, las tres cifras (presupuesto,
 * comprometido, ejercido) y la que se calcula (disponible), todas del libro. Al lado, el gasto de los agentes en MXN
 * con el tipo de cambio que se usó, su fuente y su fecha, y las filas sin costo DECLARADAS: null no es cero.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { proponeCambio, registraEjercido } from '@/features/agora/services/acciones';
import { fecha, mxn, pct, periodoLargo } from '@/features/agora/services/formato';
import { Etiqueta } from '@/features/agora/components/insignia';
import { leeCfdi } from '../services/acciones';
import type { DatosDeCostos } from '../services/lecturas';

function Barra({ p, c, e }: { p: number; c: number; e: number }) {
  const total = Math.max(p, c + e, 1);
  const sobre = c + e > p;
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100" title={`ejercido ${mxn(e)} · comprometido ${mxn(c)} · presupuesto ${mxn(p)}`}>
      <span className="absolute inset-y-0 left-0 bg-slate-800" style={{ width: `${(100 * e) / total}%` }} />
      <span className="absolute inset-y-0 bg-blue-400" style={{ left: `${(100 * e) / total}%`, width: `${(100 * c) / total}%` }} />
      {sobre ? <span className="absolute inset-y-0 border-l-2 border-rose-600" style={{ left: `${(100 * p) / total}%` }} /> : null}
    </div>
  );
}

export function Costos({ d }: { d: DatosDeCostos }) {
  const router = useRouter();
  const [aviso, setAviso] = useState<string | null>(null);
  const hijos = (padre: string | null) => d.arbol.filter((n) => n.padre === padre && (n.tipo !== 'categoria' || Number(n.presupuesto) || Number(n.comprometido) || Number(n.ejercido)));
  const fila = (n: DatosDeCostos['arbol'][number], nivel: number) => {
    const P = Number(n.presupuesto), C = Number(n.comprometido), E = Number(n.ejercido), D = Number(n.disponible);
    const desv = P > 0 ? Math.round((100 * (C + E - P)) / P) : 0;
    return (
      <tr key={n.nodo} className={`border-t border-slate-100 ${nivel === 0 ? 'bg-slate-50 font-semibold' : nivel === 1 ? 'font-medium' : ''}`} data-centro={n.tipo} data-nodo={n.nodo}>
        <td className="py-2 pr-2 text-[13px] text-slate-800" style={{ paddingLeft: 12 + nivel * 18 }}>{n.nombre}</td>
        <td className="px-2 text-right tabular-nums">{mxn(n.presupuesto)}</td>
        <td className="px-2 text-right tabular-nums text-blue-700">{mxn(n.comprometido)}</td>
        <td className="px-2 text-right tabular-nums">{mxn(n.ejercido)}</td>
        <td className={`px-2 text-right tabular-nums ${D < 0 ? 'font-semibold text-rose-700' : 'text-emerald-800'}`}>{mxn(n.disponible)}</td>
        <td className="w-[180px] px-2"><Barra p={P} c={C} e={E} /></td>
        <td className="px-2 text-right text-[12px] tabular-nums text-slate-600">{mxn(n.gastoModelo)}{n.filasSinCosto ? <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800" title="llamadas sin datos de uso: su costo es null, no cero">+{n.filasSinCosto} sin costo</span> : null}</td>
        <td className={`px-2 text-right text-[12px] tabular-nums ${desv > 0 ? 'font-semibold text-rose-700' : 'text-slate-400'}`}>{P ? `${desv > 0 ? '+' : ''}${desv} %` : '—'}</td>
      </tr>
    );
  };
  const filas: React.ReactNode[] = [];
  const recorre = (padre: string | null, nivel: number) => { for (const n of hijos(padre)) { filas.push(fila(n, nivel)); recorre(n.nodo, nivel + 1) } };
  recorre(null, 0);
  const t = d.totales;
  return (
    <div className="space-y-5 p-5" data-agora-costos={d.periodo}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Libro de costos · control presupuestal por compromisos</p>
          <h1 className="text-xl font-semibold text-slate-900">Costos de {periodoLargo(d.periodo)} {d.cerrado ? <span className="ml-2 rounded bg-slate-200 px-2 py-0.5 align-middle text-xs font-semibold text-slate-700">periodo cerrado</span> : null}</h1>
        </div>
        <label className="text-xs text-slate-600">Periodo{' '}
          <select value={d.periodo} onChange={(e) => router.push(`/agora/costos?periodo=${e.target.value}`)} className="rounded border border-slate-300 bg-white px-2 py-1 text-sm">
            {d.periodos.map((p) => <option key={p} value={p}>{periodoLargo(p)}</option>)}
          </select>
        </label>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-totales>
        {[['Presupuesto', t.presupuesto, 'aprobado por Finanzas, versionado'], ['Comprometido', t.comprometido, 'aprobado y aún no ejercido'], ['Ejercido', t.ejercido, 'con evidencia: CFDI, comprobante o uso de modelo'], ['Disponible', t.disponible, 'presupuesto − comprometido − ejercido']].map(([n, v, q]) => (
          <div key={n} className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{n}</p><p className={`mt-1 text-2xl font-semibold tabular-nums ${n === 'Disponible' && Number(v) < 0 ? 'text-rose-700' : 'text-slate-900'}`}>{mxn(v)}</p><p className="text-[11px] text-slate-500">{q}</p></div>
        ))}
      </section>
      {t.sinCosto ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900" data-sin-costo={t.sinCosto}>{t.sinCosto} llamada(s) de modelo de este periodo no traen datos de uso: su costo es <b>null, no cero</b>. La cifra real del ejercido es MAYOR que la que ves.</p> : null}
      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[980px] text-[13px]">
          <thead className="text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500"><tr className="bg-slate-50">
            <th className="px-3 py-2">Centro de costo</th><th className="px-2 text-right">Presupuesto</th><th className="px-2 text-right">Comprometido</th><th className="px-2 text-right">Ejercido</th><th className="px-2 text-right">Disponible</th><th className="px-2">Uso</th><th className="px-2 text-right">Gasto de agentes</th><th className="px-2 text-right">Desviación</th>
          </tr></thead>
          <tbody>{filas}</tbody>
        </table>
        <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500"><span className="mr-3 inline-flex items-center gap-1"><i className="h-2 w-3 rounded-sm bg-slate-800" />ejercido</span><span className="mr-3 inline-flex items-center gap-1"><i className="h-2 w-3 rounded-sm bg-blue-400" />comprometido</span><span className="inline-flex items-center gap-1"><i className="h-2 w-0.5 bg-rose-600" />presupuesto (cuando se pasa)</span></p>
      </section>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4" data-gasto-agentes>
          <h2 className="text-sm font-semibold text-slate-900">Gasto de los agentes en {periodoLargo(d.periodo)}</h2>
          <p className="mb-2 text-[11.5px] text-slate-500">Se cobra al agente que ORIGINÓ la llamada (si la pidió una persona, al que la ejecutó). Tope de la organización: {mxn(t.gastoOrg)} de {mxn(t.topeOrg, false)}.</p>
          <table className="w-full text-[12.5px]">
            <thead className="text-left text-[10.5px] uppercase tracking-wider text-slate-500"><tr><th className="py-1">Agente</th><th className="text-right">Llamadas</th><th className="text-right">USD</th><th className="text-right">MXN</th><th className="text-right">Tope</th></tr></thead>
            <tbody>{d.agentes.map((a) => {
              const p = pct(Number(a.mxn ?? 0), Number(a.tope));
              return (
                <tr key={a.agente} className="border-t border-slate-100">
                  <td className="py-1.5"><span className="mr-1.5">{a.nombre}</span><Etiqueta tipo={a.origen as 'interno' | 'externo'} /></td>
                  <td className="text-right tabular-nums">{a.llamadas}{a.sinCosto ? <span className="ml-1 text-[10.5px] text-amber-700">({a.sinCosto} sin costo)</span> : null}</td>
                  <td className="text-right tabular-nums">{a.usd ? `$${Number(a.usd).toFixed(2)}` : '—'}</td>
                  <td className="text-right font-medium tabular-nums">{mxn(a.mxn)}</td>
                  <td className={`text-right tabular-nums ${p >= 100 ? 'font-semibold text-rose-700' : p >= 80 ? 'font-semibold text-amber-700' : 'text-slate-500'}`}>{p} % de {mxn(a.tope, false)}</td>
                </tr>
              );
            })}</tbody>
          </table>
          <h3 className="mt-3 text-[12px] font-semibold text-slate-700">Tipo de cambio usado (fuente y fecha de cada uno)</h3>
          <ul className="mt-1 space-y-0.5 text-[11.5px] text-slate-600" data-tipos-de-cambio>
            {d.tipos.map((x) => <li key={x.fecha}><b className="tabular-nums">{fecha(x.fecha)}</b> · {Number(x.valor).toFixed(4)} MXN/USD · {x.fuente} · <a className="text-blue-700 underline" href={x.url} target="_blank" rel="noreferrer noopener">fuente</a> · {x.llamadas} llamada(s){x.nota ? <span className="text-amber-700"> · {x.nota}</span> : null}</li>)}
            {d.tipos.length ? null : <li>Sin llamadas de modelo con costo en este periodo.</li>}
          </ul>
        </section>
        <section className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4" data-alertas>
            <h2 className="text-sm font-semibold text-slate-900">Alertas</h2>
            <ul className="mt-2 space-y-1.5 text-[12.5px]">{d.avisos.length ? d.avisos.map((a) => <li key={a.id} data-aviso={a.tipo} className={`rounded-md px-2 py-1 ${a.tipo === 'tope_100' || a.tipo === 'segregacion_off' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-900'}`}>{a.texto}</li>) : <li className="text-slate-500">Sin alertas.</li>}</ul>
          </div>
          {d.cerrado ? <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[12.5px] text-slate-600">Este periodo está cerrado: no se edita, se reclasifica en el periodo abierto.</p> : d.soyFinanzas ? <RegistraEjercido d={d} avisa={setAviso} /> : null}
          {d.cerrado ? null : <AmpliaPresupuesto d={d} avisa={setAviso} />}
          {aviso ? <p role="status" className="rounded-lg bg-slate-900 px-3 py-2 text-[12.5px] text-white" data-aviso-costos>{aviso}</p> : null}
        </section>
      </div>
    </div>
  );
}

const campo = 'w-full rounded-md border border-slate-300 px-2 py-1.5 text-[13px]';

function RegistraEjercido({ d, avisa }: { d: DatosDeCostos; avisa: (t: string) => void }) {
  const cats = d.nodos.filter((n) => n.tipo === 'categoria');
  const [f, setF] = useState({ categoria: cats[0]?.id ?? '', compromiso: '', importe: '', concepto: '', tipo: 'cfdi' as 'cfdi' | 'comprobante', uuid: '', rfc: '', proveedor: '', sha: '' });
  const [ocupado, empieza] = useTransition();
  const compromisos = d.compromisos.filter((k) => k.categoria === f.categoria && k.periodo === d.periodo);
  const xml = async (archivo: File) => {
    const r = await leeCfdi(await archivo.text());
    if (!r.ok) return avisa(`No se pudo leer el CFDI: ${r.motivo}`);
    setF((x) => ({ ...x, tipo: 'cfdi', uuid: r.uuid, importe: String(r.total), rfc: r.rfc, proveedor: r.emisor, concepto: x.concepto || `CFDI de ${r.emisor}` }));
    avisa(`Leí el XML del CFDI: UUID ${r.uuid}, total ${mxn(r.total)}. El sello no se verifica: leer bien no es autenticar.`);
  };
  const comprobante = async (archivo: File) => {
    const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await archivo.arrayBuffer()))].map((b) => b.toString(16).padStart(2, '0')).join('');
    setF((x) => ({ ...x, tipo: 'comprobante', sha: h, concepto: x.concepto || archivo.name }));
  };
  const guarda = () => empieza(async () => {
    const r = await registraEjercido({ categoria: f.categoria, compromiso: f.compromiso || null, periodo: d.periodo, importe: Number(f.importe), concepto: f.concepto, tipo: f.tipo,
      uuid: f.tipo === 'cfdi' ? f.uuid || null : null, comprobanteSha256: f.tipo === 'comprobante' ? f.sha || null : null, rfc: f.rfc || null, proveedor: f.proveedor || null });
    avisa(r.ok ? (r.valor.estado === 'ejercido' ? 'Registrado como ejercido, con su evidencia.' : 'Sin evidencia no hay ejercido: quedó PENDIENTE hasta que llegue el CFDI o el comprobante.') : `La base no lo permitió: ${r.motivo}`);
  });
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4" data-registra-ejercido>
      <h2 className="text-sm font-semibold text-slate-900">Registrar un ejercido (Finanzas)</h2>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="text-[11.5px] text-slate-600">Categoría<select className={campo} value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value, compromiso: '' })}>{cats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
        <label className="text-[11.5px] text-slate-600">Contra el compromiso<select className={campo} value={f.compromiso} onChange={(e) => setF({ ...f, compromiso: e.target.value })}><option value="">(sin compromiso)</option>{compromisos.map((k) => <option key={k.id} value={k.id}>{k.concepto} · vigente {mxn(k.vigente, false)}</option>)}</select></label>
        <label className="text-[11.5px] text-slate-600">CFDI (XML)<input type="file" accept=".xml,text/xml" className="block text-[12px]" onChange={(e) => e.target.files?.[0] && void xml(e.target.files[0])} /></label>
        <label className="text-[11.5px] text-slate-600">o comprobante (se guarda su sha256)<input type="file" className="block text-[12px]" onChange={(e) => e.target.files?.[0] && void comprobante(e.target.files[0])} /></label>
        <label className="text-[11.5px] text-slate-600">UUID<input className={campo} value={f.uuid} onChange={(e) => setF({ ...f, uuid: e.target.value, tipo: 'cfdi' })} placeholder="del timbre" /></label>
        <label className="text-[11.5px] text-slate-600">Importe MXN<input className={`${campo} text-right`} inputMode="decimal" value={f.importe} onChange={(e) => setF({ ...f, importe: e.target.value.replace(/[^\d.]/g, '') })} /></label>
        <label className="text-[11.5px] text-slate-600 sm:col-span-2">Concepto<input className={campo} value={f.concepto} onChange={(e) => setF({ ...f, concepto: e.target.value })} /></label>
      </div>
      <button type="button" disabled={ocupado || !f.importe || f.concepto.length < 3} onClick={guarda} className="mt-2 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Registrar</button>
    </div>
  );
}

function AmpliaPresupuesto({ d, avisa }: { d: DatosDeCostos; avisa: (t: string) => void }) {
  const cats = d.nodos.filter((n) => n.tipo === 'categoria');
  const [cat, setCat] = useState(cats[0]?.id ?? '');
  const [importe, setImporte] = useState('');
  const [motivo, setMotivo] = useState('');
  const [ocupado, empieza] = useTransition();
  const actual = d.arbol.find((n) => n.nodo === cat);
  const propone = () => empieza(async () => {
    const r = await proponeCambio({ payload: { version: 1, clase: 'presupuesto', categoria: cat, periodo: d.periodo, importe_mxn: Number(importe), motivo }, resumen: `Presupuesto de ${actual?.nombre} en ${periodoLargo(d.periodo)}: de ${mxn(actual?.presupuesto, false)} a ${mxn(Number(importe), false)} (${motivo})` });
    avisa(r.ok ? (r.valor.id ? 'Quedó como propuesta en el hilo de la categoría: un presupuesto lo aprueba Finanzas (y no quien lo pidió).' : `El supervisor lo frenó: ${r.valor.veredicto.motivo}`) : `La base no lo permitió: ${r.motivo}`);
  });
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4" data-amplia-presupuesto>
      <h2 className="text-sm font-semibold text-slate-900">Pedir una versión nueva del presupuesto</h2>
      <p className="text-[11.5px] text-slate-500">Cada versión guarda quién, cuándo y por qué. La aprueba Finanzas.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <select className={campo} value={cat} onChange={(e) => setCat(e.target.value)}>{cats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
        <input className={`${campo} text-right`} inputMode="decimal" placeholder="nuevo importe MXN" value={importe} onChange={(e) => setImporte(e.target.value.replace(/[^\d.]/g, ''))} />
        <input className={campo} placeholder="por qué" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
      <button type="button" disabled={ocupado || !importe || motivo.length < 3} onClick={propone} className="mt-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-40">Proponer</button>
    </div>
  );
}
