'use client';

/** Consultas frecuentes POR REGLAS: la lista de la persona, pregunta por voz o texto, respuesta por voz. */
import { useState } from 'react';
import { useTranscripcion } from '../../hooks/use-transcripcion.ts';
import { sintetizaVoz } from '../../services/cliente.ts';
import { parseaFaq, respondeFaq, type RespuestaFaq } from '../../services/faq.ts';
import { FAQ_MUESTRA } from '../../services/muestras.ts';
import { EntradaAudio } from '../entrada-audio.tsx';
import { Aviso, Boton, claseEntrada, Ocupado, Reproductor } from '../ui.tsx';

export function PanelFaq({ token }: { token: string | undefined }) {
  const [lista, setLista] = useState(FAQ_MUESTRA);
  const [pregunta, setPregunta] = useState('');
  const [respuesta, setRespuesta] = useState<RespuestaFaq | undefined>(undefined);
  const [audio, setAudio] = useState<Blob | undefined>(undefined);
  const [hablando, setHablando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const stt = useTranscripcion(token);
  const entradas = parseaFaq(lista);

  const responde = async (p: string) => {
    const r = respondeFaq(p, entradas);
    setPregunta(p);
    setRespuesta(r);
    setAudio(undefined);
    if (!token) return;
    setHablando(true);
    try {
      const { audio: a } = await sintetizaVoz(token, r.mejor ? r.mejor.entrada.respuesta : 'No tengo esa respuesta en mi lista. ¿Puedes preguntarlo de otra forma?', undefined, 1);
      setAudio(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'no se pudo generar la voz');
    } finally {
      setHablando(false);
    }
  };

  return (
    <div className="space-y-3" data-prueba="panel-faq">
      <label className="block text-sm">
        <span className="text-xs font-medium text-neutral-500">Tus preguntas y respuestas (una por línea: pregunta | respuesta)</span>
        <textarea value={lista} onChange={(e) => setLista(e.target.value)} rows={5} className={`${claseEntrada} mt-1 font-mono text-xs`} />
      </label>
      <p className="text-xs text-neutral-500">{entradas.length} entradas entendidas.</p>
      <EntradaAudio token={token} ocupado={stt.ocupado} alAudio={(a) => void stt.corre(a, { modo: 'rapido' }).then((r) => { if (r?.texto) void responde(r.texto); })} />
      {stt.ocupado ? <Ocupado texto="Escuchando tu pregunta…" /> : null}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (pregunta.trim()) void responde(pregunta.trim()); }}>
        <input value={pregunta} onChange={(e) => setPregunta(e.target.value)} placeholder="o escribe la pregunta: ¿a qué hora atienden?" className={claseEntrada} />
        <Boton type="submit" variante="primario">Preguntar</Boton>
      </form>
      {stt.error ? <Aviso tipo="error">{stt.error}</Aviso> : null}
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      {respuesta ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950" data-prueba="respuesta">
          {respuesta.mejor ? (
            <>
              <p className="font-medium">{respuesta.mejor.entrada.respuesta}</p>
              <p className="mt-1 text-xs text-neutral-500">Parecido con «{respuesta.mejor.entrada.pregunta}»: {Math.round(respuesta.mejor.parecido * 100)} % (umbral {Math.round(respuesta.umbral * 100)} %)</p>
            </>
          ) : (
            <p className="font-medium">No tengo esa respuesta en mi lista. (Mejor parecido: {Math.round((respuesta.alternativas[0]?.parecido ?? 0) * 100)} %, por debajo del umbral.)</p>
          )}
          {hablando ? <Ocupado texto="Generando la respuesta en voz…" /> : null}
          <Reproductor audio={audio} etiqueta="Respuesta en voz:" />
        </div>
      ) : null}
      <Aviso tipo="honesto">Compara palabras, no significado: «¿cuándo abren?» no se parece a «horario de atención» si no comparten palabras. Un modelo de lenguaje aquí sería una puerta humana.</Aviso>
    </div>
  );
}
