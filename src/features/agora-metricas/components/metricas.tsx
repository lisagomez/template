'use client';

/**
 * El tablero de métricas: cada tarjeta es UNA métrica del catálogo, consultada con la sesión de quien mira, con su
 * definición, la decisión que apoya y de dónde sale (el SQL y la prueba contra el libro). Se edita con palabras: «lo
 * que entendí» antes de guardar, y cada cambio es una versión nueva. Una métrica que no existe no se sustituye.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { mxn, periodoLargo } from '@/features/agora/services/formato';
import { agregaIndicador, entiendeIndicador, quitaIndicador, vuelveAVersion } from '../services/acciones';
import type { DatosDeMetricas, Tarjeta } from '../services/lecturas';

type Entendido = Awaited<ReturnType<typeof entiendeIndicador>>;

const valor = (formato: Tarjeta['formato'], v: string | null) => {
  if (v === null) return '—';
  if (formato === 'mxn') return mxn(v);
  if (formato === 'pct') return `${Number(v).toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`;
  if (formato === 'horas') return `${Number(v).toLocaleString('es-MX', { maximumFractionDigits: 1 })} h`;
  return Number(v).toLocaleString('es-MX');
};

function Barras({ t }: { t: Tarjeta }) {
  const filas = t.filas.filter((f) => f.dimension !== null);
  const nums = filas.map((f) => (f.valor === null ? 0 : Number(f.valor)));
  const min = Math.min(0, ...nums), max = Math.max(0, ...nums);
  const rango = max - min || 1;
  const cero = (-min / rango) * 100;
  if (!filas.length) return <p className="text-sm text-slate-500">Sin filas en este periodo.</p>;
  return (
    <ul className="space-y-1.5" role="list">
      {filas.map((f) => {
        const n = f.valor === null ? null : Number(f.valor);
        const ancho = n === null ? 0 : (Math.abs(n) / rango) * 100;
        const izq = n !== null && n < 0 ? cero - ancho : cero;
        return (
          <li key={f.dimension} className="group grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 rounded px-1 py-0.5 hover:bg-slate-50" title={`${f.dimension}: ${valor(t.formato, f.valor)}`}>
            <span className="truncate text-[12px] text-slate-700">{f.dimension}</span>
            <span className="relative h-2.5 rounded-full bg-slate-100">
              {min < 0 ? <span className="absolute inset-y-[-3px] w-px bg-slate-300" style={{ left: `${cero}%` }} /> : null}
              {n === null ? null : <span className="absolute inset-y-0 rounded-[4px] bg-[#2a5db0] group-hover:bg-[#1f4787]" style={{ left: `${izq}%`, width: `${Math.max(ancho, 0.8)}%` }} />}
            </span>
            <span className="text-right text-[12px] tabular-nums text-slate-800">{n === null ? 'sin dato' : valor(t.formato, f.valor)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Tabla({ t }: { t: Tarjeta }) {
  return (
    <table className="w-full text-[12px]">
      <thead><tr className="text-left text-slate-500"><th className="py-1 font-medium">{t.dimension ?? ''}</th><th className="py-1 text-right font-medium">valor</th></tr></thead>
      <tbody>
        {t.filas.map((f, i) => (
          <tr key={f.dimension ?? i} className="border-t border-slate-100"><td className="py-1 text-slate-700">{f.dimension ?? 'total'}</td><td className="py-1 text-right tabular-nums text-slate-800">{f.valor === null ? 'sin dato' : valor(t.formato, f.valor)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function TarjetaDeMetrica({ t, quita }: { t: Tarjeta; quita: (id: string) => void }) {
  const ancha = t.vista !== 'cifra';
  return (
    <article className={`flex flex-col rounded-lg border border-slate-200 bg-white p-4 ${ancha ? 'md:col-span-2' : ''}`} data-metrica={t.metrica} data-componente={t.id}>
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold text-slate-900">{t.titulo}{t.dimension ? <span className="font-normal text-slate-500"> · por {t.dimension}</span> : null}</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">{t.definicion}{t.periodo ? ` · ${periodoLargo(t.periodo)}` : ' · acumulado'}</p>
        </div>
        <button type="button" onClick={() => quita(t.id)} className="rounded px-1.5 text-[11px] text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Quitar ${t.titulo}`}>Quitar</button>
      </header>
      <div className="mt-3 flex-1">
        {t.error ? <p className="text-sm text-rose-700">{t.error}</p>
          : t.vista === 'cifra' ? <p className="text-2xl font-semibold tabular-nums text-slate-900" data-valor>{valor(t.formato, t.filas[0]?.valor ?? null)}</p>
          : t.vista === 'barras' ? <Barras t={t} /> : <Tabla t={t} />}
      </div>
      <p className="mt-3 text-[11px] text-slate-600"><span className="font-medium">Apoya:</span> {t.decision}</p>
      {t.prueba ? (
        <p className={`mt-1 text-[11px] ${t.prueba.cuadra ? 'text-emerald-700' : 'text-rose-700'}`} data-cuadra={t.prueba.cuadra ? 'si' : 'no'}>
          {t.prueba.cuadra ? '✓ Cuadra al centavo con el libro' : '✗ NO cuadra con el libro'}: {t.formato === 'mxn' ? mxn(t.prueba.libro) : t.prueba.libro ?? '—'} en {t.prueba.fuente}
        </p>
      ) : null}
      <details className="mt-1 text-[11px] text-slate-500">
        <summary className="cursor-pointer select-none hover:text-slate-700">De dónde sale</summary>
        <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-slate-50 p-2 font-mono text-[10.5px] text-slate-700">{t.sql || '—'}</pre>
      </details>
    </article>
  );
}

export function Metricas({ d }: { d: DatosDeMetricas }) {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [entendido, setEntendido] = useState<Entendido | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, empieza] = useTransition();
  const tras = (p: Promise<{ ok: boolean; motivo?: string }>, ok: string) => empieza(async () => {
    const r = await p;
    setAviso(r.ok ? ok : `La base dijo que no: ${'motivo' in r ? r.motivo : ''}`);
    if (r.ok) setEntendido(null);
  });
  const pide = () => empieza(async () => { setAviso(null); setEntendido(await entiendeIndicador({ texto, periodo: d.periodo })); });
  const e = entendido?.ok ? entendido.valor : null;

  return (
    <div className="space-y-5 p-6" data-agora-pantalla="metricas">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Métricas</h1>
          <p className="mt-1 text-sm text-slate-600">{d.titulo} · versión {d.version} · cada cifra sale de una métrica del catálogo y de la base, nunca a mano.</p>
        </div>
        <label className="text-sm text-slate-700">Periodo{' '}
          <select value={d.periodo} onChange={(ev) => router.push(`/agora/metricas?periodo=${ev.target.value}`)} className="ml-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm">
            {d.periodos.map((p) => <option key={p} value={p}>{periodoLargo(p)}</option>)}
          </select>
        </label>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4" aria-label="Pide un indicador">
        <form className="flex flex-wrap gap-2" onSubmit={(ev) => { ev.preventDefault(); if (texto.trim().length >= 3) pide(); }}>
          <input value={texto} onChange={(ev) => setTexto(ev.target.value)} placeholder="Pide un indicador: «aceptación por agente externo en Expansión Monterrey»" className="min-w-[18rem] flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm" aria-label="Indicador que quieres ver" />
          <button type="submit" disabled={ocupado} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Entender</button>
        </form>
        {entendido && !entendido.ok ? <p className="mt-2 text-sm text-rose-700">{entendido.motivo}</p> : null}
        {e && e.ok ? (
          <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3" data-entendi>
            <p className="text-[12px] font-medium text-slate-700">Lo que entendí:</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">{e.entendi.map((x) => <li key={x} className="rounded-full bg-white px-2 py-0.5 text-[12px] text-slate-800 ring-1 ring-blue-200">{x}</li>)}</ul>
            <div className="mt-2 flex gap-2">
              <button type="button" disabled={ocupado} onClick={() => tras(agregaIndicador({ componente: e.componente }), 'Agregado: es una versión nueva del tablero.')} className="rounded bg-[#2a5db0] px-3 py-1 text-sm font-medium text-white disabled:opacity-50">Agregar al tablero</button>
              <button type="button" onClick={() => setEntendido(null)} className="rounded px-3 py-1 text-sm text-slate-600 hover:bg-white">Descartar</button>
            </div>
          </div>
        ) : null}
        {e && !e.ok ? (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3" data-no-existe>
            <p className="text-sm text-amber-900">{e.motivo}.</p>
            {e.propuesta ? <><p className="mt-2 text-[12px] text-amber-900">Sería una métrica nueva en el catálogo (un cambio de código que revisa el laboratorio), no una cifra inventada:</p>
              <pre className="mt-1 whitespace-pre-wrap rounded bg-white p-2 font-mono text-[11px] text-slate-700">{e.propuesta}</pre></> : null}
          </div>
        ) : null}
        {aviso ? <p className="mt-2 text-sm text-slate-700" role="status">{aviso}</p> : null}
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-4" aria-label="Tablero">
        {d.tarjetas.map((t) => <TarjetaDeMetrica key={t.id} t={t} quita={(id) => tras(quitaIndicador({ id }), 'Quitado: es una versión nueva del tablero.')} />)}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4" aria-label="Versiones del tablero">
        <h2 className="text-sm font-semibold text-slate-900">Versiones</h2>
        {d.versiones.length === 0 ? <p className="mt-1 text-sm text-slate-500">El tablero inicial: nadie lo ha cambiado.</p> : (
          <ul className="mt-2 space-y-1">
            {d.versiones.map((v) => (
              <li key={v.version} className="flex items-center justify-between gap-2 text-[12px] text-slate-700">
                <span>v{v.version} · {v.quien} {v.motivo} · {v.cuando.slice(0, 16).replace(/(\d{4}-\d{2}-\d{2}).(\d{2}:\d{2})/, '$1 $2')}</span>
                {v.version !== d.version ? <button type="button" onClick={() => tras(vuelveAVersion({ version: v.version }), `Volviste a la versión ${v.version} (como versión nueva).`)} className="rounded px-2 py-0.5 text-slate-500 hover:bg-slate-100">Volver a esta</button> : <span className="text-slate-400">vigente</span>}
              </li>
            ))}
            {d.version > 0 ? <li className="text-right"><button type="button" onClick={() => tras(vuelveAVersion({ version: 0 }), 'Volviste al tablero inicial (como versión nueva).')} className="rounded px-2 py-0.5 text-[12px] text-slate-500 hover:bg-slate-100">Volver al inicial</button></li> : null}
          </ul>
        )}
      </section>
    </div>
  );
}
