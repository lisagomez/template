'use client';

/**
 * De donde sale el audio que se prueba: el microfono, un archivo, o una muestra fabricada con
 * la voz sintetica de la maquina (asi se prueba sin traer nada). El audio elegido se ve y se
 * escucha ANTES de transcribir: ese es el «antes» de cada caso.
 */
import { useState } from 'react';
import { useGrabadora } from '@/features/dictado/hooks/use-grabadora';
import { fabricaMuestra, sintetizaVoz, type LineaMuestra } from '../services/cliente.ts';
import { Aviso, Boton, claseEntrada, Ocupado, Reproductor } from './ui.tsx';

export interface Muestra {
  /** Un texto que se leera con la voz sintetica (una sola voz). */
  texto?: string;
  /** O un guion a dos voces. */
  guion?: LineaMuestra[];
  formato?: 'estereo' | 'mono';
  nombre?: string;
}

export function EntradaAudio({ token, muestra, ocupado, alAudio }: { token: string | undefined; muestra?: Muestra; ocupado?: boolean; alAudio: (audio: Blob, origen: string) => void }) {
  const grabadora = useGrabadora();
  const [audio, setAudio] = useState<Blob | undefined>(undefined);
  const [origen, setOrigen] = useState<string>('');
  const [fabricando, setFabricando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [mic, setMic] = useState('');

  const entrega = (a: Blob, de: string) => {
    setAudio(a);
    setOrigen(de);
    alAudio(a, de);
  };

  const alternaGrabacion = async () => {
    if (grabadora.grabando) {
      const a = await grabadora.termina();
      if (a) entrega(a, `micrófono (${grabadora.micUsado})`);
      return;
    }
    await grabadora.empieza(mic || undefined);
  };

  const usaMuestra = async () => {
    if (!token || !muestra) return;
    setFabricando(true);
    setError(undefined);
    try {
      if (muestra.guion) {
        const { audio: a } = await fabricaMuestra(token, muestra.guion, muestra.formato ?? 'mono');
        entrega(a, muestra.nombre ?? 'muestra fabricada con dos voces sintéticas');
      } else if (muestra.texto) {
        const { audio: a } = await sintetizaVoz(token, muestra.texto, undefined, 1);
        entrega(a, muestra.nombre ?? 'muestra leída por la voz sintética');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'no se pudo fabricar la muestra');
    } finally {
      setFabricando(false);
    }
  };

  const bloqueado = ocupado || fabricando;
  return (
    <div className="space-y-2" data-prueba="entrada-audio">
      <div className="flex flex-wrap items-center gap-2">
        <Boton variante={grabadora.grabando ? 'primario' : 'secundario'} onClick={() => void alternaGrabacion()} disabled={bloqueado}>
          {grabadora.grabando ? '■ Terminar grabación' : '● Grabar con el micrófono'}
        </Boton>
        <label className="cursor-pointer rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">
          Subir un archivo de audio
          <input type="file" accept="audio/*,video/*" className="hidden" disabled={bloqueado} onChange={(e) => { const f = e.target.files?.[0]; if (f) entrega(f, `archivo «${f.name}»`); }} />
        </label>
        {muestra ? (
          <Boton variante="suave" onClick={() => void usaMuestra()} disabled={bloqueado || !token} title={token ? 'Se fabrica aquí con la voz sintética de esta computadora' : 'Empareja el navegador primero'}>
            Usar la muestra
          </Boton>
        ) : null}
        <select value={mic} onChange={(e) => setMic(e.target.value)} onFocus={() => void grabadora.listaMicrofonos()} className={`${claseEntrada} !w-auto max-w-[14rem]`}>
          <option value="">Micrófono automático</option>
          {grabadora.microfonos.map((m) => (
            <option key={m.deviceId} value={m.deviceId}>{m.label}</option>
          ))}
        </select>
      </div>
      {grabadora.grabando ? <Ocupado texto="Grabando… habla y pulsa terminar." /> : null}
      {fabricando ? <Ocupado texto="Fabricando la muestra con la voz sintética…" /> : null}
      {grabadora.error ? <Aviso tipo="error">{grabadora.error}</Aviso> : null}
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      {audio ? <Reproductor audio={audio} etiqueta={`Antes · lo que entra: ${origen} (${Math.round(audio.size / 1024)} KB)`} /> : null}
    </div>
  );
}
