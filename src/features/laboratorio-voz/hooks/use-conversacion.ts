'use client';

/**
 * Pregunta y respuesta por voz, manos libres: escucha (detector por energia), transcribe el
 * turno, calcula la respuesta con la regla del panel y la dice en flujo; si la persona habla
 * mientras la maquina suena, la maquina se calla. Mide la vuelta: desde que la persona termina
 * de hablar hasta que empieza a sonar la respuesta.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useInterrupcion, type TurnoCapturado } from './use-interrupcion.ts';
import { useTranscripcion } from './use-transcripcion.ts';
import { useVozEnFlujo, type OpcionesHabla } from './use-voz-en-flujo.ts';

export interface Vuelta {
  /** Desde el fin del habla de la persona hasta el primer audio de la respuesta. */
  msVuelta: number;
  msTranscripcion: number;
  msPrimerAudio: number;
  via: string;
  dicho: string;
  /** 1 = solo el motor principal; 2 = hizo falta el respaldo (idioma forzado). */
  pases: 1 | 2;
}

export interface OpcionesConversacion {
  token: string | undefined;
  /** Con lo que la persona dijo, que responde la maquina (o nada). */
  responde: (dicho: string) => string | undefined;
  /** Si lo dicho no sirve (p. ej. sin cantidad), se repite la transcripcion con el motor de respaldo. */
  reintentaSi?: (dicho: string) => boolean;
  voz?: string;
}

export function useConversacion({ token, responde, reintentaSi, voz: vozElegida }: OpcionesConversacion) {
  const voz = useVozEnFlujo(token);
  const stt = useTranscripcion(token);
  const [manosLibres, setManosLibres] = useState(false);
  const [vuelta, setVuelta] = useState<Vuelta | undefined>(undefined);
  const [dicho, setDicho] = useState<string | undefined>(undefined);
  const respondeRef = useRef(responde);
  const reintentaRef = useRef(reintentaSi);
  useEffect(() => {
    respondeRef.current = responde;
    reintentaRef.current = reintentaSi;
  });

  const di = useCallback((texto: string, opciones: OpcionesHabla = {}) => voz.habla(texto, { voz: vozElegida, ...opciones }), [voz, vozElegida]);

  const alTurno = useCallback(async ({ audio }: TurnoCapturado) => {
    const t0 = performance.now();
    let r = await stt.corre(audio, { modo: 'rapido' });
    let pases: 1 | 2 = 1;
    // Segundo pase: audio corto que el principal oyo en otro idioma («sí» → «Sir»). Solo si la regla lo pide.
    if (reintentaRef.current && (!r?.texto || reintentaRef.current(r.texto))) {
      const r2 = await stt.corre(audio, { modo: 'rapido', motor: 'respaldo' });
      if (r2?.texto) r = r2;
      pases = 2;
    }
    const msTranscripcion = Math.round(performance.now() - t0);
    if (!r?.texto) return;
    const texto = r.texto;
    const via = r.via ?? 'desconocida';
    setDicho(texto);
    const respuesta = respondeRef.current(texto);
    if (!respuesta) return;
    await di(respuesta, { alPrimerAudio: (msPrimerAudio) => setVuelta({ msVuelta: Math.round(performance.now() - t0), msTranscripcion, msPrimerAudio: Math.round(msPrimerAudio), via, dicho: texto, pases }) });
  }, [stt, di]);

  const escucha = useInterrupcion({ activo: manosLibres, maquinaHabla: voz.estaHablando, alInterrumpir: voz.detiene, alTurno: (t) => void alTurno(t) });

  return { voz, stt, escucha, manosLibres, setManosLibres, vuelta, dicho, di };
}
