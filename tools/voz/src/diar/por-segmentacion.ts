/**
 * Diarizacion por segmentacion (el camino de pyannote), en TypeScript puro.
 *
 * La diferencia con `creaDiarizador` no es de calidad, es de lo que puede representar:
 *
 *   VAD  → un turno, un vector, un hablante. Dos personas hablando a la vez producen UN
 *          turno con las dos voces, un embedding que es el promedio de ambas y una etiqueta
 *          que no corresponde a ninguna. Falla en silencio, que es la peor forma de fallar.
 *   PyanNet → actividad POR MARCO Y POR HABLANTE dentro de cada ventana. El solape se
 *          representa de verdad, y de ahi salen turnos que se pisan.
 *
 * El precio es que las etiquetas de PyanNet son locales a la ventana: hay que coserlas. Ese
 * cosido —embedding por hablante local, agrupamiento global, acumulacion en una linea de
 * tiempo comun— es lo que hace este archivo.
 */

import { agrupa, type OpcionesAgrupar } from './agrupacion.js';
import type { ModeloHablante, ModeloSegmentacion, Muestras, Turno } from '../types.js';

export interface OpcionesDiarizadorSegmentacion extends OpcionesAgrupar {
  segmentacion: ModeloSegmentacion;
  hablante: ModeloHablante;
  /** Fraccion de solape entre ventanas consecutivas. 0.5 es lo habitual. */
  solape?: number;
  /** Actividad por encima de la cual se considera que un hablante local esta hablando. */
  umbralActividad?: number;
  /** Un hablante local con menos de esto en la ventana se ignora: no hay con que embeber. */
  msMinimoLocal?: number;
  /** Huecos mas cortos que esto no parten un turno (alguien respira a mitad de frase). */
  msHuecoMaximo?: number;
  /** Turnos mas cortos que esto se descartan al final. */
  msMinimoTurno?: number;
  /** Adjuntar el audio de cada turno al resultado. */
  conservaAudio?: boolean;
}

interface Local {
  /** Marco global donde empieza la ventana de la que sale este hablante local. */
  offsetMarcos: number;
  /** Actividad de este hablante local, marco a marco dentro de su ventana. */
  actividad: Float32Array;
  vector: Float32Array;
}

export interface DiarizadorSegmentacion {
  /** Diariza una grabacion entera. Los turnos devueltos PUEDEN solaparse en el tiempo. */
  diariza(muestras: Muestras): Promise<Turno[]>;
}

export function creaDiarizadorPorSegmentacion(
  opciones: OpcionesDiarizadorSegmentacion,
): DiarizadorSegmentacion {
  const { segmentacion, hablante } = opciones;
  const solape = opciones.solape ?? 0.5;
  const umbralActividad = opciones.umbralActividad ?? 0.5;
  const msMinimoLocal = opciones.msMinimoLocal ?? 500;
  const msHuecoMaximo = opciones.msHuecoMaximo ?? 250;
  const msMinimoTurno = opciones.msMinimoTurno ?? 200;
  const conservaAudio = opciones.conservaAudio ?? false;

  if (solape < 0 || solape >= 1) throw new Error('solape debe estar en [0, 1)');

  return {
    async diariza(muestras: Muestras): Promise<Turno[]> {
      const hz = segmentacion.frecuenciaHz;
      const ventana = segmentacion.muestrasVentana;
      const salto = Math.max(1, Math.round(ventana * (1 - solape)));

      const locales: Local[] = [];
      let marcosPorVentana = 0;
      let muestrasPorMarco = 0;

      for (let inicio = 0; inicio < muestras.length; inicio += salto) {
        const trozo = muestras.subarray(inicio, Math.min(inicio + ventana, muestras.length));
        const actividad = await segmentacion.ventana(trozo);
        if (actividad.length === 0) continue;
        marcosPorVentana = actividad.length;
        muestrasPorMarco = ventana / marcosPorVentana;
        const offsetMarcos = Math.round(inicio / muestrasPorMarco);

        // Cuantos hablantes suenan en cada marco. Sirve para quedarse con el audio LIMPIO:
        // un embedding sacado de habla solapada mezcla dos voces y arrastra el agrupamiento.
        const simultaneos = actividad.map((marco) =>
          marco.reduce((n, v) => n + (v > umbralActividad ? 1 : 0), 0),
        );

        for (let k = 0; k < segmentacion.hablantesLocales; k++) {
          const propia = new Float32Array(marcosPorVentana);
          const exclusivos: number[] = [];
          const todos: number[] = [];
          for (let m = 0; m < marcosPorVentana; m++) {
            const v = actividad[m]![k] ?? 0;
            propia[m] = v;
            if (v > umbralActividad) {
              todos.push(m);
              if (simultaneos[m] === 1) exclusivos.push(m);
            }
          }
          if (todos.length * muestrasPorMarco < (msMinimoLocal / 1000) * hz) continue;

          // Se prefiere el audio exclusivo; si casi todo esta solapado, se usa lo que haya
          // antes que renunciar al hablante — un vector regular es mas util que ninguno.
          const usados = exclusivos.length * muestrasPorMarco >= (msMinimoLocal / 1000) * hz ? exclusivos : todos;
          const audio = new Float32Array(usados.length * Math.floor(muestrasPorMarco));
          const paso = Math.floor(muestrasPorMarco);
          usados.forEach((m, i) => {
            const desde = inicio + Math.round(m * muestrasPorMarco);
            audio.set(muestras.subarray(desde, Math.min(desde + paso, muestras.length)), i * paso);
          });

          locales.push({ offsetMarcos, actividad: propia, vector: await hablante.vector(audio) });
        }
      }

      if (locales.length === 0 || marcosPorVentana === 0) return [];

      const etiquetas = agrupa(
        locales.map((l) => l.vector),
        { umbral: opciones.umbral, hablantes: opciones.hablantes },
      );
      const numHablantes = new Set(etiquetas).size;

      // Linea de tiempo comun. Las ventanas se solapan, asi que cada marco global puede
      // recibir varias opiniones: se promedian en vez de quedarse con la ultima, que es lo
      // que produce costuras justo en los bordes de ventana.
      const totalMarcos = Math.ceil(muestras.length / muestrasPorMarco) + 1;
      const suma = Array.from({ length: numHablantes }, () => new Float32Array(totalMarcos));
      const cuenta = Array.from({ length: numHablantes }, () => new Float32Array(totalMarcos));
      locales.forEach((local, i) => {
        const g = etiquetas[i]!;
        for (let m = 0; m < local.actividad.length; m++) {
          const indice = local.offsetMarcos + m;
          if (indice >= totalMarcos) break;
          suma[g]![indice] = suma[g]![indice]! + local.actividad[m]!;
          cuenta[g]![indice] = cuenta[g]![indice]! + 1;
        }
      });

      const msPorMarco = (muestrasPorMarco / hz) * 1000;
      const turnos: Turno[] = [];
      for (let g = 0; g < numHablantes; g++) {
        let inicioMarco = -1;
        let marcosHueco = 0;
        const cierra = (finMarco: number) => {
          const inicioMs = inicioMarco * msPorMarco;
          const finMs = finMarco * msPorMarco;
          if (finMs - inicioMs >= msMinimoTurno) {
            const turno: Turno = { inicioMs, finMs, hablante: `Hablante ${g + 1}` };
            if (conservaAudio) {
              turno.audio = muestras.slice(
                Math.round((inicioMs / 1000) * hz),
                Math.round((finMs / 1000) * hz),
              );
            }
            turnos.push(turno);
          }
          inicioMarco = -1;
          marcosHueco = 0;
        };

        for (let m = 0; m < totalMarcos; m++) {
          const n = cuenta[g]![m]!;
          const activo = n > 0 && suma[g]![m]! / n > umbralActividad;
          if (activo) {
            if (inicioMarco < 0) inicioMarco = m;
            marcosHueco = 0;
          } else if (inicioMarco >= 0) {
            marcosHueco++;
            if (marcosHueco * msPorMarco > msHuecoMaximo) cierra(m - marcosHueco);
          }
        }
        if (inicioMarco >= 0) cierra(totalMarcos - marcosHueco);
      }

      return turnos.sort((a, b) => a.inicioMs - b.inicioMs || a.finMs - b.finMs);
    },
  };
}

/**
 * Tramos donde hablan dos o mas personas a la vez.
 *
 * Es la pregunta que solo se puede responder por este camino, y la que suele importar:
 * son los momentos donde un transcriptor se equivoca y donde, en un acta, alguien
 * interrumpio.
 */
export function tramosSolapados(turnos: readonly Turno[]): Array<{ inicioMs: number; finMs: number; hablantes: string[] }> {
  const bordes = new Set<number>();
  for (const t of turnos) {
    bordes.add(t.inicioMs);
    bordes.add(t.finMs);
  }
  const puntos = [...bordes].sort((a, b) => a - b);
  const salida: Array<{ inicioMs: number; finMs: number; hablantes: string[] }> = [];
  for (let i = 0; i < puntos.length - 1; i++) {
    const desde = puntos[i]!;
    const hasta = puntos[i + 1]!;
    const medio = (desde + hasta) / 2;
    const hablantes = [
      ...new Set(
        turnos.filter((t) => t.inicioMs <= medio && t.finMs >= medio).map((t) => t.hablante ?? '?'),
      ),
    ];
    if (hablantes.length < 2) continue;
    const ultimo = salida[salida.length - 1];
    if (ultimo && ultimo.finMs === desde && ultimo.hablantes.join() === hablantes.join()) {
      ultimo.finMs = hasta;
      continue;
    }
    salida.push({ inicioMs: desde, finMs: hasta, hablantes });
  }
  return salida;
}
