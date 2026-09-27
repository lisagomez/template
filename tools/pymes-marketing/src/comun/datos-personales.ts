/**
 * Minimización de datos personales (regla `personal-data` de la fuente; control C4, LFPDPPP en
 * México). Lo que una herramienta de marketing no necesita para decidir, no lo guarda ni lo
 * muestra: teléfonos, correos, RFC, CURP, CLABE y tarjetas se sustituyen por su etiqueta.
 * El nombre de quien escribe una reseña se reduce a «Nombre I.».
 */
export type TipoDatoPersonal = 'telefono' | 'correo' | 'curp' | 'rfc' | 'clabe' | 'tarjeta';

export interface Minimizado {
  readonly texto: string;
  readonly encontrados: Readonly<Partial<Record<TipoDatoPersonal, number>>>;
}

const ETIQUETA: Record<TipoDatoPersonal, string> = {
  telefono: '[teléfono]',
  correo: '[correo]',
  curp: '[CURP]',
  rfc: '[RFC]',
  clabe: '[cuenta]',
  tarjeta: '[tarjeta]',
};

function luhn(digitos: string): boolean {
  let suma = 0;
  for (let i = 0; i < digitos.length; i++) {
    let n = Number(digitos[digitos.length - 1 - i]);
    if (i % 2 === 1) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
    suma += n;
  }
  return suma % 10 === 0;
}

type Regla = readonly [TipoDatoPersonal, RegExp, (m: string) => boolean];

const REGLAS: readonly Regla[] = [
  ['correo', /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, () => true],
  ['curp', /\b[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/gi, () => true],
  ['rfc', /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/gi, () => true],
  ['clabe', /\b\d{18}\b/g, () => true],
  ['tarjeta', /\b(?:\d[ -]?){13,19}\b/g, (m) => luhn(m.replace(/\D/g, '')) && m.replace(/\D/g, '').length >= 13],
  ['telefono', /(?:\+?52[\s.-]?)?(?:\(?\d{2,3}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{4}\b/g, (m) => [10, 12].includes(m.replace(/\D/g, '').length)],
];

/** Sustituye datos personales por su etiqueta y cuenta cuántos de cada tipo había. */
export function minimizaDatosPersonales(texto: string): Minimizado {
  const encontrados: Partial<Record<TipoDatoPersonal, number>> = {};
  let salida = texto;
  for (const [tipo, patron, confirma] of REGLAS) {
    salida = salida.replace(patron, (m) => {
      if (!confirma(m)) return m;
      encontrados[tipo] = (encontrados[tipo] ?? 0) + 1;
      return ETIQUETA[tipo];
    });
  }
  return { texto: salida, encontrados };
}

/** «María Fernanda López» → «María L.»; vacío o anónimo → «Cliente». */
export function nombreCorto(nombre: string | null | undefined): string {
  const partes = (nombre ?? '').replace(/[^\p{L}\s.'-]/gu, ' ').split(/\s+/).filter(Boolean);
  if (partes.length === 0) return 'Cliente';
  const primero = partes[0]!;
  const apellido = partes.length > 1 ? ` ${partes[partes.length - 1]![0]!.toUpperCase()}.` : '';
  return `${primero[0]!.toUpperCase()}${primero.slice(1).toLowerCase()}${apellido}`;
}

export function hayDatosPersonales(m: Minimizado): boolean {
  return Object.values(m.encontrados).some((n) => (n ?? 0) > 0);
}
