/**
 * Qué pregunta el dueño, sin modelo: palabras clave → una intención tipada con su transición,
 * métrica y segmento. Es el «estructurador sin modelo» de la casa (como en grafo-conocimiento): lo
 * que no reconoce, lo dice («sin plan»), en vez de adivinar.
 */
import { anterior, delAnioAnterior, esPeriodo, type Periodo } from '../comun/periodos.js';
import type { Especificacion, Metrica } from '../ontologia/especificacion.js';

export type TipoDeIntencion = 'origen' | 'proporcion_expansion' | 'perdidos' | 'nuevos' | 'ruido_frecuencia' | 'ruido_ticket' | 'causal' | 'ticket' | 'palancas';

export interface Intencion {
  readonly tipo: TipoDeIntencion;
  readonly metrica: Metrica;
  readonly desde: Periodo;
  readonly hasta: Periodo;
  readonly segmento?: string;
  readonly umbralPorMil?: number;
  readonly intervencion?: string;
}

const sinAcentos = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const ORDINAL: Readonly<Record<string, number>> = { primer: 1, primero: 1, segundo: 2, tercer: 3, tercero: 3, cuarto: 4 };

function tipoDe(q: string): TipoDeIntencion | null {
  if (/\b(debo|deberia|conviene|vale la pena|que pasa(ria)? si|si (subo|bajo|doy|quito|cambio))\b/.test(q) || /\b(aumentara|subira|bajara|hara que)\b/.test(q)) return 'causal';
  if (/\b(ruido|casualidad|significativ|de verdad|es real|son reales|real o)\b/.test(q)) return /\bticket\b/.test(q) ? 'ruido_ticket' : 'ruido_frecuencia';
  if (/\d+(\.\d+)?\s*(%|por ?ciento)/.test(q) && /(expansion|expandi|crecimiento)/.test(q)) return 'proporcion_expansion';
  if (/\b(perdi|perdimos|se fueron|dejaron de comprar|clientes perdidos)\b/.test(q)) return 'perdidos';
  if (/\b(nuevos|ganamos|ganaste|clientes nuevos)\b/.test(q)) return 'nuevos';
  if (/\b(palanca|palancas|frecuencia y ticket|clientes, frecuencia|clientes x frecuencia|descomp)/.test(q)) return 'palancas';
  if (/\bticket\b/.test(q)) return 'ticket';
  if (/\b(de donde|que explica|por que|como se explica|puente|crecimiento|crecimos|cayeron|bajaron|subieron|ingreso)\b/.test(q)) return 'origen';
  return null;
}

function periodoNombrado(q: string): Periodo | null {
  // El dueño puede escribir «3t 2026», «2026-3t», «t3 2026» o «2026-t3» (ya en minúsculas).
  const id = /\b(20\d{2})-(?:t([1-4])|([1-4])t)\b/.exec(q);
  if (id) return `${id[1]}-${id[2] ?? id[3]}T`;
  const corto = /\b(?:t([1-4])|([1-4])t)\s+(?:de\s+)?(20\d{2})\b/.exec(q);
  if (corto) return `${corto[3]}-${corto[1] ?? corto[2]}T`;
  const largo = /\b(primer|primero|segundo|tercer|tercero|cuarto) trimestre(?: de(?:l)?)? (20\d{2})\b/.exec(q);
  return largo ? `${largo[2]}-${ORDINAL[largo[1]!]}T` : null;
}

function umbralDe(q: string): number | undefined {
  const m = /(\d+(?:\.\d+)?)\s*(%|por ?ciento)/.exec(q);
  return m ? Math.round(Number(m[1]) * 10) : undefined;
}

/** La pregunta → una intención, o `null` si no hay regla que la reconozca. */
export function interpreta(pregunta: string, e: Especificacion): Intencion | null {
  const q = sinAcentos(pregunta);
  const tipo = tipoDe(q);
  if (!tipo) return null;
  const nombrado = periodoNombrado(q);
  const hasta = nombrado && esPeriodo(nombrado) && nombrado <= e.horizonte.hasta && nombrado > e.horizonte.desde ? nombrado : e.horizonte.hasta;
  const anual = tipo === 'ruido_frecuencia' || tipo === 'ruido_ticket' || /\b(ano pasado|anual|interanual|mismo trimestre)\b/.test(q);
  const desde = anual && delAnioAnterior(hasta) >= e.horizonte.desde ? delAnioAnterior(hasta) : anterior(hasta);
  const metrica: Metrica = /\bcobr/.test(q) ? 'cobrado' : /\bfactur/.test(q) ? 'facturado' : e.ingreso.principal;
  const segmento = /\bmayorista/.test(q) ? 'mayorista' : /\bminorista/.test(q) ? 'minorista' : undefined;
  const umbral = umbralDe(q);
  return {
    tipo, metrica, desde, hasta, ...(segmento ? { segmento } : {}), ...(umbral !== undefined ? { umbralPorMil: umbral } : {}),
    ...(tipo === 'causal' ? { intervencion: pregunta.replace(/[¿?]/g, '').trim() } : {}),
  };
}
