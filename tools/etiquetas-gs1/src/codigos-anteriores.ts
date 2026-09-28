/**
 * Los GTIN ANTERIORES de un articulo se siguen leyendo. Cuando un articulo cambia de codigo (una
 * reimportacion del catalogo, el fabricante que asigna uno nuevo, un interno que pasa a GTIN), las
 * cajas que ya estan en el almacen conservan su etiqueta vieja: si el codigo viejo dejara de
 * leerse, ese inventario se volveria invisible para escanear, contar y surtir.
 *
 * La fuente es el LIBRO DE ASIGNACIONES (solo-agregar), que ya guarda el `anterior` de cada
 * sustitucion: no hay un segundo registro que se pueda desincronizar, y vale tambien para los
 * cambios hechos antes de que existiera esta lectura.
 *
 * Reglas:
 * - el codigo VIGENTE de un articulo gana siempre (si otro articulo hoy tiene ese GTIN, es de el);
 * - un codigo anterior de un articulo no se asigna a OTRO articulo sin decision humana: sus
 *   etiquetas viejas quedarian leyendose como el primero (GS1 pide no reusar un GTIN retirado).
 */
import type { Articulo, Asignacion, EstadoAlmacen, Nivel } from './modelo.js'

export interface CodigoAnterior {
  readonly gtin: string
  readonly sku: string
  readonly nivel: Nivel
  /** Cuando lo sustituyo el codigo vigente (ISO con hora, de la asignacion). */
  readonly hasta: string
  /** El codigo que lo sustituyo. */
  readonly sustituidoPor: string
}

export interface CodigoIdentificado {
  readonly articulo: Articulo
  readonly nivel: Nivel
  /** Presente si el GTIN leido es uno ANTERIOR del articulo, no el vigente. */
  readonly anterior?: CodigoAnterior
}

type Catalogo = Pick<EstadoAlmacen, 'articulos' | 'asignaciones'>

const vigentes = (c: Catalogo): Set<string> => new Set(Object.values(c.articulos).flatMap((a) => [a.gtinUnidad, a.gtinCaja]).filter((g): g is string => Boolean(g)))

/** Todos los codigos anteriores del catalogo (sin los que hoy son vigentes de alguien). */
export function codigosAnteriores(c: Catalogo): CodigoAnterior[] {
  const hoy = vigentes(c)
  const m = new Map<string, CodigoAnterior>()
  for (const a of c.asignaciones) {
    if (a.anterior && a.anterior !== a.gtin && !hoy.has(a.anterior)) m.set(a.anterior, { gtin: a.anterior, sku: a.sku, nivel: a.nivel, hasta: a.fecha, sustituidoPor: a.gtin })
  }
  return [...m.values()].sort((x, y) => x.sku.localeCompare(y.sku) || x.hasta.localeCompare(y.hasta))
}

/** Los codigos anteriores de UN articulo, del mas viejo al mas reciente. */
export const anterioresDe = (c: Catalogo, sku: string): CodigoAnterior[] => codigosAnteriores(c).filter((x) => x.sku === sku)

// El indice se arma una vez por libro de asignaciones y catalogo (el estado es inmutable).
const cache = new WeakMap<readonly Asignacion[], { articulos: Readonly<Record<string, Articulo>>; indice: Map<string, CodigoAnterior> }>()

function indice(c: Catalogo): Map<string, CodigoAnterior> {
  const previo = cache.get(c.asignaciones)
  if (previo && previo.articulos === c.articulos) return previo.indice
  const i = new Map(codigosAnteriores(c).map((x) => [x.gtin, x]))
  cache.set(c.asignaciones, { articulos: c.articulos, indice: i })
  return i
}

/** Que articulo es un GTIN: el que lo tiene hoy, o aquel del que fue codigo anterior. */
export function identificaGtin(c: Catalogo, gtin: string): CodigoIdentificado | undefined {
  const hoy = Object.values(c.articulos).find((a) => a.gtinCaja === gtin || a.gtinUnidad === gtin)
  if (hoy) return { articulo: hoy, nivel: hoy.gtinCaja === gtin ? 'caja' : 'unidad' }
  const x = indice(c).get(gtin)
  const articulo = x ? c.articulos[x.sku] : undefined
  return x && articulo ? { articulo, nivel: x.nivel, anterior: x } : undefined
}

/** Si el GTIN fue codigo de OTRO articulo (no se asigna a este sin decision humana). */
export function anteriorDeOtro(c: Catalogo, gtin: string, sku: string): CodigoAnterior | undefined {
  const x = indice(c).get(gtin)
  return x && x.sku !== sku ? x : undefined
}
