/**
 * Dinero en centavos ENTEROS, con aritmética decimal exacta (BigInt). «Cierra al centavo» es
 * igualdad, no tolerancia: si una suma necesitara tolerancia, el bug estaría aquí.
 *
 * Regla de redondeo (declarada, y la única): al centavo, mitades lejos del cero. Se aplica una vez,
 * al convertir el importe del comprobante (y su tipo de cambio) a centavos de MXN.
 */

interface Decimal { readonly digitos: bigint; readonly escala: number }

const DECIMAL = /^(-)?(\d+)(?:\.(\d+))?$/;

function leeDecimal(texto: string): Decimal | null {
  const m = DECIMAL.exec(texto.trim());
  if (!m) return null;
  const fraccion = m[3] ?? '';
  const digitos = BigInt(`${m[2]}${fraccion}`);
  return { digitos: m[1] ? -digitos : digitos, escala: fraccion.length };
}

/** Redondea un decimal a centavos: mitades lejos del cero. */
function aCentavos(d: Decimal): bigint {
  if (d.escala <= 2) return d.digitos * BigInt(10) ** BigInt(2 - d.escala);
  const divisor = BigInt(10) ** BigInt(d.escala - 2);
  const absoluto = d.digitos < BigInt(0) ? -d.digitos : d.digitos;
  const cociente = absoluto / divisor;
  const resto = absoluto % divisor;
  const redondeado = resto * BigInt(2) >= divisor ? cociente + BigInt(1) : cociente;
  return d.digitos < BigInt(0) ? -redondeado : redondeado;
}

function aNumero(c: bigint): number {
  const n = Number(c);
  if (!Number.isSafeInteger(n)) throw new Error('importe fuera del rango exacto');
  return n;
}

/** "1234.565" → 123457. `null` si el texto no es un decimal. */
export function centavosDe(texto: string): number | null {
  const d = leeDecimal(texto);
  return d ? aNumero(aCentavos(d)) : null;
}

/** Importe × tipo de cambio, exacto, y luego UN redondeo al centavo. */
export function centavosConvertidos(importe: string, tipoDeCambio: string): number | null {
  const a = leeDecimal(importe);
  const b = leeDecimal(tipoDeCambio);
  if (!a || !b) return null;
  return aNumero(aCentavos({ digitos: a.digitos * b.digitos, escala: a.escala + b.escala }));
}

/** (subtotal − descuento) × tipo de cambio, exacto, y UN redondeo al centavo. Sin tipo de cambio, × 1. */
export function centavosDeOperacion(subtotal: string, descuento: string | null, tipoDeCambio: string | null): number | null {
  const s = leeDecimal(subtotal);
  const d = leeDecimal(descuento ?? '0');
  const t = leeDecimal(tipoDeCambio ?? '1');
  if (!s || !d || !t) return null;
  const escala = Math.max(s.escala, d.escala);
  const neto = s.digitos * BigInt(10) ** BigInt(escala - s.escala) - d.digitos * BigInt(10) ** BigInt(escala - d.escala);
  return aNumero(aCentavos({ digitos: neto * t.digitos, escala: escala + t.escala }));
}

/** Centavos → "1234.56" (el texto que va a un XML o un CSV). */
export function textoDeCentavos(c: number): string {
  const signo = c < 0 ? '-' : '';
  const abs = Math.abs(c);
  return `${signo}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

const conComas = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Centavos → "$1,234.56" (y "-$1,234.56"). Formato de México, sin depender del locale. */
export function formatoPesos(c: number): string {
  const abs = Math.abs(c);
  return `${c < 0 ? '-' : ''}$${conComas(Math.trunc(abs / 100))}.${String(abs % 100).padStart(2, '0')}`;
}

/** Centavos → "$1,235": a pesos enteros, mitades lejos del cero. */
export function formatoPesosRedondo(c: number): string {
  const pesos = Math.sign(c) * Math.floor((Math.abs(c) + 50) / 100);
  return `${pesos < 0 ? '-' : ''}$${conComas(Math.abs(pesos))}`;
}

/** Suma exacta; lanza si se sale del rango de enteros seguros. */
export function suma(valores: readonly number[]): number {
  let total = BigInt(0);
  for (const v of valores) total += BigInt(v);
  return aNumero(total);
}
