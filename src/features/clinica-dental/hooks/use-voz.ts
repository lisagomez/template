'use client';

/**
 * La sesión de voz dentro de React: encender, apagar, el estado del bucle y lo que se oyó y se dijo. Sin permiso
 * de micrófono no se rompe nada: se dice qué pasó y se sigue por escrito. La sesión queda en
 * `window.__clinicaVoz` para la medición de latencia del laboratorio (micrófono falso).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EventoBucle } from '../../../../tools/bucle-voz/dist/index.js';
import { creaSesionVoz, SinMicrofono, type PuertosConversacion, type SesionVoz } from '../services/cliente/voz';

declare global {
  interface Window { __clinicaVoz?: SesionVoz }
}

export type EstadoVoz = 'apagada' | 'encendiendo' | 'escuchando' | 'transcribiendo' | 'pensando' | 'hablando' | 'reposo';

export function useVoz(alEvento?: (e: EventoBucle) => void) {
  const sesion = useRef<SesionVoz | null>(null);
  const oyente = useRef(alEvento);
  const [estado, setEstado] = useState<EstadoVoz>('apagada');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    oyente.current = alEvento;
  }, [alEvento]);

  const apaga = useCallback(async () => {
    const s = sesion.current;
    sesion.current = null;
    if (window.__clinicaVoz === s) delete window.__clinicaVoz;
    s?.destruye();
    setEstado('apagada');
  }, []);

  const enciende = useCallback(async (puertos: PuertosConversacion) => {
    await apaga();
    setError(null);
    setEstado('encendiendo');
    const s = creaSesionVoz(puertos);
    s.bucle.suscribe((e) => {
      if (e.tipo === 'estado') setEstado(e.estado as EstadoVoz);
      if (e.tipo === 'aviso') setError(e.mensaje);
      oyente.current?.(e);
    });
    try {
      await s.enciende();
      sesion.current = s;
      window.__clinicaVoz = s;
      s.bucle.activa();
      return s;
    } catch (e) {
      s.destruye();
      setEstado('apagada');
      setError(e instanceof SinMicrofono ? 'No tengo permiso para usar el micrófono. Puedes darlo en el candado de la barra de direcciones, o seguir por escrito.' : 'No pude encender la voz. Sigue por escrito.');
      return null;
    }
  }, [apaga]);

  useEffect(() => () => { void apaga(); }, [apaga]);
  return { estado, error, enciende, apaga, sesion };
}

export const TEXTO_ESTADO: Record<EstadoVoz, string> = {
  apagada: 'Voz apagada', encendiendo: 'Encendiendo el micrófono…', escuchando: 'Te escucho', transcribiendo: 'Entendiendo…',
  pensando: 'Pensando…', hablando: 'Hablando (puedes interrumpir)', reposo: 'En pausa',
};
