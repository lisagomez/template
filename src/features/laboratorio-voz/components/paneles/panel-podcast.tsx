'use client';

/** Postproduccion: silencios recortables (por el detector de voz), capitulos por pausas y transcripcion con hablantes. Propone, no corta. */
import { useState } from 'react';
import { useTranscripcion } from '../../hooks/use-transcripcion.ts';
import { pausasEntre } from '../../services/competencias.ts';
import { PODCAST_MUESTRA } from '../../services/muestras.ts';
import { formateaMs } from '../../services/texto.ts';
import { EntradaAudio } from '../entrada-audio.tsx';
import { Aviso, Metrica, Ocupado } from '../ui.tsx';
import { ListaSegmentos } from './segmentos-ui.tsx';

export function PanelPodcast({ token }: { token: string | undefined }) {
  const stt = useTranscripcion(token);
  const [hablantes, setHablantes] = useState(2);
  const segmentos = stt.resultado?.segmentos ?? [];
  const silencios = pausasEntre(segmentos, 700);
  const capitulos = pausasEntre(segmentos, 2_500);
  const recortable = silencios.reduce((s, p) => s + Math.max(0, p.ms - 300), 0);
  return (
    <div className="space-y-3" data-prueba="panel-podcast">
      <label className="flex items-center gap-2 text-sm">
        Personas que hablan:
        <input type="number" min={1} max={6} value={hablantes} onChange={(e) => setHablantes(Number(e.target.value) || 1)} className="w-16 rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900" />
      </label>
      <EntradaAudio token={token} ocupado={stt.ocupado} muestra={{ guion: PODCAST_MUESTRA.map((l) => ({ canal: l.lado === 'agente' ? 'izquierdo' : 'derecho', texto: l.texto })), formato: 'mono', nombre: 'episodio de muestra (dos voces sintéticas en una pista)' }} alAudio={(a) => void stt.corre(a, { modo: 'tiempos', hablantes })} />
      {stt.ocupado ? <Ocupado texto="Detectando voz, separando hablantes y transcribiendo… (cerca de un minuto por cada veinte de audio)" /> : null}
      {stt.error ? <Aviso tipo="error">{stt.error}</Aviso> : null}
      {stt.resultado ? (
        <>
          <div className="grid gap-2 sm:grid-cols-4">
            <Metrica nombre="Duración" valor={`${stt.resultado.segundosAudio} s`} />
            <Metrica nombre="Silencios > 0,7 s" valor={silencios.length} />
            <Metrica nombre="Recortable" valor={`${(recortable / 1000).toFixed(1)} s`} pista="dejando 0,3 s en cada uno" />
            <Metrica nombre="Capítulos (pausas > 2,5 s)" valor={capitulos.length + 1} />
          </div>
          {silencios.length > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer">Silencios detectados</summary>
              <ul className="mt-1 space-y-0.5 font-mono text-xs">
                {silencios.map((p) => (
                  <li key={p.inicioMs}>{formateaMs(p.inicioMs)} → {formateaMs(p.finMs)} · {(p.ms / 1000).toFixed(1)} s</li>
                ))}
              </ul>
            </details>
          ) : null}
          <ListaSegmentos segmentos={segmentos} />
          <Aviso tipo="honesto">Esto propone cortes; no toca el archivo. Los capítulos salen de pausas largas, no de entender el tema.</Aviso>
        </>
      ) : null}
    </div>
  );
}
