'use client';

/** Locucion sintetica: texto → voz local (Piper), con voz y velocidad a elegir; se escucha y se descarga. */
import { useState } from 'react';
import { sintetizaVoz } from '../../services/cliente.ts';
import { AUDIOLIBRO_MUESTRA } from '../../services/muestras.ts';
import type { MetricasSintesis } from '../../types/index.ts';
import { Aviso, Boton, claseEntrada, Metrica, Ocupado, Reproductor } from '../ui.tsx';

export function PanelLocucion({ token, voces }: { token: string | undefined; voces: string[] }) {
  const [texto, setTexto] = useState(AUDIOLIBRO_MUESTRA);
  const [voz, setVoz] = useState<string>('');
  const [velocidad, setVelocidad] = useState(1);
  const [audio, setAudio] = useState<Blob | undefined>(undefined);
  const [metricas, setMetricas] = useState<MetricasSintesis | undefined>(undefined);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const genera = async () => {
    if (!token) return;
    setOcupado(true);
    setError(undefined);
    try {
      const r = await sintetizaVoz(token, texto, voz || undefined, velocidad);
      setAudio(r.audio);
      setMetricas(r.metricas);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'no se pudo generar la voz');
    } finally {
      setOcupado(false);
    }
  };

  const descarga = () => {
    if (!audio) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(audio);
    a.download = 'locucion.wav';
    a.click();
  };

  return (
    <div className="space-y-3" data-prueba="panel-locucion">
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} className={claseEntrada} maxLength={6000} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-xs text-neutral-500">Voz</span>
          <select value={voz} onChange={(e) => setVoz(e.target.value)} className={`${claseEntrada} !w-auto`}>
            {voces.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
            {voces.length === 0 ? <option value="">(sin voces descargadas)</option> : null}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs text-neutral-500">Velocidad: {velocidad.toFixed(2)}</span>
          <input type="range" min={0.7} max={1.4} step={0.05} value={velocidad} onChange={(e) => setVelocidad(Number(e.target.value))} />
        </label>
        <Boton variante="primario" onClick={() => void genera()} disabled={!token || ocupado || texto.trim().length === 0 || voces.length === 0}>
          {ocupado ? 'Generando…' : 'Generar la voz'}
        </Boton>
        <Boton onClick={descarga} disabled={!audio}>Descargar WAV</Boton>
      </div>
      <p className="text-xs text-neutral-500">{texto.length} caracteres · {texto.trim().split(/\s+/).filter(Boolean).length} palabras</p>
      {ocupado ? <Ocupado texto="Sintetizando frase a frase en esta computadora…" /> : null}
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      {metricas ? (
        <div className="grid gap-2 sm:grid-cols-4" data-prueba="metricas-locucion">
          <Metrica nombre="Audio generado" valor={`${metricas.segundosAudio} s`} />
          <Metrica nombre="Cálculo" valor={`${metricas.msSintesis} ms`} pista={metricas.segundosAudio > 0 ? `${(metricas.segundosAudio / (metricas.msSintesis / 1000)).toFixed(0)} s de audio por s de cálculo` : undefined} />
          <Metrica nombre="Primera frase lista" valor={`${metricas.msPrimerAudio} ms`} />
          <Metrica nombre="Voz" valor={metricas.voz.replace('sherpa-tts:', '')} />
        </div>
      ) : null}
      <Reproductor audio={audio} etiqueta="Después · la locución:" />
    </div>
  );
}
