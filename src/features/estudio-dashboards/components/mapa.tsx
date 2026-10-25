'use client';
/**
 * El mapa como instrumento: matriz de puntos oscura (la rejilla de tierra del catálogo geográfico), tiendas como
 * nodos cuadrados dimensionados por la métrica activa y coloreados por su variación contra el año anterior. Se
 * arrastra y se acerca (puntero o teclado), se selecciona con clic o con LAZO, y la selección filtra el tablero.
 * Capas: inventario bajo reorden (la métrica que el laboratorio asigna) y señales enlazadas a sus tiendas. La
 * cobertura queda apagada: la capa semántica no tiene ese dato y el mapa no lo inventa.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Fila, Geografia, MetricaListada, Senal } from '../types';
import { cifra, etiqueta, unidad } from '../services/formato';
import e from './estudio.module.css';

interface Props {
  readonly geografia: Geografia;
  readonly filas: readonly Fila[];
  readonly metrica: string;
  readonly capaReorden: string | null;
  readonly cat: readonly MetricaListada[];
  readonly seleccion: readonly string[];
  readonly senales: readonly Senal[];
  readonly onSeleccion: (valores: string[]) => void;
}

const CORTES = [-10, 0, 10, 25];
const COLORES = ['#e66767', '#f2a3a3', '#9ec5f4', '#3987e5', '#1c6fd6'];
const colorDe = (v: number | null) => (v === null ? '#8a8799' : COLORES[CORTES.filter((c) => v >= c).length]!);
const dentro = (p: [number, number], pol: readonly [number, number][]) => {
  let c = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [xi, yi] = pol[i]!, [xj, yj] = pol[j]!;
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const RANURAS = [[0.015, 0.04], [0.015, 0.6], [0.73, 0.04]] as const;

function useTamano(ref: React.RefObject<HTMLDivElement | null>) {
  const [t, setT] = useState({ w: 800, h: 440 });
  useEffect(() => {
    const n = ref.current;
    if (!n) return;
    const o = new ResizeObserver(([x]) => x && setT({ w: x.contentRect.width || 800, h: x.contentRect.height || 440 }));
    o.observe(n);
    return () => o.disconnect();
  }, [ref]);
  return t;
}

export function Mapa({ geografia: g, filas, metrica, capaReorden, cat, seleccion, senales, onSeleccion }: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const { w, h } = useTamano(caja);
  const r = g.rejilla;
  const [vista, setVista] = useState({ cx: r.nx / 2 + 6, cy: r.ny / 2, zoom: 1 });
  const [lazo, setLazo] = useState(false);
  const [reorden, setReorden] = useState(false);
  const [trazo, setTrazo] = useState<[number, number][] | null>(null);
  const arrastre = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const escala = Math.max(r.nx / w, r.ny / h) * 1.02 / vista.zoom;
  const vb = { x: vista.cx - (w * escala) / 2, y: vista.cy - (h * escala) / 2, w: w * escala, h: h * escala };
  const aVista = (ev: React.PointerEvent): [number, number] => { const b = caja.current!.getBoundingClientRect(); return [vb.x + ((ev.clientX - b.left) / b.width) * vb.w, vb.y + ((ev.clientY - b.top) / b.height) * vb.h]; };
  const datos = useMemo(() => new Map(filas.map((f) => [f.clave, f])), [filas]);
  const maximo = Math.max(1, ...filas.map((f) => f.valores[metrica] ?? 0));
  const nodos = g.puntos.map((p) => {
    const f = datos.get(p.valor);
    const v = f?.valores[metrica] ?? null, a = f?.anteriores[metrica] ?? null;
    return { ...p, x: (p.lon - r.lon0) / r.paso, y: (r.lat1 - p.lat) / r.paso, v, var: v !== null && a ? 100 * (v / a - 1) : null, lado: 0.9 + 2.1 * Math.sqrt(Math.max(0, v ?? 0) / maximo), reorden: capaReorden ? f?.valores[capaReorden] ?? null : null };
  });
  const sel = new Set(seleccion);
  const alterna = (v: string) => onSeleccion(sel.has(v) ? seleccion.filter((x) => x !== v) : [...seleccion, v]);
  const zoom = (k: number) => setVista((s) => ({ ...s, zoom: Math.min(6, Math.max(1, s.zoom * k)) }));
  const tecla = (ev: React.KeyboardEvent) => {
    const d = 3 / vista.zoom, mov: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
    if (mov[ev.key]) { ev.preventDefault(); setVista((s) => ({ ...s, cx: s.cx + mov[ev.key]![0], cy: s.cy + mov[ev.key]![1] })); }
    if (ev.key === '+' || ev.key === '=') zoom(1.4);
    if (ev.key === '-') zoom(1 / 1.4);
  };
  const baja = (ev: React.PointerEvent) => {
    // Un gesto que empieza en un control o una tarjeta es de ese elemento: si el mapa capturara el puntero, el clic
    // nunca le llegaría al botón (pasaba con «Lazo», «+» y «−»).
    if ((ev.target as Element).closest('button, [data-tarjeta]')) return;
    if (!lazo && (ev.target as Element).closest('[data-nodo]')) return;
    (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
    if (lazo) setTrazo([aVista(ev)]);
    else arrastre.current = { x: ev.clientX, y: ev.clientY, cx: vista.cx, cy: vista.cy };
  };
  const mueve = (ev: React.PointerEvent) => {
    if (trazo) setTrazo([...trazo, aVista(ev)]);
    const a = arrastre.current;
    if (a) setVista((s) => ({ ...s, cx: a.cx - ((ev.clientX - a.x) / w) * vb.w, cy: a.cy - ((ev.clientY - a.y) / h) * vb.h }));
  };
  const suelta = () => {
    if (trazo && trazo.length > 2) onSeleccion(nodos.filter((n) => dentro([n.x, n.y], trazo)).map((n) => n.valor));
    setTrazo(null);
    arrastre.current = null;
  };
  const tarjetas = senales.filter((s) => s.entidades.length).slice(0, 3);
  const enlazadas = new Set(tarjetas.flatMap((s) => s.entidades));
  const u = unidad(cat, metrica);
  return (
    <div>
      <div ref={caja} className={e.mapa} tabIndex={0} role="group" aria-label={`Mapa de tiendas por ${etiqueta(cat, metrica)}. Flechas para mover, más y menos para acercar.`} onKeyDown={tecla}
        onPointerDown={baja} onPointerMove={mueve} onPointerUp={suelta} onPointerCancel={suelta} onWheel={(ev) => zoom(ev.deltaY < 0 ? 1.15 : 1 / 1.15)} style={{ cursor: lazo ? 'crosshair' : 'grab' }}>
        <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="none" aria-hidden={false}>
          <g className={e.tierra} aria-hidden="true">{r.celdas.map(([x, y]) => <rect key={`${x}-${y}`} x={x + 0.14} y={y + 0.14} width={0.72} height={0.72} rx={0.12} />)}</g>
          {tarjetas.map((s, i) => { const [px, py] = RANURAS[i]!; const ax = vb.x + vb.w * (px + (px > 0.5 ? 0 : 0.27)), ay = vb.y + vb.h * (py + 0.06); return <g key={s.id} className={e.enlaces} aria-hidden="true">{s.entidades.map((ent) => { const n = nodos.find((x) => x.valor === ent); return n ? <path key={ent} className={e.enlace} d={`M${ax},${ay} L${n.x},${n.y}`} /> : null; })}</g>; })}
          {nodos.filter((n) => enlazadas.has(n.valor)).map((n) => <rect key={`s-${n.valor}`} className={e.enlazada} x={n.x - n.lado / 2 - 0.45} y={n.y - n.lado / 2 - 0.45} width={n.lado + 0.9} height={n.lado + 0.9} rx={0.3} aria-hidden="true" />)}
          {reorden && nodos.map((n) => (n.reorden ? <circle key={`r-${n.valor}`} className={e.anillo} cx={n.x} cy={n.y} r={n.lado / 2 + 0.25 + n.reorden * 0.12} aria-hidden="true" /> : null))}
          {nodos.map((n) => (
            <g key={n.valor} data-nodo className={`${e.nodo} ${sel.has(n.valor) ? e.seleccionado : ''}`} role="button" tabIndex={0} aria-pressed={sel.has(n.valor)}
              aria-label={`${n.valor}: ${cifra(n.v, u)}${n.var !== null ? `, ${n.var >= 0 ? '+' : '−'}${Math.abs(n.var).toFixed(1)} % contra el año anterior` : ''}${n.reorden ? `, ${n.reorden} bajo reorden` : ''}`}
              onClick={() => alterna(n.valor)} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); alterna(n.valor); } }}>
              <rect className={e.cuerpo} x={n.x - n.lado / 2} y={n.y - n.lado / 2} width={n.lado} height={n.lado} rx={0.15} fill={colorDe(n.var)} />
              {(vista.zoom >= 1.8 || sel.has(n.valor)) && <text className={e.etiqueta} x={n.x + n.lado / 2 + 0.3} y={n.y + 0.4}>{n.valor}</text>}
            </g>
          ))}
          {trazo && <polygon className={e.lazo} points={trazo.map((p) => p.join(',')).join(' ')} />}
        </svg>
        <div className={e.controlesMapa}>
          <button type="button" onClick={() => zoom(1.4)} aria-label="Acercar">+</button>
          <button type="button" onClick={() => zoom(1 / 1.4)} aria-label="Alejar">−</button>
          <button type="button" aria-pressed={lazo} onClick={() => setLazo(!lazo)}>Lazo</button>
          {capaReorden && <button type="button" aria-pressed={reorden} onClick={() => setReorden(!reorden)}>Reorden</button>}
          <button type="button" aria-disabled="true" title="Sin datos de cobertura en la capa semántica" onClick={(ev) => ev.preventDefault()}>Cobertura</button>
        </div>
        {tarjetas.map((s, i) => { const [px, py] = RANURAS[i]!; return (
          <div key={s.id} data-tarjeta className={e.tarjetaSenal} style={{ left: `${px * 100}%`, top: `${py * 100}%` }}>
            <span>{s.estado}</span><b>{s.titulo}</b>
          </div>
        ); })}
      </div>
      {tarjetas.length > 0 && <ul className={e.listaSenalesMapa} aria-label="Señales enlazadas a tiendas del mapa">{tarjetas.map((s) => <li key={s.id}><b>{s.estado}</b> · {s.titulo} <span className={e.pie}>→ {s.entidades.join(', ')}</span></li>)}</ul>}
      <div className={e.pieMapa}>
        <span>Color: variación contra el año anterior</span>
        {['≤ −10 %', '−10 a 0 %', '0 a 10 %', '10 a 25 %', '> 25 %'].map((t, i) => <span key={t}><i className={e.cuadro} style={{ background: COLORES[i] }} />{t}</span>)}
        <span>Tamaño: {etiqueta(cat, metrica)}</span>
        {reorden && <span>Anillo: SKU bajo reorden</span>}
        {enlazadas.size > 0 && <span><i className={e.cuadro} style={{ outline: '2px solid #b07d00' }} />Marco: tienda con señal</span>}
        <span aria-live="polite">{seleccion.length ? `${seleccion.length} seleccionada(s): ${seleccion.join(', ')}` : 'Sin selección (clic o lazo)'}</span>
        {seleccion.length > 0 && <button type="button" className={e.mini} onClick={() => onSeleccion([])}>Limpiar selección</button>}
      </div>
    </div>
  );
}
