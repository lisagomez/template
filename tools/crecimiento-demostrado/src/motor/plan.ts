/**
 * El PLAN que propone un agente: una lista de consultas de un vocabulario cerrado. Nunca SQL: un
 * plan que trae una clave `sql` (en cualquier nivel) se rechaza con su propio motivo, y uno que no
 * encaja en el esquema, con el suyo. El plan se ejecuta en el motor y produce HECHOS, cada uno con
 * su huella (Γ + spec + término + valor), y la ejecución se guarda en caché por el hash del plan.
 */
import { z } from 'zod';
import { huellaDe, type Canonizable } from '../comun/canonico.js';
import { esPeriodo } from '../comun/periodos.js';
import type { Gamma } from '../datos/gamma.js';
import { METRICAS, huellaDeEspecificacion, supuestosExigidos, type Especificacion } from '../ontologia/especificacion.js';
import { valorDe, type Valor } from './evalua.js';
import { CLASES, clavesQueExige, esquemaTermino, nombreDe, type Clase, type Termino } from './terminos.js';

const periodo = z.string().refine(esPeriodo, 'periodo inválido');
const metrica = z.enum(METRICAS);
const t = { desde: periodo, hasta: periodo };

const consulta = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('puente'), metrica, ...t, segmento: z.string().optional() }).strict(),
  z.object({ tipo: z.literal('nft'), metrica, ...t, alcance: z.enum(['identificados', 'todos']) }).strict(),
  z.object({ tipo: z.literal('prueba'), diseno: z.enum(['pareada', 'dos_muestras']), variable: z.enum(['frecuencia', 'neto', 'ticket']), ...t, segmento: z.string().optional() }).strict(),
  z.object({ tipo: z.literal('top'), clase: z.enum(CLASES), metrica, ...t, k: z.number().int().min(1).max(20) }).strict(),
  z.object({ tipo: z.literal('ticket'), clase: z.enum(CLASES), metrica, ...t }).strict(),
  z.object({ tipo: z.literal('terminos'), terminos: z.array(esquemaTermino).min(1).max(40) }).strict(),
]);

export const esquemaPlan = z.object({ pregunta: z.string().max(500), consultas: z.array(consulta).min(1).max(12) }).strict();
export type Plan = z.infer<typeof esquemaPlan>;
export type Consulta = z.infer<typeof consulta>;

export interface Hecho {
  readonly id: string;
  readonly nombre: string;
  readonly termino: Termino;
  readonly valor: Valor;
  /** Los supuestos (SA) sin los que este hecho no se puede citar. */
  readonly exige: readonly string[];
}

export type LecturaDePlan = { ok: true; plan: Plan } | { ok: false; motivo: 'sql_libre' | 'plan_invalido'; detalle: string };

function traeSql(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(traeSql);
  if (typeof v !== 'object' || v === null) return false;
  return Object.entries(v).some(([k, x]) => /^(sql|query|consulta_sql|raw)$/i.test(k) || traeSql(x));
}

export function leePlan(crudo: unknown): LecturaDePlan {
  if (traeSql(crudo)) return { ok: false, motivo: 'sql_libre', detalle: 'el plan trae SQL: solo se aceptan consultas del vocabulario cerrado' };
  const r = esquemaPlan.safeParse(crudo);
  if (!r.success) return { ok: false, motivo: 'plan_invalido', detalle: r.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  return { ok: true, plan: r.data };
}

const CLASES_DEL_PUENTE: readonly Clase[] = ['T', 'N', 'K_exp', 'K_con', 'K_flat', 'L', 'Z', 'A'];

/** Una consulta → los términos que la responden. */
export function terminosDe(c: Consulta): Termino[] {
  switch (c.tipo) {
    case 'puente': {
      const base = { metrica: c.metrica, desde: c.desde, hasta: c.hasta, ...(c.segmento ? { segmento: c.segmento } : {}) };
      return CLASES_DEL_PUENTE.flatMap((clase): Termino[] => [
        { m: 'dR', clase, ...base }, { m: 'n', clase, ...base },
        { m: 'R', clase, ...base, en: 'desde' }, { m: 'R', clase, ...base, en: 'hasta' },
      ]);
    }
    case 'nft': {
      const factores = c.alcance === 'identificados' ? (['N', 'F', 'T'] as const) : (['Tx', 'T'] as const);
      const clase: Clase = c.alcance === 'identificados' ? 'U' : 'T';
      return [...factores.map((factor): Termino => ({ m: 'nft', factor, metrica: c.metrica, desde: c.desde, hasta: c.hasta, alcance: c.alcance })),
        { m: 'dR', metrica: c.metrica, clase, desde: c.desde, hasta: c.hasta }];
    }
    case 'prueba': return [{ m: 'prueba', diseno: c.diseno, variable: c.variable, desde: c.desde, hasta: c.hasta, ...(c.segmento ? { segmento: c.segmento } : {}) }];
    case 'top': return [{ m: 'top', clase: c.clase, metrica: c.metrica, desde: c.desde, hasta: c.hasta, k: c.k }];
    case 'ticket': {
      const b = { clase: c.clase, metrica: c.metrica, desde: c.desde, hasta: c.hasta };
      return [{ m: 'ticket', ...b, en: 'desde' }, { m: 'ticket', ...b, en: 'hasta' }, { m: 'tx', ...b, en: 'desde' }, { m: 'tx', ...b, en: 'hasta' }];
    }
    case 'terminos': return c.terminos;
  }
}

/** Calcula un término y lo sella como hecho de este Γ y esta spec. */
export function hechoDe(g: Gamma, e: Especificacion, termino: Termino): Hecho {
  const valor = valorDe(g, e, termino);
  const exige = [...new Set(clavesQueExige(termino).flatMap((k) => supuestosExigidos(e, k)))].sort();
  const id = huellaDe('hecho', { gamma: g.hash, spec: huellaDeEspecificacion(e), termino, valor } as unknown as Canonizable);
  return { id, nombre: nombreDe(termino), termino, valor, exige };
}

const cachePlanes = new Map<string, readonly Hecho[]>();

export function huellaDePlan(g: Gamma, e: Especificacion, plan: Plan): string {
  return huellaDe('plan', { gamma: g.hash, spec: huellaDeEspecificacion(e), plan } as unknown as Canonizable);
}

/** Ejecuta un plan ya validado. Mismo Γ + misma spec + mismo plan ⇒ los mismos hechos (y de la caché). */
export function ejecutaPlan(g: Gamma, e: Especificacion, plan: Plan): { huella: string; hechos: readonly Hecho[]; deCache: boolean } {
  const huella = huellaDePlan(g, e, plan);
  const previo = cachePlanes.get(huella);
  if (previo) return { huella, hechos: previo, deCache: true };
  const vistos = new Map<string, Hecho>();
  for (const c of plan.consultas) for (const termino of terminosDe(c)) {
    const h = hechoDe(g, e, termino);
    if (!vistos.has(h.nombre)) vistos.set(h.nombre, h);
  }
  const hechos = [...vistos.values()];
  if (cachePlanes.size > 500) cachePlanes.clear();
  cachePlanes.set(huella, hechos);
  return { huella, hechos, deCache: false };
}
