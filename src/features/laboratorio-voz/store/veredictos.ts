'use client';

/** Los veredictos de esta sesion de pruebas: se leen del servidor al entrar y se guardan uno a uno. */
import { create } from 'zustand';
import { descargaInforme, guardaVeredicto, leeVeredictos } from '../services/cliente.ts';
import type { Veredicto, VeredictoNuevo } from '../types/index.ts';

interface VeredictosStore {
  veredictos: Veredicto[];
  ocupado: boolean;
  error: string | undefined;
  carga: (token: string) => Promise<void>;
  guarda: (token: string, nuevo: VeredictoNuevo) => Promise<boolean>;
  informe: (token: string) => Promise<Blob | undefined>;
}

export const useVeredictos = create<VeredictosStore>((set) => ({
  veredictos: [],
  ocupado: false,
  error: undefined,
  carga: async (token) => {
    try {
      set({ veredictos: await leeVeredictos(token), error: undefined });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'error' });
    }
  },
  guarda: async (token, nuevo) => {
    set({ ocupado: true, error: undefined });
    try {
      const v = await guardaVeredicto(token, nuevo);
      set((s) => ({ veredictos: [...s.veredictos, v] }));
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'error' });
      return false;
    } finally {
      set({ ocupado: false });
    }
  },
  informe: async (token) => {
    try {
      return await descargaInforme(token);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'error' });
      return undefined;
    }
  },
}));
