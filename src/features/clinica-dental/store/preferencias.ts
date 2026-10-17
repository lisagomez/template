'use client';

/**
 * Los dos botones del portal, recordados en el dispositivo: la VOZ (la guía habla en el registro y el chatbot
 * escucha) y el CHATBOT. Sin almacenamiento (privado, bloqueado), valen para la página y ya.
 */
import { create } from 'zustand';

type Preferencia = 'voz' | 'chatbot';
const CLAVE: Record<Preferencia, string> = { voz: 'clinica-pref-voz', chatbot: 'clinica-pref-chatbot' };

function lee(p: Preferencia): boolean {
  try {
    return localStorage.getItem(CLAVE[p]) === 'si';
  } catch {
    return false;
  }
}

interface Estado {
  cargado: boolean;
  voz: boolean;
  chatbot: boolean;
  carga(): void;
  cambia(p: Preferencia, valor: boolean): void;
}

export const usePreferencias = create<Estado>((set) => ({
  cargado: false,
  voz: false,
  chatbot: false,
  carga: () => set({ cargado: true, voz: lee('voz'), chatbot: lee('chatbot') }),
  cambia: (p, valor) => {
    try {
      localStorage.setItem(CLAVE[p], valor ? 'si' : 'no');
    } catch {
      /* sin almacenamiento */
    }
    set({ [p]: valor } as Pick<Estado, Preferencia>);
  },
}));
