'use client';

/**
 * Consultas frecuentes POR REGLAS: la lista de la persona, pregunta por voz o texto, respuesta
 * por voz EN FLUJO (empieza a sonar con la primera frase) y manos libres con interrupcion.
 */
import { useState } from 'react';
import { useConversacion } from '../../hooks/use-conversacion.ts';
import { parseaFaq, respondeFaq, type RespuestaFaq } from '../../services/faq.ts';
import { FAQ_MUESTRA } from '../../services/muestras.ts';
import { ConversacionVoz } from '../conversacion-voz.tsx';
import { EntradaAudio } from '../entrada-audio.tsx';
import { Aviso, Boton, claseEntrada, Ocupado } from '../ui.tsx';

const SIN_RESPUESTA = 'No tengo esa respuesta en mi lista. ¿Puedes preguntarlo de otra forma?';

export function PanelFaq({ token }: { token: string | undefined }) {
  const [lista, setLista] = useState(FAQ_MUESTRA);
  const [pregunta, setPregunta] = useState('');
  const [respuesta, setRespuesta] = useState<RespuestaFaq | undefined>(undefined);
  const entradas = parseaFaq(lista);

  const calcula = (p: string): string => {
    const r = respondeFaq(p, entradas);
    setPregunta(p);
    setRespuesta(r);
    return r.mejor ? r.mejor.entrada.respuesta : SIN_RESPUESTA;
  };
  const conversacion = useConversacion({ token, responde: calcula });
  const { stt } = conversacion;

  const responde = (p: string) => {
    const texto = calcula(p);
    if (token) void conversacion.di(texto);
  };

  return (
    <div className="space-y-3" data-prueba="panel-faq">
      <label className="block text-sm">
        <span className="text-xs font-medium text-neutral-500">Tus preguntas y respuestas (una por línea: pregunta | respuesta)</span>
        <textarea value={lista} onChange={(e) => setLista(e.target.value)} rows={5} className={`${claseEntrada} mt-1 font-mono text-xs`} />
      </label>
      <p className="text-xs text-neutral-500">{entradas.length} entradas entendidas.</p>
      <ConversacionVoz conversacion={conversacion} />
      <EntradaAudio token={token} ocupado={stt.ocupado} alAudio={(a) => void stt.corre(a, { modo: 'rapido' }).then((r) => { if (r?.texto) responde(r.texto); })} />
      {stt.ocupado ? <Ocupado texto="Escuchando tu pregunta…" /> : null}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (pregunta.trim()) responde(pregunta.trim()); }}>
        <input value={pregunta} onChange={(e) => setPregunta(e.target.value)} placeholder="o escribe la pregunta: ¿a qué hora atienden?" className={claseEntrada} data-prueba="pregunta" />
        <Boton type="submit" variante="primario">Preguntar</Boton>
      </form>
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
        </div>
      ) : null}
      <Aviso tipo="honesto">Compara palabras, no significado: «¿cuándo abren?» no se parece a «horario de atención» si no comparten palabras. Un modelo de lenguaje aquí sería una puerta humana.</Aviso>
    </div>
  );
}
