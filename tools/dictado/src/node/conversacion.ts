/**
 * El modo conversacion con el agente, del lado Node: une la maquina pura del envio por silencio
 * (`../envio.ts`) con el reloj de verdad, el destino del turno, el hablante y el microfono.
 *
 *  - El destino del turno es un callback: hoy, pulsar Enter en la caja del agente (cerebro: el
 *    terminal de Claude Code); otro cerebro lo cambia sin tocar la maquina ni el socket.
 *  - `di(texto)` es half-duplex (RF-39): si la persona esta a media frase espera a que cierre el
 *    turno (RF-40), pausa el envio, cierra la PUERTA LOGICA del audio (nada del microfono entra al
 *    detector), habla, deja un margen para que la sala calle, reinicia el detector y reabre.
 *    La captura (ffmpeg) NO se para: medido el 2026-09-23 (medicion B, 70 respuestas con el
 *    altavoz sonando en la sala), la puerta sola no deja pasar ni una palabra de la voz del agente,
 *    y parar y rearrancar la captura no anadia nada y costaba ~210 ms mas de primer audio y
 *    ~100 ms mas de reapertura.
 *  - Solo el envio depende de `activa`; `di` funciona siempre que `dictar` corra, porque
 *    tambien `dictado di` a mano quiere el microfono callado.
 */
import type { Estado, EventoDictado } from '../dictado.js';
import type { EntradaEnvio, EnvioPorSilencio } from '../envio.js';
import type { RespuestaDi } from './conversacion-socket.js';
import type { Hablante, ResultadoDi } from './hablante.js';

export interface OpcionesConversacion {
  envio: EnvioPorSilencio;
  /** Que hacer cuando el turno se envia: hoy, `pegador.ejecuta(['enter'])`. */
  alEnviar: () => Promise<void> | void;
  /** El estado del dictado en este momento. */
  estado?: () => Estado;
  /** Carga (una vez) la voz y el altavoz. Sin el, `di` se omite. */
  hablante?: () => Promise<Hablante>;
  detector?: { readonly hablando: boolean; reinicia(): void };
  /** Margen tras la voz antes de reabrir la puerta: la sala tarda en callar (medicion B). */
  msMargen?: number;
  /** Tope de espera si la persona esta a media frase cuando llega el texto (RF-40). */
  msEsperaTurno?: number;
  alRespuestaHablada?: (r: ResultadoDi) => void;
  ahora?: () => number;
  /** Programa un aviso y devuelve como cancelarlo. Inyectable para probar sin esperar. */
  programa?: (ms: number, fn: () => void) => () => void;
  log?: (linea: string) => void;
  /** Trazas con instante, para la medicion (`DICTADO_CONVERSACION_TRAZA=1`). */
  traza?: (etiqueta: string) => void;
}

export interface Conversacion {
  /** Encender o apagar el envio por silencio. Al apagar se olvida lo pendiente: nada se envia solo. */
  activa: boolean;
  alEvento(evento: EventoDictado): void;
  /** Falso mientras suena la voz del agente: el audio del microfono no entra al detector. */
  admiteAudio(): boolean;
  di(texto: string): Promise<RespuestaDi>;
  calla(): void;
  /** `on|off <estado>`: lo que el socket saluda. */
  saludo(): string;
  cierra(): Promise<void>;
}

export const DEFECTOS_CONVERSACION = { msMargen: 150, msEsperaTurno: 5_000 };

const programaPorDefecto = (ms: number, fn: () => void): (() => void) => {
  const t = setTimeout(fn, ms);
  t.unref();
  return () => clearTimeout(t);
};

export function creaConversacion(o: OpcionesConversacion): Conversacion {
  const ahora = o.ahora ?? (() => performance.now());
  const programa = o.programa ?? programaPorDefecto;
  const log = o.log ?? ((l: string) => console.log(l));
  const traza = o.traza ?? (() => undefined);
  const msMargen = o.msMargen ?? DEFECTOS_CONVERSACION.msMargen;
  const msEsperaTurno = o.msEsperaTurno ?? DEFECTOS_CONVERSACION.msEsperaTurno;
  let activa = false;
  let admite = true;
  let cancela: (() => void) | undefined;
  let hablante: Hablante | undefined;
  /** Los Enter van en serie y detras del pegado: el mismo hijo de PowerShell los ordena. */
  let envios: Promise<void> = Promise.resolve();
  /** Las respuestas van en serie: dos seguidas suenan una tras otra. */
  let turnos: Promise<unknown> = Promise.resolve();
  /** Quien espera a que la persona termine su frase (RF-40). */
  let esperandoTurno: Array<() => void> = [];

  const reprograma = () => {
    cancela?.();
    cancela = undefined;
    const espera = o.envio.vence(ahora());
    if (espera !== undefined) cancela = programa(espera + 5, tick);
  };
  const aplica = (entrada: EntradaEnvio) => {
    if (o.envio.aplica(entrada, ahora()) === 'enviar') {
      log(`↵ enviado por silencio (${o.envio.msEnvio} ms tras el ultimo pegado)`);
      traza('enviado');
      envios = envios.then(() => o.alEnviar()).catch((e: unknown) => log(`✗ envio: ${e instanceof Error ? e.message : String(e)}`));
    }
    reprograma();
  };
  const tick = () => {
    cancela = undefined;
    if (activa) aplica({ tipo: 'tick' });
  };
  const turnoCerrado = () => {
    const avisa = esperandoTurno;
    esperandoTurno = [];
    for (const a of avisa) a();
  };
  const esperaFinDeTurno = () =>
    new Promise<void>((resuelve) => {
      const quita = programa(msEsperaTurno, () => resuelve());
      esperandoTurno.push(() => {
        quita();
        resuelve();
      });
    });
  const pausa = (ms: number) => new Promise<void>((r) => programa(ms, r));

  const habla = async (texto: string): Promise<RespuestaDi> => {
    traza('di-recibido');
    if (!o.hablante) return { tipo: 'omitido', motivo: 'sin-voz' };
    if (o.detector?.hablando) await esperaFinDeTurno();
    aplica({ tipo: 'vozAgente', activa: true });
    admite = false;
    traza('puerta-cerrada');
    let r: ResultadoDi | undefined;
    try {
      hablante ??= await o.hablante();
      r = await hablante.di(texto, { alPrimerAudio: () => traza('primer-audio') });
    } catch (e) {
      log(`✗ voz del agente: ${e instanceof Error ? e.message : String(e)}`);
    }
    traza('voz-fin');
    await pausa(msMargen);
    o.detector?.reinicia();
    admite = true;
    traza('puerta-abierta');
    aplica({ tipo: 'vozAgente', activa: false });
    if (!r) return { tipo: 'omitido', motivo: 'fallo-de-voz' };
    o.alRespuestaHablada?.(r);
    return r.cortado ? { tipo: 'cortado' } : { tipo: 'hecho', msPrimerAudio: r.msPrimerAudio, msTotal: r.msTotal };
  };

  return {
    get activa() {
      return activa;
    },
    set activa(valor: boolean) {
      if (valor === activa) return;
      activa = valor;
      if (valor) {
        aplica({ tipo: 'estado', estado: o.estado?.() ?? 'inactivo' });
      } else {
        cancela?.();
        cancela = undefined;
        o.envio.aplica({ tipo: 'estado', estado: 'inactivo' }, ahora());
      }
    },
    alEvento(e) {
      if (e.tipo === 'finHabla' || e.tipo === 'sinVoz' || e.tipo === 'soloMuletillas' || e.tipo === 'texto' || (e.tipo === 'estado' && e.estado === 'inactivo')) turnoCerrado();
      if (!activa) return;
      switch (e.tipo) {
        case 'texto': {
          const partes = [{ texto: e.texto, acciones: e.acciones }, ...(e.siguientes ?? [])];
          const ultima = partes[partes.length - 1];
          const pendiente = !(ultima?.acciones.includes('enter') ?? false);
          traza(pendiente ? 'pegado pendiente' : 'pegado enter');
          aplica({ tipo: 'pegado', pendiente });
          break;
        }
        case 'inicioHabla':
          traza('inicio-habla');
          aplica({ tipo: 'inicioHabla' });
          break;
        case 'finHabla':
          traza('fin-habla');
          aplica({ tipo: 'finHabla' });
          break;
        case 'error':
          aplica({ tipo: 'sinVoz' }); // hubo audio, no texto: lo pegado sigue esperando
          break;
        case 'sinVoz':
        case 'soloMuletillas':
          aplica({ tipo: 'sinVoz' });
          break;
        case 'estado':
          aplica({ tipo: 'estado', estado: e.estado });
          break;
        default:
          break;
      }
    },
    admiteAudio: () => admite,
    di(texto) {
      const turno = turnos.then(() => habla(texto));
      turnos = turno.catch(() => undefined);
      return turno;
    },
    calla() {
      hablante?.calla();
    },
    saludo: () => `${activa ? 'on' : 'off'} ${o.estado?.() ?? 'inactivo'}`,
    async cierra() {
      cancela?.();
      cancela = undefined;
      turnoCerrado();
      await hablante?.cierra();
      hablante = undefined;
    },
  };
}
