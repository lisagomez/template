/**
 * Las 20 barras del visualizador de la pildora, calculadas AQUI (en WSL, donde esta el audio) y
 * mandadas como veinte enteros 0-100 por cuadro; PowerShell solo las pinta. Sigue al visualizador
 * de sflow (`ui/audio_visualizer.py`, MIT, © Daniel Carreon): bandas en escala logaritmica sobre
 * el rango de la voz, energia por banda normalizada contra un pico movil (con suelo, para no
 * amplificar el silencio) y pasada a dB con suelo en −50 dB, mas una perilla de ganancia. La
 * caida entre cuadros es multiplicativa (0,85: el `BAR_DECAY` de sflow), asi las barras suben
 * de golpe y bajan suaves.
 *
 * Las bandas salen de `fbank` de `@tu-scope/voz` (filtros mel, ya escritos y probados): 20
 * filtros sobre una ventana de 32 ms, un cuadro por ventana (~31 cuadros por segundo a 16 kHz).
 * Puro: sin reloj ni red, se prueba con tonos y con silencio.
 */
import { fbank } from '@tu-scope/voz';

export interface OpcionesBarras {
  frecuenciaHz?: number;
  numBarras?: number;
  ventanaMs?: number;
  /** Nivel (dB respecto al pico) por debajo del cual la barra es 0. */
  sueloDb?: number;
  /** Perilla fina, ~1 neutro; sflow usa 2,3. */
  ganancia?: number;
  /** Caida por cuadro cuando la energia baja (0,85 = suave). */
  decaimiento?: number;
  /** Con que lentitud baja el pico movil (por cuadro). */
  decaimientoPico?: number;
  /** Pico minimo contra el que normalizar: el silencio no se amplifica. */
  sueloPico?: number;
}

export interface Barras {
  /** Consume audio (mono, a `frecuenciaHz`) y devuelve un cuadro de barras por cada ventana completa. */
  empuja(muestras: Float32Array): number[][];
  reinicia(): void;
  readonly muestrasPorCuadro: number;
}

export const DEFECTOS_BARRAS = { numBarras: 20, ventanaMs: 32, sueloDb: -50, ganancia: 2.3, decaimiento: 0.85, decaimientoPico: 0.97, sueloPico: 0.04 };

export function creaBarras(opciones: OpcionesBarras = {}): Barras {
  const frecuenciaHz = opciones.frecuenciaHz ?? 16_000;
  const { numBarras, ventanaMs, sueloDb, ganancia, decaimiento, decaimientoPico, sueloPico } = { ...DEFECTOS_BARRAS, ...opciones };
  const muestrasPorCuadro = Math.round((ventanaMs / 1000) * frecuenciaHz);
  // Escala: fbank suma |X|^2 sin normalizar la ventana de Hann (suma ≈ N/2); sqrt y ×2/(N/2)
  // deja la amplitud por banda en unidades de la senal (un tono a 0,5 da ~0,5 en su banda).
  const escala = 4 / muestrasPorCuadro;
  let pendiente = new Float32Array(0);
  let pico = sueloPico;
  let valores = new Array<number>(numBarras).fill(0);

  const cuadroDe = (ventana: Float32Array): number[] => {
    const [marco] = fbank(ventana, { frecuenciaHz, numMel: numBarras, ventanaMs, saltoMs: ventanaMs, normalizaMedia: false });
    const amplitudes = Array.from(marco ?? new Float32Array(numBarras), (x) => Math.sqrt(Math.exp(x)) * escala);
    const picoCuadro = Math.max(0, ...amplitudes);
    pico = Math.max(pico * decaimientoPico, picoCuadro, sueloPico);
    valores = valores.map((previo, i) => {
      const db = 20 * Math.log10((amplitudes[i] ?? 0) / pico + 1e-9);
      const objetivo = Math.max(0, Math.min(1, ((db - sueloDb) / -sueloDb) * ganancia));
      const suavizado = objetivo >= previo ? objetivo : Math.max(objetivo, previo * decaimiento);
      return suavizado < 0.005 ? 0 : suavizado;
    });
    return valores.map((v) => Math.round(v * 100));
  };

  return {
    muestrasPorCuadro,
    empuja(muestras) {
      const junto = new Float32Array(pendiente.length + muestras.length);
      junto.set(pendiente);
      junto.set(muestras, pendiente.length);
      const cuadros: number[][] = [];
      let pos = 0;
      while (pos + muestrasPorCuadro <= junto.length) {
        cuadros.push(cuadroDe(junto.subarray(pos, pos + muestrasPorCuadro)));
        pos += muestrasPorCuadro;
      }
      pendiente = junto.slice(pos);
      return cuadros;
    },
    reinicia() {
      pendiente = new Float32Array(0);
      pico = sueloPico;
      valores = new Array<number>(numBarras).fill(0);
    },
  };
}

/** La linea del protocolo del icono: `barras` y veinte enteros separados por espacio. */
export const lineaDeBarras = (valores: readonly number[]): string => `barras ${valores.join(' ')}`;
