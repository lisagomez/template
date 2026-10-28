'use client';

/**
 * Las tres vistas del tablero sobre los MISMOS ítems: tabla (editar rápido muchos campos), kanban (el flujo por
 * estado; las propuestas de los agentes como tarjetas punteadas «por aprobar») y Gantt (fechas y dependencias, con
 * la línea de hoy; arrastrar una barra mueve la fecha o la propone, según tu rol).
 */
import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as EventoPuntero } from 'react';
import Link from 'next/link';
import type { ItemTablero, Propuesta } from '../../../../tools/agora/dist/index.js';
import { ESTADO, fecha, mxn } from '@/features/agora/services/formato';
import { Avatar, Etiqueta } from '@/features/agora/components/insignia';
import type { DatosDelTablero } from '../services/lecturas';
import { dias, esHabil, suma } from '../services/reglas';
import { Cronograma, Estado, Etiquetas, Fecha, Monto, PorEjercer, Prioridad, Progreso, Responsable } from './celdas';

export type Abre = (item: ItemTablero, columna: string, ancla: DOMRect) => void;
export type Mueve = (item: ItemTablero, cambio: { campo: 'estado'; valor: string } | { campo: 'cronograma'; inicio: string; fin: string }) => void;

const COLUMNAS: Array<{ clave: string; titulo: string; ancho: string }> = [
  { clave: 'estado', titulo: 'Estado', ancho: 'w-[108px]' }, { clave: 'responsable', titulo: 'Responsable', ancho: 'w-[180px]' }, { clave: 'prioridad', titulo: 'Prioridad', ancho: 'w-[92px]' },
  { clave: 'cronograma', titulo: 'Cronograma', ancho: 'w-[124px]' }, { clave: 'fin', titulo: 'Fecha', ancho: 'w-[110px]' }, { clave: 'monto', titulo: 'Monto (MXN)', ancho: 'w-[112px]' },
  { clave: 'por_ejercer', titulo: 'Comprometido', ancho: 'w-[112px]' }, { clave: 'progreso', titulo: 'Progreso', ancho: 'w-[120px]' }, { clave: 'dependencia', titulo: 'Depende de', ancho: 'w-[150px]' },
  { clave: 'etiquetas', titulo: 'Etiquetas', ancho: 'w-[130px]' }, { clave: 'vinculo', titulo: 'Vínculo', ancho: 'w-[80px]' }, { clave: 'archivo', titulo: 'Archivo', ancho: 'w-[90px]' }, { clave: 'hilo', titulo: 'Hilo', ancho: 'w-[60px]' },
];

const pendientesDe = (p: Propuesta[], id: string) => p.filter((x) => JSON.stringify(x.payload).includes(id));
const nuevosDe = (p: Propuesta[], cat: string) => p.filter((x) => x.clase === 'crear_item' && x.categoria === cat);

function Celda({ i, c, d }: { i: ItemTablero; c: string; d: DatosDelTablero }) {
  switch (c) {
    case 'estado': return <Estado e={i.estado} />;
    case 'responsable': return <Responsable i={i} />;
    case 'prioridad': return <Prioridad p={i.prioridad} />;
    case 'cronograma': return <span className="whitespace-nowrap"><Cronograma i={i} /></span>;
    case 'fin': return <Fecha d={i.fin} hoy={d.hoy} listo={i.estado === 'done'} />;
    case 'monto': return <Monto i={i} />;
    case 'por_ejercer': return <PorEjercer i={i} />;
    case 'progreso': return <Progreso v={i.progreso} />;
    case 'dependencia': return <span className="truncate text-[12px] text-slate-600">{i.dependeDe.map((x) => d.nombres[x] ?? '—').join(', ') || '—'}</span>;
    case 'etiquetas': return <Etiquetas t={i.etiquetas} />;
    case 'vinculo': return i.vinculo ? <a href={i.vinculo} target="_blank" rel="noreferrer noopener" className="text-[12px] text-blue-700 underline" onClick={(e) => e.stopPropagation()}>abrir</a> : <span className="text-slate-400">—</span>;
    case 'archivo': return i.archivo ? <span className="truncate text-[12px]" title={`sha256 ${i.archivo.sha256}`}>📎 {i.archivo.nombre}</span> : <span className="text-slate-400">—</span>;
    case 'hilo': return <Link href={`/agora/buzon?cat=${i.categoria}`} className="text-[12px] text-blue-700" onClick={(e) => e.stopPropagation()}>💬</Link>;
    default: return null;
  }
}

export function Tabla({ d, items, abre }: { d: DatosDelTablero; items: ItemTablero[]; abre: Abre }) {
  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-white" data-vista="tabla">
      <table className="w-full min-w-[1500px] border-collapse text-[13px]">
        <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
          <tr><th className="w-[280px] px-3 py-2">Ítem</th>{COLUMNAS.map((c) => <th key={c.clave} className={`${c.ancho} px-2 py-2`}>{c.titulo}</th>)}</tr>
        </thead>
        <tbody>
          {d.categorias.map((cat) => {
            const filas = items.filter((i) => i.categoria === cat.id);
            const nuevos = nuevosDe(d.propuestas, cat.id);
            if (!filas.length && !nuevos.length) return null;
            return [
              <tr key={cat.id} className="bg-slate-100/70"><td colSpan={COLUMNAS.length + 1} className="px-3 py-1.5 text-[12px] font-semibold text-slate-700">{cat.dominio} › {cat.nombre} <span className="font-normal text-slate-500">· {filas.length} ítems · presupuesto del mes {mxn(cat.presupuesto, false)} · disponible {mxn(cat.disponible, false)}</span></td></tr>,
              ...filas.map((i) => {
                const pend = pendientesDe(d.propuestas, i.id);
                return (
                  <tr key={i.id} className="border-t border-slate-100 hover:bg-blue-50/30" data-item={i.id}>
                    <td className="px-3 py-1.5">
                      <button type="button" className="flex w-full items-center gap-2 text-left font-medium text-slate-900" onClick={(e) => abre(i, 'nombre', e.currentTarget.getBoundingClientRect())}>
                        {pend.length ? <span title={`${pend.length} propuesta(s) pendiente(s)`} className="h-2 w-2 shrink-0 rounded-full border-2 border-amber-500" data-pendiente /> : null}
                        <span className="truncate">{i.nombre}</span>
                      </button>
                    </td>
                    {COLUMNAS.map((c) => (
                      <td key={c.clave} className="px-1 py-0.5">
                        <button type="button" data-celda={c.clave} onClick={(e) => abre(i, c.clave, e.currentTarget.getBoundingClientRect())} className="flex min-h-[32px] w-full items-center rounded px-1.5 text-left hover:bg-slate-100">
                          <Celda i={i} c={c.clave} d={d} />
                        </button>
                      </td>
                    ))}
                  </tr>
                );
              }),
              ...nuevos.flatMap((p) => ((p.payload.nuevos as Array<{ nombre: string; inicio?: string; fin?: string }>) ?? []).map((n, k) => (
                <tr key={`${p.id}-${k}`} className="border-t border-dashed border-amber-300 bg-[repeating-linear-gradient(135deg,transparent_0_8px,#fef3c7_8px_9px)]" data-fantasma={p.id}>
                  <td className="px-3 py-1.5 text-slate-700"><span className="mr-2 rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold uppercase text-amber-800">por aprobar</span>{n.nombre}</td>
                  <td colSpan={COLUMNAS.length} className="px-2 text-[12px] text-slate-500">Propuesto por {p.autor?.nombre} · {fecha(n.inicio ?? null)} – {fecha(n.fin ?? null)} · <Link className="text-blue-700" href={`/agora/buzon?cat=${p.categoria}&propuesta=${p.id}`}>decidir en el hilo</Link></td>
                </tr>
              ))),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Kanban({ d, items, abre, mueve }: { d: DatosDelTablero; items: ItemTablero[]; abre: Abre; mueve: Mueve }) {
  const [sobre, setSobre] = useState<string | null>(null);
  const suelta = (estado: string) => (e: DragEvent) => {
    e.preventDefault();
    setSobre(null);
    const i = items.find((x) => x.id === e.dataTransfer.getData('text/item'));
    if (i && i.estado !== estado) mueve(i, { campo: 'estado', valor: estado });
  };
  const fantasmas = d.propuestas.filter((p) => p.clase === 'crear_item');
  return (
    <div className="grid auto-cols-[minmax(250px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2" data-vista="kanban">
      {Object.entries(ESTADO).map(([k, e]) => {
        const tarjetas = items.filter((i) => i.estado === k);
        return (
          <section key={k} onDragOver={(ev) => { ev.preventDefault(); setSobre(k) }} onDragLeave={() => setSobre(null)} onDrop={suelta(k)} data-columna={k}
            className={`flex min-h-[420px] flex-col gap-2 rounded-xl bg-slate-100 p-2 ${sobre === k ? 'outline outline-2 outline-dashed outline-blue-500' : ''}`}>
            <header className="flex items-center justify-between px-1"><span className="flex items-center gap-2 text-[12px] font-semibold text-slate-700"><i className={`h-2.5 w-2.5 rounded-sm ${e.clase}`} />{e.nombre}</span><span className="text-[11px] text-slate-500">{tarjetas.length}</span></header>
            {k === 'todo' ? fantasmas.flatMap((p) => ((p.payload.nuevos as Array<{ nombre: string; fin?: string }>) ?? []).map((n, x) => (
              <Link key={`${p.id}-${x}`} href={`/agora/buzon?cat=${p.categoria}&propuesta=${p.id}`} className="rounded-lg border-[1.5px] border-dashed border-amber-500 bg-amber-50 p-2.5 text-[12.5px]" data-fantasma={p.id}>
                <span className="block font-medium text-slate-800">{n.nombre}</span>
                <span className="mt-1 flex items-center gap-1.5 text-[11px] text-amber-800">por aprobar · {p.autor?.nombre} <Etiqueta tipo={p.autor?.tipo ?? 'interno'} /></span>
              </Link>
            ))) : null}
            {tarjetas.map((i) => {
              const pend = pendientesDe(d.propuestas, i.id).length;
              return (
                <article key={i.id} draggable onDragStart={(ev) => ev.dataTransfer.setData('text/item', i.id)} data-tarjeta={i.id}
                  className="cursor-grab rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm active:cursor-grabbing">
                  <button type="button" className="text-left text-[13px] font-medium leading-snug text-slate-900" onClick={(ev) => abre(i, 'nombre', ev.currentTarget.getBoundingClientRect())}>{i.nombre}</button>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-500">
                    <Responsable i={i} />
                    <Fecha d={i.fin} hoy={d.hoy} listo={i.estado === 'done'} />
                    {i.monto ? <span className="tabular-nums">{mxn(i.monto, false)}</span> : null}
                  </div>
                  <div className="mt-2"><Progreso v={i.progreso} /></div>
                  {pend ? <p className="mt-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800" data-pendiente>{pend} propuesta(s) por aprobar</p> : null}
                </article>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

const DIA = 24;
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function Gantt({ d, items, abre, mueve }: { d: DatosDelTablero; items: ItemTablero[]; abre: Abre; mueve: Mueve }) {
  const conFechas = items.filter((i) => i.inicio && i.fin);
  const desde = useMemo(() => suma([...conFechas.map((i) => i.inicio!), d.hoy].sort()[0]!, -3), [conFechas, d.hoy]);
  const hasta = useMemo(() => suma([...conFechas.map((i) => i.fin!), d.hoy].sort().at(-1)!, 7), [conFechas, d.hoy]);
  const total = dias(desde, hasta) + 1;
  const [arrastre, setArrastre] = useState<{ id: string; dx: number; modo: 'mover' | 'estirar' } | null>(null);
  const origen = useRef<{ x: number; id: string; modo: 'mover' | 'estirar' } | null>(null);
  const filas: Array<{ tipo: 'grupo'; nombre: string } | { tipo: 'item'; i: ItemTablero } | { tipo: 'fantasma'; p: Propuesta; nombre: string; inicio: string; fin: string }> = [];
  for (const cat of d.categorias) {
    const xs = conFechas.filter((i) => i.categoria === cat.id);
    const nuevos = nuevosDe(d.propuestas, cat.id).flatMap((p) => ((p.payload.nuevos as Array<{ nombre: string; inicio?: string; fin?: string }>) ?? []).filter((n) => n.inicio && n.fin).map((n) => ({ tipo: 'fantasma' as const, p, nombre: n.nombre, inicio: n.inicio!, fin: n.fin! })));
    if (!xs.length && !nuevos.length) continue;
    filas.push({ tipo: 'grupo', nombre: `${cat.dominio} › ${cat.nombre}` }, ...xs.map((i) => ({ tipo: 'item' as const, i })), ...nuevos);
  }
  const fila = new Map(filas.flatMap((f, k) => (f.tipo === 'item' ? [[f.i.id, k] as const] : [])));
  const x = (dia: string) => dias(desde, dia) * DIA;
  const propuestaDeFechas = (id: string) => d.propuestas.find((p) => ['mover_fecha', 'reprogramar'].includes(p.clase) && (p.payload.cambios as Array<{ item: string }> | undefined)?.some((c) => c.item === id));
  const empieza = (i: ItemTablero, modo: 'mover' | 'estirar') => (e: EventoPuntero<HTMLElement>) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    origen.current = { x: e.clientX, id: i.id, modo };
    setArrastre({ id: i.id, dx: 0, modo });
  };
  const mueveP = (e: EventoPuntero<HTMLElement>) => { if (origen.current) setArrastre({ id: origen.current.id, dx: e.clientX - origen.current.x, modo: origen.current.modo }) };
  const suelta = (i: ItemTablero) => () => {
    const a = arrastre;
    origen.current = null;
    setArrastre(null);
    if (!a) return;
    const n = Math.round(a.dx / DIA);
    if (!n) return;
    mueve(i, { campo: 'cronograma', inicio: a.modo === 'mover' ? suma(i.inicio!, n) : i.inicio!, fin: suma(i.fin!, n) });
  };
  const meses: Array<{ x: number; nombre: string }> = [];
  for (let k = 0; k < total; k++) { const f = suma(desde, k); if (k === 0 || f.slice(8) === '01') meses.push({ x: k * DIA, nombre: `${MES[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}` }) }
  const ALTO = 36;
  const caja = useRef<HTMLDivElement>(null);
  const hoyX = dias(desde, d.hoy) * DIA;
  useEffect(() => { if (caja.current) caja.current.scrollLeft = Math.max(0, hoyX - 7 * DIA) }, [hoyX]);
  return (
    <div ref={caja} className="overflow-auto rounded-xl border border-slate-200 bg-white" data-vista="gantt">
      <div className="relative" style={{ width: 260 + total * DIA }}>
        <div className="sticky top-0 z-20 flex border-b border-slate-200 bg-white">
          <div className="sticky left-0 z-30 w-[260px] shrink-0 border-r border-slate-200 bg-white px-3 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">Ítem</div>
          <div className="relative h-[44px]" style={{ width: total * DIA }}>
            {meses.map((m) => <span key={m.x} className="absolute top-0 border-l border-slate-200 pl-1.5 text-[11px] font-semibold text-slate-600" style={{ left: m.x }}>{m.nombre}</span>)}
            {Array.from({ length: total }, (_, k) => suma(desde, k)).map((f, k) => <span key={f} className={`absolute bottom-1 text-center text-[10px] ${esHabil(f) ? 'text-slate-500' : 'text-slate-300'}`} style={{ left: k * DIA, width: DIA }}>{Number(f.slice(8))}</span>)}
          </div>
        </div>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-rose-500" style={{ left: 260 + x(d.hoy) + DIA / 2 }} title="hoy" data-hoy />
          <svg className="pointer-events-none absolute left-[260px] top-0 z-10 overflow-visible" width={total * DIA} height={filas.length * ALTO} aria-hidden>
            <defs><marker id="flecha" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#64748b" /></marker></defs>
            {filas.flatMap((f, k) => (f.tipo !== 'item' ? [] : f.i.dependeDe.filter((p) => fila.has(p)).map((p) => {
              const pi = conFechas.find((z) => z.id === p)!;
              const x1 = x(pi.fin!) + DIA, y1 = fila.get(p)! * ALTO + ALTO / 2, x2 = x(f.i.inicio!), y2 = k * ALTO + ALTO / 2;
              return <path key={`${p}-${f.i.id}`} d={`M${x1},${y1} C${x1 + 18},${y1} ${x2 - 18},${y2} ${x2},${y2}`} fill="none" stroke="#64748b" strokeWidth={1.3} markerEnd="url(#flecha)" />;
            })))}
          </svg>
          {filas.map((f, k) => {
            if (f.tipo === 'grupo') return <div key={`g${k}`} className="flex h-[36px] items-center border-b border-slate-100 bg-slate-50"><div className="sticky left-0 z-20 w-[260px] shrink-0 bg-slate-50 px-3 text-[12px] font-semibold text-slate-700">{f.nombre}</div></div>;
            if (f.tipo === 'fantasma') return (
              <div key={`f${k}`} className="flex h-[36px] items-center border-b border-slate-100">
                <div className="sticky left-0 z-20 flex w-[260px] shrink-0 items-center gap-1.5 truncate bg-white px-3 text-[12.5px] text-slate-600"><span className="rounded bg-amber-100 px-1 text-[9.5px] font-semibold uppercase text-amber-800">por aprobar</span>{f.nombre}</div>
                <div className="relative h-full" style={{ width: total * DIA }}><Link href={`/agora/buzon?cat=${f.p.categoria}&propuesta=${f.p.id}`} className="absolute top-[7px] h-[22px] rounded-md border-2 border-dashed border-amber-500 bg-amber-50/80" style={{ left: x(f.inicio), width: (dias(f.inicio, f.fin) + 1) * DIA }} data-fantasma={f.p.id} /></div>
              </div>
            );
            const i = f.i;
            const a = arrastre?.id === i.id ? arrastre : null;
            const izq = x(i.inicio!) + (a && a.modo === 'mover' ? a.dx : 0);
            const ancho = (dias(i.inicio!, i.fin!) + 1) * DIA + (a && a.modo === 'estirar' ? a.dx : 0);
            const prop = propuestaDeFechas(i.id);
            const pc = prop ? (prop.payload.cambios as Array<{ campo: string; despues: string }>) : null;
            const pInicio = pc?.find((c) => c.campo === 'inicio')?.despues ?? i.inicio!;
            const pFin = pc?.find((c) => c.campo === 'fin')?.despues ?? i.fin!;
            return (
              <div key={i.id} className="flex h-[36px] items-center border-b border-slate-100" data-fila={i.id}>
                <div className="sticky left-0 z-20 flex w-[260px] shrink-0 items-center gap-2 truncate bg-white px-3 text-[12.5px]">
                  <button type="button" className="truncate text-left hover:underline" onClick={(e) => abre(i, 'cronograma', e.currentTarget.getBoundingClientRect())}>{i.nombre}</button>
                  {i.responsable && i.responsable.tipo !== 'humano' ? <Avatar tipo={i.responsable.tipo} iniciales={i.responsable.iniciales} chico /> : null}
                </div>
                <div className="relative h-full" style={{ width: total * DIA }}>
                  {prop ? <Link href={`/agora/buzon?cat=${prop.categoria}&propuesta=${prop.id}`} title={`propuesta: ${prop.resumen}`} className="absolute top-[5px] z-0 h-[26px] rounded-md border-2 border-dashed border-amber-500" style={{ left: x(pInicio), width: (dias(pInicio, pFin) + 1) * DIA }} data-fantasma={prop.id} /> : null}
                  <div onPointerDown={empieza(i, 'mover')} onPointerMove={mueveP} onPointerUp={suelta(i)} data-barra={i.id} title={`${i.nombre}: ${fecha(i.inicio)} – ${fecha(i.fin)} · ${i.progreso}%`}
                    className={`absolute top-[7px] z-[1] flex h-[22px] cursor-grab touch-none select-none items-center overflow-hidden rounded-md px-1.5 text-[11px] font-semibold text-white ${ESTADO[i.estado]?.clase}`} style={{ left: izq, width: Math.max(DIA, ancho) }}>
                    <span className="pointer-events-none absolute inset-y-0 left-0 bg-white/25" style={{ width: `${i.progreso}%` }} />
                    <span className="relative truncate">{i.progreso}%</span>
                    <span onPointerDown={empieza(i, 'estirar')} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
