/**
 * Azar con semilla para el generador. Copia propia (no la del motor) a propósito: el generador y
 * el sistema no comparten código de cálculo, para que la verdad plantada se obtenga por otro
 * camino.
 */
export interface Azar {
  (): number;
  entero(min: number, max: number): number;
  elige<T>(xs: readonly T[]): T;
  normal(): number;
  probabilidad(p: number): boolean;
  uuid(): string;
}

export function azarCon(semilla: number): Azar {
  let a = semilla >>> 0;
  const siguiente = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const f = siguiente as Azar;
  f.entero = (min, max) => min + Math.floor(siguiente() * (max - min + 1));
  f.elige = (xs) => xs[Math.floor(siguiente() * xs.length)]!;
  f.normal = () => Math.sqrt(-2 * Math.log(1 - siguiente())) * Math.cos(2 * Math.PI * siguiente());
  f.probabilidad = (p) => siguiente() < p;
  f.uuid = () => {
    const h = Array.from({ length: 32 }, () => Math.floor(siguiente() * 16).toString(16)).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${'89ab'[Math.floor(siguiente() * 4)]}${h.slice(17, 20)}-${h.slice(20, 32)}`.toUpperCase();
  };
  return f;
}

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ALFANUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** RFC de persona moral con FORMA válida y homoclave «S»+2: sintético, no se busca que exista. */
export function rfcSintetico(azar: Azar): string {
  const letras = Array.from({ length: 3 }, () => azar.elige([...LETRAS])).join('');
  const fecha = `${String(azar.entero(0, 23)).padStart(2, '0')}${String(azar.entero(1, 12)).padStart(2, '0')}${String(azar.entero(1, 28)).padStart(2, '0')}`;
  return `${letras}${fecha}S${azar.elige([...ALFANUM])}${azar.elige([...ALFANUM])}`;
}
