'use client';
/**
 * El panel de contexto: la procedencia de un componente (definición de la capa, dueño, filtros que aplicaron y los
 * que no, SQL que compiló MetricFlow), las versiones (volver, fijar la oficial, comparar dos: componentes y cifras),
 * la especificación tal cual y el catálogo.
 */
import { useState } from 'react';
import type { Comparacion, Dashboard, DatosComponente, Definicion, Estado, MetricaListada } from '../types';
import { cifra, etiqueta } from '../services/formato';
import e from './estudio.module.css';

export type Pestana = 'procedencia' | 'versiones' | 'especificacion' | 'catalogo';
interface Props {
  readonly pestana: Pestana;
  readonly onPestana: (p: Pestana) => void;
  readonly estado: Estado;
  readonly procedencia: { readonly id: string; readonly datos: DatosComponente; readonly definiciones: readonly Definicion[] } | null;
  readonly especificacion: Dashboard;
  readonly onVolver: (n: number) => void;
  readonly onOficial: (n: number) => void;
  readonly onComparar: (a: number, b: number) => Promise<Comparacion>;
}

const filtroTexto = (f: { dimension: string; operador: string; valores: readonly unknown[] }) => `${f.dimension} ${f.operador} ${f.valores.join(', ')}`;

function Procedencia({ p, cat }: { p: Props['procedencia']; cat: readonly MetricaListada[] }) {
  if (!p) return <p className={e.aviso}>Elige «Procedencia» en un componente para ver de dónde sale cada cifra.</p>;
  const q = p.datos.consultas;
  return (
    <div className={e.definicion}>
      <h3 style={{ margin: 0, fontSize: 15 }}>Componente «{p.id}»</h3>
      {p.definiciones.map((d) => (
        <dl key={d.nombre} className={e.definicion}>
          <dt>Métrica</dt><dd><b>{d.etiqueta}</b> (<code>{d.nombre}</code>) · {d.tipo}</dd>
          <dt>Definición</dt><dd>{d.descripcion || 'sin descripción en la capa'}</dd>
          <dt>Fórmula</dt><dd><code>{d.formula}</code>{d.filtro.length ? <> · filtro <code>{d.filtro.join(' y ')}</code></> : null}</dd>
          <dt>Dueño · unidad</dt><dd>{d.dueno ?? 'sin dueño declarado'} · {d.unidad || '—'}</dd>
          {d.advertencias.length > 0 && <><dt>Advertencias</dt><dd className={e.advertencia}>{d.advertencias.join('; ')}</dd></>}
        </dl>
      ))}
      <dl className={e.definicion}>
      <dt>Filtros aplicados</dt>
      <dd>{[...new Set(q.flatMap((x) => (x.consulta.filtros ?? []).map(filtroTexto)))].join(' · ') || 'ninguno'}</dd>
      {p.datos.advertencias.length > 0 && <><dt>Filtros que no aplican</dt><dd className={e.advertencia}>{p.datos.advertencias.join(' · ')}</dd></>}
      <dt>Periodo</dt><dd>{[...new Set(q.map((x) => (x.consulta.periodo ? `${x.consulta.periodo.desde}..${x.consulta.periodo.hasta}` : 'todo')))].join(' · ')}</dd>
      </dl>
      <h4 style={{ margin: '6px 0 0', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em' }}>Consultas ({q.length}) · SQL compilado por la capa</h4>
      {q.map((x, i) => (
        <details key={i} open={i === 0}>
          <summary className={e.pie}>{x.consulta.metricas.map((m) => etiqueta(cat, m)).join(', ')}{x.consulta.agrupar?.length ? ` por ${x.consulta.agrupar.join(', ')}` : ''} · {x.ms.toFixed(0)} ms{x.desdeCache ? ' (caché)' : ''}</summary>
          <pre className={e.sql} tabIndex={0} aria-label={`SQL compilado de la consulta ${i + 1}`}>{x.sql ?? '— la capa no expone SQL —'}</pre>
        </details>
      ))}
    </div>
  );
}

function Versiones({ estado, onVolver, onOficial, onComparar }: Pick<Props, 'estado' | 'onVolver' | 'onOficial' | 'onComparar'>) {
  const t = estado.tablero;
  const [elegidas, setElegidas] = useState<number[]>([]);
  const [comp, setComp] = useState<{ a: number; b: number; r: Comparacion } | null>(null);
  const elige = (n: number) => setElegidas((x) => (x.includes(n) ? x.filter((y) => y !== n) : [...x, n].slice(-2)));
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <ol className={e.lista} reversed>
        {[...t.versiones].reverse().map((v) => (
          <li key={v.n} className={v.n === t.version ? e.actual : undefined}>
            <span className={e.pie}>v{v.n} · {v.autor}{v.n === t.version ? ' · actual' : ''}{v.n === t.oficial ? ' · OFICIAL' : ''}</span>
            <span>{v.instruccion ? `«${v.instruccion}»` : v.resumen}</span>
            <div className={e.acciones}>
              <label className={e.pie}><input type="checkbox" checked={elegidas.includes(v.n)} onChange={() => elige(v.n)} /> comparar</label>
              {v.n !== t.version && <button type="button" className={e.mini} onClick={() => onVolver(v.n)}>Volver a esta</button>}
              {v.n !== t.oficial && <button type="button" className={e.mini} onClick={() => onOficial(v.n)}>Fijar oficial</button>}
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className={e.boton} disabled={elegidas.length !== 2} onClick={async () => { const [a, b] = [...elegidas].sort((x, y) => x - y) as [number, number]; setComp({ a, b, r: await onComparar(a, b) }); }}>Comparar las dos elegidas</button>
      {comp && <section aria-label="Comparación de versiones" className={e.definicion}>
        <h3 style={{ margin: 0, fontSize: 14 }}>v{comp.a} → v{comp.b}</h3>
        <dl className={e.definicion}>
        <dt>Componentes</dt>
        <dd>{[...comp.r.diferencia.agregados.map((x) => `+ ${x}`), ...comp.r.diferencia.quitados.map((x) => `− ${x}`), ...comp.r.diferencia.cambiados.map((x) => `~ ${x.id} (${x.campos.join(', ')})`), ...comp.r.diferencia.movidos.map((x) => `↕ ${x}`)].join(' · ') || 'iguales'}</dd>
        <dt>Partes globales</dt><dd>{comp.r.diferencia.globales.map((g) => g.campo).join(', ') || 'iguales'}</dd>
        <dt>Cifras que cambiaron ({comp.r.cifras?.length ?? 0})</dt>
        <dd><ul className={e.pie}>{(comp.r.cifras ?? []).slice(0, 14).map((c) => <li key={`${c.componente}${c.clave}`}>{c.componente} · {c.clave}: {cifra(c.antes, '')} → {cifra(c.despues, '')}</li>)}</ul></dd>
        </dl>
      </section>}
    </div>
  );
}

export function Panel(p: Props) {
  const pestanas: [Pestana, string][] = [['procedencia', 'Procedencia'], ['versiones', 'Versiones'], ['especificacion', 'Especificación'], ['catalogo', 'Métricas']];
  return (
    <aside className={e.panel} aria-label="Panel de contexto">
      <div className={e.pestanas} role="tablist" aria-label="Contexto">
        {pestanas.map(([k, t]) => <button key={k} type="button" role="tab" id={`pestana-${k}`} aria-controls={`panel-${k}`} aria-selected={p.pestana === k} onClick={() => p.onPestana(k)}>{t}</button>)}
      </div>
      <div role="tabpanel" id={`panel-${p.pestana}`} aria-labelledby={`pestana-${p.pestana}`}>
        {p.pestana === 'procedencia' && <Procedencia p={p.procedencia} cat={p.estado.catalogo} />}
        {p.pestana === 'versiones' && <Versiones estado={p.estado} onVolver={p.onVolver} onOficial={p.onOficial} onComparar={p.onComparar} />}
        {p.pestana === 'especificacion' && <pre className={e.sql} style={{ maxHeight: '70vh' }} tabIndex={0} aria-label="Especificación del tablero en JSON">{JSON.stringify(p.especificacion, null, 1)}</pre>}
        {p.pestana === 'catalogo' && <ul className={e.lista}>{p.estado.catalogo.map((m) => <li key={m.nombre}><b>{m.etiqueta}</b><code className={e.pie}>{m.nombre} · {m.tipo}{m.unidad ? ` · ${m.unidad}` : ''}{m.dueno ? ` · ${m.dueno}` : ''}</code>{m.descripcion && <span className={e.pie}>{m.descripcion}</span>}</li>)}</ul>}
      </div>
      <p className={e.aviso}>Laboratorio con datos ficticios (Distribuidora Golfo Norte). Toda cifra sale de la capa semántica dbt + MetricFlow; el agente edita la especificación, no dibuja ni escribe SQL.</p>
    </aside>
  );
}
