'use client';
/**
 * El ciclo de growth en cuatro carriles. Detectar y Diagnosticar muestran las tarjetas por su etapa; Actuar es el
 * backlog de experimentos por ICE (métrica guía, guardarraíl, población, duración); Aprender, lo que ya dejó una
 * lección. Cada tarjeta nombra las tiendas a las que se enlaza en el mapa; su texto viene del motor, con cifras que
 * salieron de consultas semánticas.
 */
import type { Senal } from '../types';
import e from './estudio.module.css';

const ESTADO: Record<string, string> = { vigilando: 'Vigilando', hipotesis: 'Hipótesis', experimento: 'Experimento', aprendizaje: 'Aprendizaje' };

function Tarjeta({ s, modo }: { s: Senal; modo: 'senal' | 'experimento' }) {
  return (
    <article className={e.senal} aria-label={s.titulo}>
      <span className={e.etiquetaEstado}>{modo === 'experimento' ? `Experimento · ICE ${s.ice.ice}` : ESTADO[s.estado] ?? s.estado}</span>
      <h5>{s.titulo}</h5>
      {modo === 'senal' ? <>
        <p>{s.evidenciaTexto}</p>
        {s.diagnostico && <p><b>Diagnóstico:</b> {s.diagnostico}</p>}
        <p><b>Hipótesis:</b> {s.hipotesis}</p>
      </> : s.experimento && <dl className={e.definicion}>
        <dt>Experimento</dt><dd>{s.experimento.descripcion}</dd>
        <dt>Métrica guía · guardarraíl</dt><dd>{s.experimento.metricaGuia} · {s.experimento.guardarrail}</dd>
        <dt>Población · duración</dt><dd>{s.experimento.poblacion} · {s.experimento.duracion}</dd>
        <dt>ICE</dt><dd>impacto {s.ice.impacto} · confianza {s.ice.confianza} · facilidad {s.ice.facilidad}</dd>
      </dl>}
      {s.advertencias.length > 0 && <p className={e.advertencia}>{s.advertencias.join(' ')}</p>}
      {s.entidades.length > 0 && <p className={e.pie}>En el mapa: {s.entidades.join(', ')}</p>}
    </article>
  );
}

export function Ciclo({ senales, cargando }: { senales: readonly Senal[] | null; cargando: boolean }) {
  if (!senales) return <p className={e.aviso}>{cargando ? 'El motor está recorriendo frecuencia, retención, valor y riesgo por tienda y origen…' : 'Sin señales todavía.'}</p>;
  const carriles: [string, string, readonly Senal[], 'senal' | 'experimento'][] = [
    ['Detectar', 'cambios que pasan su umbral', senales.filter((s) => s.etapa === 'detectar'), 'senal'],
    ['Diagnosticar', 'causas separadas con consultas', senales.filter((s) => s.etapa === 'diagnosticar'), 'senal'],
    ['Actuar', 'backlog de experimentos por ICE', [...senales].filter((s) => s.experimento).sort((a, b) => b.ice.ice - a.ice.ice), 'experimento'],
    ['Aprender', 'resultados registrados', senales.filter((s) => s.etapa === 'aprender'), 'senal'],
  ];
  return (
    <div className={e.ciclo}>
      {carriles.map(([t, d, ss, modo]) => (
        <section key={t} className={e.carril} aria-label={t}>
          <h4>{t} <span className={e.pie}>· {d}</span></h4>
          {ss.length ? ss.map((s) => <Tarjeta key={`${t}-${s.id}`} s={s} modo={modo} />) : <p className={e.aviso}>Nada aquí.</p>}
        </section>
      ))}
    </div>
  );
}
