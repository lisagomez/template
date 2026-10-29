'use client';

/**
 * El editor flotante de una celda: el control de SU tipo de campo (estado, fecha, cronograma, persona con insignia,
 * prioridad, moneda en MXN, progreso, dependencia, etiquetas, vínculo, archivo) y arriba, en una línea, lo que va a
 * pasar: «cambia directo», «queda como propuesta» o «no te toca», con el porqué. Lo decide de nuevo la base.
 */
import { useMemo, useState, useTransition } from 'react';
import type { ItemTablero } from '../../../../tools/agora/dist/index.js';
import { cambiaDependencia, editaCampo, proponeCambio } from '@/features/agora/services/acciones';
import { ESTADO, PRIORIDAD, fecha, mxn } from '@/features/agora/services/formato';
import { Avatar, Etiqueta } from '@/features/agora/components/insignia';
import type { DatosDelTablero } from '../services/lecturas';
import { esHabil, modoDe } from '../services/reglas';

export interface Resultado { tono: 'bien' | 'propuesta' | 'mal'; texto: string }

const huellaDe = async (b: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('');

export function Editor({ item, columna, d, cierra, avisa }: { item: ItemTablero; columna: string; d: DatosDelTablero; cierra: () => void; avisa: (r: Resultado) => void }) {
  const cat = d.categorias.find((c) => c.id === item.categoria);
  const [valor, setValor] = useState<unknown>(() => inicial(item, columna));
  const [error, setError] = useState<string | null>(null);
  const [ocupado, empieza] = useTransition();
  const conf = d.columnas.find((c) => c.clave === columna)?.config ?? {};
  const asignables = useMemo(() => d.asignables.filter((a) => a.tipo === 'humano' || (a.categorias ?? []).some((n) => [item.categoria, d.workspace.id].includes(n)
    || d.categorias.some((c) => c.id === item.categoria && n === c.id))), [d, item]);
  const elegido = columna === 'responsable' ? asignables.find((a) => a.id === valor) : undefined;
  const modo = modoDe(item, columna, cat, d.yo, elegido?.tipo === 'externo');

  const guarda = (v: unknown = valor) => {
    setError(null);
    const e = valida(columna, v, item, conf);
    if (e) { setError(e); return; }
    empieza(async () => {
      if (columna === 'dependencia') {
        const r = await cambiaDependencia({ item: item.id, dependeDe: String(v) });
        avisa(r.ok ? { tono: 'bien', texto: `«${item.nombre}» ahora depende de «${d.nombres[String(v)]}».` } : { tono: 'mal', texto: `La base no lo permitió: ${r.motivo}` });
        return cierra();
      }
      const cambios = cambiosDe(item, columna, v, asignables);
      if (modo.modo === 'directo') {
        for (const c of cambios) {
          const r = await editaCampo({ item: item.id, campo: c.campo, valor: c.despues });
          if (!r.ok) { avisa({ tono: 'mal', texto: `La base no lo permitió: ${r.motivo}` }); return cierra(); }
          const suc = (r.valor as { sucesores?: string[] | null }).sucesores;
          if (suc?.length) { avisa({ tono: 'propuesta', texto: `Cambiado. Y como «${item.nombre}» termina después, el coordinador propuso mover ${suc.length} sucesor(es): están en su hilo.` }); return cierra(); }
        }
        avisa({ tono: 'bien', texto: `Cambiado directo: ${item.nombre}.` });
        return cierra();
      }
      const clase = columna === 'monto' ? 'cambiar_monto' : columna === 'responsable' ? (elegido?.tipo === 'externo' ? 'asignar_externo' : 'asignar') : ['fin', 'cronograma'].includes(columna) ? 'mover_fecha' : 'editar';
      const r = await proponeCambio({ payload: { version: 1, clase, categoria: item.categoria, cambios }, resumen: resumenDe(item, columna, v, d) });
      if (!r.ok) avisa({ tono: 'mal', texto: `La base no lo permitió: ${r.motivo}` });
      else if (!r.valor.id) avisa({ tono: 'mal', texto: `El supervisor lo frenó antes del hilo: ${r.valor.veredicto.motivo}` });
      else avisa({ tono: 'propuesta', texto: `Quedó como propuesta en el hilo de ${cat?.nombre} (huella ${r.valor.sha256!.slice(0, 4)}…${r.valor.sha256!.slice(-4)}). Nada cambió todavía.` });
      cierra();
    });
  };

  return (
    <div role="dialog" aria-label={`Editar ${columna}`} className="w-[310px] rounded-xl border border-slate-300 bg-white p-3 shadow-xl" data-editor={columna}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-[13px] font-semibold leading-tight text-slate-900">{item.nombre}</p>
        <button type="button" onClick={cierra} aria-label="Cerrar" className="text-slate-400 hover:text-slate-700">✕</button>
      </div>
      <p data-modo={modo.modo} className={`mb-2 rounded-md px-2 py-1 text-[11.5px] ${modo.modo === 'directo' ? 'bg-emerald-50 text-emerald-800' : modo.modo === 'propuesta' ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-700'}`}>
        {modo.modo === 'directo' ? 'Lo cambias directo (queda en el historial).' : modo.modo === 'propuesta' ? `Queda como propuesta: ${modo.porque}.` : `No te toca: ${modo.porque}.`}
      </p>
      {modo.modo === 'no' ? null : <Control columna={columna} valor={valor} setValor={setValor} item={item} d={d} asignables={asignables} conf={conf} guarda={guarda} />}
      {error ? <p role="alert" className="mt-1 text-[11.5px] text-rose-700">{error}</p> : null}
      {modo.modo === 'no' || ['estado', 'prioridad', 'responsable', 'dependencia'].includes(columna) ? null : (
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={cierra} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs">Cancelar</button>
          <button type="button" disabled={ocupado} onClick={() => guarda()} data-guarda className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50">{modo.modo === 'directo' ? 'Guardar' : 'Proponer'}</button>
        </div>
      )}
    </div>
  );
}

function inicial(i: ItemTablero, columna: string): unknown {
  switch (columna) {
    case 'cronograma': return { inicio: i.inicio ?? '', fin: i.fin ?? '' };
    case 'fin': return i.fin ?? '';
    case 'monto': return i.monto === null ? '' : String(Number(i.monto));
    case 'responsable': return i.responsable?.id ?? '';
    case 'etiquetas': return i.etiquetas;
    case 'vinculo': return i.vinculo ?? 'https://';
    default: return (i as unknown as Record<string, unknown>)[columna] ?? '';
  }
}

function valida(columna: string, v: unknown, i: ItemTablero, conf: Record<string, unknown>): string | null {
  if (columna === 'fin' && typeof v === 'string') return !v ? 'Elige una fecha.' : !esHabil(v) ? 'Cae en fin de semana: elige un día hábil.' : i.inicio && v < i.inicio ? 'No puede terminar antes de empezar.' : null;
  if (columna === 'cronograma') { const c = v as { inicio: string; fin: string }; return !c.inicio || !c.fin ? 'Las dos fechas.' : c.inicio > c.fin ? 'El inicio es después del fin.' : !esHabil(c.fin) ? 'El fin cae en fin de semana.' : null; }
  if (columna === 'monto') { const n = Number(v); return !(n >= 0) || String(v).trim() === '' ? 'Escribe el monto en pesos.' : null; }
  if (columna === 'vinculo') {
    const permitidos = (conf.dominios as string[] | undefined) ?? [];
    try { const u = new URL(String(v)); return u.protocol !== 'https:' ? 'Solo https.' : permitidos.length && !permitidos.some((x) => u.hostname === x || u.hostname.endsWith(`.${x}`)) ? `Dominio fuera de la lista permitida (${permitidos.join(', ')}).` : null } catch { return 'No es una URL.' }
  }
  if (columna === 'nombre') return String(v).trim().length < 2 ? 'Muy corto.' : null;
  if (columna === 'archivo') { const a = v as { error?: string; sha256?: string } | null; return !a?.sha256 ? (a?.error ?? 'Elige un archivo.') : null }
  return null;
}

function cambiosDe(i: ItemTablero, columna: string, v: unknown, asignables: DatosDelTablero['asignables']) {
  switch (columna) {
    case 'cronograma': { const c = v as { inicio: string; fin: string }; return [{ item: i.id, campo: 'inicio', antes: i.inicio, despues: c.inicio }, { item: i.id, campo: 'fin', antes: i.fin, despues: c.fin }].filter((x) => x.antes !== x.despues) }
    case 'fin': return [{ item: i.id, campo: 'fin', antes: i.fin, despues: String(v) }];
    case 'monto': return [{ item: i.id, campo: 'monto_mxn', antes: i.monto === null ? null : Number(i.monto), despues: Number(v) }];
    case 'responsable': {
      const a = asignables.find((x) => x.id === v);
      const antesP = i.responsable?.tipo === 'humano' ? i.responsable.id : null;
      const antesA = i.responsable && i.responsable.tipo !== 'humano' ? i.responsable.id : null;
      return a?.tipo === 'humano' ? [{ item: i.id, campo: 'responsable_persona', antes: antesP, despues: a.id }] : [{ item: i.id, campo: 'responsable_agente', antes: antesA, despues: String(v) }];
    }
    case 'progreso': return [{ item: i.id, campo: 'progreso', antes: i.progreso, despues: Number(v) }];
    case 'etiquetas': return [{ item: i.id, campo: 'etiquetas', antes: i.etiquetas, despues: v as string[] }];
    default: return [{ item: i.id, campo: columna, antes: (i as unknown as Record<string, unknown>)[columna] ?? null, despues: v }];
  }
}

function resumenDe(i: ItemTablero, columna: string, v: unknown, d: DatosDelTablero): string {
  if (columna === 'monto') return `Cambiar el monto de «${i.nombre}» de ${mxn(i.monto, false)} a ${mxn(Number(v), false)}`;
  if (columna === 'fin') return `Mover la fecha de «${i.nombre}» del ${fecha(i.fin)} al ${fecha(String(v))}`;
  if (columna === 'cronograma') { const c = v as { inicio: string; fin: string }; return `Mover «${i.nombre}» a ${fecha(c.inicio)} – ${fecha(c.fin)}` }
  if (columna === 'responsable') return `Asignar «${i.nombre}» a ${d.nombres[String(v)] ?? 'otra persona'}`;
  return `Cambiar ${columna} de «${i.nombre}»`;
}

function Control({ columna, valor, setValor, item, d, asignables, conf, guarda }: {
  columna: string; valor: unknown; setValor: (v: unknown) => void; item: ItemTablero; d: DatosDelTablero; asignables: DatosDelTablero['asignables']; conf: Record<string, unknown>; guarda: (v?: unknown) => void
}) {
  const campo = 'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm';
  switch (columna) {
    case 'estado': return <div className="grid gap-1">{Object.entries(ESTADO).map(([k, e]) => <button key={k} type="button" onClick={() => guarda(k)} aria-pressed={valor === k} className={`rounded px-2 py-1 text-left text-xs font-semibold text-white ${e.clase} ${valor === k ? 'ring-2 ring-slate-900 ring-offset-1' : ''}`}>{e.nombre}{k === 'done' && item.dependeDe.length ? ' (exige dependencias cerradas)' : ''}</button>)}</div>;
    case 'prioridad': return <div className="grid gap-1">{Object.entries(PRIORIDAD).map(([k, p]) => <button key={k} type="button" onClick={() => guarda(k)} className="flex items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-slate-100"><i className={`h-2 w-2 rounded-sm ${p.clase}`} />{p.nombre}</button>)}</div>;
    case 'responsable': return (
      <div className="max-h-64 space-y-0.5 overflow-auto">{asignables.map((a) => (
        <button key={a.id} type="button" onClick={() => { setValor(a.id); guarda(a.id) }} className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[13px] hover:bg-slate-100" data-asignable={a.tipo}>
          <Avatar tipo={a.tipo} iniciales={a.iniciales} chico /><span className="flex-1 truncate">{a.nombre}</span>{a.tipo !== 'humano' ? <Etiqueta tipo={a.tipo} /> : null}
        </button>))}</div>
    );
    case 'fin': return <input type="date" className={campo} value={String(valor)} onChange={(e) => setValor(e.target.value)} />;
    case 'cronograma': { const c = valor as { inicio: string; fin: string }; return <div className="grid grid-cols-2 gap-2"><input type="date" className={campo} value={c.inicio} onChange={(e) => setValor({ ...c, inicio: e.target.value })} /><input type="date" className={campo} value={c.fin} onChange={(e) => setValor({ ...c, fin: e.target.value })} /></div> }
    case 'monto': {
      const cat = d.categorias.find((c) => c.id === item.categoria);
      const n = Number(valor);
      return (
        <div>
          <label className="flex items-center gap-2"><span className="text-sm text-slate-500">MXN</span><input inputMode="decimal" className={`${campo} text-right tabular-nums`} value={String(valor)} onChange={(e) => setValor(e.target.value.replace(/[^\d.]/g, ''))} /></label>
          <p className="mt-1 text-[11px] text-slate-500">Disponible de {cat?.nombre} este mes: {mxn(cat?.disponible)} · umbral de Finanzas {mxn(d.umbral, false)}</p>
          {n > Number(d.umbral) ? <p className="mt-1 text-[11px] font-semibold text-amber-800">Sobre el umbral: lo aprueba Finanzas.</p> : null}
        </div>
      );
    }
    case 'progreso': return <div className="flex items-center gap-2"><input type="range" min={0} max={100} step={5} className="flex-1" value={Number(valor)} onChange={(e) => setValor(Number(e.target.value))} /><span className="w-10 text-right text-sm tabular-nums">{String(valor)}%</span></div>;
    case 'dependencia': {
      const otros = d.items.filter((x) => x.id !== item.id && !item.dependeDe.includes(x.id));
      return <div className="max-h-56 overflow-auto">{otros.map((x) => <button key={x.id} type="button" onClick={() => guarda(x.id)} className="block w-full truncate rounded px-1.5 py-1 text-left text-[13px] hover:bg-slate-100">{x.nombre}</button>)}</div>;
    }
    case 'etiquetas': {
      const catalogo = (conf.catalogo as string[] | undefined) ?? [];
      const sel = valor as string[];
      return <div className="flex flex-wrap gap-1">{catalogo.map((t) => <button key={t} type="button" aria-pressed={sel.includes(t)} onClick={() => setValor(sel.includes(t) ? sel.filter((x) => x !== t) : [...sel, t])} className={`rounded px-1.5 py-0.5 text-[11.5px] ${sel.includes(t) ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{t}</button>)}</div>;
    }
    case 'archivo': {
      const tipos = (conf.tipos as string[] | undefined) ?? [];
      const max = Number(conf.max_bytes ?? 10485760);
      return <input type="file" accept={tipos.join(',')} className="text-xs" onChange={async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (tipos.length && !tipos.includes(f.type)) return setValor({ error: `tipo ${f.type || 'desconocido'} no permitido` });
        if (f.size > max) return setValor({ error: 'pasa el tamaño máximo' });
        setValor({ nombre: f.name, tipo: f.type, bytes: f.size, sha256: await huellaDe(await f.arrayBuffer()) });
      }} />;
    }
    default: return <input className={campo} value={String(valor)} onChange={(e) => setValor(e.target.value)} />;
  }
}
