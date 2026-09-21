'use client';

/**
 * Competencias orales medidas sobre la grabacion de la persona: ritmo, muletillas, pausas, tiempo
 * hablado, con una rubrica ORIENTATIVA por franjas (nunca una nota) y la honestidad de decir
 * cuando las muletillas no son medibles con el motor que transcribio. Adultos: menores solo con
 * la AISIA firmada.
 */
import { useState } from 'react';
import { useTranscripcion } from '../../hooks/use-transcripcion.ts';
import { evaluaCompetencias, REFERENCIA, rubrica, type Franja } from '../../services/competencias.ts';
import { CLASE_MUESTRA } from '../../services/muestras.ts';
import { formateaMs } from '../../services/texto.ts';
import { EntradaAudio } from '../entrada-audio.tsx';
import { Aviso, Metrica, Ocupado } from '../ui.tsx';
import { ListaSegmentos } from './segmentos-ui.tsx';

const COLOR: Record<Franja | 'no-medible', string> = {
  'en-rango': 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  bajo: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200',
  alto: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200',
  'no-medible': 'border-neutral-300 bg-neutral-100 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300',
};
const ETIQUETA: Record<Franja | 'no-medible', string> = { 'en-rango': 'en rango', bajo: 'bajo', alto: 'alto', 'no-medible': 'no medible' };

export function PanelCompetencias({ token }: { token: string | undefined }) {
  const stt = useTranscripcion(token);
  const [segundoMotor, setSegundoMotor] = useState(false);
  const segmentos = stt.resultado?.segmentos ?? [];
  const c = segmentos.length > 0 ? evaluaCompetencias(segmentos, (stt.resultado?.segundosAudio ?? 0) * 1000, stt.resultado?.motor) : undefined;
  const r = c ? rubrica(c) : undefined;
  return (
    <div className="space-y-3" data-prueba="panel-competencias">
      <Aviso tipo="honesto">Para adultos que se evalúan a sí mismos. Con menores no se usa hasta que una persona firme la evaluación de impacto (borrador listo): el daño recae sobre quien no firma.</Aviso>
      <label className="flex items-center gap-2 text-sm" data-prueba="segundo-motor">
        <input type="checkbox" checked={segundoMotor} onChange={(e) => setSegundoMotor(e.target.checked)} />
        Medir muletillas con el segundo motor (el único que las conserva, medido; tarda más)
      </label>
      <EntradaAudio token={token} ocupado={stt.ocupado} muestra={{ texto: CLASE_MUESTRA, nombre: 'exposición de muestra leída por la voz sintética' }} alAudio={(a) => void stt.corre(a, { modo: 'tiempos', hablantes: 1, ...(segundoMotor ? { motor: 'respaldo' as const } : {}) })} />
      {stt.ocupado ? <Ocupado texto={segundoMotor ? 'Transcribiendo con el segundo motor (más lento)…' : 'Transcribiendo con tiempos…'} /> : null}
      {stt.error ? <Aviso tipo="error">{stt.error}</Aviso> : null}
      {c && r ? (
        <>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6" data-prueba="metricas">
            <Metrica nombre="Palabras" valor={c.palabras} />
            <Metrica nombre="Palabras / min" valor={c.palabrasPorMinuto} pista={REFERENCIA.palabrasPorMinuto} />
            <Metrica nombre="Tiempo hablado" valor={`${c.segundosHabla} s de ${c.segundosTotales} s`} pista={`${Math.round(c.ratioHabla * 100)} %`} />
            <Metrica nombre="Muletillas / min" valor={c.medicionMuletillas === 'no-medible' ? 'no medible' : c.muletillasPorMinuto} pista={c.medicionMuletillas === 'no-medible' ? 'el motor tiende a omitirlas' : REFERENCIA.muletillasPorMinuto} />
            <Metrica nombre="Pausas > 1,5 s" valor={c.pausasLargas.length} pista={REFERENCIA.pausasLargas} />
            <Metrica nombre="Frase más larga" valor={`${c.fraseMasLarga} palabras`} />
          </div>
          <div className="space-y-1" data-prueba="rubrica" data-json={JSON.stringify({ ritmo: r.ritmo.franja, muletillas: r.muletillas.franja, pausas: r.pausas.franja, tiempoHablado: r.tiempoHablado.franja, medicionMuletillas: c.medicionMuletillas })}>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Rúbrica orientativa (no es una calificación)</p>
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {([['Ritmo', r.ritmo], ['Muletillas', r.muletillas], ['Pausas', r.pausas], ['Tiempo hablado', r.tiempoHablado]] as const).map(([nombre, f]) => (
                <li key={nombre} className={`rounded-lg border px-3 py-2 ${COLOR[f.franja]}`}>
                  <span className="font-medium">{nombre}: {ETIQUETA[f.franja]}.</span> {f.texto}
                </li>
              ))}
            </ul>
            <p className="text-xs text-neutral-500">{r.aviso}</p>
          </div>
          {c.medicionMuletillas === 'no-medible' ? (
            <Aviso tipo="honesto">Muletillas no medibles: medido el 2026-09-20 contra guiones con muletillas escritas, el motor que transcribió las omite en su mayoría. Contarlas sobre su salida daría una cifra baja por diseño, no por mérito. Lo que sí es fiable aquí: ritmo, pausas y tiempo hablado.</Aviso>
          ) : c.muletillas.length > 0 ? (
            <p className="text-sm">Muletillas encontradas: {c.muletillas.map((m) => `«${m.palabra}» ×${m.veces}`).join(', ')}</p>
          ) : (
            <p className="text-sm text-neutral-500">Sin muletillas de la lista.</p>
          )}
          {c.pausasLargas.length > 0 ? <p className="text-xs text-neutral-500">Pausas largas en: {c.pausasLargas.map((p) => `${formateaMs(p.inicioMs)} (${(p.ms / 1000).toFixed(1)} s)`).join(', ')}</p> : null}
          <ListaSegmentos segmentos={segmentos} />
          <Aviso tipo="honesto">Mide, no juzga. Los rangos son de una exposición clara para adultos; la voz sintética de la muestra no titubea, para eso graba tú.</Aviso>
        </>
      ) : null}
    </div>
  );
}
