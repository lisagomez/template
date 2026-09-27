/**
 * Fechas como días «AAAA-MM-DD» (texto), sin horas ni zonas: una venta del 1 de septiembre es
 * del 1 de septiembre en cualquier servidor. La entrada mexicana es día/mes/año.
 */
export type Dia = string;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function valido(a: number, m: number, d: number): Dia | null {
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return f.toISOString().slice(0, 10);
}

/**
 * Acepta «2026-09-01», «2026-09-01T12:00:00», «01/09/2026», «1-9-2026», «01/09/26». Por defecto día
 * primero (México); `orden: 'mdy'` para archivos que el propio archivo delata como mes primero.
 */
export function leeDia(texto: string, orden: 'dmy' | 'mdy' = 'dmy'): Dia | null {
  const t = texto.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return valido(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const mx = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (!mx) return null;
  const anio = mx[3]!.length === 2 ? 2000 + Number(mx[3]) : Number(mx[3]);
  const [a, b] = [Number(mx[1]), Number(mx[2])];
  return orden === 'dmy' ? valido(anio, b, a) : valido(anio, a, b);
}

function aFecha(dia: Dia): Date {
  return new Date(`${dia}T00:00:00Z`);
}

export function sumaDias(dia: Dia, n: number): Dia {
  const f = aFecha(dia);
  f.setUTCDate(f.getUTCDate() + n);
  return f.toISOString().slice(0, 10);
}

export function diasEntre(desde: Dia, hasta: Dia): number {
  return Math.round((aFecha(hasta).getTime() - aFecha(desde).getTime()) / 86_400_000);
}

/** 0 = domingo … 6 = sábado. */
export function diaDeSemana(dia: Dia): number {
  return aFecha(dia).getUTCDay();
}

export function nombreDeDia(dia: Dia): string {
  return DIAS[diaDeSemana(dia)]!;
}

/** «lunes 5 de octubre». */
export function fechaLarga(dia: Dia): string {
  const f = aFecha(dia);
  return `${nombreDeDia(dia)} ${f.getUTCDate()} de ${MESES[f.getUTCMonth()]}`;
}

/** «5 oct». */
export function fechaCorta(dia: Dia): string {
  const f = aFecha(dia);
  return `${f.getUTCDate()} ${MESES[f.getUTCMonth()]!.slice(0, 3)}`;
}

/** Lunes de la semana del día dado. */
export function lunesDe(dia: Dia): Dia {
  return sumaDias(dia, -((diaDeSemana(dia) + 6) % 7));
}

/** Último día del mes de `dia`. */
export function finDeMes(dia: Dia): Dia {
  const f = aFecha(dia);
  return new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

export function diaDe(anio: number, mes: number, dia: number): Dia {
  return valido(anio, mes, dia) ?? `${anio}-01-01`;
}

/**
 * ¿Día/mes o mes/día? Se deduce del propio archivo: si alguna fecha trae un primer número mayor que
 * 12, es día primero; si lo trae el segundo, es mes primero. Si ninguna lo delata, es AMBIGUO y se
 * dice (se lee como día/mes, lo normal en México). Nunca se adivina en silencio.
 */
export function ordenDeFechas(textos: readonly string[]): { readonly orden: 'dmy' | 'mdy'; readonly certeza: 'deducida' | 'ambigua' | 'contradictoria' } {
  let dmy = false, mdy = false;
  for (const t of textos) {
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}$/.exec(t.trim());
    if (!m) continue;
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[2]) > 12) mdy = true;
  }
  if (dmy && mdy) return { orden: 'dmy', certeza: 'contradictoria' };
  if (mdy) return { orden: 'mdy', certeza: 'deducida' };
  return { orden: 'dmy', certeza: dmy ? 'deducida' : 'ambigua' };
}
