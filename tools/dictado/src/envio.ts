/**
 * El ENVIO por silencio: en modo conversacion, lo que se pego en la caja se manda solo (Enter)
 * cuando la persona lleva `msEnvio` sin volver a hablar desde el ultimo pegado. Es otro reloj
 * que el del VAD: `silencioMs` (1000, medido) cierra cada FRASE para pegarla en cuanto se pueda;
 * `msEnvio` decide cuando el TURNO acabo. Subir `silencioMs` retrasaria cada frase y no
 * resolveria las pausas de pensamiento.
 *
 * Pura y con el reloj inyectado, como `node/pildora.ts`: se prueba sin esperar. Reglas:
 *  - un pegado PENDIENTE (sin «dale enter») arma el reloj; uno que ya llevo Enter lo desarma;
 *  - si empieza voz nueva, el reloj se quita pero el texto sigue pendiente;
 *  - «sin voz» (o solo muletillas) rearma: hubo ruido, no texto, y lo pegado sigue esperando;
 *  - mientras suena la voz del agente no se envia nada; al callar, rearma;
 *  - el dictado en «inactivo» borra todo: si ella lo apago, nada se envia solo;
 *  - el tick solo envia si hay texto pendiente, el plazo vencio y el dictado esta ESCUCHANDO.
 * El defecto de `msEnvio` lo fija la medicion A del PRP-003 (RF-45), no una opinion.
 */
import type { Estado } from './dictado.js';

export type EntradaEnvio =
  | { tipo: 'pegado'; pendiente: boolean }
  | { tipo: 'inicioHabla' }
  | { tipo: 'sinVoz' }
  | { tipo: 'estado'; estado: Estado }
  | { tipo: 'vozAgente'; activa: boolean }
  | { tipo: 'tick' };

export interface OpcionesEnvio {
  msEnvio?: number;
}

export interface EnvioPorSilencio {
  /** Hay texto pegado que aun no se envio. */
  readonly pendiente: boolean;
  readonly msEnvio: number;
  /** Aplica una entrada en el instante `ahoraMs`; devuelve `enviar` si toca pulsar Enter. */
  aplica(entrada: EntradaEnvio, ahoraMs: number): 'enviar' | undefined;
  /** Milisegundos hasta que venza el plazo (para programar el tick), o nada si no hay plazo. */
  vence(ahoraMs: number): number | undefined;
  /** Cambia el plazo en caliente; un plazo en curso se recalcula desde ahora. */
  cambiaMs(msEnvio: number, ahoraMs: number): void;
}

/** Provisional hasta la medicion A (`medicion/mide-conversacion.mjs`). */
export const DEFECTOS_ENVIO = { msEnvio: 2000 };

export function creaEnvioPorSilencio(opciones: OpcionesEnvio = {}): EnvioPorSilencio {
  let msEnvio = opciones.msEnvio ?? DEFECTOS_ENVIO.msEnvio;
  let pendiente = false;
  let hasta: number | undefined;
  let estado: Estado = 'inactivo';
  let vozAgente = false;

  const arma = (ahoraMs: number) => {
    hasta = pendiente && !vozAgente ? ahoraMs + msEnvio : undefined;
  };

  return {
    get pendiente() {
      return pendiente;
    },
    get msEnvio() {
      return msEnvio;
    },
    aplica(entrada, ahoraMs) {
      switch (entrada.tipo) {
        case 'pegado':
          pendiente = entrada.pendiente;
          arma(ahoraMs);
          return undefined;
        case 'inicioHabla':
          hasta = undefined;
          return undefined;
        case 'sinVoz':
          arma(ahoraMs);
          return undefined;
        case 'estado':
          estado = entrada.estado;
          if (estado === 'inactivo') {
            pendiente = false;
            hasta = undefined;
          } else if (estado === 'escuchando') {
            // Al volver a escuchar (tras pegar, tras un error) el plazo cuenta desde AHORA: un plazo
            // que vencio mientras se transcribia no dispara un Enter al instante.
            arma(ahoraMs);
          }
          return undefined;
        case 'vozAgente':
          vozAgente = entrada.activa;
          if (vozAgente) hasta = undefined;
          else arma(ahoraMs);
          return undefined;
        case 'tick':
          if (!pendiente || hasta === undefined || ahoraMs < hasta || estado !== 'escuchando' || vozAgente) return undefined;
          pendiente = false;
          hasta = undefined;
          return 'enviar';
      }
    },
    vence(ahoraMs) {
      return hasta === undefined ? undefined : Math.max(0, hasta - ahoraMs);
    },
    cambiaMs(nuevo, ahoraMs) {
      msEnvio = nuevo;
      if (hasta !== undefined) arma(ahoraMs);
    },
  };
}
