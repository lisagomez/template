/**
 * La hora y la fecha dichas como las diría una persona en español de México («son las cinco y
 * veinte de la tarde»), en letra: la voz lee mejor palabras que «17:20».
 */

const UNIDADES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** 0-99 en letra. */
export function numeroEnPalabras(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 99) return String(n);
  if (n < 30) return UNIDADES[n] ?? String(n);
  const d = Math.floor(n / 10);
  const u = n % 10;
  return u === 0 ? (DECENAS[d] ?? '') : `${DECENAS[d] ?? ''} y ${UNIDADES[u] ?? ''}`;
}

export interface PartesHora {
  hora: number;
  minuto: number;
  diaSemana: number;
  dia: number;
  mes: number;
}

/** Las partes del instante en una zona horaria (Intl), sin depender de la zona de la máquina. */
export function partesDe(instante: Date, zona: string): PartesHora {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: zona, hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short', day: 'numeric', month: 'numeric' });
  const p = Object.fromEntries(f.formatToParts(instante).map((x) => [x.type, x.value]));
  const dias = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return { hora: Number(p['hour']), minuto: Number(p['minute']), diaSemana: dias.indexOf(p['weekday'] ?? 'Sun'), dia: Number(p['day']), mes: Number(p['month']) - 1 };
}

const franja = (h: number) => (h < 6 ? 'de la madrugada' : h < 12 ? 'de la mañana' : h < 20 ? 'de la tarde' : 'de la noche');

export function horaEnPalabras(instante: Date, zona = 'America/Mexico_City'): string {
  const { hora, minuto } = partesDe(instante, zona);
  const h12 = hora % 12 === 0 ? 12 : hora % 12;
  const nombre = h12 === 1 ? 'la una' : `las ${numeroEnPalabras(h12)}`;
  const verbo = h12 === 1 ? 'Es' : 'Son';
  const minutos = minuto === 0 ? ' en punto' : minuto === 15 ? ' y cuarto' : minuto === 30 ? ' y media' : ` y ${numeroEnPalabras(minuto)}`;
  return `${verbo} ${nombre}${minutos} ${franja(hora)}.`;
}

export function fechaEnPalabras(instante: Date, zona = 'America/Mexico_City'): string {
  const { diaSemana, dia, mes } = partesDe(instante, zona);
  return `Hoy es ${DIAS[diaSemana] ?? ''} ${numeroEnPalabras(dia)} de ${MESES[mes] ?? ''}.`;
}
