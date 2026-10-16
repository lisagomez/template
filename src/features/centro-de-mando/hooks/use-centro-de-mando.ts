'use client';

/**
 * El estado de la página: emparejamiento (el mismo token que /dictar y el laboratorio), la
 * sesión de voz y la vista que pintan el orbe, la onda, los subtítulos, la telemetría y el
 * registro. Teclado: mantener ESPACIO = pulsar para hablar (soltar o perder el foco cierra el
 * turno: nunca se queda colgado); ESC = parar todo, también una transcripción en vuelo.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDictadoMovil } from '@/features/dictado/store/movil';
import { tokenDelEnlace } from '@/shared/lib/token-enlace';
import type { EventoBucle, ModoBucle } from '../../../../tools/bucle-voz/dist/index.js';
import { pideEstado } from '../services/cliente.ts';
import { creaSesion, type Sesion } from '../services/sesion.ts';
import type { EstadoServidor, VistaCentro } from '../types/index.ts';
import { aplicaEvento, VISTA_INICIAL } from './vista.ts';

const esCampo = (e: EventTarget | null) => e instanceof HTMLElement && (e.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.tagName));

function useTeclado(sesion: Sesion | undefined) {
  useEffect(() => {
    if (!sesion) return undefined;
    const abajo = (e: KeyboardEvent) => {
      if (esCampo(e.target)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) sesion.pulsa();
      } else if (e.code === 'Escape') sesion.bucle.desactiva();
    };
    const arriba = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !esCampo(e.target)) sesion.suelta();
    };
    const pierde = () => sesion.suelta();
    window.addEventListener('keydown', abajo);
    window.addEventListener('keyup', arriba);
    window.addEventListener('blur', pierde);
    return () => {
      window.removeEventListener('keydown', abajo);
      window.removeEventListener('keyup', arriba);
      window.removeEventListener('blur', pierde);
    };
  }, [sesion]);
}

export function useCentroDeMando(modoInicial: ModoBucle = 'manos-libres') {
  const movil = useDictadoMovil();
  const { carga, empareja, token } = movil;
  const [sesion, setSesion] = useState<Sesion | undefined>(undefined);
  const [vista, setVista] = useState<VistaCentro>({ ...VISTA_INICIAL, modo: modoInicial });
  const [servidor, setServidor] = useState<EstadoServidor | undefined>(undefined);
  const turnosPendientes = useRef(0);

  useEffect(() => {
    carga();
    // Emparejamiento por enlace (#t=…), como /dictar (shared/lib/token-enlace.ts).
    const enlace = tokenDelEnlace(window.location);
    if (enlace) {
      void empareja(enlace.token);
      history.replaceState(null, '', enlace.urlLimpia);
    }
  }, [carga, empareja]);

  useEffect(() => {
    if (!token) return undefined;
    const s = creaSesion(token, modoInicial);
    const quita = s.bucle.suscribe((e: EventoBucle) => setVista((v) => aplicaEvento(v, e)));
    const quitaTel = s.bucle.telemetria.suscribe(() => {
      if (turnosPendientes.current) return;
      turnosPendientes.current = requestAnimationFrame(() => {
        turnosPendientes.current = 0;
        setVista((v) => ({ ...v, turnos: [...s.bucle.telemetria.turnos()].slice(-14), velocidad: s.bucle.velocidad }));
      });
    });
    setSesion(s);
    if (new URLSearchParams(window.location.search).has('medicion')) Object.assign(window, { __centroDeMando: s });
    const refresca = () => pideEstado(token).then(setServidor, () => undefined);
    void refresca();
    const intervalo = setInterval(refresca, 15_000);
    return () => {
      clearInterval(intervalo);
      quita();
      quitaTel();
      s.destruye();
      setSesion(undefined);
    };
  }, [token, modoInicial]);

  useTeclado(sesion);

  const enciende = useCallback(async () => {
    if (!sesion) return;
    try {
      await sesion.enciende();
      sesion.bucle.activa();
      setVista((v) => ({ ...v, encendido: true, error: undefined }));
    } catch (e) {
      setVista((v) => ({ ...v, error: `no se pudo abrir el micrófono: ${e instanceof Error ? e.message : 'sin permiso'}` }));
    }
  }, [sesion]);

  const apaga = useCallback(async () => {
    await sesion?.apaga();
    setVista((v) => ({ ...v, encendido: false }));
  }, [sesion]);

  const cambiaModo = useCallback((modo: ModoBucle) => {
    sesion?.bucle.cambiaModo(modo);
    setVista((v) => ({ ...v, modo }));
  }, [sesion]);

  return { movil, token, sesion, vista, servidor, enciende, apaga, cambiaModo, refrescaServidor: () => token && pideEstado(token).then(setServidor) };
}
