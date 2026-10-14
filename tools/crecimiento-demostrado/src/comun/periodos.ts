/**
 * Días y periodos como TEXTO, nunca como `Date`. La `Fecha` de un CFDI 4.0 es hora local del lugar
 * de expedición y no trae zona: pasarla por `new Date()` la movería según la máquina que corre, y
 * un ticket de las 23:30 del 31 de marzo caería en otro trimestre. Aquí el día son los diez
 * primeros caracteres y ya.
 */

export type Dia = string;
/**
 * `AAAA-nT` (trimestre, como en los reportes trimestrales de México: «3T 2026») o `AAAA-MM` (mes).
 * La notación «T» seguida de dígito no se usa: la gobernanza la reserva para identificadores de
 * caso del corpus y la caza en todo el árbol.
 */
export type Periodo = string;
export type Granularidad = 'trimestre' | 'mes';

const DIA = /^(\d{4})-(\d{2})-(\d{2})/;
const TRIMESTRE = /^(\d{4})-([1-4])T$/;
const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const;

/** "2025-08-14T10:22:31" → "2025-08-14". `null` si no empieza con un día válido. */
export function diaDe(texto: string): Dia | null {
  const m = DIA.exec(texto.trim());
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mes < 1 || mes > 12 || dia < 1 || dia > diasDelMes(anio, mes)) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function diasDelMes(anio: number, mes: number): number {
  if (mes === 2) return anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

export const esPeriodo = (p: string): boolean => TRIMESTRE.test(p) || MES.test(p);
export const granularidadDe = (p: Periodo): Granularidad => (TRIMESTRE.test(p) ? 'trimestre' : 'mes');

export function periodoDe(dia: Dia, g: Granularidad): Periodo {
  const anio = dia.slice(0, 4);
  const mes = Number(dia.slice(5, 7));
  return g === 'mes' ? `${anio}-${dia.slice(5, 7)}` : `${anio}-${Math.ceil(mes / 3)}T`;
}

function partes(p: Periodo): { anio: number; n: number; g: Granularidad } {
  const t = TRIMESTRE.exec(p);
  if (t) return { anio: Number(t[1]), n: Number(t[2]), g: 'trimestre' };
  const m = MES.exec(p);
  if (m) return { anio: Number(m[1]), n: Number(m[2]), g: 'mes' };
  throw new Error(`periodo inválido: ${p}`);
}

function arma(anio: number, n: number, g: Granularidad): Periodo {
  return g === 'trimestre' ? `${anio}-${n}T` : `${anio}-${String(n).padStart(2, '0')}`;
}

/** El periodo inmediato anterior: 2025-1T → 2024-4T; 2025-01 → 2024-12. */
export function anterior(p: Periodo): Periodo {
  const { anio, n, g } = partes(p);
  const tope = g === 'trimestre' ? 4 : 12;
  return n === 1 ? arma(anio - 1, tope, g) : arma(anio, n - 1, g);
}

export function siguiente(p: Periodo): Periodo {
  const { anio, n, g } = partes(p);
  const tope = g === 'trimestre' ? 4 : 12;
  return n === tope ? arma(anio + 1, 1, g) : arma(anio, n + 1, g);
}

/** El mismo periodo del año anterior: compararlo controla la estacionalidad. */
export function delAnioAnterior(p: Periodo): Periodo {
  const { anio, n, g } = partes(p);
  return arma(anio - 1, n, g);
}

export function contiene(p: Periodo, dia: Dia): boolean {
  return periodoDe(dia, granularidadDe(p)) === p;
}

/** Periodos de `desde` a `hasta`, inclusive, de la misma granularidad. */
export function rango(desde: Periodo, hasta: Periodo): Periodo[] {
  const fuera: Periodo[] = [];
  for (let p = desde; fuera.length < 400; p = siguiente(p)) {
    fuera.push(p);
    if (p === hasta) return fuera;
  }
  throw new Error(`rango inválido: ${desde} → ${hasta}`);
}

/** "2025-3T" → "3T 2025"; "2025-08" → "agosto 2025". */
export function etiqueta(p: Periodo): string {
  const { anio, n, g } = partes(p);
  return g === 'trimestre' ? `${n}T ${anio}` : `${MESES[n - 1]} ${anio}`;
}

export const nombreDeMes = (n: number): string => MESES[n - 1] ?? '';
