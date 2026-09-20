/** Utilidades de texto compartidas por las reglas: normalizar, partir en frases, numeros dichos. */

export const quitaAcentos = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export const normaliza = (s: string): string => quitaAcentos(s.toLowerCase()).replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();

export const tokeniza = (s: string): string[] => normaliza(s).split(' ').filter((t) => t.length > 0);

/** Parte un texto en frases por puntuacion fuerte o salto de linea; sin frases vacias. */
export function parteEnFrases(texto: string): string[] {
  return texto
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

const UNIDADES: Record<string, number> = {
  cero: 0, un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const DECENAS: Record<string, number> = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const CENTENAS: Record<string, number> = { cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500 };

/**
 * Primer numero que aparece en un texto, en cifras («12») o en palabras («doce», «treinta y
 * cinco», «ciento dos»). `undefined` si no hay ninguno. Cubre 0-999, que es lo que un pedido,
 * una hora o una cantidad dictada necesitan.
 */
export function primerNumero(texto: string): number | undefined {
  const cifras = /\d+/.exec(texto);
  const tokens = tokeniza(texto);
  let total: number | undefined;
  let posicionCifra = cifras ? normaliza(texto).indexOf(cifras[0]) : -1;
  let posicionPalabra = -1;
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i] ?? '';
    const valor = CENTENAS[t] ?? DECENAS[t] ?? UNIDADES[t];
    if (valor === undefined) {
      if (total !== undefined) break;
      i++;
      continue;
    }
    if (total === undefined) posicionPalabra = normaliza(texto).indexOf(t);
    total = (total ?? 0) + valor;
    if (DECENAS[t] !== undefined && tokens[i + 1] === 'y' && UNIDADES[tokens[i + 2] ?? ''] !== undefined) {
      total += UNIDADES[tokens[i + 2] ?? ''] ?? 0;
      i += 3;
      continue;
    }
    i++;
  }
  if (cifras && (total === undefined || posicionCifra < posicionPalabra)) return Number(cifras[0]);
  posicionCifra = -1;
  return total;
}

export const formateaMs = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 100)) / 10;
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};
