'use client';

/**
 * Quien habla y que paso: la llamada o la reunion entra (muestra a dos voces, grabacion propia o
 * texto pegado), se separan las voces, se dice de que lado esta cada una y el cerebro de asesoria
 * (sin LLM) devuelve hallazgos con evidencia, puntaje con desglose, acciones y riesgos.
 */
import { useMemo, useState } from 'react';
import { useTranscripcion } from '../../hooks/use-transcripcion.ts';
import { analizaTurnos, hablantesDe, segmentosDesdeTexto, TIPOS_REUNION, type AnalisisReunion, type Lado, type TipoReunion } from '../../services/asesor.ts';
import { LLAMADA_MUESTRA } from '../../services/muestras.ts';
import type { Segmento } from '../../types/index.ts';
import { EntradaAudio } from '../entrada-audio.tsx';
import { Aviso, Boton, claseEntrada, Ocupado } from '../ui.tsx';
import { ResultadoAsesor } from './resultado-asesor.tsx';
import { ListaSegmentos } from './segmentos-ui.tsx';

type Entrada = 'llamada' | 'reunion' | 'texto';

export function PanelReunion({ token, entradaInicial = 'llamada', enfoque = 'insights' }: { token: string | undefined; entradaInicial?: Entrada; enfoque?: 'insights' | 'score' | 'turnos' | 'playbook' }) {
  const [entrada, setEntrada] = useState<Entrada>(entradaInicial);
  const [hablantes, setHablantes] = useState(2);
  const [texto, setTexto] = useState(LLAMADA_MUESTRA.map((l) => `${l.lado === 'agente' ? 'Ana' : 'Luis'}: ${l.texto}`).join('\n'));
  const [segmentosTexto, setSegmentosTexto] = useState<Segmento[] | undefined>(undefined);
  const [lados, setLados] = useState<Record<string, Lado>>({});
  const [tipo, setTipo] = useState<TipoReunion>('discovery');
  const stt = useTranscripcion(token);

  const segmentos = entrada === 'texto' ? segmentosTexto : stt.resultado?.segmentos;
  const nombres = useMemo(() => hablantesDe(segmentos ?? []), [segmentos]);
  const ladoDe = (h: string): Lado => lados[h] ?? (/agente|ana|asesor/i.test(h) || nombres.indexOf(h) === 0 ? 'interno' : 'cliente');
  const analisis: AnalisisReunion | undefined = useMemo(() => {
    if (!segmentos || segmentos.length === 0) return undefined;
    return analizaTurnos(segmentos, Object.fromEntries(nombres.map((n) => [n, ladoDe(n)])), tipo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentos, lados, tipo, nombres]);

  const guion = LLAMADA_MUESTRA.map((l) => ({ canal: l.lado === 'agente' ? ('izquierdo' as const) : ('derecho' as const), texto: l.texto }));

  return (
    <div className="space-y-3" data-prueba="panel-reunion">
      <div className="flex flex-wrap gap-1 rounded-full border border-neutral-300 p-1 text-sm dark:border-neutral-700">
        {([['llamada', 'Llamada a dos canales'], ['reunion', 'Una pista, varias voces'], ['texto', 'Pegar transcripción']] as Array<[Entrada, string]>).map(([v, n]) => (
          <button key={v} type="button" onClick={() => setEntrada(v)} className={`rounded-full px-3 py-1 ${entrada === v ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900' : ''}`}>{n}</button>
        ))}
      </div>
      {entrada === 'llamada' ? (
        <>
          <p className="text-xs text-neutral-500">Como una llamada grabada: agente en el canal izquierdo, cliente en el derecho. Cada canal se transcribe por su lado: no hace falta adivinar quién habla.</p>
          <EntradaAudio token={token} ocupado={stt.ocupado} muestra={{ guion, formato: 'estereo', nombre: 'llamada de muestra (dos voces sintéticas, una por canal)' }} alAudio={(a) => void stt.corre(a, { modo: 'canales', etiquetas: ['Agente', 'Cliente'] })} />
        </>
      ) : null}
      {entrada === 'reunion' ? (
        <>
          <label className="flex items-center gap-2 text-sm">
            Personas que hablan (si lo sabes):
            <input type="number" min={1} max={8} value={hablantes} onChange={(e) => setHablantes(Number(e.target.value) || 2)} className="w-16 rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900" />
          </label>
          <EntradaAudio token={token} ocupado={stt.ocupado} muestra={{ guion, formato: 'mono', nombre: 'reunión de muestra (dos voces sintéticas en una pista)' }} alAudio={(a) => void stt.corre(a, { modo: 'tiempos', hablantes })} />
        </>
      ) : null}
      {entrada === 'texto' ? (
        <>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={6} className={`${claseEntrada} text-xs`} placeholder="Nombre: lo que dijo, una línea por turno" />
          <Boton variante="primario" onClick={() => setSegmentosTexto(segmentosDesdeTexto(texto))}>Analizar el texto</Boton>
        </>
      ) : null}
      {stt.ocupado ? <Ocupado texto={entrada === 'llamada' ? 'Separando canales y transcribiendo cada uno…' : 'Detectando voz, separando hablantes y transcribiendo…'} /> : null}
      {stt.error ? <Aviso tipo="error">{stt.error}</Aviso> : null}
      {segmentos && segmentos.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-xs text-neutral-500">De qué lado está cada voz:</span>
            {nombres.map((n) => (
              <label key={n} className="flex items-center gap-1">
                <span className="font-medium">{n}</span>
                <select value={ladoDe(n)} onChange={(e) => setLados((l) => ({ ...l, [n]: e.target.value as Lado }))} className="rounded border border-neutral-300 px-1 py-0.5 text-xs dark:border-neutral-700 dark:bg-neutral-900">
                  <option value="interno">asesor / agente</option>
                  <option value="cliente">cliente</option>
                </select>
              </label>
            ))}
            <label className="ml-auto flex items-center gap-1">
              <span className="text-xs text-neutral-500">Tipo de reunión</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoReunion)} className="rounded border border-neutral-300 px-1 py-0.5 text-xs dark:border-neutral-700 dark:bg-neutral-900">
                {TIPOS_REUNION.map((t) => (
                  <option key={t.valor} value={t.valor}>{t.nombre}</option>
                ))}
              </select>
            </label>
          </div>
          <ListaSegmentos segmentos={segmentos} />
          {analisis ? <ResultadoAsesor analisis={analisis} segmentos={segmentos} enfoque={enfoque} /> : null}
        </>
      ) : null}
    </div>
  );
}
