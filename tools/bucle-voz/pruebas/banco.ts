/**
 * Banco común: un reloj que controla la prueba (los temporizadores avanzan con él, nada duerme)
 * y puertos falsos que registran lo que el bucle les pide, con promesas que la prueba resuelve
 * cuando quiere (así se fabrica «llegó tarde»).
 */
import {
  creaBucle,
  creaEnrutadorLocal,
  ORDENES_ES,
  type AudioFrase,
  type Bucle,
  type EventoBucle,
  type EventoReproductor,
  type Mensaje,
  type OpcionesBucle,
  type PiezaCerebro,
  type PiezaReproducir,
} from '../dist/index.js';

export interface Diferido<T> {
  promesa: Promise<T>;
  resuelve(v: T): void;
  rechaza(e: unknown): void;
}

export function diferido<T>(): Diferido<T> {
  let resuelve!: (v: T) => void;
  let rechaza!: (e: unknown) => void;
  const promesa = new Promise<T>((a, b) => {
    resuelve = a;
    rechaza = b;
  });
  return { promesa, resuelve, rechaza };
}

/** Deja correr las promesas pendientes. */
export const vacia = async (veces = 10) => {
  for (let i = 0; i < veces; i++) await new Promise((r) => setImmediate(r));
};

export interface RelojFalso {
  ahora(): number;
  avanza(ms: number): Promise<void>;
  programa(f: () => void, ms: number): () => void;
}

export function relojFalso(inicio = 0): RelojFalso {
  let t = inicio;
  let tareas: { cuando: number; f: () => void; viva: boolean }[] = [];
  return {
    ahora: () => t,
    programa(f, ms) {
      const tarea = { cuando: t + ms, f, viva: true };
      tareas.push(tarea);
      return () => {
        tarea.viva = false;
      };
    },
    async avanza(ms) {
      const fin = t + ms;
      for (;;) {
        const siguiente = tareas.filter((x) => x.viva && x.cuando <= fin).sort((a, b) => a.cuando - b.cuando)[0];
        if (!siguiente) break;
        t = siguiente.cuando;
        siguiente.viva = false;
        siguiente.f();
        await vacia();
      }
      tareas = tareas.filter((x) => x.viva);
      t = fin;
      await vacia();
    },
  };
}

export const audioDe = (ms: number, hz = 16_000): { muestras: Float32Array; hz: number } => ({ muestras: new Float32Array(Math.round((ms / 1000) * hz)).fill(0.1), hz });

export const fraseFalsa = (texto: string): AudioFrase => ({ muestras: new Float32Array(Math.max(1, texto.length * 10)).fill(0.2), hz: 16_000 });

/** Reproductor falso: «suena» al recibir (a la hora del reloj); «termina» cuando la prueba lo pide. */
export function reproductorFalso(reloj: RelojFalso) {
  const oyentes = new Set<(e: EventoReproductor) => void>();
  const recibidas: PiezaReproducir[] = [];
  let sonando: PiezaReproducir[] = [];
  let detenciones = 0;
  const emite = (e: EventoReproductor) => [...oyentes].forEach((f) => f(e));
  return {
    recibidas,
    get detenciones() {
      return detenciones;
    },
    get sonando() {
      return sonando;
    },
    velocidades: [] as number[],
    atenuaciones: [] as boolean[],
    reproduce(p: PiezaReproducir) {
      recibidas.push(p);
      sonando.push(p);
      emite({ tipo: 'suena', turno: p.turno, indice: p.indice, t: reloj.ahora() });
    },
    detiene() {
      detenciones++;
      sonando = [];
    },
    atenua(a: boolean) {
      this.atenuaciones.push(a);
    },
    velocidad(v: number) {
      this.velocidades.push(v);
    },
    alEvento(f: (e: EventoReproductor) => void) {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    /** Termina todo lo que suena, en orden. */
    terminaTodo() {
      const ahora = sonando;
      sonando = [];
      for (const p of ahora) emite({ tipo: 'termina', turno: p.turno, indice: p.indice, t: reloj.ahora() });
    },
    progreso(p: PiezaReproducir, fraccion: number) {
      emite({ tipo: 'progreso', turno: p.turno, indice: p.indice, fraccion });
    },
  };
}

export interface Montaje {
  bucle: Bucle;
  reloj: RelojFalso;
  rep: ReturnType<typeof reproductorFalso>;
  eventos: EventoBucle[];
  transcripciones: { senal: AbortSignal; d: Diferido<readonly string[]>; ms: number }[];
  sintesis: { frase: string; senal: AbortSignal; d: Diferido<AudioFrase> }[];
  pensadas: { mensajes: readonly Mensaje[]; senal: AbortSignal }[];
  lecturas: string[];
  /** Si es `true`, la voz se resuelve sola al pedirla. */
  vozInmediata: boolean;
  /** Tokens que el cerebro devuelve (uno por pieza), con una espera opcional antes de cada uno. */
  respuestaCerebro: string[];
  pausaCerebro?: Diferido<void>;
}

export function monta(extra: Partial<OpcionesBucle> = {}): Montaje {
  const reloj = relojFalso(10_000);
  const rep = reproductorFalso(reloj);
  const m = { reloj, rep, eventos: [], transcripciones: [], sintesis: [], pensadas: [], lecturas: [], vozInmediata: true, respuestaCerebro: ['Un balance ', 'general resume ', 'activos y pasivos. ', 'Sirve para ', 'decidir.'] } as unknown as Montaje;
  m.bucle = creaBucle({
    modo: 'manos-libres',
    reloj: reloj.ahora,
    programa: reloj.programa,
    enrutador: creaEnrutadorLocal({ ordenes: ORDENES_ES }),
    transcriptor: {
      transcribe(audio, senal) {
        const d = diferido<readonly string[]>();
        m.transcripciones.push({ senal, d, ms: (audio.muestras.length / audio.hz) * 1000 });
        return d.promesa;
      },
    },
    sintetizador: {
      sintetiza(frase, senal) {
        const d = diferido<AudioFrase>();
        m.sintesis.push({ frase, senal, d });
        if (m.vozInmediata) d.resuelve(fraseFalsa(frase));
        return d.promesa;
      },
    },
    cerebro: {
      async *piensa(mensajes, senal): AsyncGenerator<PiezaCerebro> {
        m.pensadas.push({ mensajes, senal });
        for (const t of m.respuestaCerebro) {
          if (m.pausaCerebro) await m.pausaCerebro.promesa;
          if (senal.aborted) return;
          yield { tipo: 'token', texto: t };
        }
        yield { tipo: 'uso', costoUsd: 0.00005 };
      },
    },
    lector: {
      async lee(orden) {
        m.lecturas.push(orden);
        return orden === 'hora' ? 'Son las cinco y veinte de la tarde.' : `Lectura de ${orden}.`;
      },
    },
    reproductor: rep,
    ...extra,
  });
  m.bucle.suscribe((e) => m.eventos.push(e));
  return m;
}

/** Un tramo de voz completo: inicio, fin real y cierre del VAD `msCierre` después. */
export async function habla(m: Montaje, msVoz = 800, msCierre = 600): Promise<{ finReal: number }> {
  m.bucle.vozInicia(m.reloj.ahora());
  await m.reloj.avanza(msVoz);
  const finReal = m.reloj.ahora();
  await m.reloj.avanza(msCierre);
  m.bucle.vozTermina(audioDe(msVoz), finReal, m.reloj.ahora());
  await vacia();
  return { finReal };
}
