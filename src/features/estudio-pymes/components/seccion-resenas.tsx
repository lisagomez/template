'use client';

/** Reseñas: temas con citas, respuestas para aprobar UNA POR UNA (las publicas tú) y quién se calló. */
import { useState } from 'react';
import { Boton } from '@/features/laboratorio-voz/components/ui';
import { formatoPesosRedondo } from '../../../../tools/pymes-marketing/dist/index.js';
import { cita, type BorradorDeRespuesta } from '../../../../tools/pymes-marketing/dist/resenas/index.js';
import { useEstudio } from '../store/estudio.ts';
import { AreaDeTexto, Copiar, Lista, Pastilla } from './ui-estudio.tsx';

const TONO = { borrador: 'neutro', aprobada: 'bien', omitida: 'sin', retenida: 'problema', escalada: 'problema', 'ya-respondida': 'sin' } as const;

function Respuesta({ b, i }: { b: BorradorDeRespuesta; i: number }) {
  const decide = useEstudio((s) => s.decideRespuesta);
  const [texto, setTexto] = useState(b.texto ?? '');
  return (
    <div className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800" data-prueba="borrador-respuesta" data-estado={b.estado}>
      <p className="text-neutral-700 dark:text-neutral-300">{cita(b.resena)} · <span className="text-xs">{b.resena.autor}</span></p>
      <div className="my-2 flex items-center gap-2"><Pastilla tono={TONO[b.estado]}>{b.estado === 'aprobada' ? 'aprobada: la publicas tú' : b.estado}</Pastilla>{b.motivo ? <span className="text-xs text-neutral-500">{b.motivo}</span> : null}</div>
      {b.texto !== null ? (
        <>
          <AreaDeTexto valor={texto} cambia={setTexto} filas={6} mono={false} />
          <p className="text-xs text-neutral-500">{texto.split(/\s+/).filter(Boolean).length} palabras (menos de 60) · {b.avisos.join(' · ')}</p>
          <div className="mt-2 flex gap-2"><Boton onClick={() => decide(i, 'aprobada', texto)} disabled={b.estado !== 'borrador'}>Aprobar</Boton><Boton variante="suave" onClick={() => decide(i, 'omitida')} disabled={b.estado !== 'borrador'}>Omitir</Boton><Copiar texto={texto} /></div>
        </>
      ) : null}
    </div>
  );
}

export function SeccionResenas() {
  const { analisis, avisosResenas, cargaResenas } = useEstudio();
  const [texto, setTexto] = useState('');
  return (
    <div className="space-y-4">
      <AreaDeTexto valor={texto} cambia={setTexto} filas={5} marcador={'Pega tus reseñas (una por bloque) o el CSV exportado.\nMaría López · ★★☆☆☆ · 12/09/2026 · Google\nEl pan llegó frío.'} />
      <Boton variante="primario" onClick={() => void cargaResenas(texto)} disabled={!texto.trim()}>Leer reseñas</Boton>
      {analisis ? (
        <div className="space-y-4" data-prueba="analisis-resenas">
          <Lista titulo="Lo que no pude leer" elementos={avisosResenas} />
          <div className="flex flex-wrap gap-2 text-sm">{analisis.calificaciones.map((c) => <Pastilla key={c.plataforma}>{c.plataforma}: {c.promedio ?? '—'} ({c.resenas}){c.cambio !== null ? ` ${c.cambio >= 0 ? '+' : ''}${c.cambio}` : ''}</Pastilla>)}<span className="text-xs text-neutral-500">Cada plataforma por separado: no se promedian.</span></div>
          <table className="text-sm"><tbody>{analisis.fuentes.map((f) => <tr key={f.nombre}><td className="pr-4">{f.nombre}</td><td className="tabular-nums">{f.cuantas ?? '—'}</td><td className="pl-3 text-xs text-neutral-500">{f.nota}</td></tr>)}</tbody></table>
          <div className="grid gap-3 md:grid-cols-2">{analisis.temas.map((t) => <Lista key={t.id} titulo={`${t.etiqueta}: ${t.conteo} (${t.quejas} quejas)`} elementos={t.citas} />)}</div>
          <p className="font-semibold">Respuestas: se aprueban una por una y las publicas tú</p>
          <div className="grid gap-2">{analisis.borradores.map((b, i) => <Respuesta key={b.resena.id} b={b} i={i} />)}</div>
          <Lista titulo="Clientes que se callaron (dime qué puedes ofrecerles; aquí no se les escribe)" elementos={analisis.callados.map((c) => `${c.alias}: ${c.compras} compras, ${formatoPesosRedondo(c.gastoCentavos)}, ${c.diasSinComprar} días sin comprar (su ritmo: cada ${c.intervaloNormal} días)${c.estimacion ? ' — estimación' : ''}`)} />
          <Lista titulo="Haz estas cosas esta semana" elementos={analisis.tresCosas.map((a) => `${a.titulo} — ${a.porque}`)} />
        </div>
      ) : null}
    </div>
  );
}
