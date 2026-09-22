/**
 * El modo conversacion con el agente, del lado Node: une la maquina pura del envio por silencio
 * (`../envio.ts`) con el reloj de verdad y con el destino del turno. El destino es un callback:
 * hoy, pulsar Enter en la caja del agente (cerebro: el terminal de Claude Code); otro cerebro lo
 * cambia sin tocar la maquina. Solo actua mientras `activa`; apagado, no toca nada y el dictado
 * sigue como siempre («dale enter» incluido).
 *
 * Fase 1 del PRP-003 (RF-38). La fase 2 anade el hablante y el microfono callado.
 */
import type { Estado, EventoDictado } from '../dictado.js';
import type { EntradaEnvio, EnvioPorSilencio } from '../envio.js';

export interface OpcionesConversacion {
  envio: EnvioPorSilencio;
  /** Que hacer cuando el turno se envia: hoy, `pegador.ejecuta(['enter'])`. */
  alEnviar: () => Promise<void> | void;
  /** El estado del dictado en este momento, para arrancar la maquina al encender el modo. */
  estado?: () => Estado;
  ahora?: () => number;
  /** Programa el tick y devuelve como cancelarlo. Inyectable para probar sin esperar. */
  programa?: (ms: number, fn: () => void) => () => void;
  log?: (linea: string) => void;
}

export interface Conversacion {
  /** Encender o apagar el modo. Al apagar se olvida lo pendiente: nada se envia solo. */
  activa: boolean;
  alEvento(evento: EventoDictado): void;
  cierra(): void;
}

const programaPorDefecto = (ms: number, fn: () => void): (() => void) => {
  const t = setTimeout(fn, ms);
  t.unref();
  return () => clearTimeout(t);
};

export function creaConversacion(o: OpcionesConversacion): Conversacion {
  const ahora = o.ahora ?? (() => performance.now());
  const programa = o.programa ?? programaPorDefecto;
  const log = o.log ?? ((l: string) => console.log(l));
  let activa = false;
  let cancela: (() => void) | undefined;
  /** Los Enter van en serie y detras del pegado: el mismo hijo de PowerShell los ordena. */
  let envios: Promise<void> = Promise.resolve();

  const reprograma = () => {
    cancela?.();
    cancela = undefined;
    const espera = o.envio.vence(ahora());
    if (espera !== undefined) cancela = programa(espera + 5, tick);
  };
  const aplica = (entrada: EntradaEnvio) => {
    if (o.envio.aplica(entrada, ahora()) === 'enviar') {
      log(`↵ enviado por silencio (${o.envio.msEnvio} ms tras el ultimo pegado)`);
      envios = envios.then(() => o.alEnviar()).catch((e: unknown) => log(`✗ envio: ${e instanceof Error ? e.message : String(e)}`));
    }
    reprograma();
  };
  const tick = () => {
    cancela = undefined;
    if (activa) aplica({ tipo: 'tick' });
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
      if (!activa) return;
      switch (e.tipo) {
        case 'texto': {
          const partes = [{ texto: e.texto, acciones: e.acciones }, ...(e.siguientes ?? [])];
          const ultima = partes[partes.length - 1];
          aplica({ tipo: 'pegado', pendiente: !(ultima?.acciones.includes('enter') ?? false) });
          break;
        }
        case 'inicioHabla':
          aplica({ tipo: 'inicioHabla' });
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
    cierra() {
      cancela?.();
      cancela = undefined;
    },
  };
}
