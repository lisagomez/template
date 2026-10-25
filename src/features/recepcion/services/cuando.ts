/**
 * Cuándo dice lo pedido en el mostrador: «hoy», «mañana», «pasado mañana» o un día de la semana, y la hora
 * («a las 10», «a las diez y media», «a las 4 de la tarde», «16:30», «al mediodía»). Lo dictado por voz trae
 * los números en palabras, así que se leen igual que las cifras.
 *
 * Si no se entiende la hora, es null: quien apartaría una cita no adivina la hora (apartar a una hora que nadie
 * dijo es un error con víctima, el cliente que llega a otra hora). «de la mañana» es la mañana, no el día de mañana.
 */
const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const NUMEROS: Readonly<Record<string, number>> = {
  una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
};
const NUMERO = `\\d{1,2}|${Object.keys(NUMEROS).join('|')}`;

/** Sin acentos, en minúsculas y sin signos: «¿Mañana?» y «manana» se leen igual. */
export const normaliza = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[¿?¡!.,;«»"]/g, ' ').replace(/\s+/g, ' ').trim();

export interface Cuando {
  /** Días desde hoy (0 hoy, 1 mañana…). */
  dias: number;
  /** «HH:MM» en hora local, o null si no se dijo o no se entendió. */
  hora: string | null;
  /** Si el texto nombró un día (si no, es hoy por omisión). */
  diaDicho: boolean;
}

function horaDe(t: string, deLaManana: boolean): string | null {
  if (/\bmediodia\b/.test(t)) return '12:00';
  let h: number | null = null;
  let m = 0;
  const reloj = t.match(/\b(\d{1,2}):(\d{2})\b/);
  const dicha = t.match(new RegExp(`\\b(?:a |para )?las? (${NUMERO})(?: y (media|cuarto|\\d{1,2}))?\\b`));
  if (reloj) {
    h = Number(reloj[1]);
    m = Number(reloj[2]);
  } else if (dicha) {
    h = /^\d/.test(dicha[1]!) ? Number(dicha[1]) : NUMEROS[dicha[1]!] ?? null;
    m = dicha[2] === 'media' ? 30 : dicha[2] === 'cuarto' ? 15 : dicha[2] ? Number(dicha[2]) : 0;
  }
  if (h === null || h > 23 || m > 59) return null;
  const tarde = /\b(de la tarde|de la noche|pm)\b/.test(t);
  if (tarde && h < 12) h += 12;
  // En un mostrador, «a las 4» es de la tarde; «de la mañana» lo deja en la mañana.
  else if (!tarde && !deLaManana && h >= 1 && h <= 7) h += 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** `diaDeHoy`: 0 domingo … 6 sábado, en la zona del negocio. Un día de la semana que es hoy cuenta como el de la
 *  semana que viene (para hoy se dice «hoy»). */
export function cuandoDe(texto: string, diaDeHoy: number): Cuando {
  const crudo = ` ${normaliza(texto)} `;
  const deLaManana = /\b(de|en|por) la manana\b/.test(crudo);
  const t = crudo.replace(/\b(de|en|por) la manana\b/g, ' ');
  let dias = 0;
  let diaDicho = /\bhoy\b/.test(t);
  if (/\bpasado manana\b/.test(t)) [dias, diaDicho] = [2, true];
  else if (/\bmanana\b/.test(t)) [dias, diaDicho] = [1, true];
  else {
    const k = DIAS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(t));
    if (k >= 0) [dias, diaDicho] = [(k - diaDeHoy + 7) % 7 || 7, true];
  }
  return { dias, hora: horaDe(t, deLaManana), diaDicho };
}
