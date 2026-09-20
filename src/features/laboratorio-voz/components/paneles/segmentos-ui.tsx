'use client';

/** Lista de turnos con tiempo, hablante y texto; con buscador y capitulos por pausa larga. */
import { useState } from 'react';
import { pausasEntre } from '../../services/competencias.ts';
import { formateaMs, normaliza } from '../../services/texto.ts';
import type { Segmento } from '../../types/index.ts';
import { claseEntrada } from '../ui.tsx';

const COLORES = ['text-sky-700 dark:text-sky-300', 'text-rose-700 dark:text-rose-300', 'text-emerald-700 dark:text-emerald-300', 'text-violet-700 dark:text-violet-300', 'text-amber-700 dark:text-amber-300', 'text-teal-700 dark:text-teal-300'];

export function ListaSegmentos({ segmentos, conBuscador = false, conCapitulos = false }: { segmentos: Segmento[]; conBuscador?: boolean; conCapitulos?: boolean }) {
  const [busca, setBusca] = useState('');
  const hablantes = [...new Set(segmentos.map((s) => s.hablante))];
  const inicioCapitulo = new Set(conCapitulos ? pausasEntre(segmentos, 2_500).map((p) => p.finMs) : []);
  const filtro = normaliza(busca);
  const visibles = filtro ? segmentos.filter((s) => normaliza(s.texto).includes(filtro)) : segmentos;
  const numeroCapitulo = new Map<number, number>();
  if (conCapitulos) {
    let n = 0;
    for (const s of segmentos) if (s === segmentos[0] || inicioCapitulo.has(s.inicioMs)) numeroCapitulo.set(s.inicioMs, ++n);
  }
  return (
    <div className="space-y-2" data-prueba="segmentos">
      {conBuscador ? <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar una palabra en los apuntes…" className={claseEntrada} /> : null}
      <ol className="max-h-96 space-y-1 overflow-auto rounded-lg border border-neutral-200 p-2 text-sm dark:border-neutral-800">
        {visibles.map((s) => {
          const capitulo = numeroCapitulo.get(s.inicioMs);
          return (
            <li key={`${s.inicioMs}-${s.hablante}`}>
              {capitulo !== undefined ? <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Capítulo {capitulo} · {formateaMs(s.inicioMs)}</p> : null}
              <span className="font-mono text-xs text-neutral-400">{formateaMs(s.inicioMs)}</span>{' '}
              {hablantes.length > 1 ? <span className={`text-xs font-semibold ${COLORES[hablantes.indexOf(s.hablante) % COLORES.length]}`}>{s.hablante}: </span> : null}
              <span>{s.texto || <em className="text-neutral-400">(sin texto)</em>}</span>
            </li>
          );
        })}
        {visibles.length === 0 ? <li className="text-neutral-400">Nada coincide.</li> : null}
      </ol>
    </div>
  );
}
