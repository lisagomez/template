'use client';

/** Lo ultimo que cada panel midio (ms, WER...), para que el veredicto lo guarde junto a la opinion. Solo numeros. */
import { create } from 'zustand';
import type { MetricasVeredicto } from '../types/index.ts';

interface MetricasStore {
  porCaso: Record<number, MetricasVeredicto>;
  registra: (caso: number, metricas: MetricasVeredicto) => void;
}

export const useMetricasCaso = create<MetricasStore>((set) => ({
  porCaso: {},
  registra: (caso, metricas) => set((s) => ({ porCaso: { ...s.porCaso, [caso]: { ...(s.porCaso[caso] ?? {}), ...metricas } } })),
}));

/** El tipo de aparato, sin identificar a nadie: lo que un informe de pruebas necesita saber. */
export function dispositivoActual(): string {
  if (typeof navigator === 'undefined') return 'desconocido';
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  return 'PC';
}
