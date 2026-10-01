/**
 * El modelo de cada agente sale del ROUTING (C8): clase de tarea → nivel → modelo pineado. La llave se inyecta y nunca
 * se imprime. Sin llave no hay agente: se dice «falta la llave», jamás se inventa una respuesta.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { modeloOpenAiCompat } from '../../../../tools/sistema-integrado/dist/openrouter.js';
import type { ClaseDeRouting, ModeloLLM } from '../../../../tools/sistema-integrado/dist/agentes/index.js';
import { modeloPara, type ClaseDeTarea } from '../../../lib/ai/routing.ts';
import { estadoPresupuesto, type EstadoDePresupuesto } from '../../../lib/ai/contabilidad.ts';

/** Presupuesto mensual de agentes por organización (USD). Al 80 % se avisa; al 100 % la APP pausa los agentes de esa
 * organización (decisión de producto con víctima declarada: la pyme sigue usando todo lo demás, sin redacción). */
export const PRESUPUESTO_MENSUAL_USD = 5;

/** Tope de razonamiento por clase, aparte del de la respuesta. El modelo de evaluación razona por omisión y, sin tope
 * propio, se comía todo el límite de salida del diagnóstico (medido el 2026-10-01: respuesta vacía, US$0.30 perdidos). */
const RAZONAMIENTO: Partial<Record<Exclude<ClaseDeRouting, null>, number>> = { 'agente-sgi-evaluacion': 4000 };

export function modeloDe(clase: Exclude<ClaseDeRouting, null>, llave: string | undefined, f: typeof fetch = fetch): ModeloLLM | null {
  if (!llave) return null;
  const { modelo } = modeloPara(clase as ClaseDeTarea);
  const razonamiento = RAZONAMIENTO[clase];
  return modeloOpenAiCompat({
    llave, modelo, fetch: f, cabeceras: { 'X-Title': 'sistema-integrado-iso' },
    ...(razonamiento ? { razonamiento: { maxTokens: razonamiento } } : {}),
  });
}

/** Gasto del mes de UNA organización, leído con la sesión (RLS: solo sus trazas). */
export async function presupuestoDe(sb: SupabaseClient, orgId: string, ahora = new Date()): Promise<EstadoDePresupuesto> {
  const desde = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)).toISOString();
  const { data, error } = await sb.from('sgi_traza').select('costo_usd, uso').eq('organizacion_id', orgId).gte('creado_en', desde);
  if (error) throw new Error(`no se pudo leer el gasto: ${error.message}`);
  const filas = data ?? [];
  const gastado = filas.reduce((s, x) => s + (x.costo_usd === null ? 0 : Number(x.costo_usd)), 0);
  // Una llamada al modelo sin datos de uso se guarda con costo null y se DECLARA: la cifra real es mayor.
  const sinCosto = filas.filter((x) => x.costo_usd === null).length;
  return estadoPresupuesto(gastado, PRESUPUESTO_MENSUAL_USD, sinCosto);
}
