/**
 * Los contratos de los agentes, con la forma de A2A (entrada, salida, estado) aunque corran en un
 * proceso. Un agente PROPONE: un plan, una derivación, un texto. Nada de lo que devuelve se cree:
 * el plan pasa por el esquema, la derivación por el kernel y el texto por la inclusión de números.
 */
import type { Gamma } from '../datos/gamma.js';
import type { Veredicto } from '../kernel/veredicto.js';
import type { Hecho, Plan } from '../motor/plan.js';
import type { Especificacion } from '../ontologia/especificacion.js';

export const PERMISOS = ['leer_gamma', 'proponer_plan', 'proponer_derivacion', 'narrar', 'proponer_accion'] as const;
export type Permiso = (typeof PERMISOS)[number];

export interface Contexto {
  readonly gamma: Gamma;
  readonly especificacion: Especificacion;
  readonly pregunta: string;
}

/** Lo que vuelve al proponente cuando el kernel (o el esquema del plan) rechaza su propuesta. */
export interface Retroalimentacion {
  readonly intento: number;
  readonly veredicto: Exclude<Veredicto, { estado: 'aceptada' }> | { readonly estado: 'plan_rechazado'; readonly motivo: string; readonly detalle: string };
}

/** Un proponente sin modelo inyectado no inventa: dice «no medido». */
export type Propuesta<T> = { readonly tipo: 'propuesta'; readonly valor: T } | { readonly tipo: 'sin_plan'; readonly motivo: string } | { readonly tipo: 'no_medido'; readonly motivo: string };

export interface Proponente {
  readonly nombre: string;
  readonly permisos: readonly Permiso[];
  planea(c: Contexto, retro: Retroalimentacion | null): Promise<Propuesta<unknown>>;
  deriva(c: Contexto, plan: Plan, hechos: readonly Hecho[], retro: Retroalimentacion | null): Promise<Propuesta<unknown>>;
}

/** Lo que el narrador recibe: SOLO lo verificado (veredicto y, si lo hay, certificado). */
export interface ParaNarrar {
  readonly pregunta: string;
  readonly veredicto: Veredicto;
  readonly especificacion: Especificacion;
  readonly bloqueoAnterior: readonly { readonly crudo: string; readonly motivo: string }[] | null;
}

export interface Narrador {
  readonly nombre: string;
  readonly permisos: readonly Permiso[];
  narra(p: ParaNarrar): Promise<string>;
}

/** La forma de `sis_propuesta` (ERP D-42): la inteligencia propone con origen, modelo y evidencia; jamás ejecuta. */
export interface PropuestaDeAccion {
  readonly origen: 'crecimiento-demostrado';
  readonly modelo: string;
  readonly version: string;
  readonly accion: string;
  readonly evidencia: { readonly veredicto: Veredicto['estado']; readonly certificado: string | null; readonly gamma: string };
  readonly estado: 'propuesta';
  readonly requiere: 'principal humano';
}
