'use client';

/** Un audio → una transcripcion, con lo que la pantalla necesita: resultado, ocupado, error y latencia vista desde el navegador. */
import { useState } from 'react';
import { transcribe, type OpcionesTranscribir } from '../services/cliente.ts';
import type { RespuestaTranscripcion } from '../types/index.ts';

export function useTranscripcion(token: string | undefined) {
  const [resultado, setResultado] = useState<RespuestaTranscripcion | undefined>(undefined);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [msCliente, setMsCliente] = useState<number | undefined>(undefined);

  const corre = async (audio: Blob, opciones: OpcionesTranscribir): Promise<RespuestaTranscripcion | undefined> => {
    if (!token) {
      setError('empareja el navegador para transcribir');
      return undefined;
    }
    setOcupado(true);
    setError(undefined);
    const t0 = performance.now();
    try {
      const r = await transcribe(token, audio, opciones);
      setResultado(r);
      setMsCliente(Math.round(performance.now() - t0));
      if (r.razon) setError(r.razon);
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'no se pudo transcribir');
      return undefined;
    } finally {
      setOcupado(false);
    }
  };

  const limpia = () => {
    setResultado(undefined);
    setError(undefined);
    setMsCliente(undefined);
  };

  return { resultado, ocupado, error, msCliente, corre, limpia };
}
