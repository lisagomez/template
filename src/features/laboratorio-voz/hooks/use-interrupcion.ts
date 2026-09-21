'use client';

/**
 * Escucha por el microfono mientras la maquina habla (y despues), con el detector por ENERGIA de
 * `tools/voz` en el navegador: cero modelos, cero descargas. Cuando la persona habla de verdad,
 * `alInterrumpir` (la voz se calla) y, al terminar, `alTurno` con el audio para transcribir.
 * Limite escrito: por energia sirve con auriculares o microfono cercano; en una sala con ruido
 * falla, y si las cifras lo piden se propone Silero en el navegador (CDC).
 */
import { useEffect, useRef, useState } from 'react';
import { capturaMicrofono, type CapturaMicrofono } from '../../../../tools/voz/dist/browser/index.js';
import { creaDetectorVoz, modeloEnergia } from '../../../../tools/voz/dist/index.js';
import { creaInterrupcion, type Accion, type TurnoPersona } from '../services/interrupcion.ts';
import { flotanteAInt16 } from '../services/pcm.ts';
import { escribeWavPcm16 } from '../services/wav.ts';

export type EstadoEscucha = 'apagado' | 'calibrando' | 'escuchando' | 'persona-habla';

export interface RegistroEvento {
  tipo: 'calibrado' | 'inicioHabla' | 'interrumpir' | 'turno';
  /** Tiempo del audio capturado, desde que se abrio el microfono. */
  msAudio: number;
  /** Reloj del navegador desde que se abrio el microfono. */
  msReloj: number;
  msDesdeInicioHabla?: number;
  interrumpio?: boolean;
}

export interface TurnoCapturado {
  turno: TurnoPersona;
  audio: Blob;
  interrumpio: boolean;
}

export interface OpcionesEscucha {
  activo: boolean;
  maquinaHabla: () => boolean;
  alInterrumpir: () => void;
  alTurno: (t: TurnoCapturado) => void;
}

interface Avisos {
  alEstado: (e: EstadoEscucha) => void;
  alNivel: (n: number) => void;
  alEvento: (r: RegistroEvento) => void;
}

const FRECUENCIA_HZ = 16_000;

/** Abre el microfono y monta detector + maquina de estados. No es un hook: vive fuera del render. */
async function abreEscucha(opciones: React.RefObject<OpcionesEscucha>, avisos: Avisos): Promise<CapturaMicrofono> {
  // 9 marcos de 32 ms ≈ 300 ms: el suelo es el ruido de fondo (con la maquina sonando), no el primer marco.
  const detector = creaDetectorVoz({ modelo: modeloEnergia({ frecuenciaHz: FRECUENCIA_HZ, marcosCalibracion: 9 }), msMinimoHabla: 150, msSilencioParaCerrar: 700, msRelleno: 200, conservaAudio: true });
  const maquina = creaInterrupcion();
  const t0 = performance.now();
  let ultimoNivel = 0;
  let cola = Promise.resolve();
  const aplica = (a: Accion) => {
    const msReloj = Math.round(performance.now() - t0);
    if (a.tipo === 'calibrado') {
      avisos.alEstado('escuchando');
      avisos.alEvento({ tipo: 'calibrado', msAudio: Math.round(a.ms), msReloj });
    } else if (a.tipo === 'interrumpir') {
      avisos.alEvento({ tipo: 'interrumpir', msAudio: Math.round(a.ms), msReloj, msDesdeInicioHabla: Math.round(a.msDesdeInicioHabla) });
      opciones.current.alInterrumpir();
    } else {
      avisos.alEstado('escuchando');
      avisos.alEvento({ tipo: 'turno', msAudio: Math.round(a.turno.finMs), msReloj, interrumpio: a.interrumpio });
      const audio = a.turno.audio ?? new Float32Array(0);
      opciones.current.alTurno({ turno: a.turno, audio: new Blob([escribeWavPcm16(flotanteAInt16(audio), FRECUENCIA_HZ, 1)], { type: 'audio/wav' }), interrumpio: a.interrumpio });
    }
  };
  const procesa = async (muestras: Float32Array) => {
    for (const e of await detector.procesa(muestras)) {
      if (e.tipo === 'probabilidad') {
        if (performance.now() - ultimoNivel > 100) {
          ultimoNivel = performance.now();
          avisos.alNivel(Math.round(e.valor * 100) / 100);
        }
      } else if (e.tipo === 'inicioHabla') {
        avisos.alEvento({ tipo: 'inicioHabla', msAudio: Math.round(e.ms), msReloj: Math.round(performance.now() - t0) });
      }
      const acciones = maquina.procesa(e, opciones.current.maquinaHabla());
      if (maquina.estado === 'persona-habla') avisos.alEstado('persona-habla');
      for (const a of acciones) aplica(a);
    }
  };
  return capturaMicrofono({
    frecuenciaHz: FRECUENCIA_HZ,
    // Cancelacion de eco ENCENDIDA: es lo unico que evita que la maquina se oiga a si misma por los altavoces.
    restricciones: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
    alRecibir: (m) => { cola = cola.then(() => procesa(m)).catch(() => undefined); },
  });
}

export function useInterrupcion(opciones: OpcionesEscucha) {
  const ultimas = useRef(opciones);
  useEffect(() => {
    ultimas.current = opciones;
  });
  const [estadoInterno, setEstado] = useState<EstadoEscucha>('apagado');
  const [nivelInterno, setNivel] = useState(0);
  const [eventos, setEventos] = useState<RegistroEvento[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const { activo } = opciones;

  useEffect(() => {
    if (!activo) return undefined;
    let cerrado = false;
    const sesion = abreEscucha(ultimas, {
      alEstado: setEstado,
      alNivel: setNivel,
      alEvento: (r) => setEventos((e) => [...e, r]),
    });
    sesion.then(
      (captura) => {
        if (cerrado) return void captura.detiene();
        setError(undefined);
        setEventos([]);
        setEstado('calibrando');
      },
      (e: unknown) => {
        setError(`no se pudo abrir el micrófono: ${e instanceof Error ? e.message : 'sin permiso'}`);
      },
    );
    return () => {
      cerrado = true;
      void sesion.then((captura) => captura.detiene()).catch(() => undefined);
    };
  }, [activo]);

  return { estado: activo ? estadoInterno : 'apagado', nivel: activo ? nivelInterno : 0, eventos, error };
}
