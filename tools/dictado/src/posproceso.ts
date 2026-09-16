/**
 * Lo que pasa entre el motor y el pegado, en este orden:
 *
 *   texto crudo → snippets → comandos de voz → diccionario → limpieza (LLM, opcional) → mayuscula
 *
 * Snippets antes que comandos para que una expansion pueda contener saltos de linea literales
 * sin que nadie los toque; comandos antes que la limpieza para que el LLM —si lo hay— vea el
 * texto ya con sus signos y no invente los suyos. Cada paso es opcional y el resultado dice
 * que hizo cada uno: cuando el texto sale raro, hay que saber que paso lo torcio.
 */
import { aplicaComandos } from './comandos.js';
import type { Diccionario } from './diccionario.js';
import type { Snippets } from './snippets.js';
import { capitalizaInicio } from './texto/normaliza.js';
import type { Accion, Limpiador } from './types.js';

export interface OpcionesPosproceso {
  snippets?: Snippets;
  diccionario?: Diccionario;
  /** Comandos de voz («punto y aparte», «dale enter»). Por defecto activos. */
  comandos?: boolean;
  /** Limpieza por modelo de lenguaje. Sin `limpiador` no hay limpieza: no existe un proveedor por defecto. */
  limpiador?: Limpiador;
  /** Perfil de tono que se le pasa al limpiador (`codigo`, `chat`, `formal`…). */
  perfil?: string;
  /** Primera letra en mayuscula. Por defecto apagado: los motores ya puntuan y capitalizan. */
  capitaliza?: boolean;
}

export interface ResultadoPosproceso {
  texto: string;
  acciones: Accion[];
  pasos: {
    snippetsUsados: string[];
    comandosAplicados: boolean;
    diccionarioCambio: boolean;
    limpiezaCambio: boolean;
  };
}

export interface Posproceso {
  procesa(textoCrudo: string): Promise<ResultadoPosproceso>;
}

export function creaPosproceso(opciones: OpcionesPosproceso = {}): Posproceso {
  const conComandos = opciones.comandos ?? true;
  return {
    async procesa(textoCrudo) {
      let texto = textoCrudo.trim();
      const pasos = { snippetsUsados: [] as string[], comandosAplicados: false, diccionarioCambio: false, limpiezaCambio: false };
      let acciones: Accion[] = [];

      if (opciones.snippets) {
        const r = opciones.snippets.aplica(texto);
        texto = r.texto;
        pasos.snippetsUsados = r.usados;
      }
      if (conComandos) {
        const r = aplicaComandos(texto);
        pasos.comandosAplicados = r.texto !== texto || r.acciones.length > 0;
        texto = r.texto;
        acciones = r.acciones;
      }
      if (opciones.diccionario) {
        const corregido = opciones.diccionario.corrige(texto);
        pasos.diccionarioCambio = corregido !== texto;
        texto = corregido;
      }
      if (opciones.limpiador && texto.length >= 3) {
        const limpio = (await opciones.limpiador.limpia(texto, { perfil: opciones.perfil ?? 'neutro' })).trim();
        // Un limpiador que devuelve vacio no ha limpiado: ha borrado. Se ignora.
        if (limpio.length > 0) {
          pasos.limpiezaCambio = limpio !== texto;
          texto = limpio;
        }
      }
      if (opciones.capitaliza) texto = capitalizaInicio(texto);
      return { texto, acciones, pasos };
    },
  };
}
