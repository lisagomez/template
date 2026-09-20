'use client';

/**
 * Estado de la superficie movil del dictado (Zustand como hook directo, sin Provider).
 * Vive en la feature —solo la pagina /dictar lo usa—; el estado GLOBAL del pipeline sigue en
 * `src/shared/stores/dictado.ts`. El token de emparejamiento se guarda en localStorage del
 * telefono (se teclea UNA vez) y jamas se muestra; el destino elegido tambien persiste.
 */
import { create } from 'zustand';
import { z } from 'zod';

export type Destino = 'pc' | 'pantalla' | 'ambos';

export interface Transcripcion {
  id: string;
  texto: string;
  ms: number;
  fecha: string;
}

const esquemaRespuesta = z.object({ texto: z.string(), ms: z.number(), destino: z.string() });

const guarda = (clave: string, valor: string) => {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    /* modo privado: la sesion vive igual, solo no persiste */
  }
};
const lee = (clave: string): string | undefined => {
  try {
    return localStorage.getItem(clave) ?? undefined;
  } catch {
    return undefined;
  }
};

interface DictadoMovil {
  token: string | undefined;
  destino: Destino;
  transcripciones: Transcripcion[];
  transcribiendo: boolean;
  error: string | undefined;
  /** Carga token y destino guardados (se llama al montar la pagina). */
  carga: () => void;
  /** Verifica el token contra el servidor; si vale, queda emparejado y persistido. */
  empareja: (token: string) => Promise<boolean>;
  olvida: () => void;
  eligeDestino: (destino: Destino) => void;
  /** Manda el audio grabado a transcribir; el texto llega segun el destino. */
  transcribe: (audio: Blob) => Promise<void>;
}

export const useDictadoMovil = create<DictadoMovil>((set, get) => ({
  token: undefined,
  destino: 'pc',
  transcripciones: [],
  transcribiendo: false,
  error: undefined,
  carga: () => {
    const destino = lee('dictado.destino');
    set({
      token: lee('dictado.token'),
      destino: destino === 'pantalla' || destino === 'ambos' ? destino : 'pc',
    });
  },
  empareja: async (token) => {
    set({ error: undefined });
    try {
      const r = await fetch('/api/dictado/movil', { headers: { authorization: `Bearer ${token}` } });
      if (!r.ok) {
        set({ error: r.status === 503 ? 'el servidor no tiene token configurado (DICTADO_MOVIL_TOKEN)' : 'ese token no es' });
        return false;
      }
      guarda('dictado.token', token);
      set({ token });
      return true;
    } catch {
      set({ error: 'no se pudo llegar al servidor' });
      return false;
    }
  },
  olvida: () => {
    try {
      localStorage.removeItem('dictado.token');
    } catch {
      /* nada */
    }
    set({ token: undefined, transcripciones: [] });
  },
  eligeDestino: (destino) => {
    guarda('dictado.destino', destino);
    set({ destino });
  },
  transcribe: async (audio) => {
    const { token, destino } = get();
    if (!token) return;
    set({ transcribiendo: true, error: undefined });
    try {
      const r = await fetch('/api/dictado/movil', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': audio.type || 'application/octet-stream', 'x-destino': destino },
        body: audio,
      });
      if (!r.ok) {
        set({ error: r.status === 401 ? 'el emparejamiento caduco: vuelve a teclear el token' : 'no se pudo transcribir' });
        return;
      }
      const { texto, ms } = esquemaRespuesta.parse(await r.json());
      if (texto.length === 0) {
        set({ error: 'sin voz en la toma' });
        return;
      }
      set((s) => ({
        transcripciones: [{ id: crypto.randomUUID(), texto, ms, fecha: new Date().toISOString() }, ...s.transcripciones].slice(0, 50),
      }));
    } catch {
      set({ error: 'no se pudo llegar al servidor' });
    } finally {
      set({ transcribiendo: false });
    }
  },
}));
