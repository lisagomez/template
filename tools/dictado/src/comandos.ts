/**
 * Comandos de voz: lo que se dice y no se escribe.
 *
 * Dos familias, portadas de sflow (`smart_commands.py` + `dictation_actions.py`):
 *  - **de texto**: «punto y aparte», «nueva linea», «coma»… se sustituyen por el signo. Los
 *    signos exigen una palabra DELANTE («… trabajo coma …») para no cazar la palabra «coma»
 *    en «esta en coma»; los saltos no, porque una frase puede empezar por ellos.
 *  - **de accion**: «… y dale enter» al FINAL del dictado se recorta del texto y se devuelve
 *    como accion para ejecutar despues de pegar.
 *
 * Bilingue es/en, como el original, y con fronteras Unicode (ver `texto/normaliza.ts`).
 */
import type { Accion } from './types.js';

interface Regla {
  regex: RegExp;
  reemplazo: string;
}

const PALABRA_DELANTE = '(?<=[\\p{L}\\p{N}])';
const FRONTERA_INICIO = '(?<![\\p{L}\\p{N}])';
const FRONTERA_FIN = '(?![\\p{L}\\p{N}])';

/** Solo espacio HORIZONTAL alrededor: un salto ya escrito por el comando anterior no se come. */
const regla = (patron: string, reemplazo: string, conPalabraDelante: boolean): Regla => ({
  regex: new RegExp(`${conPalabraDelante ? PALABRA_DELANTE : ''}[ \\t]*${FRONTERA_INICIO}${patron}${FRONTERA_FIN}[ \\t]*`, 'giu'),
  reemplazo,
});

/** El orden importa: «punto y aparte» antes que «punto», «nuevo parrafo» antes que «nueva linea». */
const REGLAS_TEXTO: readonly Regla[] = [
  regla('punto y aparte', '.\n\n', false),
  regla('nuevo p[aá]rrafo', '\n\n', false),
  regla('new paragraph', '\n\n', false),
  regla('nueva l[ií]nea', '\n', false),
  regla('salto de l[ií]nea', '\n', false),
  regla('new line', '\n', false),
  regla('punto y seguido', '. ', true),
  regla('punto final', '.', true),
  regla('punto y coma', '; ', true),
  regla('dos puntos', ': ', true),
  regla('puntos suspensivos', '… ', true),
  regla('coma', ', ', true),
  regla('signo de interrogaci[oó]n', '?', true),
  regla('signo de exclamaci[oó]n', '!', true),
];

const LIMPIEZA: readonly Regla[] = [
  { regex: /[ \t]+\n/g, reemplazo: '\n' },
  { regex: /\n[ \t]+/g, reemplazo: '\n' },
  { regex: /\n{3,}/g, reemplazo: '\n\n' },
  { regex: /[ \t]{2,}/g, reemplazo: ' ' },
  { regex: /[ \t]+([.,;:?!…])/g, reemplazo: '$1' },
  // «signo de interrogacion punto y aparte»: el punto del parrafo sobra detras de ? ! …
  { regex: /([?!…])\./g, reemplazo: '$1' },
];

/** «… y dale enter», «… presiona enter», «… press enter» al final; el conector «y»/«and» se va con el comando. */
const ENTER_AL_FINAL = new RegExp(
  `[\\s,;.:]*(?:${FRONTERA_INICIO}(?:y|and)\\s+)?${FRONTERA_INICIO}(?:press\\s+enter|presion[ae]r?\\s+enter|pulsa(?:r)?\\s+enter|enter\\s+final|da(?:le)?\\s+enter)${FRONTERA_FIN}[\\s.,!?]*$`,
  'iu',
);

export interface ResultadoComandos {
  texto: string;
  acciones: Accion[];
}

/** Recorta las acciones verbales del final y devuelve cuales eran. */
export function extraeAcciones(texto: string): ResultadoComandos {
  const recortado = texto.replace(ENTER_AL_FINAL, '');
  if (recortado === texto) return { texto, acciones: [] };
  return { texto: recortado.replace(/[\s.,;:!?]+$/u, ''), acciones: ['enter'] };
}

/** Sustituye los comandos de texto por su signo y normaliza el espacio alrededor. */
export function aplicaComandosDeTexto(texto: string): string {
  let salida = texto;
  for (const r of REGLAS_TEXTO) salida = salida.replace(r.regex, r.reemplazo);
  for (const r of LIMPIEZA) salida = salida.replace(r.regex, r.reemplazo);
  return salida.trim();
}

/** Las dos familias, en el orden correcto: primero se recortan las acciones, luego los signos. */
export function aplicaComandos(texto: string): ResultadoComandos {
  if (texto.trim().length === 0) return { texto: '', acciones: [] };
  const { texto: sinAcciones, acciones } = extraeAcciones(texto);
  return { texto: aplicaComandosDeTexto(sinAcciones), acciones };
}
