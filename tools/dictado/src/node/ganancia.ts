/**
 * Ganancia del microfono que se ajusta sola, por lo que se OYE en cada escucha, no por los
 * primeros segundos (que suelen ser silencio). Objetivo: que el pico de la voz caiga entre
 * -20 y -6 dBFS, la ventana sana medida en vivo (SDD, 2026-09-16/19). Si con la ganancia el pico
 * satura (> -3 dBFS), se baja 6 dB; si hubo texto pero entro flojo (< -30 dBFS), se sube 6 dB.
 * Pasos de 6 dB y topes: sin oscilar y sin amplificar ruido hasta el infinito. Puro y probado.
 */
import { factorDeDb } from '@tu-scope/voz';
export interface EntradaAjuste {
  actualDb: number;
  /** Pico de la escucha tal como entro del microfono, sin ganancia. */
  picoRawDb: number;
  /** Pico de la escucha con la ganancia aplicada (lo que oyo el motor). */
  picoConGananciaDb: number;
  huboTexto: boolean;
  minimoDb?: number;
  maximoDb?: number;
}

export interface Ajuste {
  nuevaDb: number;
  motivo?: 'saturando' | 'flojo' | 'microfono-satura-solo';
}

export const VENTANA_SANA_DB = { desde: -20, hasta: -6 } as const;

export function ajustaGanancia(e: EntradaAjuste): Ajuste {
  const minimo = e.minimoDb ?? -12;
  const maximo = e.maximoDb ?? 18;
  if (!Number.isFinite(e.picoConGananciaDb)) return { nuevaDb: e.actualDb };
  if (e.picoConGananciaDb > -3) {
    // Satura ya sin ganancia: bajar la nuestra no arregla nada; es el nivel de Windows.
    if (e.picoRawDb > -3 || e.actualDb <= minimo) return { nuevaDb: Math.max(minimo, Math.min(e.actualDb, 0)), motivo: 'microfono-satura-solo' };
    return { nuevaDb: Math.max(minimo, e.actualDb - 6), motivo: 'saturando' };
  }
  if (e.huboTexto && e.picoConGananciaDb < -30 && e.actualDb < maximo) return { nuevaDb: Math.min(maximo, e.actualDb + 6), motivo: 'flojo' };
  return { nuevaDb: e.actualDb };
}

/** dB → factor lineal para multiplicar muestras. */
/** dB → factor lineal: el `factorDeDb` de `voz`, con el nombre que ya usaba este paquete. */
export const factorDe = factorDeDb;
