/**
 * El vocabulario CERRADO de lo que se puede medir: un término es un objeto tipado (no un texto
 * libre ni SQL) y su valor lo calcula el motor sobre Γ. Las clases se definen respecto de una
 * TRANSICIÓN `desde → hasta`:
 *
 *   C_t   = clientes identificados que compraron en t
 *   U     = clientes identificados con cualquier actividad (compra, nota o pago) en desde o hasta
 *   N     = C_hasta \ C_desde          L = C_desde \ C_hasta
 *   K     = C_hasta ∩ C_desde  →  K_exp (ΔR > banda) · K_con (ΔR < −banda) · K_flat (|ΔR| ≤ banda)
 *   Z     = U \ (C_desde ∪ C_hasta)    («solo ajustes»: notas o pagos sin compra en ninguno)
 *   A     = la clase anónima (público en general)          T = U ∪ {A}
 *
 * {N, K_exp, K_con, K_flat, L, Z, A} parte T. Que Z exista es un hallazgo: un cliente perdido
 * que recibe una nota de crédito tiene R_hasta ≠ 0, y la forma clásica del bridge deja de cerrar.
 */
import { z } from 'zod';
import { esPeriodo, etiqueta } from '../comun/periodos.js';
import { METRICAS } from '../ontologia/especificacion.js';

export const CLASES = ['T', 'U', 'A', 'N', 'L', 'K', 'K_exp', 'K_con', 'K_flat', 'Z'] as const;
export type Clase = (typeof CLASES)[number];

const periodo = z.string().refine(esPeriodo, 'periodo inválido');
const metrica = z.enum(METRICAS);
const clase = z.enum(CLASES);
const transicion = { desde: periodo, hasta: periodo };
const filtros = { segmento: z.string().optional(), cliente: z.string().regex(/^cli_[0-9a-f]{16}$/).optional() };

export const esquemaTermino = z.discriminatedUnion('m', [
  /** Ingreso de una clase en uno de los dos periodos de la transición. */
  z.object({ m: z.literal('R'), metrica, clase, ...transicion, en: z.enum(['desde', 'hasta']), ...filtros }).strict(),
  /** ΔR de una clase: R(hasta) − R(desde). */
  z.object({ m: z.literal('dR'), metrica, clase, ...transicion, ...filtros }).strict(),
  /** Cuántos miembros tiene la clase (A cuenta como uno). */
  z.object({ m: z.literal('n'), metrica, clase, ...transicion, segmento: z.string().optional() }).strict(),
  /** Cuántas transacciones hizo la clase en uno de los dos periodos. */
  z.object({ m: z.literal('tx'), metrica, clase, ...transicion, en: z.enum(['desde', 'hasta']), segmento: z.string().optional() }).strict(),
  /** Ticket promedio = R / tx: una FRACCIÓN exacta, no un flotante. */
  z.object({ m: z.literal('ticket'), metrica, clase, ...transicion, en: z.enum(['desde', 'hasta']), segmento: z.string().optional() }).strict(),
  /** Contribución LMDI (centavos) de un factor a ΔR: clientes, frecuencia o ticket (identificados), o transacciones y ticket (todos). */
  z.object({ m: z.literal('nft'), factor: z.enum(['N', 'F', 'T', 'Tx']), metrica, ...transicion, alcance: z.enum(['identificados', 'todos']) }).strict(),
  /** Prueba de permutación con semilla: pareada por cliente, o de dos muestras por transacción. */
  z.object({ m: z.literal('prueba'), diseno: z.enum(['pareada', 'dos_muestras']), variable: z.enum(['frecuencia', 'neto', 'ticket']), ...transicion, segmento: z.string().optional() }).strict(),
  /** Los k miembros de una clase con mayor |ΔR|, con su ΔR. */
  z.object({ m: z.literal('top'), metrica, clase, ...transicion, k: z.number().int().min(1).max(20) }).strict(),
]);

export type Termino = z.infer<typeof esquemaTermino>;

const flecha = (t: { desde: string; hasta: string }) => `${etiqueta(t.desde)}→${etiqueta(t.hasta)}`;
const sufijo = (t: { segmento?: string; cliente?: string }) => `${t.segmento ? ` seg=${t.segmento}` : ''}${t.cliente ? ` ${t.cliente}` : ''}`;

/** Nombre canónico y legible de un término: lo que se cita en una derivación y se muestra al dueño. */
export function nombreDe(t: Termino): string {
  switch (t.m) {
    case 'R': return `R[${t.metrica}](${t.clase}${sufijo(t)}; ${etiqueta(t.en === 'desde' ? t.desde : t.hasta)} de ${flecha(t)})`;
    case 'dR': return `ΔR[${t.metrica}](${t.clase}${sufijo(t)}; ${flecha(t)})`;
    case 'n': return `|${t.clase}|[${t.metrica}](${flecha(t)}${sufijo(t)})`;
    case 'tx': return `tx[${t.metrica}](${t.clase}${sufijo(t)}; ${etiqueta(t.en === 'desde' ? t.desde : t.hasta)} de ${flecha(t)})`;
    case 'ticket': return `ticket[${t.metrica}](${t.clase}${sufijo(t)}; ${etiqueta(t.en === 'desde' ? t.desde : t.hasta)} de ${flecha(t)})`;
    case 'nft': return `LMDI[${t.metrica}](${t.factor}, ${t.alcance}; ${flecha(t)})`;
    case 'prueba': return `prueba(${t.diseno}, ${t.variable}${sufijo(t)}; ${flecha(t)})`;
    case 'top': return `top${t.k}[${t.metrica}](${t.clase}; ${flecha(t)})`;
  }
}

/** Las claves de supuestos que un término exige (se cruzan con `exigidoPor` de la spec). */
export function clavesQueExige(t: Termino): string[] {
  const claves = new Set<string>(['ingreso']);
  if ('metrica' in t) claves.add(t.metrica);
  if (t.m === 'prueba') {
    claves.add('prueba');
    if (t.desde.slice(4) !== t.hasta.slice(4)) claves.add('prueba-no-anual');
  }
  if ('segmento' in t && t.segmento) claves.add('segmento');
  if ('clase' in t && (t.clase === 'A' || t.clase === 'T')) claves.add('anonimo');
  return [...claves];
}
