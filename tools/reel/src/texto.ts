/** Normalización y números en español de México (para cotejar lo que se dice contra el catálogo). */

export const normaliza = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ$.,\s]/g, ' ').replace(/\s+/g, ' ').trim();

const UNIDADES: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500,
  seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
};

/** «cuarenta y cinco» → 45; «mil doscientos» → 1200. `null` si alguna palabra no es número. */
export function numeroEnPalabras(palabras: readonly string[]): number | null {
  let total = 0, actual = 0, vistas = 0;
  for (const p of palabras) {
    if (p === 'y') continue;
    if (p === 'mil') { total += (actual || 1) * 1000; actual = 0; vistas++; continue; }
    const v = UNIDADES[p];
    if (v === undefined) return null;
    actual += v; vistas++;
  }
  return vistas ? total + actual : null;
}

export interface PrecioDicho { valor: number; indice: number; texto: string }

/** Precios en lo dicho: «$45», «45 pesos», «45.50 pesos», «cuarenta y cinco pesos». `indice` = palabra donde termina. */
export function preciosDichos(palabras: readonly string[]): PrecioDicho[] {
  const n = palabras.map(limpiaToken);
  const salida: PrecioDicho[] = [];
  for (let i = 0; i < n.length; i++) {
    const p = n[i] ?? '';
    const cifra = /^\$?(\d{1,6}(?:[.,]\d{2})?)$/.exec(p.replace(/,(?=\d{3}\b)/g, ''));
    const siguePesos = /^pesos?$/.test(n[i + 1] ?? '');
    if (cifra && (p.startsWith('$') || siguePesos)) {
      salida.push({ valor: Number((cifra[1] ?? '0').replace(',', '.')), indice: i, texto: palabras[i] ?? '' });
      continue;
    }
    if (/^pesos?$/.test(p)) {
      for (let k = Math.max(0, i - 5); k < i; k++) {
        const v = numeroEnPalabras(n.slice(k, i));
        if (v !== null && !salida.some((s) => s.indice >= k)) { salida.push({ valor: v, indice: i - 1, texto: palabras.slice(k, i + 1).join(' ') }); break; }
      }
    }
  }
  return salida;
}

/** Una palabra suelta sin la puntuación que el transcriptor le pega al final («pesos.» → «pesos»). */
export const limpiaToken = (s: string): string => normaliza(s).replace(/[.,]+$/, '');
