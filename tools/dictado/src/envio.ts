/**
 * El ENVIO por silencio: en modo conversacion, lo que se pego en la caja se manda solo (Enter)
 * cuando la persona lleva `msEnvio` sin volver a hablar desde el ultimo pegado. Es otro reloj
 * que el del VAD: `silencioMs` (1000, medido) cierra cada FRASE para pegarla en cuanto se pueda;
 * `msEnvio` decide cuando el TURNO acabo. Subir `silencioMs` retrasaria cada frase y no
 * resolveria las pausas de pensamiento.
 *
 * Pura y con el reloj inyectado, como `node/pildora.ts`: se prueba sin esperar. Reglas:
 *  - un pegado PENDIENTE (sin «dale enter») arma el reloj; uno que ya llevo Enter lo desarma;
 *  - si empieza voz nueva, el reloj se quita pero el texto sigue pendiente; y un pegado que llega
 *    con esa voz ya en marcha (el motor tardo mas que la pausa: medido el 2026-09-23, con pausas
 *    de 1 s la segunda mitad empieza ~100 ms ANTES de que se pegue la primera) tampoco arma —
 *    armaria un Enter a mitad de frase; lo arma el pegado que viene;
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
  | { tipo: 'finHabla' }
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

/**
 * Medido el 2026-09-23 (`medicion/mide-conversacion.mjs`, bloque A): con pausas de pensamiento de 1 a 3 s
 * dentro de una frase, el hueco entre el pegado de una mitad y la voz de la siguiente llega a 994 ms
 * con pausas de 2 s; 1500 = ese hueco + 400 ms de margen (p95 − p50 del motor), y da 0 falsos envios
 * hasta 2 s (1000 tambien, pero a 6 ms del borde). 2000 aguanta pausas de 3 s a cambio de medio
 * segundo mas por turno: `dictado ajustes pon envioMs 2000`.
 */
export const DEFECTOS_ENVIO = { msEnvio: 1500 };

export function creaEnvioPorSilencio(opciones: OpcionesEnvio = {}): EnvioPorSilencio {
  let msEnvio = opciones.msEnvio ?? DEFECTOS_ENVIO.msEnvio;
  let pendiente = false;
  let hasta: number | undefined;
  let estado: Estado = 'inactivo';
  let vozAgente = false;
  /** La persona esta hablando (entre inicioHabla y finHabla): con voz en marcha no hay plazo. */
  let hablando = false;

  const arma = (ahoraMs: number) => {
    hasta = pendiente && !vozAgente && !hablando ? ahoraMs + msEnvio : undefined;
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
          hablando = true;
          hasta = undefined;
          return undefined;
        case 'finHabla':
          // No arma: lo que sigue (pegado, sin voz, error) arma, y asi el plazo cuenta desde el pegado.
          hablando = false;
          return undefined;
        case 'sinVoz':
          hablando = false; // el turno cerro sin texto
          arma(ahoraMs);
          return undefined;
        case 'estado':
          estado = entrada.estado;
          if (estado === 'inactivo') {
            pendiente = false;
            hasta = undefined;
            hablando = false;
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
          if (!pendiente || hasta === undefined || ahoraMs < hasta || estado !== 'escuchando' || vozAgente || hablando) return undefined;
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
