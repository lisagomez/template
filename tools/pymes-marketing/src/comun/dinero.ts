/**
 * Dinero en CENTAVOS enteros (nunca flotantes) y con su moneda. Regla `currency-and-locale` de
 * la fuente, adaptada: aquí la moneda por defecto es MXN y el formato es el de México
 * ($1,234.50: coma de miles, punto decimal). Monedas distintas **no se suman**: se reportan
 * aparte o se convierten solo con un tipo de cambio que venga en el propio documento.
 */
export interface Importe {
  readonly centavos: number;
  readonly moneda: string;
}

export type LecturaDeImporte =
  | { readonly ok: true; readonly centavos: number; readonly moneda: string | null }
  | { readonly ok: false; readonly motivo: string };

const MONEDAS = ['MXN', 'USD', 'EUR', 'CAD'] as const;
const EUROPEO = /^-?\d{1,3}(\.\d{3})+(,\d{1,2})?$/;

/** Lee «$1,234.50», «1234.5», «MXN 1,200», «(300.00)» (negativo contable). */
export function leeImporte(crudo: string): LecturaDeImporte {
  let texto = crudo.trim().toUpperCase();
  if (texto === '') return { ok: false, motivo: 'importe vacío' };
  const moneda = MONEDAS.find((m) => texto.includes(m)) ?? (texto.includes('US$') ? 'USD' : null);
  const negativo = /^\(.*\)$/.test(texto) || texto.startsWith('-');
  texto = texto.replace(/US\$|MXN|USD|EUR|CAD|MN|\$|\s|\(|\)|-/g, '');
  if (EUROPEO.test(texto)) {
    return { ok: false, motivo: `«${crudo}» parece formato europeo (punto de miles): no se adivina` };
  }
  texto = texto.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(texto)) return { ok: false, motivo: `«${crudo}» no es un importe` };
  const centavos = Math.round(Number(texto) * 100);
  return { ok: true, centavos: negativo ? -centavos : centavos, moneda };
}

const FORMATOS = new Map<string, Intl.NumberFormat>();

/** «$1,234.50» para MXN; «US$1,234.50» para dólares. */
export function formatoDinero(centavos: number, moneda = 'MXN'): string {
  let f = FORMATOS.get(moneda);
  if (!f) {
    f = new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda, minimumFractionDigits: 2 });
    FORMATOS.set(moneda, f);
  }
  return f.format(centavos / 100);
}

/** Pesos redondos para titulares: «$12,400». */
export function formatoPesosRedondo(centavos: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(
    Math.round(centavos / 100),
  );
}

/** Suma importes de UNA moneda. Si vienen mezcladas, no suma: agrupa y lo dice. */
export function sumaPorMoneda(importes: readonly Importe[]): Map<string, number> {
  const porMoneda = new Map<string, number>();
  for (const i of importes) porMoneda.set(i.moneda, (porMoneda.get(i.moneda) ?? 0) + i.centavos);
  return porMoneda;
}
