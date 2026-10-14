/** Calendario del generador (propio, como el azar): meses del horizonte y días con hora local. */
export const ESTACIONALIDAD = [0.85, 0.9, 1.0, 1.0, 1.05, 1.0, 1.0, 1.15, 0.95, 1.0, 1.2, 1.3] as const;

export interface Mes { readonly indice: number; readonly anio: number; readonly mes: number }

export function meses(desde: { anio: number; mes: number }, cuantos: number): Mes[] {
  return Array.from({ length: cuantos }, (_, i) => {
    const total = desde.anio * 12 + (desde.mes - 1) + i;
    return { indice: i, anio: Math.floor(total / 12), mes: (total % 12) + 1 };
  });
}

export function diasDe(anio: number, mes: number): number {
  if (mes === 2) return anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

const dos = (n: number) => String(n).padStart(2, '0');
export const dia = (anio: number, mes: number, d: number): string => `${anio}-${dos(mes)}-${dos(d)}`;
export const fechaHora = (diaTexto: string, h: number, m: number): string => `${diaTexto}T${dos(h)}:${dos(m)}:${dos((h * 7 + m) % 60)}`;

/** `n` días después de un día (sin `Date` de la máquina: aritmética sobre el calendario). */
export function sumaDias(diaTexto: string, n: number): string {
  let [a, m, d] = diaTexto.split('-').map(Number) as [number, number, number];
  d += n;
  while (d > diasDe(a, m)) { d -= diasDe(a, m); m += 1; if (m > 12) { m = 1; a += 1; } }
  return dia(a, m, d);
}

export const mesSiguiente = (anio: number, mes: number) => (mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 });
export const trimestreDe = (indiceDeMes: number) => Math.floor(indiceDeMes / 3);
