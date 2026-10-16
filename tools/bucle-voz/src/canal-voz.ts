/**
 * La voz de UN turno: cada frase se sintetiza en cuanto existe (varias a la vez, con tope) y se
 * entrega al reproductor EN ORDEN. Es lo mejor de la fuente (voz por oración pedida en paralelo y
 * encolada en orden) con tres cosas que allí faltaban:
 *  - todo va atado al turno: si el turno muere, lo que llegue tarde se tira (defecto 2b);
 *  - una frase que falla no se pierde en silencio: se reintenta una vez y, si no, se avisa
 *    (defecto 7) y la cola sigue;
 *  - la entrega puede quedar RETENIDA hasta confirmar el turno: así se prepara la respuesta durante
 *    la pausa (especulación) sin que suene nada si la persona sigue hablando.
 */
import type { Turno } from './turnos.js';

export interface AudioFrase {
  muestras: Float32Array;
  hz: number;
}

export interface PiezaReproducir {
  turno: number;
  indice: number;
  texto: string;
  audio: AudioFrase;
}

export interface Sintetizador {
  sintetiza(frase: string, senal: AbortSignal): Promise<AudioFrase>;
}

export interface OpcionesCanal {
  turno: Turno;
  sintetizador: Sintetizador;
  entrega(p: PiezaReproducir): void;
  alFallo(indice: number, texto: string, mensaje: string): void;
  alVozLista?(indice: number): void;
  concurrencia?: number;
  reintentos?: number;
  confirmado?: boolean;
}

type EstadoRanura = 'pendiente' | 'sintetizando' | 'lista' | 'fallida' | 'entregada';

interface Ranura {
  texto: string;
  estado: EstadoRanura;
  audio?: AudioFrase;
  intentos: number;
}

export interface CanalVoz {
  agrega(frase: string): void;
  /** Ya no vendrán más frases. */
  termina(): void;
  /** Suelta lo retenido y deja pasar lo que venga. */
  confirma(): void;
  /** Entrega audio ya hecho (repetir sin volver a sintetizar). */
  agregaHecha(texto: string, audio: AudioFrase): void;
  readonly frases: readonly string[];
  readonly terminado: boolean;
  /** Frases que nunca van a sonar (fallaron). */
  readonly fallidas: number;
  readonly entregadas: number;
}

export function creaCanalVoz(o: OpcionesCanal): CanalVoz {
  const concurrencia = o.concurrencia ?? 2;
  const reintentos = o.reintentos ?? 1;
  const ranuras: Ranura[] = [];
  let siguiente = 0;
  let activas = 0;
  let confirmado = o.confirmado ?? true;
  let terminado = false;

  const entregaEnOrden = () => {
    while (confirmado && o.turno.vivo) {
      const r = ranuras[siguiente];
      if (!r || (r.estado !== 'lista' && r.estado !== 'fallida')) return;
      if (r.estado === 'lista' && r.audio) {
        r.estado = 'entregada';
        o.entrega({ turno: o.turno.id, indice: siguiente, texto: r.texto, audio: r.audio });
      }
      siguiente++;
    }
  };

  const sintetiza = (indice: number) => {
    const r = ranuras[indice];
    if (!r) return;
    r.estado = 'sintetizando';
    r.intentos++;
    activas++;
    o.sintetizador.sintetiza(r.texto, o.turno.senal).then(
      (audio) => {
        activas--;
        if (!o.turno.vivo) return;
        r.audio = audio;
        r.estado = 'lista';
        o.alVozLista?.(indice);
        entregaEnOrden();
        bombea();
      },
      (e: unknown) => {
        activas--;
        if (!o.turno.vivo) return;
        if (r.intentos <= reintentos) r.estado = 'pendiente';
        else {
          r.estado = 'fallida';
          o.alFallo(indice, r.texto, e instanceof Error ? e.message : 'la voz falló');
        }
        entregaEnOrden();
        bombea();
      },
    );
  };

  const bombea = () => {
    for (let i = 0; i < ranuras.length && activas < concurrencia && o.turno.vivo; i++) {
      if (ranuras[i]?.estado === 'pendiente') sintetiza(i);
    }
  };

  return {
    get frases() {
      return ranuras.map((r) => r.texto);
    },
    get terminado() {
      return terminado;
    },
    get fallidas() {
      return ranuras.filter((r) => r.estado === 'fallida').length;
    },
    get entregadas() {
      return ranuras.filter((r) => r.estado === 'entregada').length;
    },
    agrega(frase) {
      if (terminado || !o.turno.vivo) return;
      ranuras.push({ texto: frase, estado: 'pendiente', intentos: 0 });
      bombea();
    },
    agregaHecha(texto, audio) {
      if (terminado || !o.turno.vivo) return;
      ranuras.push({ texto, estado: 'lista', audio, intentos: 0 });
      entregaEnOrden();
    },
    termina() {
      terminado = true;
    },
    confirma() {
      confirmado = true;
      entregaEnOrden();
    },
  };
}
