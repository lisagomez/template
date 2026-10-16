/**
 * El texto del modelo llega token a token y la voz se pide frase a frase: este separador decide
 * dónde acaba una frase SIN esperar la respuesta entera.
 *
 * Lo que se tomó de la fuente (business-os, `sentence-splitter.ts`, MIT) y lo que se rediseñó:
 *  - se conserva la idea del primer trozo ávido: en voz, el primer audio es lo que se nota;
 *  - allí `exec` sin `g` miraba siempre la primera coincidencia y una respuesta que empezaba por
 *    «Sí.» no emitía nada hasta el final (defecto A del análisis); aquí se avanza por posición;
 *  - allí «Sr. Pérez», «3.5» y «$1,214» se partían; aquí un fin de frase exige espacio detrás,
 *    y se descartan decimales, miles, horas, abreviaturas, iniciales y marcas de lista.
 */

export interface OpcionesSeparador {
  /** Primer trozo: sale en la primera pausa (coma, punto y coma, dos puntos, raya) a partir de estos caracteres. */
  minPrimerTrozo?: number;
  /** Sin pausa, el primer trozo sale en un espacio a partir de estos caracteres. */
  maxPrimerTrozo?: number;
  /** Ninguna frase pasa de aquí: se corta en la última pausa o el último espacio. */
  maxFrase?: number;
  /** Abreviaturas extra (sin punto, en minúsculas). */
  abreviaturas?: readonly string[];
}

export interface Separador {
  /** Añade texto del flujo y devuelve las frases que ya se pueden decir. */
  empuja(texto: string): string[];
  /** Fin del flujo: devuelve lo que quedaba. */
  cierra(): string[];
  /** Lo que todavía no forma frase. */
  readonly pendiente: string;
  reinicia(): void;
}

export const DEFECTOS_SEPARADOR = { minPrimerTrozo: 20, maxPrimerTrozo: 70, maxFrase: 240 } as const;

/** Abreviaturas frecuentes en español (en minúsculas, sin el punto). */
export const ABREVIATURAS: readonly string[] = [
  'sr', 'sra', 'srta', 'sres', 'dr', 'dra', 'lic', 'ing', 'arq', 'mtro', 'mtra', 'prof', 'profa', 'ud', 'uds', 'vd', 'vds',
  'etc', 'ej', 'p', 'pág', 'págs', 'núm', 'nº', 'no', 'tel', 'av', 'avda', 'col', 'art', 'cap', 'vol', 'aprox', 'máx', 'mín',
  'dpto', 'depto', 'cía', 'hnos', 'gral', 'admón', 'ee', 'uu', 'cp', 'fig', 'pto', 'sta', 'sto', 'st', 'vs', 'mr', 'mrs',
];

const FIN_DURO = new Set(['.', '!', '?', '…']);
const PAUSA = new Set([',', ';', ':']);
const CIERRES = new Set(['"', '”', '’', "'", ')', ']', '»']);
const ES_ESPACIO = /\s/u;
const ES_DIGITO = /\p{N}/u;
const ES_MAYUSCULA = /[\p{Lu}¿¡]/u;
const PALABRA_ANTES = /([\p{L}\p{N}º]+)$/u;

/** Quita lo que la voz leería mal: énfasis y encabezados de markdown, viñetas y código en línea. */
export function limpiaParaVoz(frase: string): string {
  return frase
    .replace(/`+/g, '')
    .replace(/\*\*|__|~~/g, '')
    .replace(/(^|\s)[*_](\S)/g, '$1$2')
    .replace(/(\S)[*_](?=\s|$|[.,;:!?])/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** ¿El punto en `i` termina frase? `null` si aún no se puede saber (falta texto detrás). */
function terminaEnPunto(b: string, i: number, abreviaturas: ReadonlySet<string>, inicioLinea: number): boolean | null {
  const siguiente = b[i + 1];
  if (ES_DIGITO.test(b[i - 1] ?? '') && ES_DIGITO.test(siguiente ?? '')) return false;
  const palabra = PALABRA_ANTES.exec(b.slice(0, i))?.[1];
  if (palabra && /^\d+$/u.test(palabra) && b.slice(inicioLinea, i).trim() === palabra) return false;
  if (!palabra) return true;
  const plegada = palabra.toLowerCase();
  const abreviatura = abreviaturas.has(plegada) || (palabra.length === 1 && /\p{L}/u.test(palabra));
  if (!abreviatura) return true;
  // «etc.» y compañía cierran frase solo si lo que sigue empieza en mayúscula.
  const sigue = sigueMayuscula(b, i + 1);
  return sigue === null ? null : plegada === 'etc' && sigue;
}

/** Lo que viene tras la posición `j` empieza en mayúscula (o «¿», «¡»). `null` si aún no llegó. */
function sigueMayuscula(b: string, j: number): boolean | null {
  const resto = b.slice(j).trimStart();
  if (resto.length === 0) return null;
  return ES_MAYUSCULA.test(resto[0] ?? '');
}

export function creaSeparador(opciones: OpcionesSeparador = {}): Separador {
  const minPrimer = opciones.minPrimerTrozo ?? DEFECTOS_SEPARADOR.minPrimerTrozo;
  const maxPrimer = opciones.maxPrimerTrozo ?? DEFECTOS_SEPARADOR.maxPrimerTrozo;
  const maxFrase = opciones.maxFrase ?? DEFECTOS_SEPARADOR.maxFrase;
  const abreviaturas = new Set([...ABREVIATURAS, ...(opciones.abreviaturas ?? [])].map((a) => a.toLowerCase()));
  let b = '';
  let emitidas = 0;

  const saca = (hasta: number, salida: string[]) => {
    const frase = limpiaParaVoz(b.slice(0, hasta));
    b = b.slice(hasta).replace(/^\s+/u, '');
    if (/[\p{L}\p{N}]/u.test(frase)) {
      salida.push(frase);
      emitidas++;
    }
  };

  /** Índice justo después del final de la primera frase completa, o -1. */
  const finDeFrase = (): number => {
    let inicioLinea = 0;
    for (let i = 0; i < b.length; i++) {
      const c = b[i] ?? '';
      if (c === '\n') {
        if (b.slice(inicioLinea, i).trim().length > 0) return i;
        inicioLinea = i + 1;
        continue;
      }
      if (!FIN_DURO.has(c)) continue;
      let j = i + 1;
      while (j < b.length && (FIN_DURO.has(b[j] ?? '') || CIERRES.has(b[j] ?? ''))) j++;
      if (j >= b.length) return -1; // falta saber qué viene detrás
      if (!ES_ESPACIO.test(b[j] ?? '')) continue; // «ejemplo.com», «3.5», «¿qué?» pegado
      // Suspensivos («...», «…»): cierran solo si sigue mayúscula («Pero... Ya veremos»).
      const suspensivos = /\.\.|…/u.test(b.slice(i, j));
      const cierra = suspensivos ? sigueMayuscula(b, j) : c === '.' ? terminaEnPunto(b, i, abreviaturas, inicioLinea) : true;
      if (cierra === null) return -1;
      if (cierra) return j;
      i = j - 1;
    }
    return -1;
  };

  /** Primer trozo ávido: pausa a partir de `minPrimer`, o espacio a partir de `maxPrimer`. */
  const corteAvido = (limite: number, conEspacio: boolean): number => {
    for (let i = limite; i < b.length - 1; i++) {
      const c = b[i] ?? '';
      if ((PAUSA.has(c) || c === '—') && ES_ESPACIO.test(b[i + 1] ?? '') && !(ES_DIGITO.test(b[i - 1] ?? '') && ES_DIGITO.test(b[i + 2] ?? ''))) return i + 1;
    }
    if (!conEspacio) return -1;
    const espacio = b.lastIndexOf(' ', b.length - 1);
    return espacio >= limite ? espacio : -1;
  };

  const extrae = (salida: string[]) => {
    for (;;) {
      const fin = finDeFrase();
      if (fin > 0 && fin <= maxFrase) {
        saca(fin, salida);
        continue;
      }
      if (emitidas === 0 && b.length >= minPrimer) {
        const corte = corteAvido(minPrimer - 1, b.length >= maxPrimer);
        if (corte > 0) {
          saca(corte, salida);
          continue;
        }
      }
      if (b.length > maxFrase) {
        const corte = corteAvido(Math.floor(maxFrase / 2), true);
        saca(corte > 0 ? corte : maxFrase, salida);
        continue;
      }
      return;
    }
  };

  return {
    get pendiente() {
      return b;
    },
    empuja(texto) {
      b += texto;
      const salida: string[] = [];
      extrae(salida);
      return salida;
    },
    cierra() {
      const salida: string[] = [];
      extrae(salida);
      if (b.trim().length > 0) saca(b.length, salida);
      b = '';
      return salida;
    },
    reinicia() {
      b = '';
      emitidas = 0;
    },
  };
}
