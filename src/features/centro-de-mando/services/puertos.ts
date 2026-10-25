'use client';

/**
 * Los puertos del bucle en el navegador. Lo que se puede contestar aquí se contesta aquí (la hora,
 * la fecha, la telemetría, la ayuda): ni red ni servidor. La agenda y el gasto van al servidor
 * local. La voz de las frases fijas se cachea y se calienta al empezar: «Dime.» o «De acuerdo,
 * más despacio.» suenan sin esperar al sintetizador. Las del ACUSE van primero: son las que suenan
 * en cuanto una pregunta va al cerebro.
 */
import {
  creaSeparador,
  fechaEnPalabras,
  horaEnPalabras,
  resume,
  type AudioFrase,
  type Cerebro,
  type Lector,
  type Sintetizador,
  type Telemetria,
  type Transcriptor,
} from '../../../../tools/bucle-voz/dist/index.js';
import * as cliente from './cliente.ts';

export const FRASES_FIJAS = ['Dime.', 'De acuerdo, más despacio.', 'De acuerdo, más rápido.', 'Hasta luego.', 'Descartado.', 'Todavía no he dicho nada.', 'Perdón, no pude contestar ahora.'];

const AYUDA = 'Puedo decirte la hora, la fecha y tu agenda de hoy o de mañana, cuánto llevo gastado y cómo voy de rapidez. También me callo, repito, y hablo más despacio o más rápido. Lo demás lo pienso con el cerebro. No escribo nada: lo que escribiría lo dejo en borrador.';

const ms = (v: number | undefined) => (v === undefined ? 'sin datos' : `${Math.round(v)} milisegundos`);

export interface Puertos {
  transcriptor: Transcriptor;
  sintetizador: Sintetizador & { calienta(): Promise<void> };
  cerebro: Cerebro;
  lector: Lector;
  /** Calcula las lecturas probables (hora del minuto, fecha, agenda) y sintetiza su PRIMERA frase de antemano. */
  calientaLecturas(): Promise<void>;
}

/** La primera frase tal como la cortará el canal de voz del bucle (mismo separador). */
const primeraFrase = (texto: string): string | undefined => {
  const s = creaSeparador();
  return [...s.empuja(texto), ...s.cierra()][0];
};

const MAX_CACHE = 96;

/** Las frases que nunca salen de la caché (el acuse y las fijas): una respuesta larga no las empuja fuera. */
const fijas = (frasesAcuse: readonly string[]) => new Set([...frasesAcuse, ...FRASES_FIJAS]);

export function creaPuertos(token: string, telemetria: () => Telemetria | undefined, zona = 'America/Mexico_City', frasesAcuse: readonly string[] = []): Puertos {
  const cache = new Map<string, AudioFrase>();
  const protegidas = fijas(frasesAcuse);
  const sintetizador = {
    async sintetiza(frase: string, senal: AbortSignal): Promise<AudioFrase> {
      const guardada = cache.get(frase);
      if (guardada) return guardada;
      const audio = await cliente.sintetiza(token, frase, senal);
      if (frase.length <= 120) {
        cache.set(frase, audio);
        if (cache.size > MAX_CACHE) {
          const vieja = [...cache.keys()].find((k) => !protegidas.has(k));
          if (vieja !== undefined) cache.delete(vieja);
        }
      }
      return audio;
    },
    async calienta() {
      const senal = new AbortController().signal;
      for (const f of [...frasesAcuse, ...FRASES_FIJAS]) await sintetizador.sintetiza(f, senal).catch(() => undefined);
    },
  };
  const lector: Lector = {
    async lee(orden, senal) {
      if (orden === 'hora') return horaEnPalabras(new Date(), zona);
      if (orden === 'fecha') return fechaEnPalabras(new Date(), zona);
      if (orden === 'ayuda') return AYUDA;
      if (orden === 'estado') {
        const t = telemetria()?.turnos() ?? [];
        const o = resume(t, 'orden');
        const l = resume(t, 'llm');
        return `Desde que callas hasta que suena mi voz: las órdenes, ${ms(o.p50)} de mediana; con el cerebro, ${ms(l.p50)}.`;
      }
      if (orden === 'agenda-hoy' || orden === 'agenda-manana' || orden === 'gasto') return cliente.lee(token, orden, senal);
      return 'Esa lectura no la tengo.';
    },
  };
  return {
    transcriptor: { transcribe: (audio, senal) => cliente.transcribe(token, audio, senal) },
    sintetizador,
    cerebro: { piensa: (mensajes, senal) => cliente.piensa(token, mensajes, senal) },
    lector,
    async calientaLecturas() {
      const senal = new AbortController().signal;
      const textos = await Promise.all((['hora', 'fecha', 'agenda-hoy', 'agenda-manana'] as const).map((o) => lector.lee(o, senal).catch(() => '')));
      for (const t of textos) {
        const f = primeraFrase(t);
        if (f) await sintetizador.sintetiza(f, senal).catch(() => undefined);
      }
    },
  };
}
