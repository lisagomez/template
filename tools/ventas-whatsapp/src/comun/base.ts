/**
 * Lo que todo el núcleo comparte: reloj y generador de ids inyectables (las pruebas y el
 * simulador corren con tiempo y ids deterministas), dinero en centavos, el resultado explícito
 * y la normalización del teléfono.
 */

/** Milisegundos desde la época. Se inyecta: nadie en el núcleo llama a `Date.now()` directo. */
export type Reloj = () => number;
export const relojDelSistema: Reloj = () => Date.now();

/** Un reloj que solo avanza cuando se le pide. Para pruebas y para el laboratorio. */
export interface RelojManual {
  (): number;
  avanza(ms: number): void;
  fija(ms: number): void;
}
export function relojManual(inicio: number): RelojManual {
  let ahora = inicio;
  const r = (() => ahora) as RelojManual;
  r.avanza = (ms) => { ahora += ms; };
  r.fija = (ms) => { ahora = ms; };
  return r;
}

export type GeneradorIds = (prefijo: string) => string;

/** Ids deterministas por prefijo (`ped_1`, `ped_2`…). */
export function idsSecuenciales(semilla = ''): GeneradorIds {
  const cuentas = new Map<string, number>();
  return (prefijo) => {
    const n = (cuentas.get(prefijo) ?? 0) + 1;
    cuentas.set(prefijo, n);
    return `${prefijo}_${semilla}${n}`;
  };
}

/** Ids aleatorios, para producción. */
export function idsAleatorios(): GeneradorIds {
  return (prefijo) => `${prefijo}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };
export const ok = <T>(valor: T): Resultado<T> => ({ ok: true, valor });
export const falla = <T = never>(error: string): Resultado<T> => ({ ok: false, error });

export const HORA = 3_600_000;
export const DIA = 24 * HORA;

/** Centavos → «$1,250.00 MXN». */
export function formatoDinero(centavos: number, moneda = 'MXN'): string {
  const signo = centavos < 0 ? '-' : '';
  const abs = Math.abs(Math.round(centavos));
  const enteros = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${signo}$${enteros}.${String(abs % 100).padStart(2, '0')} ${moneda}`;
}

/** Micro-dólares (millonésimas de USD) → «USD 0.0085». */
export function formatoUsd(micros: number): string {
  return `USD ${(micros / 1_000_000).toFixed(4)}`;
}

/**
 * Normaliza el `wa_id` que llega en el webhook: solo dígitos, y los celulares de México con el
 * prefijo antiguo `521` + 10 dígitos pasan a `52` + 10 dígitos. Sin esto, el mismo cliente
 * aparece dos veces (fuente §Puntos de entrada).
 */
export function normalizaWaId(entrada: string): string {
  const digitos = entrada.replace(/\D/g, '');
  if (digitos.length === 13 && digitos.startsWith('521')) return `52${digitos.slice(3)}`;
  return digitos;
}

/** El código de país del destinatario (lo que decide la tarifa). Solo los que el laboratorio usa. */
export function paisDeWaId(waId: string): string {
  const d = normalizaWaId(waId);
  const prefijos: Array<[string, string]> = [
    ['52', 'MX'], ['57', 'CO'], ['51', 'PE'], ['56', 'CL'], ['54', 'AR'], ['55', 'BR'], ['1', 'US'],
  ];
  for (const [p, pais] of prefijos) if (d.startsWith(p)) return pais;
  return 'OTRO';
}

export const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const texto = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

export const numero = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
};

/** Quita acentos y pasa a minúsculas: para comparar texto de clientes. */
export function pliega(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
