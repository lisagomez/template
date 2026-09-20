'use client';

/** Sentimiento POR REGLAS: tono por frase con las palabras que pesaron. Se puede dictar el texto. */
import { useState } from 'react';
import { useTranscripcion } from '../../hooks/use-transcripcion.ts';
import { SENTIMIENTO_MUESTRA } from '../../services/muestras.ts';
import { analizaSentimiento, type Tono } from '../../services/sentimiento.ts';
import { EntradaAudio } from '../entrada-audio.tsx';
import { Aviso, claseEntrada, Metrica, Ocupado } from '../ui.tsx';

const ESTILO: Record<Tono, string> = {
  positivo: 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950',
  neutro: 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950',
  negativo: 'border-red-300 bg-red-50 dark:bg-red-950',
};

export function PanelSentimiento({ token }: { token: string | undefined }) {
  const [texto, setTexto] = useState(SENTIMIENTO_MUESTRA);
  const stt = useTranscripcion(token);
  const r = analizaSentimiento(texto);
  return (
    <div className="space-y-3" data-prueba="panel-sentimiento">
      <EntradaAudio token={token} ocupado={stt.ocupado} alAudio={(a) => void stt.corre(a, { modo: 'rapido' }).then((x) => { if (x?.texto) setTexto(x.texto); })} />
      {stt.ocupado ? <Ocupado texto="Transcribiendo…" /> : null}
      {stt.error ? <Aviso tipo="error">{stt.error}</Aviso> : null}
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} className={claseEntrada} />
      <div className="grid gap-2 sm:grid-cols-4">
        <Metrica nombre="Tono global" valor={r.global.tono} />
        <Metrica nombre="Puntaje" valor={r.global.puntaje} pista="suma de pesos" />
        <Metrica nombre="Frases positivas" valor={r.global.positivas} />
        <Metrica nombre="Frases negativas" valor={r.global.negativas} />
      </div>
      <ul className="space-y-1" data-prueba="frases">
        {r.frases.map((f) => (
          <li key={f.texto} className={`rounded-lg border px-3 py-2 text-sm ${ESTILO[f.tono]}`}>
            <span className="mr-2 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase dark:bg-black/30">{f.tono} {f.puntaje > 0 ? `+${f.puntaje}` : f.puntaje}</span>
            {f.texto}
            {f.palabras.length > 0 ? <p className="mt-1 text-xs text-neutral-500">pesaron: {f.palabras.map((p) => `${p.palabra} (${p.peso > 0 ? '+' : ''}${p.peso})`).join(', ')}</p> : <p className="mt-1 text-xs text-neutral-400">ninguna palabra del diccionario</p>}
          </li>
        ))}
      </ul>
      <Aviso tipo="honesto">Es un diccionario de palabras, no inteligencia: no entiende contexto ni ironía. «Qué maravilla, otra vez tarde» le sale positivo.</Aviso>
    </div>
  );
}
