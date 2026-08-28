/**
 * La maquina de estados del VAD. Es el corazon de la herramienta y no toca ningun modelo:
 * recibe probabilidades y decide donde empieza y donde acaba un turno.
 *
 * Lo que hace aqui la diferencia no es el modelo, es la contabilidad de alrededor:
 * histeresis, relleno hacia atras, silencio de cierre y descarte de golpes. Un VAD sin eso
 * abre y cierra turnos decenas de veces por segundo y corta las palabras por la mitad.
 */

import { concatena, creaRelleno, creaTroceador } from '../audio/marcos.js';
import type { EventoVoz, Muestras, OpcionesDetector, Turno } from '../types.js';

export interface DetectorVoz {
  /**
   * Consume audio (de cualquier tamano, a la frecuencia del modelo) y devuelve lo que haya
   * pasado. Devolver eventos en vez de emitirlos deja el nucleo sin emisor propio: el
   * consumidor los reparte como quiera, en React, en un stream o en un bucle.
   */
  procesa(entrada: Muestras): Promise<EventoVoz[]>;
  /** Cierra un turno abierto y vacia lo pendiente. Se llama al acabar el flujo. */
  cierra(): Promise<EventoVoz[]>;
  /** Olvida estado y vuelve al principio, sin recrear el modelo. */
  reinicia(): void;
  /** true si ahora mismo hay un turno abierto. Util para pintar un indicador. */
  readonly hablando: boolean;
}

export function creaDetectorVoz(opciones: OpcionesDetector): DetectorVoz {
  const { modelo } = opciones;
  const umbralEntrada = opciones.umbralEntrada ?? 0.5;
  const umbralSalida = opciones.umbralSalida ?? 0.35;
  const msSilencioParaCerrar = opciones.msSilencioParaCerrar ?? 500;
  const msMinimoHabla = opciones.msMinimoHabla ?? 120;
  const msRelleno = opciones.msRelleno ?? 200;
  const conservaAudio = opciones.conservaAudio ?? false;

  if (umbralSalida > umbralEntrada) {
    throw new Error('umbralSalida no puede superar a umbralEntrada: eso invierte la histeresis');
  }

  const msPorMarco = (modelo.tamMarco / modelo.frecuenciaHz) * 1000;
  const marcosSilencioCierre = Math.max(1, Math.round(msSilencioParaCerrar / msPorMarco));
  const muestrasRelleno = Math.max(modelo.tamMarco, Math.round((msRelleno / 1000) * modelo.frecuenciaHz));

  const troceador = creaTroceador(modelo.tamMarco);
  const relleno = creaRelleno(muestrasRelleno);

  let marcosVistos = 0;
  let hablando = false;
  let inicioTurnoMs = 0;
  let marcosSilencioSeguidos = 0;
  let audioTurno: Muestras[] = [];
  /** Cola de marcos de silencio al final del turno: entran solo si vuelve el habla. */
  let colaSilencio: Muestras[] = [];

  const msDe = (marcos: number) => (marcos * modelo.tamMarco * 1000) / modelo.frecuenciaHz;

  function cierraTurno(finMs: number, eventos: EventoVoz[]): void {
    const duracion = finMs - inicioTurnoMs;
    hablando = false;
    const audio = conservaAudio ? concatena(audioTurno) : undefined;
    audioTurno = [];
    colaSilencio = [];
    // Un tramo mas corto que `msMinimoHabla` es un golpe de mesa, un clic o una tos. Se
    // descarta entero: emitir un turno de 40 ms le da trabajo inutil a todo lo que venga
    // detras, y en diarizacion produce un hablante fantasma.
    if (duracion < msMinimoHabla) return;
    const turno: Turno = { inicioMs: inicioTurnoMs, finMs };
    if (audio) turno.audio = audio;
    eventos.push({ tipo: 'finHabla', turno });
  }

  async function procesaMarco(marco: Muestras, eventos: EventoVoz[]): Promise<void> {
    const p = await modelo.probabilidad(marco);
    const finMarcoMs = msDe(marcosVistos + 1);
    eventos.push({ tipo: 'probabilidad', valor: p, ms: msDe(marcosVistos) });

    if (!hablando) {
      relleno.escribe(marco);
      if (p >= umbralEntrada) {
        hablando = true;
        marcosSilencioSeguidos = 0;
        const previo = relleno.lee();
        // El turno empieza ANTES de la deteccion: tantos ms como quepan en el relleno.
        inicioTurnoMs = Math.max(0, finMarcoMs - (previo.length / modelo.frecuenciaHz) * 1000);
        if (conservaAudio) audioTurno = [previo];
        relleno.reinicia();
        eventos.push({ tipo: 'inicioHabla', ms: inicioTurnoMs });
      }
      marcosVistos++;
      return;
    }

    if (p >= umbralSalida) {
      // Vuelve el habla: el silencio corto que habia en cola era una pausa dentro de la
      // frase, no el final. Se recupera para no dejar un hueco mudo dentro del turno.
      if (conservaAudio && colaSilencio.length > 0) audioTurno.push(...colaSilencio);
      colaSilencio = [];
      marcosSilencioSeguidos = 0;
      if (conservaAudio) audioTurno.push(marco);
    } else {
      marcosSilencioSeguidos++;
      if (conservaAudio) colaSilencio.push(marco);
      if (marcosSilencioSeguidos >= marcosSilencioCierre) {
        // El turno acaba donde empezo el silencio, no donde lo confirmamos: si no, cada
        // turno se lleva medio segundo de nada pegado al final.
        cierraTurno(finMarcoMs - msSilencioParaCerrar, eventos);
        relleno.reinicia();
        relleno.escribe(marco);
      }
    }
    marcosVistos++;
  }

  return {
    get hablando() {
      return hablando;
    },
    async procesa(entrada: Muestras): Promise<EventoVoz[]> {
      const eventos: EventoVoz[] = [];
      for (const marco of troceador.empuja(entrada)) await procesaMarco(marco, eventos);
      return eventos;
    },
    async cierra(): Promise<EventoVoz[]> {
      const eventos: EventoVoz[] = [];
      const ultimo = troceador.vacia();
      if (ultimo) await procesaMarco(ultimo, eventos);
      if (hablando) cierraTurno(msDe(marcosVistos), eventos);
      return eventos;
    },
    reinicia() {
      troceador.reinicia();
      relleno.reinicia();
      modelo.reinicia();
      marcosVistos = 0;
      hablando = false;
      marcosSilencioSeguidos = 0;
      audioTurno = [];
      colaSilencio = [];
    },
  };
}
