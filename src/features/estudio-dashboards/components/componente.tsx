'use client';
/**
 * Una tarjeta del tablero: renderiza su componente de la especificación con los datos que resolvió el servidor, y
 * deja corregir con clics (tipo de gráfica, orden) por la MISMA vía que una frase: un parche a la especificación.
 * La procedencia está a un clic: métrica, definición, filtros y SQL compilado, en el panel de contexto.
 */
import { useState } from 'react';
import type { Componente, DatosComponente, Geografia, MetricaListada, Senal } from '../types';
import { cifra, dimension, etiqueta, unidad } from '../services/formato';
import { Barras, Contabilidad, Delta, Linea, TablaDatos, TablaSeries } from './graficas';
import { Mapa } from './mapa';
import { Ciclo } from './senales';
import e from './estudio.module.css';

export interface Acciones {
  readonly procedencia: (id: string) => void;
  readonly cambia: (id: string, cambios: Record<string, unknown>) => void;
  readonly selecciona: (valores: string[]) => void;
}
interface Props {
  readonly c: Componente;
  readonly datos: DatosComponente | undefined;
  readonly cat: readonly MetricaListada[];
  readonly geografia: Geografia;
  readonly senales: readonly Senal[] | null;
  readonly seleccion: readonly string[];
  readonly capaReorden: string | null;
  readonly estado: 'normal' | 'nueva' | 'propuesta';
  readonly acciones: Acciones | null;
}

const ANCHO: Record<string, string> = { completo: e.completo!, ancho: e.ancho!, medio: e.medio!, tercio: e.tercio! };
const DEFECTO: Record<string, string> = { hero: 'tercio', kpis: 'completo', metas: 'tercio', medidor: 'medio', progreso: 'tercio', actividad: 'medio', barras: 'medio', linea: 'medio', tabla: 'completo', mapa: 'completo', cohortes: 'medio', contabilidad: 'ancho', senales: 'completo', nota: 'completo', hallazgo: 'completo' };

export function titulo(c: Componente, cat: readonly MetricaListada[]): string {
  if (c.titulo) return c.titulo;
  if (c.tipo === 'senales') return 'Ciclo de growth: detectar → diagnosticar → actuar → aprender';
  if (c.tipo === 'contabilidad') return 'Contabilidad de clientes por mes';
  if (c.tipo === 'hallazgo') return 'Hallazgo';
  if (c.tipo === 'nota') return 'Nota';
  if (c.tipo === 'kpis') return 'Indicadores';
  if (c.tipo === 'metas') return 'Metas';
  const m = 'metrica' in c ? etiqueta(cat, c.metrica) : c.tipo === 'tabla' ? c.metricas.map((x) => etiqueta(cat, x)).join(', ') : '';
  const por = 'dimension' in c && c.dimension ? ` por ${dimension(c.dimension)}` : 'serie' in c && c.serie ? ` por ${dimension(c.serie)}` : c.tipo === 'linea' ? ' por mes' : '';
  return `${m}${por}`;
}

function Valores({ d, cat, c }: { d: DatosComponente; cat: readonly MetricaListada[]; c: Componente }) {
  if (d.forma.tipo !== 'valores') return null;
  if (c.tipo === 'hero') { const v = d.forma.valores[0]!; return <div><div className={`${e.grande} ${e.num}`}>{cifra(v.valor, v.unidad)}</div><div className={e.pie}><Delta v={v.variacion} tipo={v.tipoVariacion} /> {v.anterior !== null && <>· año anterior {cifra(v.anterior, v.unidad)}</>}</div></div>; }
  const metas = c.tipo === 'metas' ? new Map(c.metas.map((m) => [m.metrica, m.meta])) : c.tipo === 'medidor' ? new Map([[c.metrica, c.meta]]) : null;
  return (
    <div className={e.kpis}>{d.forma.valores.map((v) => (
      <div key={v.metrica} className={e.kpi}>
        <span className={e.l}>{etiqueta(cat, v.metrica)}</span>
        <span className={`${e.v} ${e.num}`}>{cifra(v.valor, v.unidad)}</span>
        {metas?.get(v.metrica) !== undefined ? <span className={e.pie}>meta {cifra(metas.get(v.metrica)!, v.unidad)} · {v.valor !== null && v.valor >= metas.get(v.metrica)! ? 'cumplida ✓' : 'por debajo ✗'}</span> : <span className={e.pie}><Delta v={v.variacion} tipo={v.tipoVariacion} /></span>}
      </div>
    ))}</div>
  );
}

function Cuerpo({ c, d, cat, geografia, senales, seleccion, capaReorden, acciones, tabla }: Omit<Props, 'estado'> & { d: DatosComponente; tabla: boolean }) {
  const f = d.forma;
  if (c.tipo === 'senales') return <Ciclo senales={senales} cargando={senales === null} />;
  if (c.tipo === 'nota') return <p>{c.texto}</p>;
  if (c.tipo === 'hallazgo') return <><p>{c.texto}</p><details><summary className={e.pie}>Evidencia ({c.evidencia.length} cifras de consultas de esta vuelta)</summary><ul className={e.pie}>{c.evidencia.map((x, i) => <li key={i}>{x.etiqueta}: {cifra(x.valor, x.unidad)} — {x.consulta}</li>)}</ul></details></>;
  if (f.tipo === 'valores') return <Valores d={d} cat={cat} c={c} />;
  if (c.tipo === 'mapa' && f.tipo === 'filas') return <Mapa geografia={geografia} filas={f.filas} metrica={c.metrica} capaReorden={capaReorden} cat={cat} seleccion={seleccion} senales={c.capas?.includes('senales') ? senales ?? [] : []} onSeleccion={acciones?.selecciona ?? (() => {})} />;
  if (f.tipo === 'filas' && (tabla || c.tipo === 'tabla')) return <TablaDatos filas={f.filas} metricas={f.metricas} dimension={f.dimension} cat={cat} resaltar={c.tipo === 'barras' ? c.resaltar : undefined} />;
  if (f.tipo === 'filas' && c.tipo === 'progreso') {
    const total = f.filas.reduce((s, r) => s + (r.valores[c.metrica] ?? 0), 0);
    return <div className={e.progreso}>{f.filas.map((r) => { const v = r.valores[c.metrica] ?? 0; return <div key={r.clave} className={e.fila}><span>{r.clave} · <b className={e.num}>{cifra(v, unidad(cat, c.metrica))}</b> ({total ? ((100 * v) / total).toFixed(1) : '—'} %)</span><div className={e.barraP}><i style={{ width: `${total ? (100 * v) / total : 0}%` }} /></div></div>; })}</div>;
  }
  if (f.tipo === 'filas') return <Barras filas={f.filas} metrica={f.metricas[0]!} cat={cat} resaltar={c.tipo === 'barras' ? c.resaltar : undefined} titulo={titulo(c, cat)} />;
  if (f.tipo === 'series' && tabla) return <TablaSeries series={f.series} cat={cat} />;
  if (f.tipo === 'series' && c.tipo === 'contabilidad') return <Contabilidad series={f.series} salidas={c.salidas} cat={cat} />;
  if (f.tipo === 'series') return <Linea series={f.series} cat={cat} titulo={titulo(c, cat)} />;
  return <p className={e.aviso}>Sin datos.</p>;
}

export function Tarjeta(p: Props) {
  const [tabla, setTabla] = useState(false);
  const { c, datos, cat, estado, acciones } = p;
  const graficable = ['barras', 'linea', 'tabla', 'actividad', 'cohortes', 'contabilidad'].includes(c.tipo);
  const clase = [e.tarjeta, ANCHO[c.ancho ?? DEFECTO[c.tipo] ?? 'medio'], estado === 'nueva' ? e.nueva : '', estado === 'propuesta' ? e.propuesta : '', c.tipo === 'hallazgo' ? e.hallazgo : ''].join(' ');
  return (
    <section className={clase} aria-label={titulo(c, cat)} data-componente={c.id}>
      <div className={e.cabTarjeta}>
        <h3>{titulo(c, cat)}</h3>
        {acciones && c.tipo === 'barras' && <button type="button" className={e.mini} onClick={() => acciones.cambia(c.id, { tipo: 'linea' })}>Ver en línea</button>}
        {acciones && c.tipo === 'linea' && c.serie && <button type="button" className={e.mini} onClick={() => acciones.cambia(c.id, { tipo: 'barras' })}>Ver en barras</button>}
        {acciones && c.tipo === 'barras' && <button type="button" className={e.mini} onClick={() => acciones.cambia(c.id, { orden: c.orden === 'asc' ? 'desc' : 'asc' })}>Orden {c.orden === 'asc' ? '↑' : '↓'}</button>}
        {graficable && c.tipo !== 'tabla' && <button type="button" className={e.mini} aria-pressed={tabla} onClick={() => setTabla(!tabla)}>Ver tabla</button>}
        {acciones && datos && datos.consultas.length > 0 && <button type="button" className={e.mini} onClick={() => acciones.procedencia(c.id)}>Procedencia</button>}
      </div>
      {datos?.error ? <p className={e.error}>La capa no respondió: {datos.error}</p> : datos || ['senales', 'nota', 'hallazgo'].includes(c.tipo) ? <Cuerpo {...p} d={datos ?? { id: c.id, forma: { tipo: 'vacio' }, consultas: [], advertencias: [], error: null }} tabla={tabla} /> : <p className={e.aviso}>Cargando…</p>}
      {datos && datos.advertencias.map((a) => <p key={a} className={e.advertencia}>{a}</p>)}
      {datos && datos.consultas.length > 0 && <p className={e.pie}>{datos.consultas[0]!.consulta.metricas.join(', ')} · {datos.consultas[0]!.consulta.periodo ? `${datos.consultas[0]!.consulta.periodo.desde}..${datos.consultas[0]!.consulta.periodo.hasta}` : 'todo el periodo'}{datos.consultas.some((q) => q.desdeCache) ? ' · caché' : ''}</p>}
    </section>
  );
}
