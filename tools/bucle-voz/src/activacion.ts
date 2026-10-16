/**
 * Palabra de activación sobre TEXTO local: el motor de la máquina transcribe cada tramo de voz
 * en reposo y aquí se decide si empezaba por la frase de activación. Ni Web Speech (manda el
 * audio a Google mientras la pestaña esté abierta) ni un modelo de activación propietario.
 *
 * Lo que se arregla respecto a la fuente (business-os, `useWakeWord.ts`, MIT):
 *  - `\b` era ASCII: «Ámbar», «José» o «Begoña» no tenían límite de palabra. Aquí las palabras
 *    salen de clases Unicode y se comparan plegadas (sin acentos, ñ conservada y barata de
 *    confundir con n, que es como la suele escribir el motor);
 *  - bastaba el nombre en cualquier punto, también en boca del propio agente: aquí la frase
 *    tiene que ir al principio (`maxInicio`), y `pareceEco` descarta lo que el agente acaba de
 *    decir;
 *  - el reconocedor se reiniciaba cada 800 ms y dejaba huecos sordos: aquí el micrófono no se
 *    cierra y no hay reconocedor que reiniciar.
 */
import { palabras, parecido, pliega } from './texto.js';

export interface OpcionesActivacion {
  /** Frases de activación, p. ej. `['oye mando']`. Variantes de la misma frase, si hacen falta. */
  frases: readonly string[];
  /** Parecido mínimo (0-1) de la ventana con la frase. */
  umbral?: number;
  /** La frase tiene que empezar dentro de estas primeras palabras. */
  maxInicio?: number;
}

export type ResultadoActivacion =
  | { activada: false; confianza: number }
  | { activada: true; frase: string; confianza: number; resto: string };

export interface Activacion {
  detecta(texto: string): ResultadoActivacion;
}

export const DEFECTOS_ACTIVACION = { umbral: 0.8, maxInicio: 2 } as const;

interface Palabra {
  plegada: string;
  fin: number;
}

/** Palabras con la posición de su final en el texto ORIGINAL, para recortar el resto sin perder acentos. */
function conPosiciones(texto: string): Palabra[] {
  const salida: Palabra[] = [];
  for (const m of texto.matchAll(/[\p{L}\p{N}]+/gu)) salida.push({ plegada: pliega(m[0]), fin: (m.index ?? 0) + m[0].length });
  return salida;
}

/** Parecido de una ventana con la frase: palabra a palabra, o pegadas («oyemando», «bego ña»). */
function parecidoVentana(ventana: readonly string[], frase: readonly string[]): number {
  let porPalabra = 0;
  if (ventana.length === frase.length) {
    porPalabra = frase.reduce((s, f, i) => s + parecido(ventana[i] ?? '', f), 0) / frase.length;
  }
  const pegadas = parecido(ventana.join(''), frase.join(''));
  return Math.max(porPalabra, pegadas);
}

export function creaActivacion(opciones: OpcionesActivacion): Activacion {
  const umbral = opciones.umbral ?? DEFECTOS_ACTIVACION.umbral;
  const maxInicio = opciones.maxInicio ?? DEFECTOS_ACTIVACION.maxInicio;
  const frases = opciones.frases.map((f) => ({ original: f, tokens: palabras(f) })).filter((f) => f.tokens.length > 0);
  if (frases.length === 0) throw new Error('la activación necesita al menos una frase con letras');

  return {
    detecta(texto) {
      const ps = conPosiciones(texto);
      let mejor = { valor: 0, frase: '', fin: -1 };
      for (const f of frases) {
        for (let inicio = 0; inicio <= maxInicio && inicio < ps.length; inicio++) {
          for (let largo = Math.max(1, f.tokens.length - 1); largo <= f.tokens.length + 1; largo++) {
            const ventana = ps.slice(inicio, inicio + largo);
            if (ventana.length < largo) continue;
            const valor = parecidoVentana(ventana.map((p) => p.plegada), f.tokens);
            if (valor > mejor.valor) mejor = { valor, frase: f.original, fin: ventana.at(-1)?.fin ?? -1 };
          }
        }
      }
      if (mejor.valor < umbral) return { activada: false, confianza: mejor.valor };
      // Fuera la coma o el punto que separa la llamada; «¿» y «¡» abren lo que sigue y se quedan.
      const resto = texto.slice(mejor.fin).replace(/^[\s,;:.!?—-]+/u, '').trim();
      return { activada: true, frase: mejor.frase, confianza: mejor.valor, resto };
    },
  };
}

/**
 * ¿Lo que se oyó es el propio agente? Compara con lo que dijo hace nada: si casi todas las
 * palabras oídas están en su frase, es eco de la sala, no la persona.
 */
export function pareceEco(oido: string, dichoPorElAgente: string, umbral = 0.7): boolean {
  const o = palabras(oido);
  const d = palabras(dichoPorElAgente);
  if (o.length === 0 || d.length === 0) return false;
  const dentro = o.filter((p) => d.some((q) => parecido(p, q) >= 0.8)).length;
  return dentro / o.length >= umbral;
}
