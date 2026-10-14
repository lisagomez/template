'use client';

/** Anuncios desde tu exportación (el clic lo das tú) y el brief del lunes que junta todo. */
import { useState } from 'react';
import { Boton } from '@/features/laboratorio-voz/components/ui';
import { formatoDinero } from '../../../../tools/pymes-marketing/dist/index.js';
import type { BriefDelLunes } from '../../../../tools/pymes-marketing/dist/pulso/index.js';
import { useEstudio } from '../store/estudio.ts';
import { AreaDeTexto, Lista, Pastilla } from './ui-estudio.tsx';

const TONO = { funciona: 'bien', vigilar: 'revisar', problema: 'problema', 'sin-veredicto': 'sin' } as const;

export function SeccionAnuncios() {
  const { campanas, bloques, monedaAnuncios, avisosAnuncios, cargaAnuncios } = useEstudio();
  const [csv, setCsv] = useState('');
  return (
    <div className="space-y-4">
      <AreaDeTexto valor={csv} cambia={setCsv} filas={4} marcador="Pega la exportación del Administrador de anuncios (por día, 90 días)" />
      <Boton variante="primario" onClick={() => cargaAnuncios(csv)} disabled={!csv.trim()}>Leer anuncios</Boton>
      {campanas ? (
        <div className="space-y-3" data-prueba="anuncios">
          <Lista titulo="Lo que no pude leer" elementos={avisosAnuncios} />
          <table className="w-full text-sm"><tbody>{campanas.map((c) => (
            <tr key={c.nombre} className="border-t border-neutral-100 dark:border-neutral-900"><td className="py-1 pr-2">{c.nombre}</td><td className="tabular-nums">{formatoDinero(c.gasto, monedaAnuncios)}</td><td className="tabular-nums">{c.resultados ?? '—'} resultados</td><td><Pastilla tono={TONO[c.veredicto]}>{c.veredicto}</Pastilla></td><td className="text-xs text-neutral-500">{c.porque}</td></tr>))}</tbody></table>
          <p className="text-xs text-neutral-500">Cada campaña contra su propio promedio, no contra referencias de internet.</p>
          <div className="grid gap-2 md:grid-cols-2">{bloques.map((b) => (
            <div key={b.cambio} className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800">
              <p className="font-semibold">{b.cambio}</p>
              <p className="text-xs">Cuesta hoy: {b.cuestaHoy} · Después: {b.despues}</p>
              <p className="text-xs">Neto: {b.neto} · Reversible: {b.reversible}</p>
              <ol className="mt-1 list-decimal pl-5 text-xs text-neutral-600 dark:text-neutral-400">{b.comoHacerlo.map((p) => <li key={p}>{p}</li>)}</ol>
              <p className="mt-1 text-xs">Vigila: {b.vigilar}</p>
            </div>))}</div>
        </div>
      ) : null}
    </div>
  );
}

function Brief({ b }: { b: BriefDelLunes }) {
  return (
    <div data-prueba="brief-lunes" className="space-y-3 rounded-xl bg-neutral-50 p-4 text-sm dark:bg-neutral-900">
      <p className="text-xs uppercase tracking-widest text-neutral-500">Brief del lunes {b.semana}</p>
      <p className="text-lg font-bold">{b.titular}</p>
      {b.hilo.map((h) => <p key={h} className="italic text-neutral-700 dark:text-neutral-300">{h}</p>)}
      <div className="grid gap-3 md:grid-cols-2">{b.secciones.map((s) => (
        <div key={s.fuente} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800" data-prueba={`lunes-${s.fuente}`} data-estado={s.estado}>
          <p className="mb-1 flex items-center gap-2 font-semibold">{s.titulo} {s.estado === 'sin-datos' ? <Pastilla tono="sin">sin datos</Pastilla> : null}</p>
          {s.estado === 'sin-datos' ? <p className="text-xs text-neutral-500">{s.motivo}</p> : <ul className="list-disc space-y-0.5 pl-4 text-xs">{s.hallazgos.slice(0, 5).map((h) => <li key={h}>{h}</li>)}</ul>}
        </div>))}</div>
      <Lista titulo="Haz estas tres cosas esta semana" elementos={b.acciones.map((a, i) => `${i + 1}. ${a.titulo} — ${a.porque}${a.impacto ? ` (${a.impacto})` : ''}`)} />
      <p className="text-xs text-neutral-500">Fuentes: {b.fuentes}</p>
      {b.colaDeRespuestas ? <p className="text-xs">{b.colaDeRespuestas} respuesta(s) a reseñas esperan tu aprobación en su propia cola.</p> : null}
      <p className="text-xs text-neutral-500">{b.nota}</p>
    </div>
  );
}

export function SeccionLunes() {
  const { lunes, generaLunes, fijaCompetencia, notasCompetencia } = useEstudio();
  const [notas, setNotas] = useState(notasCompetencia);
  return (
    <div className="space-y-3">
      <AreaDeTexto valor={notas} cambia={setNotas} filas={2} marcador="Qué viste de tu competencia: 12/10/2026 · Panadería X · abrió sucursal · observado" />
      <Boton variante="primario" onClick={() => { fijaCompetencia(notas); generaLunes(); }}>Armar el brief del lunes</Boton>
      {lunes ? <Brief b={lunes} /> : null}
    </div>
  );
}
