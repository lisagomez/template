/**
 * Tablero de caducidades por sitio y orden FEFO (First Expired, First Out) para surtir.
 *
 * - Vencidos: se listan aparte y NUNCA entran al orden de surtido (lo que EWM hace mal si nadie
 *   lo filtra).
 * - Retiro (rojo): dentro de los dias de retiro de su categoria: bloqueados para venta normal, se
 *   ven aparte. Los naranjas (promocion) SI se surten: salen primero, con su exhibicion.
 * - «Esta semana» = vence en los proximos 7 dias; «este mes» = en los proximos 30 (despues de
 *   la semana). Se dice asi en pantalla para que nadie lo lea como mes calendario.
 * - FEFO: por articulo, los lotes surtibles del que vence antes al que vence despues.
 * - Por zona: lo que esta en PISO y vence esta semana o ya no se debe vender va a «retirar del
 *   anaquel»; el RESURTIDO dice que lote bajar del almacen primero. Lo que esta en merma ya se
 *   separo: no cuenta en ninguna lista, solo se dice cuantas cajas hay.
 */
import { diasHasta, esFecha, parseaFechaGs1, aAammdd } from './fechas.js'
import type { Articulo, EstadoAlmacen, Existencia, Zona } from './modelo.js'
import { categoriaPorId, estadoSemaforo, vendible, type EstadoSemaforo } from './semaforo.js'

export interface FilaTablero {
  readonly existencia: Existencia
  readonly descripcion: string
  readonly dias: number
  readonly estado: EstadoSemaforo
  readonly zona: Zona
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
  /** En piso de venta y vencido, en retiro o venciendo esta semana: quitar del anaquel. */
  readonly anaquel: readonly FilaTablero[]
  /** Del almacen (o recibo) a piso: por articulo, el lote que hay que bajar primero. */
  readonly resurtido: readonly GrupoFefo[]
  readonly cajasEnMerma: number
  readonly totales: Readonly<Record<EstadoSemaforo, number>>
  /** Los lotes de cada color, para listarlos con su accion. */
  readonly porEstado: Readonly<Record<EstadoSemaforo, readonly FilaTablero[]>>
}

export function diasParaCaducar(caducidadIso: string, hoy: string): number {
  const f = parseaFechaGs1(aAammdd(caducidadIso), Number(hoy.slice(0, 4)))
  return esFecha(f) ? diasHasta(f, hoy) : Number.NaN
}

export function tableroSitio(estado: EstadoAlmacen, sitio: string, hoy: string): TableroSitio {
  const cats = estado.configuracion.categorias
  const filas: FilaTablero[] = estado.existencias
    .filter((e) => e.sitio === sitio && e.cantidad > 0 && (e.zona ?? 'recibo') !== 'merma')
    .map((e) => {
      const art: Articulo | undefined = estado.articulos[e.sku]
      const dias = diasParaCaducar(e.caducidad, hoy)
      return { existencia: e, descripcion: art?.descripcion ?? e.sku, dias, estado: estadoSemaforo(dias, categoriaPorId(cats, art?.categoria)), zona: e.zona ?? 'recibo' }
    })
    .sort((a, b) => a.dias - b.dias || a.descripcion.localeCompare(b.descripcion))
  const totales: Record<EstadoSemaforo, number> = { vigente: 0, alerta: 0, promocion: 0, retiro: 0, vencido: 0 }
  for (const f of filas) totales[f.estado]++
  const surtibles = filas.filter((f) => vendible(f.estado))
  const agrupa = (lista: readonly FilaTablero[]): GrupoFefo[] => {
    const grupos = new Map<string, FilaTablero[]>()
    for (const f of lista) grupos.set(f.existencia.sku, [...(grupos.get(f.existencia.sku) ?? []), f])
    return [...grupos.entries()]
      .map(([sku, lotes]) => ({ sku, descripcion: lotes[0]!.descripcion, lotes: lotes.map((l, i) => ({ ...l, orden: i + 1 })) }))
      .sort((a, b) => (a.lotes[0]?.dias ?? 0) - (b.lotes[0]?.dias ?? 0))
  }
  const fefo = agrupa(surtibles)
  const resurtido = agrupa(surtibles.filter((f) => f.zona === 'almacen' || f.zona === 'recibo'))
  const anaquel = filas.filter((f) => f.zona === 'piso' && (f.estado === 'vencido' || f.estado === 'retiro' || f.dias <= 7))
  const cajasEnMerma = estado.existencias.filter((e) => e.sitio === sitio && (e.zona ?? 'recibo') === 'merma').reduce((s, e) => s + e.cantidad, 0)
  return {
    sitio,
    vencidos: filas.filter((f) => f.estado === 'vencido'),
    retiro: filas.filter((f) => f.estado === 'retiro'),
    semana: filas.filter((f) => f.dias >= 0 && f.dias <= 7),
    mes: filas.filter((f) => f.dias > 7 && f.dias <= 30),
    fefo,
    anaquel,
    resurtido,
    cajasEnMerma,
    totales,
    porEstado: {
      vencido: filas.filter((f) => f.estado === 'vencido'), retiro: filas.filter((f) => f.estado === 'retiro'), promocion: filas.filter((f) => f.estado === 'promocion'),
      alerta: filas.filter((f) => f.estado === 'alerta'), vigente: filas.filter((f) => f.estado === 'vigente'),
    },
  }
}
