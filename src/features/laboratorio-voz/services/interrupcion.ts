/**
 * La maquina de estados del «callate si te hablo» (barge-in), pura y sin reloj propio: recibe
 * los eventos del detector de voz de `tools/voz` (probabilidad por marco, inicio y fin de habla)
 * y dice que hacer. Tres reglas, cada una por una razon medida:
 *
 *  - **Calibracion**: los primeros `msCalibracion` no cuentan. El detector por energia fija su
 *    suelo con el primer marco; si la maquina ya suena, ese marco es la maquina, no el silencio.
 *  - **Confirmacion**: un inicio de habla arma; solo si sigue habiendo voz `msConfirmacion`
 *    despues se interrumpe. Un golpe o un clic abren el detector y no llegan a eso.
 *  - **Desarme**: si tras armar vuelve el silencio antes de confirmar, se desarma sin hacer nada.
 *
 * Con la maquina callada la misma maquina sigue escuchando: el fin de habla entrega el turno de
 * la persona para transcribirlo (manos libres).
 */

export interface TurnoPersona {
  inicioMs: number;
  finMs: number;
  audio?: Float32Array;
}

export type EventoEntrada =
  | { tipo: 'probabilidad'; valor: number; ms: number }
  | { tipo: 'inicioHabla'; ms: number }
  | { tipo: 'finHabla'; turno: TurnoPersona };

export type Accion =
  | { tipo: 'calibrado'; ms: number }
  | { tipo: 'interrumpir'; ms: number; msDesdeInicioHabla: number }
  | { tipo: 'turno'; turno: TurnoPersona; interrumpio: boolean };

export type EstadoInterrupcion = 'calibrando' | 'en-espera' | 'armado' | 'persona-habla';

export interface OpcionesInterrupcion {
  msCalibracion?: number;
  msConfirmacion?: number;
  /** Silencio seguido, en ms, que desarma un inicio no confirmado. */
  msDesarme?: number;
  /** Duracion de un marco del detector, para contar voz por marcos de probabilidad. */
  msPorMarco?: number;
  /** Probabilidad a partir de la cual un marco cuenta como voz (el umbral de entrada del detector). */
  umbralVoz?: number;
}

export interface MaquinaInterrupcion {
  /** `maquinaHabla`: si la voz sintetica esta sonando ahora mismo. */
  procesa(evento: EventoEntrada, maquinaHabla: boolean): Accion[];
  readonly estado: EstadoInterrupcion;
  reinicia(): void;
}

export const DEFECTOS_INTERRUPCION = { msCalibracion: 300, msConfirmacion: 150, msDesarme: 300, msPorMarco: 32, umbralVoz: 0.5 };

export function creaInterrupcion(opciones: OpcionesInterrupcion = {}): MaquinaInterrupcion {
  const { msCalibracion, msConfirmacion, msDesarme, msPorMarco, umbralVoz } = { ...DEFECTOS_INTERRUPCION, ...opciones };
  let estado: EstadoInterrupcion = 'calibrando';
  let msInicio: number | undefined;
  let msArmado = 0;
  let msVoz = 0;
  let msSilencio = 0;
  let interrumpio = false;

  const ahoraDe = (e: EventoEntrada): number => (e.tipo === 'finHabla' ? e.turno.finMs : e.ms);

  return {
    get estado() {
      return estado;
    },
    reinicia() {
      estado = 'calibrando';
      msInicio = undefined;
      msVoz = 0;
      msSilencio = 0;
      interrumpio = false;
    },
    procesa(evento, maquinaHabla) {
      const ahora = ahoraDe(evento);
      if (msInicio === undefined) msInicio = ahora;
      const acciones: Accion[] = [];
      if (estado === 'calibrando') {
        if (ahora - msInicio < msCalibracion) return acciones;
        estado = 'en-espera';
        acciones.push({ tipo: 'calibrado', ms: ahora });
        // Lo que empezo durante la calibracion no cuenta: se espera un inicio nuevo.
        if (evento.tipo !== 'inicioHabla') return acciones;
      }
      if (estado === 'en-espera') {
        if (evento.tipo === 'inicioHabla') {
          estado = 'armado';
          msArmado = evento.ms;
          msVoz = 0;
          msSilencio = 0;
          interrumpio = false;
        }
        return acciones;
      }
      if (estado === 'armado') {
        if (evento.tipo === 'probabilidad') {
          if (evento.valor >= umbralVoz) {
            msVoz += msPorMarco;
            msSilencio = 0;
          } else {
            msSilencio += msPorMarco;
          }
          if (msVoz >= msConfirmacion) {
            estado = 'persona-habla';
            if (maquinaHabla) {
              interrumpio = true;
              acciones.push({ tipo: 'interrumpir', ms: evento.ms, msDesdeInicioHabla: evento.ms - msArmado });
            }
          } else if (msSilencio >= msDesarme) {
            estado = 'en-espera';
          }
        } else if (evento.tipo === 'finHabla') {
          // El detector cerro sin que llegaramos a confirmar: fue corto. Aun asi, si el turno
          // dura mas que la confirmacion, es voz de verdad y se entrega.
          estado = 'en-espera';
          if (evento.turno.finMs - evento.turno.inicioMs >= msConfirmacion) acciones.push({ tipo: 'turno', turno: evento.turno, interrumpio: false });
        }
        return acciones;
      }
      // persona-habla
      if (evento.tipo === 'finHabla') {
        estado = 'en-espera';
        acciones.push({ tipo: 'turno', turno: evento.turno, interrumpio });
        interrumpio = false;
      }
      return acciones;
    },
  };
}
