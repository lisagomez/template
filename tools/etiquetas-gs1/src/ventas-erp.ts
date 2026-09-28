/**
 * Ventas del ERP para el agente de riesgo: la `FuenteVentas` que lee pedidos del ERP en vez de
 * las ficticias de la semilla.
 *
 * - SOLO LECTURA: un `select` bajo la RLS del tenant (`app.cliente_id`) con un rol que no escribe
 *   (`rol_swm`, el que hereda `erp_lector`). La conexion se INYECTA (`ConsultaSql`): el nucleo no
 *   trae cliente de Postgres. Se prueba en el Postgres efimero con el esquema real del ERP y ventas
 *   de prueba (`migraciones/prueba-ventas-erp.mjs`); leer produccion es otra decision (C4).
 * - Venta = partidas de pedidos `confirmado` o `facturado` en la ventana; borrador y cancelado no.
 * - El ERP no tiene sucursal: el tenant corresponde a UN sitio, que se declara. A los demas sitios
 *   la fuente no les sabe venta (`undefined`, y el agente no los evalua).
 * - El ERP cuenta en su unidad (`clave_unidad` del SAT): en caja (`XBX`) ya son cajas; en pieza u
 *   otra, se divide entre las unidades por caja del catalogo del laboratorio.
 * - Un articulo que el ERP conoce y no vendio es venta CERO (se sabe); uno que el ERP no tiene es
 *   `undefined` (no se sabe). No son lo mismo.
 */
import { sumaDias } from './fechas.js'
import { identificaGtin } from './codigos-anteriores.js'
import type { Articulo, EstadoAlmacen } from './modelo.js'
import type { FuenteVentas } from './riesgo.js'

/** Estados de pedido que cuentan como venta. */
export const ESTADOS_VENTA: readonly string[] = ['confirmado', 'facturado']

/** $1 desde (incluido), $2 hasta (excluido), $3 estados que cuentan como venta. */
export const SQL_VENTAS_ERP = `select a.sku, a.clave_unidad, coalesce(sum(p.cantidad) filter (where o.id is not null), 0)::text as cantidad
from erp.inv_articulo a
left join erp.ped_partida p on p.inv_articulo_id = a.id and p.cliente_id = a.cliente_id
left join erp.ped_pedido o on o.id = p.ped_pedido_id and o.cliente_id = p.cliente_id
  and o.estado = any($3::text[]) and o.fecha >= $1::date and o.fecha < $2::date
where a.activo
group by a.sku, a.clave_unidad
order by a.sku`

export type ConsultaSql = (sql: string, parametros: readonly unknown[]) => Promise<readonly unknown[]>

export interface OpcionesVentasErp {
  /** Sitio del laboratorio al que corresponde el tenant del ERP. */
  readonly sitio: string
  /** AAAA-MM-DD: la ventana termina el dia anterior (dias completos). */
  readonly hoy: string
  /** Dias de la ventana (por defecto 28). */
  readonly dias?: number
  readonly articulos: Readonly<Record<string, Articulo>>
  /** El libro de asignaciones: con el, las ventas de un codigo ANTERIOR tambien son del articulo. */
  readonly asignaciones?: EstadoAlmacen['asignaciones']
}

export interface FilaVentaErp {
  readonly sku: string
  readonly claveUnidad: string | null
  readonly cantidad: number
}

/** Claves SAT de unidad que ya son cajas. */
export const UNIDADES_CAJA: ReadonlySet<string> = new Set(['XBX'])

export const DIAS_VENTANA = 28

/** Lo que regresa la base NO se confia: fila por fila, o entra bien formada o se descarta. */
export function leeFilasVentas(filas: readonly unknown[]): { filas: FilaVentaErp[]; descartadas: number } {
  const buenas: FilaVentaErp[] = []
  let descartadas = 0
  for (const f of filas) {
    const o = typeof f === 'object' && f !== null && !Array.isArray(f) ? (f as Readonly<Record<string, unknown>>) : undefined
    const cantidad = o ? Number(o['cantidad']) : Number.NaN
    const unidad = o?.['clave_unidad']
    if (!o || typeof o['sku'] !== 'string' || !o['sku'] || !Number.isFinite(cantidad) || cantidad < 0 || (unidad !== null && unidad !== undefined && typeof unidad !== 'string')) { descartadas++; continue }
    buenas.push({ sku: o['sku'], claveUnidad: typeof unidad === 'string' ? unidad : null, cantidad })
  }
  return { filas: buenas, descartadas }
}

export function ventanaDe(hoy: string, dias = DIAS_VENTANA): { desde: string; hasta: string } {
  return { desde: sumaDias(hoy, -dias), hasta: hoy }
}

/** La fuente a partir de las filas ya leidas. */
export function ventasDesdeFilas(filas: readonly FilaVentaErp[], o: OpcionesVentasErp): FuenteVentas {
  const dias = o.dias ?? DIAS_VENTANA
  const porSku = new Map(filas.map((f) => [f.sku, f]))
  return {
    nombre: `erp:${o.sitio}`,
    promedioDiario(sitio, gtin) {
      if (sitio !== o.sitio) return undefined
      const art = identificaGtin({ articulos: o.articulos, asignaciones: o.asignaciones ?? [] }, gtin)?.articulo
      const f = art ? porSku.get(art.sku) : undefined
      if (!art || !f) return undefined
      const cajas = f.claveUnidad && UNIDADES_CAJA.has(f.claveUnidad) ? f.cantidad : f.cantidad / Math.max(1, art.unidadesPorCaja)
      return Math.round((cajas / dias) * 1000) / 1000
    },
  }
}

/** Lee el ERP con la consulta inyectada y arma la fuente. */
export async function cargaVentasErp(consulta: ConsultaSql, o: OpcionesVentasErp): Promise<{ fuente: FuenteVentas; filas: FilaVentaErp[]; descartadas: number; ventana: { desde: string; hasta: string } }> {
  const ventana = ventanaDe(o.hoy, o.dias ?? DIAS_VENTANA)
  const crudas = await consulta(SQL_VENTAS_ERP, [ventana.desde, ventana.hasta, [...ESTADOS_VENTA]])
  const { filas, descartadas } = leeFilasVentas(crudas)
  return { fuente: ventasDesdeFilas(filas, o), filas, descartadas, ventana }
}
