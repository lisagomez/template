/**
 * Rollos de etiquetas: presupuesto contra gasto por sitio, y estimacion de cuanto se gastaria.
 *
 * El gasto se VALORA con el rollo que tiene puesto cada impresora: etiquetas impresas × costo por
 * etiqueta (precio del paquete / rollos / etiquetas por rollo). Una impresion en una impresora sin
 * rollo asignado NO se suma como cero: queda «sin costo asignado» y se dice cuantas son. Sumar
 * huecos como ceros da un gasto que parece completo y no lo es (la misma regla que la
 * contabilidad de tokens del repo).
 *
 * El presupuesto AVISA (80 %, o si la proyeccion a fin de mes lo pasa) y marca el exceso; nunca
 * bloquea la impresion: dejar una caja sin etiqueta de caducidad por cuidar un presupuesto de
 * papel es una decision con victima, y esa la toma la operacion, no este modulo.
 */
import { diasDelMes } from './fechas.js'

export type Tecnologia = 'termica-directa' | 'transferencia-termica'

export interface Rollo {
  readonly id: string
  readonly nombre: string
  readonly tecnologia: Tecnologia
  readonly anchoMm: number
  readonly altoMm: number
  readonly etiquetasPorRollo: number
  /** Precio del paquete tal como se compra, y cuantos rollos trae. */
  readonly costoPaquete: number
  readonly rollosPorPaquete: number
  /** De donde salio el precio y cuando se consulto: un precio sin fuente no es un precio. */
  readonly fuente?: string
  readonly fechaPrecio?: string
}

export interface Presupuesto {
  readonly sitio: string
  /** `AAAA-MM`. */
  readonly mes: string
  readonly monto: number
}

export type OrigenConsumo = 'impresion' | 'lote' | 'calibracion'

export interface Consumo {
  readonly id: string
  /** ISO con hora. */
  readonly fecha: string
  readonly sitio: string
  readonly impresora: string
  /** El rollo que tenia la impresora AL imprimir (el precio de ese dia, no el de hoy). */
  readonly rollo?: string
  readonly etiquetas: number
  readonly origen: OrigenConsumo
  readonly operador: string
}

export interface Compra {
  readonly id: string
  readonly fecha: string
  readonly sitio: string
  readonly rollo: string
  readonly rollos: number
  readonly costoTotal: number
  readonly operador: string
}

export interface LineaEscenario {
  readonly concepto: string
  readonly rollo: string
  readonly etiquetasMes: number
}

export interface Escenario {
  readonly id: string
  readonly nombre: string
  /** Supuestos en palabras: de donde salen los volumenes. */
  readonly supuestos: string
  readonly lineas: readonly LineaEscenario[]
  /** Calibracion, reimpresiones y etiquetas perdidas, en %. */
  readonly mermaPct: number
}

export interface Consumibles {
  readonly rollos: readonly Rollo[]
  readonly rolloPorImpresora: Readonly<Record<string, string>>
  readonly presupuestos: readonly Presupuesto[]
  readonly consumos: readonly Consumo[]
  readonly compras: readonly Compra[]
  readonly escenarios: readonly Escenario[]
}

export const CONSUMIBLES_VACIOS: Consumibles = { rollos: [], rolloPorImpresora: {}, presupuestos: [], consumos: [], compras: [], escenarios: [] }

export function costoPorEtiqueta(r: Rollo): number {
  return r.costoPaquete / (r.rollosPorPaquete * r.etiquetasPorRollo)
}

export function costoPorRollo(r: Rollo): number {
  return r.costoPaquete / r.rollosPorPaquete
}

/** Etiquetas que imprime un ZPL: cada ^XA…^XZ por su ^PQ (1 si no lo lleva). */
export function etiquetasDeZpl(zpl: string): number {
  let total = 0
  for (const bloque of zpl.split(/\^XA/i).slice(1)) {
    const pq = /\^PQ(\d+)/i.exec(bloque)
    total += pq ? Math.max(1, Number(pq[1])) : 1
  }
  return total
}

// --- Estimacion -----------------------------------------------------------------------------

export interface LineaEstimada {
  readonly concepto: string
  readonly rollo?: Rollo
  readonly etiquetas: number
  readonly rollos: number
  /** null si el rollo no esta en el catalogo: no se inventa un precio. */
  readonly costo: number | null
}

export interface Estimacion {
  readonly lineas: readonly LineaEstimada[]
  readonly etiquetasMes: number
  readonly costoMes: number
  readonly costoAnio: number
  /** Lineas sin precio: el total las excluye y lo dice. */
  readonly sinPrecio: number
}

export function estima(e: Escenario, rollos: readonly Rollo[]): Estimacion {
  const factor = 1 + Math.max(0, e.mermaPct) / 100
  const lineas: LineaEstimada[] = e.lineas.map((l) => {
    const rollo = rollos.find((r) => r.id === l.rollo)
    const etiquetas = l.etiquetasMes * factor
    return {
      concepto: l.concepto, etiquetas,
      rollos: rollo ? etiquetas / rollo.etiquetasPorRollo : 0,
      costo: rollo ? etiquetas * costoPorEtiqueta(rollo) : null,
      ...(rollo ? { rollo } : {}),
    }
  })
  const costoMes = lineas.reduce((s, l) => s + (l.costo ?? 0), 0)
  return { lineas, etiquetasMes: lineas.reduce((s, l) => s + l.etiquetas, 0), costoMes, costoAnio: costoMes * 12, sinPrecio: lineas.filter((l) => l.costo === null).length }
}

// --- Presupuesto contra gasto ----------------------------------------------------------------

/** `incompleto`: hay impresiones sin precio y lo valorado no llega al aviso: no se puede decir «en rango». */
export type EstadoPresupuesto = 'sin-presupuesto' | 'en-rango' | 'incompleto' | 'aviso' | 'excedido'

export interface GastoImpresora {
  readonly impresora: string
  readonly rollo?: Rollo
  readonly etiquetas: number
  readonly gasto: number
  readonly etiquetasSinCosto: number
}

export interface ResumenSitio {
  readonly sitio: string
  readonly presupuesto?: number
  readonly gasto: number
  readonly etiquetas: number
  /** Impresiones que no se pudieron valorar (impresora sin rollo asignado). */
  readonly etiquetasSinCosto: number
  readonly compras: number
  readonly rollosComprados: number
  readonly proporcion?: number
  /** Gasto al ritmo actual al cerrar el mes. */
  readonly proyeccion: number
  readonly estado: EstadoPresupuesto
  readonly porImpresora: readonly GastoImpresora[]
}

export const UMBRAL_AVISO = 0.8

export function resumenPresupuesto(c: Consumibles, sitios: readonly string[], mes: string, hoy: string): ResumenSitio[] {
  const [anio = 1970, m = 1] = mes.split('-').map(Number)
  const dias = diasDelMes(anio, m)
  const transcurridos = hoy.startsWith(mes) ? Math.max(1, Number(hoy.slice(8, 10))) : hoy > mes ? dias : 0
  const delMes = <T extends { fecha: string }>(x: T) => x.fecha.startsWith(mes)
  return sitios.map((sitio) => {
    const consumos = c.consumos.filter((x) => x.sitio === sitio && delMes(x))
    const impresoras = [...new Set(consumos.map((x) => x.impresora))].sort()
    const porImpresora: GastoImpresora[] = impresoras.map((impresora) => {
      let gasto = 0
      let etiquetas = 0
      let sinCosto = 0
      for (const x of consumos.filter((y) => y.impresora === impresora)) {
        const rollo = c.rollos.find((r) => r.id === x.rollo)
        etiquetas += x.etiquetas
        if (rollo) gasto += x.etiquetas * costoPorEtiqueta(rollo)
        else sinCosto += x.etiquetas
      }
      const actual = c.rollos.find((r) => r.id === c.rolloPorImpresora[impresora])
      return { impresora, etiquetas, gasto, etiquetasSinCosto: sinCosto, ...(actual ? { rollo: actual } : {}) }
    })
    const gasto = porImpresora.reduce((s, x) => s + x.gasto, 0)
    const compras = c.compras.filter((x) => x.sitio === sitio && delMes(x))
    const presupuesto = c.presupuestos.find((p) => p.sitio === sitio && p.mes === mes)?.monto
    const proyeccion = transcurridos > 0 ? (gasto / transcurridos) * dias : 0
    const proporcion = presupuesto ? gasto / presupuesto : undefined
    const sinCosto = porImpresora.some((x) => x.etiquetasSinCosto > 0)
    const estado: EstadoPresupuesto = !presupuesto ? 'sin-presupuesto'
      : gasto >= presupuesto ? 'excedido'
        : gasto >= UMBRAL_AVISO * presupuesto || proyeccion >= presupuesto ? 'aviso'
          : sinCosto ? 'incompleto' : 'en-rango'
    return {
      sitio, gasto, etiquetas: porImpresora.reduce((s, x) => s + x.etiquetas, 0), etiquetasSinCosto: porImpresora.reduce((s, x) => s + x.etiquetasSinCosto, 0),
      compras: compras.reduce((s, x) => s + x.costoTotal, 0), rollosComprados: compras.reduce((s, x) => s + x.rollos, 0),
      proyeccion, estado, porImpresora, ...(presupuesto ? { presupuesto } : {}), ...(proporcion !== undefined ? { proporcion } : {}),
    }
  })
}
