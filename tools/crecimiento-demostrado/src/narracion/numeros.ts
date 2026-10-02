/**
 * Los NÚMEROS de un texto en español de México: «$1,234.56», «$1,235», «$1.2 millones», «12 %»,
 * «12.5 por ciento», «doce por ciento», «la mitad», «el doble», «14 clientes». Cada uno sale como
 * racional exacto con su clase (pesos, porcentaje, cantidad) y la PRECISIÓN con que se escribió:
 * «$1.2 millones» es cualquier valor que redondee a 1.2 millones, no 1,200,000.00 exactos.
 *
 * Lo que no es una cifra del negocio se quita antes: periodos («3T 2026», «agosto de 2025»), años
 * sueltos, supuestos e invariantes («SA-02», «INV-03») y seudónimos de cliente.
 */
export type Clase = 'pesos' | 'porcentaje' | 'cantidad' | 'fraccion';

export interface Numero {
  readonly crudo: string;
  readonly clase: Clase;
  /** Valor como racional: num/den (en pesos, puntos porcentuales o unidades). */
  readonly num: bigint;
  readonly den: bigint;
  /** El valor escrito es exacto a ±media unidad de esta precisión (racional). */
  readonly precision: { readonly num: bigint; readonly den: bigint };
  readonly posicion: number;
}

export type Lectura = { ok: true; numeros: Numero[] } | { ok: false; crudo: string; motivo: string };

const PALABRAS: Readonly<Record<string, number>> = {
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14,
  quince: 15, dieciséis: 16, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50,
  sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100,
};
const FRACCIONES: readonly [RegExp, bigint, bigint][] = [
  [/\bla mitad\b/gi, BigInt(1), BigInt(2)], [/\bel doble\b/gi, BigInt(2), BigInt(1)], [/\bel triple\b/gi, BigInt(3), BigInt(1)], [/\bun tercio\b/gi, BigInt(1), BigInt(3)],
  [/\bdos terceras partes\b/gi, BigInt(2), BigInt(3)], [/\bun cuarto\b/gi, BigInt(1), BigInt(4)], [/\btres cuartas partes\b/gi, BigInt(3), BigInt(4)],
];
const MESES = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre';
const RUIDO: readonly RegExp[] = [
  /\bcli_[0-9a-f]{16}\b/g, /\b(?:SA|INV)-\d{2}\b/g, /\b\d{4}-(?:T[1-4]|[1-4]T)\b/g, /\b(?:T[1-4]|[1-4]T)\s+(?:de\s+)?\d{4}\b/g, /\b(?:T[1-4]|[1-4]T)\b/g,
  new RegExp(`\\b(?:${MESES})(?:\\s+de)?\\s+\\d{4}\\b`, 'gi'), /\b(?:19|20)\d{2}\b/g, /\b(?:snap|spec|cert|der|hecho):[0-9a-f]+\b/g,
];

/** Quita lo que no es cifra del negocio, conservando las posiciones (se reemplaza por espacios). */
export function sinRuido(texto: string): string {
  return RUIDO.reduce((t, r) => t.replace(r, (m) => ' '.repeat(m.length)), texto);
}

const NUMERO = /(-?\$\s?)?(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?)(\s*(?:mil(?:lones?)?\b|millón\b))?(\s*(?:%|por\s?ciento\b))?/gi;

function decimalA(texto: string): { num: bigint; den: bigint; decimales: number } | null {
  if (texto.includes(',') && !/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(texto)) return null;
  const limpio = texto.replace(/,/g, '');
  const [ent, frac = ''] = limpio.replace('-', '').split('.');
  const signo = limpio.startsWith('-') ? -BigInt(1) : BigInt(1);
  return { num: signo * BigInt(`${ent}${frac}`), den: BigInt(10) ** BigInt(frac.length), decimales: frac.length };
}

function escala(sufijo: string | undefined): bigint {
  if (!sufijo) return BigInt(1);
  return /mill/i.test(sufijo) ? BigInt(1000000) : BigInt(1000);
}

function deCifra(m: RegExpExecArray): Numero | { error: string } {
  const [crudo, peso, cifra, magnitud, porciento] = [m[0], m[1], m[2]!, m[3], m[4]];
  const d = decimalA(cifra);
  if (!d) return { error: `formato ambiguo «${cifra.trim()}»: en México la coma separa miles y el punto decimales` };
  const factor = escala(magnitud);
  const negativo = (peso ?? '').includes('-');
  const clase: Clase = porciento ? 'porcentaje' : peso ? 'pesos' : 'cantidad';
  return {
    crudo: crudo.trim(), clase, num: (negativo ? -BigInt(1) : BigInt(1)) * d.num * factor, den: d.den,
    precision: { num: factor, den: BigInt(10) ** BigInt(d.decimales) }, posicion: m.index,
  };
}

function dePalabras(texto: string): Numero[] {
  const fuera: Numero[] = [];
  const palabras = new RegExp(`\\b(${Object.keys(PALABRAS).join('|')})(\\s+y\\s+(${Object.keys(PALABRAS).join('|')}))?(\\s+por\\s?ciento)?\\b`, 'gi');
  for (const m of texto.matchAll(palabras)) {
    const v = PALABRAS[m[1]!.toLowerCase()]! + (m[3] ? PALABRAS[m[3].toLowerCase()]! : 0);
    fuera.push({ crudo: m[0], clase: m[4] ? 'porcentaje' : 'cantidad', num: BigInt(v), den: BigInt(1), precision: { num: BigInt(1), den: BigInt(1) }, posicion: m.index ?? 0 });
  }
  for (const [r, num, den] of FRACCIONES) for (const m of texto.matchAll(r)) fuera.push({ crudo: m[0], clase: 'fraccion', num, den, precision: { num: BigInt(0), den: BigInt(1) }, posicion: m.index ?? 0 });
  return fuera;
}

/** Todos los números de un texto, o el primero que no se puede leer sin ambigüedad. */
export function numerosDe(texto: string): Lectura {
  const limpio = sinRuido(texto);
  const numeros: Numero[] = [];
  for (const m of limpio.matchAll(NUMERO)) {
    const n = deCifra(m);
    if ('error' in n) return { ok: false, crudo: m[0].trim(), motivo: n.error };
    numeros.push(n);
  }
  numeros.push(...dePalabras(limpio));
  return { ok: true, numeros: numeros.sort((a, b) => a.posicion - b.posicion) };
}
