/**
 * Tablero de caducidades por sitio y orden FEFO (First Expired, First Out) para surtir.
 *
 * - Vencidos: se listan aparte y NUNCA entran al orden de surtido (lo que EWM hace mal si nadie
 *   lo filtra).
 * - Retiro: dentro de los dias de retiro de su categoria; tampoco se surten, se ven aparte.
 * - «Esta semana» = vence en los proximos 7 dias; «este mes» = en los proximos 30 (despues de
 *   la semana). Se dice asi en pantalla para que nadie lo lea como mes calendario.
 * - FEFO: por articulo, los lotes surtibles del que vence antes al que vence despues.
 */
import { diasHasta, esFecha, parseaFechaGs1, aAammdd } from './fechas.js'
import type { Articulo, EstadoAlmacen, Existencia } from './modelo.js'
import { categoriaPorId, estadoSemaforo, type EstadoSemaforo } from './semaforo.js'

export interface FilaTablero {
  readonly existencia: Existencia
  readonly descripcion: string
  readonly dias: number
  readonly estado: EstadoSemaforo
}

export interface LoteFefo extends FilaTablero {
  readonly orden: number
}

export interface GrupoFefo {
  readonly sku: string
  readonly descripcion: string
  readonly lotes: readonly LoteFefo[]
}

export interface TableroSitio {
  readonly sitio: string
  readonly vencidos: readonly FilaTablero[]
  readonly retiro: readonly FilaTablero[]
  readonly semana: readonly FilaTablero[]
  readonly mes: readonly FilaTablero[]
  readonly fefo: readonly GrupoFefo[]
  readonly totales: Readonly<Record<EstadoSemaforo, number>>
}

export function diasParaCaducar(caducidadIso: string, hoy: string): number {
  const f = parseaFechaGs1(aAammdd(caducidadIso), Number(hoy.slice(0, 4)))
  return esFecha(f) ? diasHasta(f, hoy) : Number.NaN
}

export function tableroSitio(estado: EstadoAlmacen, sitio: string, hoy: string): TableroSitio {
  const cats = estado.configuracion.categorias
  const filas: FilaTablero[] = estado.existencias
    .filter((e) => e.sitio === sitio && e.cantidad > 0)
    .map((e) => {
      const art: Articulo | undefined = estado.articulos[e.sku]
      const dias = diasParaCaducar(e.caducidad, hoy)
      return { existencia: e, descripcion: art?.descripcion ?? e.sku, dias, estado: estadoSemaforo(dias, categoriaPorId(cats, art?.categoria)) }
    })
    .sort((a, b) => a.dias - b.dias || a.descripcion.localeCompare(b.descripcion))
  const totales: Record<EstadoSemaforo, number> = { vigente: 0, alerta: 0, retiro: 0, vencido: 0 }
  for (const f of filas) totales[f.estado]++
  const surtibles = filas.filter((f) => f.estado === 'vigente' || f.estado === 'alerta')
  const grupos = new Map<string, FilaTablero[]>()
  for (const f of surtibles) grupos.set(f.existencia.sku, [...(grupos.get(f.existencia.sku) ?? []), f])
  const fefo: GrupoFefo[] = [...grupos.entries()]
    .map(([sku, lotes]) => ({ sku, descripcion: lotes[0]!.descripcion, lotes: lotes.map((l, i) => ({ ...l, orden: i + 1 })) }))
    .sort((a, b) => (a.lotes[0]?.dias ?? 0) - (b.lotes[0]?.dias ?? 0))
  return {
    sitio,
    vencidos: filas.filter((f) => f.estado === 'vencido'),
    retiro: filas.filter((f) => f.estado === 'retiro'),
    semana: filas.filter((f) => f.dias >= 0 && f.dias <= 7),
    mes: filas.filter((f) => f.dias > 7 && f.dias <= 30),
    fefo,
    totales,
  }
}
