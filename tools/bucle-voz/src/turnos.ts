/**
 * Identificador de turno y cancelación: la pieza que faltaba en la fuente (business-os no
 * numeraba los turnos, defecto 2 del análisis). Cada turno nace con su `AbortController`; abrir
 * otro aborta el anterior, y todo lo que el turno viejo tenía en vuelo (transcripción, cerebro,
 * voz) recibe la señal. Lo que llegue tarde se compara con `vigente(id)` y se tira: un turno
 * viejo nunca suena en el nuevo.
 */

export interface Turno {
  readonly id: number;
  readonly senal: AbortSignal;
  readonly vivo: boolean;
  /** Por qué murió, si murió. */
  readonly motivo: string | undefined;
  aborta(motivo: string): void;
}

export interface GestorTurnos {
  /** Abre un turno y aborta el que hubiera. */
  nuevo(): Turno;
  readonly actual: Turno | undefined;
  /** `true` solo para el turno actual y vivo. */
  vigente(id: number): boolean;
  /** Aborta el actual (interrupción, desactivar). */
  abortaActual(motivo: string): void;
}

export function creaGestorTurnos(): GestorTurnos {
  let siguiente = 1;
  let actual: Turno | undefined;

  const creaTurno = (id: number): Turno => {
    const control = new AbortController();
    let motivo: string | undefined;
    return {
      id,
      senal: control.signal,
      get vivo() {
        return !control.signal.aborted;
      },
      get motivo() {
        return motivo;
      },
      aborta(m) {
        if (control.signal.aborted) return;
        motivo = m;
        control.abort(new Error(`turno ${id} abortado: ${m}`));
      },
    };
  };

  return {
    get actual() {
      return actual;
    },
    nuevo() {
      actual?.aborta('turno nuevo');
      actual = creaTurno(siguiente++);
      return actual;
    },
    vigente(id) {
      return actual !== undefined && actual.id === id && actual.vivo;
    },
    abortaActual(motivo) {
      actual?.aborta(motivo);
    },
  };
}

/** Rechaza en cuanto la señal se aborta, aunque la promesa no sepa de señales. */
export function conSenal<T>(promesa: Promise<T>, senal: AbortSignal): Promise<T> {
  if (senal.aborted) return Promise.reject(senal.reason instanceof Error ? senal.reason : new Error('abortado'));
  return new Promise<T>((resuelve, rechaza) => {
    const alAbortar = () => rechaza(senal.reason instanceof Error ? senal.reason : new Error('abortado'));
    senal.addEventListener('abort', alAbortar, { once: true });
    promesa.then(
      (v) => {
        senal.removeEventListener('abort', alAbortar);
        resuelve(v);
      },
      (e: unknown) => {
        senal.removeEventListener('abort', alAbortar);
        rechaza(e);
      },
    );
  });
}
