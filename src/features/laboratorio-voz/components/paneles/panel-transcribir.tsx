'use client';

/**
 * Hablar y que se escriba: rapido (solo texto) o con tiempos (turnos, buscador, capitulos).
 * El «antes» es el audio que entra; el «despues», el texto con su latencia medida.
 */
import { useEffect, useState } from 'react';
import { cer, wer } from '../../../../../tools/dictado/dist/index.js';
import { useTranscripcion } from '../../hooks/use-transcripcion.ts';
import { useMetricasCaso } from '../../store/metricas.ts';
import { EntradaAudio, type Muestra } from '../entrada-audio.tsx';
import { Aviso, Boton, claseEntrada, Metrica, Ocupado } from '../ui.tsx';
import { ListaSegmentos } from './segmentos-ui.tsx';

const pct = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(1).replace('.', ',')} %` : '—');

export function PanelTranscribir({ token, caso, muestra, conTiempos = false, conCapitulos = false, avisoRuido = false }: { token: string | undefined; caso: number; muestra?: Muestra; conTiempos?: boolean; conCapitulos?: boolean; avisoRuido?: boolean }) {
  const stt = useTranscripcion(token);
  const r = stt.resultado;
  const [referencia, setReferencia] = useState('');
  const registra = useMetricasCaso((s) => s.registra);
  const medida = r?.texto && referencia.trim() ? { wer: wer(referencia, r.texto), cer: cer(referencia, r.texto) } : undefined;
  const werTasa = medida ? Math.round(medida.wer.wer * 1000) / 1000 : null;
  const cerTasa = medida ? Math.round(medida.cer.wer * 1000) / 1000 : null;
  useEffect(() => {
    if (!r?.texto) return;
    registra(caso, { ms: r.ms, msMotor: r.msMotor ?? null, segundosAudio: r.segundosAudio, wer: werTasa, cer: cerTasa });
  }, [r, werTasa, cerTasa, caso, registra]);
  const copia = () => {
    if (r?.texto) void navigator.clipboard.writeText(r.texto).catch(() => undefined);
  };
  return (
    <div className="space-y-3" data-prueba="panel-transcribir">
      <EntradaAudio token={token} muestra={muestra} ocupado={stt.ocupado} alAudio={(a) => void stt.corre(a, { modo: conTiempos ? 'tiempos' : 'rapido', ...(conTiempos ? { hablantes: 1 } : {}) })} />
      {stt.ocupado ? <Ocupado texto={conTiempos ? 'Transcribiendo con tiempos… (cerca de un minuto por cada veinte de audio)' : 'Transcribiendo en esta computadora…'} /> : null}
      {stt.error ? <Aviso tipo="error">{stt.error}</Aviso> : null}
      {r && r.texto ? (
        <div className="space-y-2" data-prueba="resultado">
          <div className="grid gap-2 sm:grid-cols-4">
            <Metrica nombre="Audio" valor={`${r.segundosAudio} s`} />
            <Metrica nombre="Motor" valor={r.msMotor !== undefined ? `${r.msMotor} ms` : '—'} pista="solo el reconocimiento" />
            <Metrica nombre="Total servidor" valor={`${r.ms} ms`} pista={r.via === 'demonio' ? 'motor residente: sin arranque' : 'con arranque del motor y lectura del audio'} />
            <Metrica nombre="Visto desde aquí" valor={stt.msCliente !== undefined ? `${stt.msCliente} ms` : '—'} pista="incluye la red" />
          </div>
          <p className="text-xs text-neutral-500">Después · el texto ({r.motor})</p>
          <p className="rounded-lg border border-neutral-200 bg-white p-3 text-base dark:border-neutral-800 dark:bg-neutral-950" data-prueba="texto">{r.texto}</p>
          <Boton onClick={copia}>Copiar el texto</Boton>
          <details className="rounded-lg border border-neutral-200 p-2 text-sm dark:border-neutral-800" open={referencia.length > 0}>
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-neutral-500">Medir la precisión: pega lo que dijiste de verdad</summary>
            <textarea value={referencia} onChange={(e) => setReferencia(e.target.value)} rows={2} placeholder={muestra?.texto ? 'Con la muestra, pega su texto original; con tu voz, lo que dijiste palabra por palabra.' : 'Lo que dijiste, palabra por palabra.'} className={`${claseEntrada} mt-2`} data-prueba="referencia" />
            {muestra?.texto ? <button type="button" className="mt-1 text-xs underline" onClick={() => setReferencia(muestra.texto ?? '')}>usar el texto de la muestra como referencia</button> : null}
            {medida ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-3" data-prueba="wer">
                <Metrica nombre="Errores de palabra (WER)" valor={pct(medida.wer.wer)} pista={`${medida.wer.errores} de ${medida.wer.palabras} palabras`} />
                <Metrica nombre="Errores de letra (CER)" valor={pct(medida.cer.wer)} pista={`${medida.cer.errores} de ${medida.cer.palabras} letras`} />
                <Metrica nombre="Cómo se compara" valor={medida.wer.wer <= 0.06 ? 'como en audio limpio' : medida.wer.wer <= 0.12 ? 'aceptable con ruido' : 'revisar micrófono o entorno'} pista="3,3 % medido con audio leído y limpio" />
              </div>
            ) : null}
          </details>
          {conTiempos && r.segmentos ? <ListaSegmentos segmentos={r.segmentos} conBuscador conCapitulos={conCapitulos} /> : null}
          {avisoRuido ? <Aviso tipo="honesto">Cuenta los errores en tu grabación: esa es la medida real en tu entorno. La cifra de 3,3 % es con audio limpio y leído.</Aviso> : null}
        </div>
      ) : null}
    </div>
  );
}
