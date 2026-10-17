/**
 * Lo que la guia de voz entiende de una frase dicha, campo por campo. Sin LLM: reglas deterministas sobre la
 * transcripcion local. Cada interprete devuelve un valor o `null` (no entendi), nunca una suposicion.
 */
import type { Categoria } from '../clinicas.js';
import { normalizaCelular } from '../cuestionario.js';
import { normaliza } from './urgencias.js';

const UNIDADES: Record<string, number> = {
  cero: 0, uno: 1, un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21,
  veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const DECENAS: Record<string, number> = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100 };

/** «treinta y cuatro» → 34; «ciento dos» → 102; «34» → 34. */
export function numeroDicho(texto: string): number | null {
  const t = normaliza(texto);
  const digitos = /\b(\d{1,3})\b/.exec(t);
  if (digitos) return Number(digitos[1]);
  let total = 0;
  let visto = false;
  for (const p of t.split(' ')) {
    if (p in DECENAS) {
      total += DECENAS[p]!;
      visto = true;
    } else if (p in UNIDADES) {
      total += UNIDADES[p]!;
      visto = true;
    }
  }
  return visto ? total : null;
}

export function edadDicha(texto: string): number | null {
  const n = numeroDicho(texto);
  return n !== null && n >= 0 && n <= 120 ? n : null;
}

const RELLENO_NOMBRE = /^(me llamo|mi nombre es|mi apellido es|mi apellido|soy|es|se llama|mi segundo apellido es|mi primer apellido es)\s+/;

/** «me llamo ana sofía» → «Ana Sofía». Solo letras, espacios, apóstrofo y guion. */
export function nombreDicho(texto: string): string | null {
  const limpio = texto.trim().replace(/[.,!?¿¡]+/g, ' ').replace(/\s+/g, ' ').trim();
  const sinRelleno = limpio.replace(new RegExp(RELLENO_NOMBRE.source, 'i'), '');
  if (!sinRelleno || !/^[\p{L}\p{M}' -]{2,60}$/u.test(sinRelleno)) return null;
  return sinRelleno.split(' ').map((w) => w.charAt(0).toLocaleUpperCase('es-MX') + w.slice(1).toLocaleLowerCase('es-MX')).join(' ');
}

/** «ana punto lópez arroba ejemplo punto com» → «ana.lopez@ejemplo.com». */
export function correoDicho(texto: string): string | null {
  const escrito = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/u.exec(texto);
  if (escrito) {
    const c = escrito[0].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\.$/, '');
    return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(c) ? c : null;
  }
  let t = ` ${normaliza(texto)} `;
  t = t.replace(/ (mi correo es|es|el correo es|correo) /g, ' ');
  t = t.replace(/ guion bajo /g, '_').replace(/ guion medio | guion /g, '-').replace(/ arroba /g, '@').replace(/ punto /g, '.');
  t = t.replace(/\s+/g, '');
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(t) ? t : null;
}

/** «cinco cinco uno dos…» o «55 1234 5678» → «+525512345678». */
export function celularDicho(texto: string): string | null {
  const t = normaliza(texto);
  const digitos = t.split(' ').map((p) => (/^\d+$/.test(p) ? p : p in UNIDADES && UNIDADES[p]! < 10 ? String(UNIDADES[p]) : '')).join('');
  return normalizaCelular(digitos);
}

const NINGUNO = /^(no|ninguna|ninguno|no tengo|nada|sin empresa|no aplica|paso|siguiente)$/;
export const ningunoDicho = (texto: string): boolean => NINGUNO.test(normaliza(texto));

export function empresaDicha(texto: string): string | null {
  const t = texto.trim().replace(/^(trabajo en|es|la empresa es|en)\s+/i, '').replace(/[.!?]+$/, '');
  return t.length >= 2 && t.length <= 80 ? t : null;
}

const POR_CATEGORIA: [Categoria, RegExp][] = [
  ['general', /\b(general|preventiva|limpieza|revision|chequeo|valoracion|caries|resina)\b/],
  ['ortodoncia', /\b(ortodon\w*|ortodoc\w*|brackets|braquets|frenos|alineadores|dientes chuecos)\b/],
  ['endodoncia', /\b(endodoncia|conductos|nervio|endo)\b/],
  ['implantologia', /\b(implante|implantes|implantologia)\b/],
];

export function categoriasDichas(texto: string): Categoria[] | null {
  const t = normaliza(texto);
  const c = POR_CATEGORIA.filter(([, re]) => re.test(t)).map(([k]) => k);
  return c.length ? c : null;
}

export function parentescoDicho(texto: string): 'madre' | 'padre' | 'tutor_legal' | null {
  const t = normaliza(texto);
  if (/\b(madre|mama|mami)\b/.test(t)) return 'madre';
  if (/\b(padre|papa|papi)\b/.test(t)) return 'padre';
  if (/\b(tutor|tutora|tutela)\b/.test(t)) return 'tutor_legal';
  return null;
}

export type Respuesta = 'si' | 'no' | 'enviar' | null;
/** «sí, envíalo» al final es la UNICA forma de enviar; un «sí» suelto acepta lo propuesto. */
export function siONo(texto: string): Respuesta {
  const t = normaliza(texto);
  if (/\b(envialo|enviar|envia el registro|mandalo|registrame)\b/.test(t) && /\b(si|claro|ok|okay|dale|va)\b/.test(t)) return 'enviar';
  if (/^(no|nop|incorrecto|esta mal|equivocado|mal|tampoco)\b/.test(t)) return 'no';
  // «See», «sea», «ci»: un «sí» suelto que el ASR oye en inglés (Parakeet con monosílabos; medido en la guía).
  if (/^(si|sip|see|sea|ci|c|correcto|asi es|exacto|claro|ok|okay|va|dale|esta bien|perfecto|eso es)\b/.test(t)) return 'si';
  return null;
}
