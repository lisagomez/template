/**
 * Snippets: una frase disparadora dicha en voz alta se sustituye por su expansion
 * («mi correo» → la direccion entera). Portado de sflow con las mismas reglas: sin distinguir
 * mayusculas, solo como palabra completa, y el disparador mas largo gana («firma larga» antes
 * que «firma»). El contador de uso se conserva porque es lo que ordena la lista en la interfaz.
 */
import { regexDePalabra } from './texto/normaliza.js';

export interface Snippet {
  disparador: string;
  expansion: string;
  usos: number;
}

export interface Snippets {
  lista(): Snippet[];
  agrega(disparador: string, expansion: string): Snippet;
  quita(disparador: string): boolean;
  /** Sustituye los disparadores presentes. Devuelve el texto y cuales se usaron. */
  aplica(texto: string): { texto: string; usados: string[] };
}

export function creaSnippets(iniciales: ReadonlyArray<Pick<Snippet, 'disparador' | 'expansion'> & Partial<Snippet>> = []): Snippets {
  const lista: Snippet[] = [];

  const agrega = (disparador: string, expansion: string, usos = 0): Snippet => {
    const limpio = disparador.trim().toLowerCase().replace(/\s+/g, ' ');
    if (limpio.length === 0) throw new Error('el disparador del snippet no puede estar vacio');
    if (expansion.length === 0) throw new Error('la expansion del snippet no puede estar vacia');
    const existente = lista.find((s) => s.disparador === limpio);
    if (existente) {
      existente.expansion = expansion;
      return existente;
    }
    const nuevo = { disparador: limpio, expansion, usos };
    lista.push(nuevo);
    return nuevo;
  };
  for (const s of iniciales) agrega(s.disparador, s.expansion, s.usos ?? 0);

  return {
    lista: () => lista.map((s) => ({ ...s })).sort((a, b) => b.usos - a.usos || a.disparador.localeCompare(b.disparador)),
    agrega: (d, e) => ({ ...agrega(d, e) }),
    quita(disparador) {
      const indice = lista.findIndex((s) => s.disparador === disparador.trim().toLowerCase());
      if (indice === -1) return false;
      lista.splice(indice, 1);
      return true;
    },
    aplica(texto) {
      if (texto.length === 0 || lista.length === 0) return { texto, usados: [] };
      const usados: string[] = [];
      let salida = texto;
      for (const s of [...lista].sort((a, b) => b.disparador.length - a.disparador.length)) {
        const regex = regexDePalabra(s.disparador);
        if (!regex.test(salida)) continue;
        salida = salida.replace(regex, () => s.expansion);
        s.usos += 1;
        usados.push(s.disparador);
      }
      return { texto: salida, usados };
    },
  };
}
