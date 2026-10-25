'use client';
/**
 * Las gráficas del lienzo, en SVG propio: marcas delgadas, un solo eje, colores categóricos en orden fijo, leyenda
 * desde dos series y tooltip al pasar (con la tabla como vía equivalente). Ninguna suma en el cliente: cada valor
 * llega de la capa; la participación de `progreso` solo se arma con métricas sumables (lo valida el núcleo).
 */
import { useRef, useState, type ReactNode } from 'react';
import type { Fila, MetricaListada, Serie } from '../types';
import { SERIES, corta, cifra, dimension, etiqueta, mes, unidad, variacion } from '../services/formato';
import e from './estudio.module.css';

interface Punta { x: number; y: number; texto: string[] }
function useTooltip(): [Punta | null, (p: Punta | null) => void, ReactNode] {
  const [p, setP] = useState<Punta | null>(null);
  const nodo = p ? <div className={e.tooltip} style={{ left: p.x + 12, top: p.y - 8 }} role="status">{p.texto.map((t, i) => <div key={i}>{i === 0 ? <b>{t}</b> : t}</div>)}</div> : null;
  return [p, setP, nodo];
}
const posicion = (ev: React.PointerEvent, cont: HTMLElement | null) => { const r = cont?.getBoundingClientRect(); return { x: ev.clientX - (r?.left ?? 0), y: ev.clientY - (r?.top ?? 0) }; };

/** Barras horizontales por categoría; el año anterior como marca delgada; `resaltar` pinta las que cruzan el umbral. */
export function Barras({ filas, metrica, cat, resaltar, titulo }: { filas: readonly Fila[]; metrica: string; cat: readonly MetricaListada[]; resaltar?: { operador: 'menor' | 'mayor'; valor: number }; titulo: string }) {
  const [, setP, tip] = useTooltip();
  const u = unidad(cat, metrica);
  const vals = filas.flatMap((f) => [f.valores[metrica] ?? 0, f.anteriores[metrica] ?? 0]);
  const [min, max] = [Math.min(0, ...vals), Math.max(0, ...vals)];
  const ancho = 520, alto = 22 * filas.length + 18, izq = 132, der = 70;
  const x = (v: number) => izq + ((v - min) / ((max - min) || 1)) * (ancho - izq - der);
  const cruza = (v: number | null) => resaltar && v !== null && (resaltar.operador === 'menor' ? v < resaltar.valor : v > resaltar.valor);
  const cont = useRef<HTMLDivElement>(null);
  return (
    <div className={e.relativa} ref={cont}>
      <svg className={e.grafica} viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={`${titulo}: barras por categoría`}>
        <line className={e.eje} x1={x(0)} x2={x(0)} y1={0} y2={alto - 14} />
        {filas.map((f, i) => {
          const v = f.valores[metrica] ?? null, a = f.anteriores[metrica] ?? null, y = 6 + i * 22;
          return (
            <g key={f.clave} onPointerMove={(ev) => setP({ ...posicion(ev, cont.current), texto: [f.clave, `${etiqueta(cat, metrica)}: ${cifra(v, u)}`, ...(a !== null ? [`año anterior: ${cifra(a, u)}`] : [])] })} onPointerLeave={() => setP(null)}>
              <text x={izq - 6} y={y + 11} textAnchor="end">{f.clave}</text>
              <rect x={Math.min(x(0), x(v ?? 0))} y={y + 2} width={Math.max(1, Math.abs(x(v ?? 0) - x(0)))} height={12} rx={3} fill={cruza(v) ? 'var(--s2)' : 'var(--s1)'} />
              {a !== null && <rect x={x(a) - 1} y={y} width={2} height={16} fill="var(--tinta)" opacity={0.75} />}
              <text x={Math.max(x(v ?? 0), x(0)) + 4} y={y + 12}>{corta(v, u)}</text>
            </g>
          );
        })}
      </svg>
      {(resaltar || filas.some((f) => f.anteriores[metrica] !== undefined)) && (
        <div className={e.leyenda}>
          <span><i style={{ background: 'var(--s1)', height: 10 }} />{etiqueta(cat, metrica)}</span>
          {resaltar && <span><i style={{ background: 'var(--s2)', height: 10 }} />{resaltar.operador === 'menor' ? 'debajo de' : 'encima de'} {cifra(resaltar.valor, u)}</span>}
          {filas.some((f) => f.anteriores[metrica] !== undefined) && <span><i style={{ background: 'var(--tinta)', width: 2, height: 12 }} />año anterior</span>}
        </div>
      )}
      {tip}
    </div>
  );
}

/** Línea en el tiempo; el periodo de comparación, punteado y alineado por posición. */
export function Linea({ series, cat, titulo }: { series: readonly Serie[]; cat: readonly MetricaListada[]; titulo: string }) {
  const [, setP, tip] = useTooltip();
  const visibles = series.slice(0, 8);
  const xs = [...new Set(visibles.flatMap((s) => s.puntos.map((p) => p.x)))].sort();
  const u = unidad(cat, visibles[0]?.metrica ?? '');
  const vals = visibles.flatMap((s) => [...s.puntos, ...s.anterior].map((p) => p.y ?? 0));
  const [min, max] = [Math.min(0, ...vals), Math.max(...vals, 1)];
  const ancho = 520, alto = 200, izq = 46, abajo = 22;
  const px = (i: number) => izq + (i / Math.max(1, xs.length - 1)) * (ancho - izq - 10);
  const py = (v: number) => 8 + (1 - (v - min) / ((max - min) || 1)) * (alto - abajo - 8);
  const camino = (pts: readonly { y: number | null }[]) => pts.map((p, i) => (p.y === null ? '' : `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(p.y).toFixed(1)}`)).join(' ');
  const cont = useRef<HTMLDivElement>(null);
  const sobre = (ev: React.PointerEvent<SVGRectElement>) => {
    const r = (ev.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const i = Math.round(((ev.clientX - r.left) / r.width * ancho - izq) / ((ancho - izq - 10) / Math.max(1, xs.length - 1)));
    const k = xs[Math.max(0, Math.min(xs.length - 1, i))];
    if (k) setP({ ...posicion(ev, cont.current), texto: [mes(k), ...visibles.map((s) => `${s.nombre}: ${cifra(s.puntos.find((p) => p.x === k)?.y ?? null, u)}`)] });
  };
  return (
    <div className={e.relativa} ref={cont}>
      <svg className={e.grafica} viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={`${titulo}: línea en el tiempo`}>
        {[min, (min + max) / 2, max].map((v) => <g key={v}><line className={e.eje} x1={izq} x2={ancho - 10} y1={py(v)} y2={py(v)} strokeDasharray="2 3" /><text x={izq - 6} y={py(v) + 4} textAnchor="end">{corta(v, u)}</text></g>)}
        {xs.map((k, i) => (i % Math.ceil(xs.length / 7) === 0 ? <text key={k} x={px(i)} y={alto - 6} textAnchor="middle">{mes(k)}</text> : null))}
        {visibles.map((s, j) => <g key={`${s.metrica}-${s.nombre}`}>
          {s.anterior.length > 0 && <path d={camino(s.anterior)} fill="none" stroke={SERIES[j]} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7} />}
          <path d={camino(s.puntos)} fill="none" stroke={SERIES[j]} strokeWidth={2} />
        </g>)}
        <rect x={izq} y={0} width={ancho - izq} height={alto - abajo} fill="transparent" onPointerMove={sobre} onPointerLeave={() => setP(null)} />
      </svg>
      {(visibles.length > 1 || visibles.some((s) => s.anterior.length)) && <div className={e.leyenda}>
        {visibles.map((s, j) => <span key={`${s.metrica}-${s.nombre}`}><i style={{ background: SERIES[j] }} />{s.nombre === s.metrica ? etiqueta(cat, s.metrica) : s.nombre}</span>)}
        {visibles.some((s) => s.anterior.length) && <span><i className={e.punteada} />año anterior</span>}
      </div>}
      {tip}
    </div>
  );
}

/** Contabilidad por mes: entradas hacia arriba, salidas hacia abajo (cuentas sumables por mes). */
export function Contabilidad({ series, salidas, cat }: { series: readonly Serie[]; salidas: readonly string[]; cat: readonly MetricaListada[] }) {
  const xs = [...new Set(series.flatMap((s) => s.puntos.map((p) => p.x)))].sort();
  const valor = (s: Serie, k: string) => s.puntos.find((p) => p.x === k)?.y ?? 0;
  const arriba = xs.map((k) => series.filter((s) => !salidas.includes(s.metrica)).reduce((t, s) => t + valor(s, k), 0));
  const abajo = xs.map((k) => series.filter((s) => salidas.includes(s.metrica)).reduce((t, s) => t + valor(s, k), 0));
  const max = Math.max(1, ...arriba, ...abajo), ancho = 520, alto = 200, cero = 100, paso = (ancho - 40) / Math.max(1, xs.length);
  const h = (v: number) => (v / max) * 88;
  return (
    <div>
      <svg className={e.grafica} viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Contabilidad de clientes por mes: entradas arriba, salidas abajo">
        <line className={e.eje} x1={30} x2={ancho} y1={cero} y2={cero} />
        {xs.map((k, i) => {
          let sube = cero, baja = cero;
          return <g key={k}>
            {series.map((s, j) => {
              const v = valor(s, k), out = salidas.includes(s.metrica), alto2 = h(v);
              const y = out ? baja : sube - alto2;
              if (out) baja += alto2 + 1; else sube -= alto2 + 1;
              return <rect key={s.metrica} x={30 + i * paso + 2} y={y} width={paso - 5} height={Math.max(0, alto2)} rx={2} fill={SERIES[j]}><title>{`${mes(k)} · ${etiqueta(cat, s.metrica)}: ${cifra(v, '')}`}</title></rect>;
            })}
            {i % 3 === 0 && <text x={30 + i * paso + paso / 2} y={alto - 4} textAnchor="middle">{mes(k)}</text>}
          </g>;
        })}
      </svg>
      <div className={e.leyenda}>{series.map((s, j) => <span key={s.metrica}><i style={{ background: SERIES[j], height: 10 }} />{etiqueta(cat, s.metrica)}{salidas.includes(s.metrica) ? ' (salida)' : ''}</span>)}</div>
    </div>
  );
}

export function TablaDatos({ filas, metricas, dimension: dim, cat, resaltar }: { filas: readonly Fila[]; metricas: readonly string[]; dimension: string; cat: readonly MetricaListada[]; resaltar?: { operador: 'menor' | 'mayor'; valor: number } }) {
  const con = filas.some((f) => Object.keys(f.anteriores).length);
  return (
    <div className={e.tablaDatos}>
      <table>
        <thead><tr><th scope="col">{dimension(dim)}</th>{metricas.map((m) => <th key={m} scope="col">{etiqueta(cat, m)}</th>)}{con && <th scope="col">año anterior</th>}</tr></thead>
        <tbody>{filas.map((f) => {
          const v = f.valores[metricas[0]!] ?? null;
          const marca = resaltar && v !== null && (resaltar.operador === 'menor' ? v < resaltar.valor : v > resaltar.valor);
          return <tr key={f.clave} className={marca ? e.resaltada : undefined}><th scope="row" style={{ fontWeight: 400, textAlign: 'left' }}>{f.clave}</th>{metricas.map((m) => <td key={m} className={e.num}>{cifra(f.valores[m] ?? null, unidad(cat, m))}</td>)}{con && <td className={e.num}>{cifra(f.anteriores[metricas[0]!] ?? null, unidad(cat, metricas[0]!))}</td>}</tr>;
        })}</tbody>
      </table>
    </div>
  );
}

export function TablaSeries({ series, cat }: { series: readonly Serie[]; cat: readonly MetricaListada[] }) {
  const xs = [...new Set(series.flatMap((s) => s.puntos.map((p) => p.x)))].sort();
  return (
    <div className={e.tablaDatos}><table>
      <thead><tr><th scope="col">mes</th>{series.map((s) => <th key={`${s.metrica}${s.nombre}`} scope="col">{s.nombre === s.metrica ? etiqueta(cat, s.metrica) : s.nombre}</th>)}</tr></thead>
      <tbody>{xs.map((k) => <tr key={k}><th scope="row" style={{ fontWeight: 400 }}>{mes(k)}</th>{series.map((s) => <td key={`${s.metrica}${s.nombre}`} className={e.num}>{cifra(s.puntos.find((p) => p.x === k)?.y ?? null, unidad(cat, s.metrica))}</td>)}</tr>)}</tbody>
    </table></div>
  );
}

export function Delta({ v, tipo }: { v: number | null; tipo: '%' | 'pp' | null }) {
  const clase = v === null ? e.igual : v > 0 ? e.sube : v < 0 ? e.baja : e.igual;
  return <span className={clase}>{v === null ? '' : v > 0 ? '▲ ' : v < 0 ? '▼ ' : ''}{variacion(v, tipo)}<span className={e.oculto}> contra el año anterior</span></span>;
}

export { dimension };
