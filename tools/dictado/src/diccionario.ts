/**
 * Diccionario personal: nombres propios, jerga y siglas que el motor no conoce.
 *
 * En sflow era SOLO una pista para Whisper (`prompt=`): el motor la recibe como vocabulario a
 * favorecer. Aqui se conserva eso (`comoPista`) y se anade lo que un motor sin prompt —Parakeet—
 * necesita: una correccion POSTERIOR por similitud, que sustituye una palabra transcrita por
 * el termino del diccionario cuando estan a una o dos letras. Esa correccion va APAGADA por
 * defecto: sustituir de mas es peor que no sustituir, y su efecto no esta medido en corpus.
 *
 * El aprendizaje (`candidatos`) viene de sflow tal cual: cuando el humano edita una
 * transcripcion, las palabras nuevas con mayuscula inicial o guion son candidatas.
 */
import { distanciaEdicion } from './texto/wer.js';
import { quitaAcentos } from './texto/normaliza.js';

export interface OpcionesDiccionario {
  terminos?: readonly string[];
  /** Activa `corrige`. Sin medir en corpus: dejalo apagado hasta medirlo. */
  corrigePorSimilitud?: boolean;
  /** Letras de diferencia toleradas segun el largo del termino. Por defecto 0 (<5 letras: «leva»→«Levy» esta a una letra), 1 (≥5) o 2 (≥9). */
  distanciaMaxima?: (largo: number) => number;
}

export interface Diccionario {
  terminos(): string[];
  /** Anade los que no estaban (sin distinguir mayusculas). Devuelve los anadidos. */
  agrega(terminos: readonly string[]): string[];
  quita(termino: string): boolean;
  /** Los terminos como una sola linea separada por comas, recortada al tope de caracteres. */
  comoPista(maxCaracteres?: number): string;
  /** Sustituye palabras a distancia ≤ tolerada por su termino. Sin `corrigePorSimilitud`, devuelve el texto tal cual. */
  corrige(texto: string): string;
  /** Palabras que aparecen en `editado` y no en `original`, filtradas: lo que el humano corrigio a mano. */
  candidatos(original: string, editado: string): string[];
}

const PARADAS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'y', 'o', 'u', 'e', 'a', 'en', 'por',
  'para', 'con', 'sin', 'sobre', 'bajo', 'que', 'qué', 'como', 'cómo', 'cuando', 'cuándo', 'donde', 'dónde',
  'pero', 'sino', 'si', 'sí', 'no', 'mi', 'tu', 'su', 'mis', 'tus', 'sus', 'le', 'les', 'lo', 'me', 'te', 'se',
  'nos', 'os', 'es', 'son', 'era', 'eran', 'fue', 'fueron', 'ha', 'han', 'he', 'haber', 'esto', 'eso', 'esta',
  'este', 'ese', 'aquel', 'muy', 'más', 'mas', 'menos', 'todo', 'todos', 'toda', 'todas', 'ya', 'aún', 'aun',
  'aunque', 'porque', 'mientras', 'entonces', 'the', 'and', 'that', 'this', 'with', 'from', 'have', 'they',
  'what', 'when', 'where', 'which', 'your', 'will', 'would', 'about', 'there', 'their', 'then', 'than',
]);

const PALABRA = /[\p{L}][\p{L}\p{N}'’-]*/gu;

function distanciaPorDefecto(largo: number): number {
  if (largo >= 9) return 2;
  if (largo >= 5) return 1;
  return 0;
}

function clave(termino: string): string {
  return quitaAcentos(termino).toLowerCase();
}

export function creaDiccionario(opciones: OpcionesDiccionario = {}): Diccionario {
  const lista: string[] = [];
  const claves = new Set<string>();
  const tolerancia = opciones.distanciaMaxima ?? distanciaPorDefecto;
  const corrigeActivo = opciones.corrigePorSimilitud ?? false;

  const agrega = (terminos: readonly string[]): string[] => {
    const anadidos: string[] = [];
    for (const crudo of terminos) {
      const termino = crudo.trim();
      if (termino.length === 0 || termino.startsWith('#')) continue;
      const k = clave(termino);
      if (claves.has(k)) continue;
      claves.add(k);
      lista.push(termino);
      anadidos.push(termino);
    }
    return anadidos;
  };
  agrega(opciones.terminos ?? []);

  /** Termino a distancia tolerada de `palabra`, el mas cercano; solo terminos de una palabra. */
  const terminoCercano = (palabra: string): string | undefined => {
    const k = clave(palabra);
    let mejor: { termino: string; distancia: number } | undefined;
    for (const termino of lista) {
      if (/\s/.test(termino)) continue;
      const kt = clave(termino);
      if (kt === k) return termino;
      const maxima = tolerancia(kt.length);
      if (maxima === 0 || Math.abs(kt.length - k.length) > maxima) continue;
      const distancia = distanciaEdicion(Array.from(kt), Array.from(k));
      if (distancia <= maxima && (mejor === undefined || distancia < mejor.distancia)) mejor = { termino, distancia };
    }
    return mejor?.termino;
  };

  return {
    terminos: () => [...lista],
    agrega,
    quita(termino) {
      const k = clave(termino);
      const indice = lista.findIndex((t) => clave(t) === k);
      if (indice === -1) return false;
      lista.splice(indice, 1);
      claves.delete(k);
      return true;
    },
    comoPista(maxCaracteres = 800) {
      const junto = lista.join(', ');
      if (junto.length <= maxCaracteres) return junto;
      const corte = junto.lastIndexOf(',', maxCaracteres);
      return corte > 0 ? junto.slice(0, corte) : junto.slice(0, maxCaracteres);
    },
    corrige(texto) {
      if (!corrigeActivo || lista.length === 0) return texto;
      return texto.replace(PALABRA, (palabra) => {
        if (palabra.length < 4) return palabra;
        const termino = terminoCercano(palabra);
        return termino === undefined || clave(termino) === clave(palabra) ? palabra : termino;
      });
    },
    candidatos(original, editado) {
      const previas = new Set((original.match(PALABRA) ?? []).map((p) => p.toLowerCase()));
      const vistos = new Set<string>();
      const salida: string[] = [];
      for (const palabra of editado.match(PALABRA) ?? []) {
        const baja = palabra.toLowerCase();
        if (previas.has(baja) || PARADAS.has(baja) || palabra.length < 4 || vistos.has(baja)) continue;
        const propio = palabra[0] !== undefined && palabra[0] !== palabra[0].toLowerCase();
        if (!propio && !/[-'’]/.test(palabra)) continue;
        vistos.add(baja);
        salida.push(palabra);
      }
      return salida;
    },
  };
}
