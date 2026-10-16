/**
 * Un `.ics` (RFC 5545) con la cita, para que el paciente la agregue a SU calendario: VCALENDAR con VERSION,
 * PRODID y METHOD:PUBLISH (no es una invitacion que espere respuesta), un VEVENT con UID estable (el mismo
 * para reprogramar, con SEQUENCE que sube), DTSTAMP, DTSTART/DTEND en UTC (sin VTIMEZONE que mantener) y un
 * VALARM dos horas antes. Lineas con CRLF, plegadas a 75 octetos (§3.1) y texto escapado (§3.3.11).
 */
export interface CitaIcs {
  uid: string;
  inicio: Date;
  fin: Date;
  resumen: string;
  lugar: string;
  descripcion: string;
  secuencia?: number;
  cancelada?: boolean;
  sello: Date;
}

const utc = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export const escapaTexto = (s: string): string => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Pliega una linea a 75 octetos sin partir un caracter UTF-8: la continuacion empieza con un espacio. */
export function pliega(linea: string): string {
  const partes: string[] = [];
  let actual = '';
  let octetos = 0;
  for (const ch of linea) {
    const n = Buffer.byteLength(ch, 'utf8');
    const limite = partes.length === 0 ? 75 : 74;
    if (octetos + n > limite) {
      partes.push(actual);
      actual = '';
      octetos = 0;
    }
    actual += ch;
    octetos += n;
  }
  partes.push(actual);
  return partes.join('\r\n ');
}

export function construyeIcs(c: CitaIcs): string {
  const lineas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Laboratorio del template//Portal clinica dental 0.1//ES', 'CALSCALE:GREGORIAN',
    c.cancelada ? 'METHOD:CANCEL' : 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${c.uid}`, `DTSTAMP:${utc(c.sello)}`, `DTSTART:${utc(c.inicio)}`, `DTEND:${utc(c.fin)}`,
    `SEQUENCE:${c.secuencia ?? 0}`, `STATUS:${c.cancelada ? 'CANCELLED' : 'CONFIRMED'}`,
    `SUMMARY:${escapaTexto(c.resumen)}`, `LOCATION:${escapaTexto(c.lugar)}`, `DESCRIPTION:${escapaTexto(c.descripcion)}`,
    ...(c.cancelada ? [] : ['BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT2H', `DESCRIPTION:${escapaTexto(`Recordatorio: ${c.resumen}`)}`, 'END:VALARM']),
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return `${lineas.map(pliega).join('\r\n')}\r\n`;
}

/** Despliega y lee las propiedades de un `.ics` (pruebas y visor del buzon). */
export function leeIcs(texto: string): Record<string, string> {
  const desplegado = texto.replace(/\r\n[ \t]/g, '');
  const props: Record<string, string> = {};
  for (const l of desplegado.split('\r\n')) {
    const i = l.indexOf(':');
    if (i > 0) props[l.slice(0, i)] ??= l.slice(i + 1);
  }
  return props;
}
