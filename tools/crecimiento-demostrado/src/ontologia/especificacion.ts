/**
 * La ESPECIFICACIÓN versionada de una pyme: qué es un cliente, qué es ingreso, qué se considera
 * «estable», cuánto es material, cuánto n hace falta para inferir, y los supuestos explícitos (SA).
 * Es la mitad de Γ que no son datos. Cambia poco, se versiona, y su hash viaja en cada
 * certificado: la misma pregunta con otra spec es otra prueba.
 */
import { z } from 'zod';
import { huellaDe, type Canonizable } from '../comun/canonico.js';
import { esPeriodo } from '../comun/periodos.js';

export const METRICAS = ['facturado', 'neto', 'cobrado'] as const;
export type Metrica = (typeof METRICAS)[number];

const supuesto = z.object({
  id: z.string().regex(/^SA-\d{2}$/),
  texto: z.string().min(10),
  /** Qué métricas o reglas no se pueden usar sin declararlo. */
  exigidoPor: z.array(z.string()).default([]),
});

export const esquemaEspecificacion = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  pyme: z.object({ id: z.string().regex(/^[a-z0-9-]+$/), nombre: z.string(), giro: z.string(), modelo: z.enum(['b2b', 'b2c']) }),
  moneda: z.literal('MXN'),
  granularidad: z.enum(['trimestre', 'mes']),
  horizonte: z.object({ desde: z.string().refine(esPeriodo), hasta: z.string().refine(esPeriodo) }),
  cliente: z.object({
    identidad: z.literal('rfc-seudonimizado'),
    /** RFC genéricos: nunca son un cliente, son la clase anónima de la partición. */
    anonimos: z.array(z.string()).min(1),
  }),
  ingreso: z.object({ principal: z.enum(METRICAS) }),
  /** Fuente transaccional: en B2B el CFDI es la venta; en B2C lo es el ticket de caja. */
  transaccional: z.enum(['cfdi', 'caja']),
  /** «Estable» = |Δ| ≤ banda × R_{t−1}, en milésimas. 0 = exactamente igual (ΔR(K_flat) = 0). */
  estable: z.object({ bandaPorMil: z.number().int().min(0).max(500) }),
  segmentos: z.object({ nombre: z.string(), resto: z.string() }),
  /** Denominador mínimo (en centavos) para que una proporción sea un número y no ruido. */
  materialidadCentavos: z.number().int().positive(),
  inferencia: z.object({
    nMinimo: z.number().int().min(2),
    alfaPorMil: z.number().int().min(1).max(200),
    iteraciones: z.number().int().min(200).max(20000),
    semilla: z.number().int().nonnegative(),
  }),
  supuestos: z.array(supuesto).min(1),
});

export type Especificacion = z.infer<typeof esquemaEspecificacion>;
export type Supuesto = z.infer<typeof supuesto>;

export const huellaDeEspecificacion = (e: Especificacion): string => huellaDe('spec', e as unknown as Canonizable);

/** Los supuestos que exige una métrica o una regla, según la spec. */
export function supuestosExigidos(e: Especificacion, clave: string): string[] {
  return e.supuestos.filter((s) => s.exigidoPor.includes(clave)).map((s) => s.id);
}

export function leeEspecificacion(crudo: unknown): { ok: true; especificacion: Especificacion } | { ok: false; errores: string[] } {
  const r = esquemaEspecificacion.safeParse(crudo);
  if (!r.success) return { ok: false, errores: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  const ids = r.data.supuestos.map((s) => s.id);
  if (new Set(ids).size !== ids.length) return { ok: false, errores: ['supuestos: hay un id repetido'] };
  return { ok: true, especificacion: r.data };
}
