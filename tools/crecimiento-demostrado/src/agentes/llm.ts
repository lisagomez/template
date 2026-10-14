/**
 * El proponente y el narrador con un LLM REAL, listos y sin usar: sin modelo inyectado responden
 * «no medido», nunca inventan. El modelo lo inyecta el proyecto con su clase de routing pineada
 * (alta de clase = CDC) y registra el uso en su contabilidad (coste `null` si no hay datos de uso).
 *
 * Estos prompts son parte del CDC del proyecto que los active: cambiarlos cambia el comportamiento.
 * El LLM solo PROPONE; su salida cruda pasa por el esquema del plan, el kernel y la inclusión.
 */
import type { Hecho, Plan } from '../motor/plan.js';
import { REGLAS, TEOREMAS } from '../kernel/derivacion.js';
import type { Contexto, Narrador, ParaNarrar, Proponente, Propuesta, Retroalimentacion } from './tipos.js';

export interface UsoDelModelo { readonly entrada: number; readonly salida: number }
export interface Modelo {
  readonly id: string;
  genera(sistema: string, usuario: string): Promise<{ readonly texto: string; readonly uso: UsoDelModelo | null }>;
}

export const PROMPT_PLAN = `Eres el planificador de un sistema de analítica con prueba. NO calculas nada.
Devuelve SOLO un JSON {"pregunta": string, "consultas": [...]} con consultas de este vocabulario cerrado:
puente{metrica,desde,hasta,segmento?} · nft{metrica,desde,hasta,alcance} · prueba{diseno,variable,desde,hasta,segmento?} ·
top{clase,metrica,desde,hasta,k} · ticket{clase,metrica,desde,hasta} · terminos{terminos:[...]}.
Nunca SQL. Periodos AAAA-Tn. Métricas: facturado, neto, cobrado.`;

export const PROMPT_DERIVACION = `Eres el proponente de una derivación Γ ⊢ φ. Devuelve SOLO un JSON con
{afirmacion:{paso}, nivel, gamma, especificacion, supuestos, pasos}. Reglas permitidas: ${REGLAS.join(', ')}.
Teoremas: ${TEOREMAS.join(', ')}. Cita SOLO hechos de la lista que se te da, con su valor exacto, y declara
todos los supuestos que exigen. Una afirmación causal es siempre una hipótesis con su experimento.
Un kernel sin LLM verificará cada paso; si te rechaza, recibirás el motivo.`;

export const PROMPT_NARRACION = `Redacta en español de México, para el dueño de una pyme, la respuesta verificada que se te da.
Usa SOLO las cifras que aparecen en ella, con su formato ($1,234.56; 12.3 %). No expliques causas
(«porque», «gracias a») salvo que la respuesta sea una hipótesis. Si no hay respuesta demostrada, dilo.`;

function jsonDe(texto: string): unknown {
  const [a, b] = [texto.indexOf('{'), texto.lastIndexOf('}')];
  if (a < 0 || b <= a) return texto;
  try { return JSON.parse(texto.slice(a, b + 1)) as unknown; } catch { return texto; }
}

const NO_MEDIDO = { tipo: 'no_medido' as const, motivo: 'sin modelo inyectado: el adaptador real está listo y su resultado es «no medido»' };

export class ProponenteLLM implements Proponente {
  readonly nombre: string;
  readonly permisos = ['leer_gamma', 'proponer_plan', 'proponer_derivacion'] as const;
  readonly usos: (UsoDelModelo | null)[] = [];
  private readonly modelo: Modelo | null;
  constructor(modelo: Modelo | null) {
    this.modelo = modelo;
    this.nombre = `proponente-llm@1.0.0 (${modelo?.id ?? 'sin modelo'})`;
  }
  private async pide(sistema: string, usuario: string): Promise<Propuesta<unknown>> {
    if (!this.modelo) return NO_MEDIDO;
    const r = await this.modelo.genera(sistema, usuario);
    this.usos.push(r.uso);
    return { tipo: 'propuesta', valor: jsonDe(r.texto) };
  }
  planea(c: Contexto, retro: Retroalimentacion | null): Promise<Propuesta<unknown>> {
    return this.pide(PROMPT_PLAN, JSON.stringify({ pregunta: c.pregunta, horizonte: c.especificacion.horizonte, segmentos: c.especificacion.segmentos, retro }));
  }
  deriva(c: Contexto, plan: Plan, hechos: readonly Hecho[], retro: Retroalimentacion | null): Promise<Propuesta<unknown>> {
    const supuestos = c.especificacion.supuestos.map((s) => ({ id: s.id, texto: s.texto }));
    return this.pide(PROMPT_DERIVACION, JSON.stringify({ pregunta: c.pregunta, gamma: c.gamma.hash, plan, hechos, supuestos, retro }));
  }
}

export class NarradorLLM implements Narrador {
  readonly nombre: string;
  readonly permisos = ['narrar'] as const;
  private readonly modelo: Modelo | null;
  constructor(modelo: Modelo | null) {
    this.modelo = modelo;
    this.nombre = `narrador-llm@1.0.0 (${modelo?.id ?? 'sin modelo'})`;
  }
  async narra(p: ParaNarrar): Promise<string> {
    if (!this.modelo) return 'No medido: no hay un modelo inyectado para redactar.';
    const r = await this.modelo.genera(PROMPT_NARRACION, JSON.stringify({ pregunta: p.pregunta, veredicto: p.veredicto, bloqueoAnterior: p.bloqueoAnterior }));
    return r.texto;
  }
}
