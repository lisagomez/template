'use client';

/**
 * La maquina habla EN FLUJO: cada trozo de PCM que llega se vuelve un AudioBuffer y se encadena
 * al anterior sin hueco, asi la primera frase suena mientras el servidor sintetiza el resto.
 * El AudioContext se crea en el clic (los navegadores no dejan sonar sin gesto). `detiene()`
 * corta la reproduccion Y la peticion: el servidor deja de sintetizar lo que falta.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { pideVozEnFlujo } from '../services/cliente.ts';
import { creaDecodificadorPcm16 } from '../services/pcm.ts';

export interface MetricasVozEnFlujo {
  /** Desde que se pidio hasta que el primer trozo empezo a sonar. */
  msPrimerAudio: number;
  msTotal: number;
  via: 'demonio' | 'cli' | 'desconocida';
  voz: string;
  frecuenciaHz: number;
  segundosAudio: number;
  trozos: number;
  cortada: boolean;
}

export interface OpcionesHabla {
  voz?: string;
  velocidad?: number;
  /** Se llama cuando el primer trozo empieza a sonar (para medir la vuelta pregunta → respuesta). */
  alPrimerAudio?: (msPrimerAudio: number) => void;
}

interface EnCurso {
  aborto: AbortController;
  fuentes: Set<AudioBufferSourceNode>;
  despierta?: () => void;
}

export function useVozEnFlujo(token: string | undefined) {
  const contexto = useRef<AudioContext | undefined>(undefined);
  const enCurso = useRef<EnCurso | undefined>(undefined);
  const [hablando, setHablando] = useState(false);
  const [metricas, setMetricas] = useState<MetricasVozEnFlujo | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const detiene = useCallback(() => {
    const c = enCurso.current;
    if (!c) return;
    enCurso.current = undefined;
    c.aborto.abort();
    for (const f of c.fuentes) {
      try {
        f.stop();
      } catch {
        /* ya habia terminado */
      }
    }
    c.despierta?.();
    setHablando(false);
  }, []);

  useEffect(() => () => { detiene(); void contexto.current?.close(); }, [detiene]);

  const habla = useCallback(async (texto: string, opciones: OpcionesHabla = {}): Promise<MetricasVozEnFlujo | undefined> => {
    if (!token) {
      setError('empareja el navegador para oír la voz');
      return undefined;
    }
    detiene();
    const t0 = performance.now();
    const ctx = contexto.current ?? (contexto.current = new AudioContext());
    if (ctx.state === 'suspended') await ctx.resume();
    const actual: EnCurso = { aborto: new AbortController(), fuentes: new Set() };
    enCurso.current = actual;
    setHablando(true);
    setError(undefined);
    let via: MetricasVozEnFlujo['via'] = 'desconocida';
    let voz = '';
    let hz = 22050;
    let muestras = 0;
    let trozos = 0;
    let primer: number | undefined;
    let siguiente = 0;
    try {
      const r = await pideVozEnFlujo(token, texto, { voz: opciones.voz, velocidad: opciones.velocidad, senal: actual.aborto.signal });
      via = r.via;
      voz = r.voz;
      hz = r.frecuenciaHz;
      const decodificador = creaDecodificadorPcm16();
      const lector = r.cuerpo.getReader();
      for (;;) {
        const { done, value } = await lector.read();
        if (done || actual.aborto.signal.aborted) break;
        const f = decodificador.decodifica(value);
        if (f.length === 0) continue;
        const buffer = ctx.createBuffer(1, f.length, hz);
        buffer.copyToChannel(f, 0);
        const fuente = ctx.createBufferSource();
        fuente.buffer = buffer;
        fuente.connect(ctx.destination);
        const inicio = Math.max(ctx.currentTime, siguiente);
        fuente.start(inicio);
        siguiente = inicio + buffer.duration;
        actual.fuentes.add(fuente);
        fuente.onended = () => actual.fuentes.delete(fuente);
        if (primer === undefined) {
          primer = performance.now() - t0;
          opciones.alPrimerAudio?.(primer);
        }
        muestras += f.length;
        trozos++;
      }
      // Espera a que suene lo encolado, salvo que alguien corte antes.
      const restanteMs = Math.max(0, (siguiente - ctx.currentTime) * 1000);
      if (!actual.aborto.signal.aborted && restanteMs > 0) {
        await new Promise<void>((resuelve) => {
          const temporizador = setTimeout(resuelve, restanteMs + 20);
          actual.despierta = () => { clearTimeout(temporizador); resuelve(); };
        });
      }
    } catch (e) {
      if (!actual.aborto.signal.aborted) setError(e instanceof Error ? e.message : 'no se pudo reproducir la voz');
    } finally {
      if (enCurso.current === actual) {
        enCurso.current = undefined;
        setHablando(false);
      }
    }
    const m: MetricasVozEnFlujo = { msPrimerAudio: Math.round(primer ?? -1), msTotal: Math.round(performance.now() - t0), via, voz, frecuenciaHz: hz, segundosAudio: Math.round((muestras / hz) * 10) / 10, trozos, cortada: actual.aborto.signal.aborted };
    setMetricas(m);
    return m;
  }, [token, detiene]);

  const estaHablando = useCallback(() => enCurso.current !== undefined, []);

  return { habla, detiene, hablando, estaHablando, metricas, error };
}
