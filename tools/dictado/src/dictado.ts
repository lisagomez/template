/**
 * La maquina de estados del dictado. TypeScript puro: recibe audio por `alimenta`, detecta
 * los turnos con el `DetectorVoz` de `voz`, los transcribe, los posprocesa y los entrega al
 * `Pegador`. Nada mas — y nada menos, porque aqui vive la unica cifra que le importa a quien
 * dicta: la **latencia** entre que deja de hablar y que aparece el texto.
 *
 * Tres modos, dos comportamientos:
 *  - `alternar` y `pulsar`: entre `empieza()` y `termina()` se acumulan los turnos que el VAD
 *    recorte, y al terminar se transcriben JUNTOS en una sola llamada. Un solo contexto da
 *    mejor puntuacion que tres trozos, y la latencia se mide desde `termina()`. Quien decide
 *    cuando —una tecla mantenida, un toggle— es el punto de entrada; el nucleo no lo sabe.
 *  - `manosLibres`: cada turno que el VAD cierra se transcribe y se pega por su cuenta, en
 *    serie. La latencia se mide desde que el VAD cerro el turno.
 *
 * Los eventos se entregan por callback y no por emisor propio: el consumidor los pinta en
 * una TUI, los escribe en un log o los ignora.
 */
import type { Posproceso } from './posproceso.js';
import type { Almacen } from './historial.js';
import type { Accion, DetectorVoz, Muestras, Pegador, Transcriptor, Turno } from './types.js';

export type Modo = 'alternar' | 'pulsar' | 'manosLibres';
export type Estado = 'inactivo' | 'escuchando' | 'transcribiendo' | 'pegando';

export type EventoDictado =
  | { tipo: 'estado'; estado: Estado }
  | { tipo: 'inicioHabla'; ms: number }
  | { tipo: 'finHabla'; duracionMs: number }
  | { tipo: 'texto'; texto: string; textoCrudo: string; acciones: Accion[]; duracionMs: number; latenciaMs: number; msMotor: number }
  | { tipo: 'sinVoz' }
  | { tipo: 'error'; mensaje: string };

export interface OpcionesDictado {
  detector: DetectorVoz;
  transcriptor: Transcriptor;
  /** Frecuencia del audio que entra por `alimenta`, la misma que espera el detector. */
  frecuenciaHz: number;
  modo?: Modo;
  idioma?: string;
  /** Vocabulario a favorecer, consultado en cada transcripcion (el diccionario cambia en caliente). */
  pista?: () => string | undefined;
  posproceso?: Posproceso;
  pegador?: Pegador;
  almacen?: Almacen;
  /** Nombre del motor que se escribe en el historial. */
  motorId?: string;
  /** Silencio, en ms, que se intercala entre turnos al juntarlos. Por defecto 150. */
  msSilencioEntreTurnos?: number;
  ahora?: () => number;
  alEvento?: (evento: EventoDictado) => void;
}

export interface Dictado {
  readonly estado: Estado;
  readonly modo: Modo;
  /** Pasa a `escuchando`. En `manosLibres` cada turno cerrado sale solo; en los otros se acumulan. */
  empieza(): void;
  /** Deja de escuchar y, en `alternar`/`pulsar`, transcribe y pega lo acumulado. Resuelve cuando el texto se entrego. */
  termina(): Promise<void>;
  /** Audio a `frecuenciaHz`, del tamano que sea. Fuera de `escuchando` se descarta. */
  alimenta(muestras: Muestras): Promise<void>;
  cambiaModo(modo: Modo): void;
}

/** Junta el audio de varios turnos con un silencio corto entre ellos. */
export function juntaTurnos(turnos: readonly Turno[], frecuenciaHz: number, msSilencio: number): Muestras {
  const conAudio = turnos.filter((t): t is Turno & { audio: Muestras } => t.audio !== undefined && t.audio.length > 0);
  const hueco = Math.round((frecuenciaHz * msSilencio) / 1000);
  const largo = conAudio.reduce((s, t) => s + t.audio.length, 0) + Math.max(0, conAudio.length - 1) * hueco;
  const salida = new Float32Array(largo);
  let pos = 0;
  for (const [i, t] of conAudio.entries()) {
    if (i > 0) pos += hueco;
    salida.set(t.audio, pos);
    pos += t.audio.length;
  }
  return salida;
}

export function creaDictado(opciones: OpcionesDictado): Dictado {
  const { detector, transcriptor, frecuenciaHz } = opciones;
  const ahora = opciones.ahora ?? (() => performance.now());
  const emite = opciones.alEvento ?? (() => undefined);
  const msSilencio = opciones.msSilencioEntreTurnos ?? 150;
  let modo: Modo = opciones.modo ?? 'alternar';
  let estado: Estado = 'inactivo';
  /**
   * Separado de `estado` a proposito: en `manosLibres` el microfono sigue abierto mientras el
   * turno anterior se transcribe. Si el audio se descartara por estar en `transcribiendo`,
   * se perderia el principio de la frase siguiente — y nadie sabria por que.
   */
  let escuchando = false;
  let acumulados: Turno[] = [];
  let cola: Promise<void> = Promise.resolve();

  const cambia = (nuevo: Estado) => {
    if (estado === nuevo) return;
    estado = nuevo;
    emite({ tipo: 'estado', estado });
  };

  /** Un turno (o varios juntos) → motor → posproceso → pegador → historial. */
  const entrega = async (audio: Muestras, finHablaMs: number): Promise<void> => {
    const duracionMs = (audio.length / frecuenciaHz) * 1000;
    cambia('transcribiendo');
    const t0 = ahora();
    const transcripcion = await transcriptor.transcribe(audio, frecuenciaHz, { idioma: opciones.idioma, pista: opciones.pista?.() });
    const msMotor = ahora() - t0;
    const textoCrudo = transcripcion.texto.trim();
    if (textoCrudo.length === 0) {
      emite({ tipo: 'sinVoz' });
      return;
    }
    const procesado = opciones.posproceso ? await opciones.posproceso.procesa(textoCrudo) : { texto: textoCrudo, acciones: [] as Accion[] };
    cambia('pegando');
    if (opciones.pegador && procesado.texto.length > 0) {
      await opciones.pegador.pega(procesado.texto);
      if (procesado.acciones.length > 0) await opciones.pegador.ejecuta?.(procesado.acciones);
    }
    const latenciaMs = ahora() - finHablaMs;
    emite({ tipo: 'texto', texto: procesado.texto, textoCrudo, acciones: procesado.acciones, duracionMs, latenciaMs, msMotor });
    await opciones.almacen?.agrega({
      texto: procesado.texto,
      ...(procesado.texto !== textoCrudo ? { textoCrudo } : {}),
      motor: opciones.motorId ?? 'desconocido',
      duracionMs: Math.round(duracionMs),
      latenciaMs: Math.round(latenciaMs),
    });
  };

  /** En serie: un motor local satura la CPU con una instancia y el orden del texto importa. */
  const encola = (audio: Muestras, finHablaMs: number): Promise<void> => {
    cola = cola
      .then(() => entrega(audio, finHablaMs))
      .catch((error: unknown) => emite({ tipo: 'error', mensaje: error instanceof Error ? error.message : String(error) }))
      .then(() => cambia(escuchando ? 'escuchando' : 'inactivo'));
    return cola;
  };

  const reparte = (eventos: readonly import('./types.js').EventoVoz[]) => {
    for (const evento of eventos) {
      if (evento.tipo === 'inicioHabla') emite({ tipo: 'inicioHabla', ms: evento.ms });
      if (evento.tipo !== 'finHabla') continue;
      const turno = evento.turno;
      emite({ tipo: 'finHabla', duracionMs: turno.finMs - turno.inicioMs });
      if (modo === 'manosLibres') {
        if (turno.audio && turno.audio.length > 0) void encola(turno.audio, ahora());
      } else {
        acumulados.push(turno);
      }
    }
  };

  return {
    get estado() {
      return estado;
    },
    get modo() {
      return modo;
    },
    cambiaModo(nuevo) {
      if (estado !== 'inactivo') throw new Error('el modo se cambia con el dictado inactivo');
      modo = nuevo;
    },
    empieza() {
      if (estado !== 'inactivo') return;
      acumulados = [];
      detector.reinicia();
      escuchando = true;
      cambia('escuchando');
    },
    async alimenta(muestras) {
      if (!escuchando) return;
      reparte(await detector.procesa(muestras));
    },
    async termina() {
      if (!escuchando) return;
      escuchando = false;
      const finHablaMs = ahora();
      reparte(await detector.cierra());
      if (modo === 'manosLibres') {
        await cola;
        cambia('inactivo');
        return;
      }
      const audio = juntaTurnos(acumulados, frecuenciaHz, msSilencio);
      acumulados = [];
      if (audio.length === 0) {
        emite({ tipo: 'sinVoz' });
        cambia('inactivo');
        return;
      }
      await encola(audio, finHablaMs);
    },
  };
}
