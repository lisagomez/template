/**
 * Catalogo del almacen desde Excel o CSV: validar lo que ya trae codigo, asignar con la regla
 * MIXTA lo que no, y hacerlo idempotente — resubir el mismo archivo no duplica nada.
 *
 * Regla mixta (decidida por el laboratorio), aplicada por NIVEL (pieza y caja):
 *   1. si trae el GTIN del fabricante, se conserva;
 *   2. si es marca propia, se numera con el prefijo de empresa de la instalacion;
 *   3. si no hay ni lo uno ni lo otro, codigo interno de circulacion restringida.
 * La caja lleva su propio GTIN-14: el de la pieza NO sirve para la caja (escanear la caja
 * contaria una pieza). Solo el dueño de la marca puede derivarlo; de un fabricante sin GTIN de
 * caja no se inventa nada: la caja recibe un codigo interno y una nota para pedirselo.
 */
import { digitoCorrecto, corrigeDigito, normalizaGtin } from './digito.js'
import type { Articulo, EstadoAlmacen, Nivel, Regla } from './modelo.js'
import { clasificaPrefijo, perteneceAPrefijo } from './prefijos.js'

/** Las columnas de la plantilla, en orden, con su explicacion. */
export const COLUMNAS_PLANTILLA: readonly { readonly clave: string; readonly obligatoria: boolean; readonly ayuda: string }[] = [
  { clave: 'sku', obligatoria: true, ayuda: 'Clave interna del artículo. Única.' },
  { clave: 'descripcion', obligatoria: true, ayuda: 'Nombre como se imprime en la etiqueta.' },
  { clave: 'categoria', obligatoria: false, ayuda: 'Para el semáforo: lacteos, panaderia, congelados, bebidas, abarrotes o general.' },
  { clave: 'sitios', obligatoria: true, ayuda: 'Claves de sitio separadas por ; (ej. CEDIS-NTE;SUC-CENTRO).' },
  { clave: 'marca_propia', obligatoria: false, ayuda: 'SI si la marca es de la casa; si no, NO.' },
  { clave: 'gtin', obligatoria: false, ayuda: 'GTIN de la pieza si ya lo tiene (8, 12, 13 o 14 cifras). Formatea la columna como TEXTO.' },
  { clave: 'gtin_caja', obligatoria: false, ayuda: 'GTIN-14 de la caja si el fabricante lo da.' },
  { clave: 'unidades_por_caja', obligatoria: false, ayuda: 'Piezas en cada caja (1 si la caja es la unidad de venta).' },
  { clave: 'cajas_por_tarima', obligatoria: false, ayuda: 'Cajas en una tarima completa: va en (37).' },
  { clave: 'vida_util_dias', obligatoria: false, ayuda: 'Vida útil desde la producción, para proponer la caducidad.' },
]

const SINONIMOS: Readonly<Record<string, string>> = {
  sku: 'sku', clave: 'sku', codigo_interno: 'sku', articulo: 'sku',
  descripcion: 'descripcion', producto: 'descripcion', nombre: 'descripcion',
  categoria: 'categoria', familia: 'categoria',
  sitios: 'sitios', sitio: 'sitios', almacenes: 'sitios',
  marca_propia: 'marca_propia', propia: 'marca_propia',
  gtin: 'gtin', gtin_unidad: 'gtin', gtin_pieza: 'gtin', ean: 'gtin', ean13: 'gtin', codigo_barras: 'gtin', upc: 'gtin',
  gtin_caja: 'gtin_caja', dun14: 'gtin_caja', gtin14: 'gtin_caja',
  unidades_por_caja: 'unidades_por_caja', piezas_por_caja: 'unidades_por_caja',
  cajas_por_tarima: 'cajas_por_tarima', vida_util_dias: 'vida_util_dias', vida_util: 'vida_util_dias',
}

const normalizaCabecera = (c: string): string =>
  c.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

export interface FilaCatalogo {
  readonly fila: number
  readonly sku: string
  readonly descripcion: string
  readonly categoria: string
  readonly sitios: readonly string[]
  readonly marcaPropia: boolean
  readonly gtin: string
  readonly gtinCaja: string
  readonly unidadesPorCaja: number
  readonly cajasPorTarima?: number
  readonly vidaUtilDias?: number
}

export interface ErrorFila {
  readonly fila: number
  readonly mensaje: string
}

const SI = /^(si|sí|s|x|1|true|verdadero|yes|y)$/i
const entero = (v: string): number | undefined => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : undefined)

/** Registros (cabecera → valor) a filas tipadas. La fila 1 es la cabecera, asi que datos desde la 2. */
export function leeFilas(registros: readonly Record<string, string>[], categorias: readonly string[]): { filas: FilaCatalogo[]; errores: ErrorFila[] } {
  const filas: FilaCatalogo[] = []
  const errores: ErrorFila[] = []
  registros.forEach((r, i) => {
    const fila = i + 2
    const x: Record<string, string> = {}
    for (const [k, v] of Object.entries(r)) {
      const clave = SINONIMOS[normalizaCabecera(k)]
      if (clave) x[clave] = String(v ?? '').trim()
    }
    const sku = x['sku'] ?? ''
    const descripcion = x['descripcion'] ?? ''
    const sitios = (x['sitios'] ?? '').split(/[;,|]/).map((s) => s.trim().toUpperCase()).filter(Boolean)
    if (!sku) return errores.push({ fila, mensaje: 'falta el sku' })
    if (!descripcion) return errores.push({ fila, mensaje: `${sku}: falta la descripción` })
    if (sitios.length === 0) return errores.push({ fila, mensaje: `${sku}: falta al menos un sitio` })
    const cat = normalizaCabecera(x['categoria'] ?? '') || 'general'
    const unidades = x['unidades_por_caja'] ? entero(x['unidades_por_caja']) : 1
    if (unidades === undefined || unidades < 1) return errores.push({ fila, mensaje: `${sku}: unidades_por_caja debe ser un entero de 1 en adelante` })
    const cajas = x['cajas_por_tarima'] ? entero(x['cajas_por_tarima']) : undefined
    const vida = x['vida_util_dias'] ? entero(x['vida_util_dias']) : undefined
    filas.push({
      fila, sku, descripcion, categoria: categorias.includes(cat) ? cat : 'general', sitios,
      marcaPropia: SI.test(x['marca_propia'] ?? ''), gtin: x['gtin'] ?? '', gtinCaja: x['gtin_caja'] ?? '', unidadesPorCaja: unidades,
      ...(cajas ? { cajasPorTarima: cajas } : {}), ...(vida ? { vidaUtilDias: vida } : {}),
    })
  })
  return { filas, errores }
}

export type ValidacionCodigo =
  | { readonly estado: 'vacio' }
  | { readonly estado: 'valido'; readonly gtin: string }
  | { readonly estado: 'invalido'; readonly motivo: string; readonly sugerencia?: string }

/** ¿El codigo que trae el archivo es un GTIN bien formado? */
export function validaCodigo(texto: string): ValidacionCodigo {
  const t = texto.trim()
  if (!t) return { estado: 'vacio' }
  if (/e\+?\d+$/i.test(t) || /^\d+[.,]\d+e/i.test(t)) return { estado: 'invalido', motivo: 'Excel lo convirtió a notación científica y se perdieron cifras. Formatea la columna como texto y vuelve a exportar.' }
  if (/[^\d\s-]/.test(t)) return { estado: 'invalido', motivo: 'lleva caracteres que no son cifras' }
  const g = normalizaGtin(t)
  if (!g) return { estado: 'invalido', motivo: `mide ${t.replace(/\D/g, '').length} cifras; un GTIN mide 8, 12, 13 o 14` }
  if (!digitoCorrecto(g)) return { estado: 'invalido', motivo: `el último dígito no cuadra (debería ser ${corrigeDigito(g).at(-1)})`, sugerencia: corrigeDigito(g) }
  return { estado: 'valido', gtin: g }
}

export type EstadoFila = 'nuevo' | 'cambiado' | 'sin-cambio' | 'conflicto' | 'invalido'

export interface AsignacionPropuesta {
  readonly nivel: Nivel
  readonly gtin: string
  readonly regla: Regla
  /** true: el numero lo genero la casa ahora; false: se registra uno que ya existia. */
  readonly emitido: boolean
  readonly anterior?: string
}

export interface FilaPlan {
  readonly fila: number
  readonly sku: string
  readonly estado: EstadoFila
  readonly motivos: readonly string[]
  readonly cambios: readonly string[]
  readonly articulo?: Articulo
  readonly nuevas: readonly AsignacionPropuesta[]
}

export interface PlanImportacion {
  readonly filas: readonly FilaPlan[]
  readonly errores: readonly ErrorFila[]
  readonly resumen: Readonly<Record<string, number>>
  /** Contadores tras aplicar el plan. */
  readonly contadores: EstadoAlmacen['contadores']
}

export function reglaDeExistente(gtin: string, gcp: string, prefijoInterno: string): Regla {
  if (perteneceAPrefijo(gtin, gcp)) return 'propio-existente'
  if (gtin.slice(1).startsWith(prefijoInterno) && clasificaPrefijo(gtin).clase.startsWith('restringido')) return 'interno-existente'
  return 'fabricante'
}

export function diferencias(a: Articulo, b: Articulo): string[] {
  const c: string[] = []
  if (a.descripcion !== b.descripcion) c.push(`descripción: «${a.descripcion}» → «${b.descripcion}»`)
  if (a.categoria !== b.categoria) c.push(`categoría: ${a.categoria} → ${b.categoria}`)
  if (a.sitios.join(';') !== b.sitios.join(';')) c.push(`sitios: ${a.sitios.join(';')} → ${b.sitios.join(';')}`)
  if (a.marcaPropia !== b.marcaPropia) c.push(`marca propia: ${a.marcaPropia ? 'SI' : 'NO'} → ${b.marcaPropia ? 'SI' : 'NO'}`)
  if (a.gtinUnidad !== b.gtinUnidad) c.push(`GTIN pieza: ${a.gtinUnidad ?? '—'} → ${b.gtinUnidad ?? '—'}`)
  if (a.gtinCaja !== b.gtinCaja) c.push(`GTIN caja: ${a.gtinCaja ?? '—'} → ${b.gtinCaja ?? '—'}`)
  if (a.unidadesPorCaja !== b.unidadesPorCaja) c.push(`unidades por caja: ${a.unidadesPorCaja} → ${b.unidadesPorCaja}`)
  if (a.cajasPorTarima !== b.cajasPorTarima) c.push(`cajas por tarima: ${a.cajasPorTarima ?? '—'} → ${b.cajasPorTarima ?? '—'}`)
  if (a.vidaUtilDias !== b.vidaUtilDias) c.push(`vida útil: ${a.vidaUtilDias ?? '—'} → ${b.vidaUtilDias ?? '—'}`)
  return c
}
