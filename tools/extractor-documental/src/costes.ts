/**
 * Estimacion del coste ANTES de lanzar el lote.
 *
 * 5.000 paginas a la tarifa del motor son ~20 USD, y hoy eso se descubre en la factura. Tambien es
 * la superficie que faltaba contra el denial-of-wallet del modelo de amenazas: quemar presupuesto
 * sin hackear nada.
 *
 * Regla heredada de `src/lib/ai/contabilidad.ts` de la app: **si el motor no declara tarifa, la
 * estimacion es `null`, nunca cero**. Un cero inventado da un presupuesto que parece completo y no
 * lo esta, que es peor que un hueco declarado.
 */

export interface TarifaDelMotor {
  /** USD por cada 1.000 paginas. `null` = el motor no la declara. */
  usdPorMilPaginas: number | null
  /** Con anotaciones estructuradas suele ser mas cara. */
  usdPorMilPaginasAnotadas?: number | null
  /** Descuento del modo por lotes, entre 0 y 1. 0.5 = mitad de precio. */
  descuentoPorLote?: number
}

export interface Estimacion {
  paginas: number
  /** `null` cuando no hay tarifa declarada. NUNCA cero por defecto. */
  costeUsd: number | null
  /** En espanol y honesto: si no se sabe, se dice. */
  mensaje: string
}

export interface OpcionesDeEstimacion {
  conAnotaciones?: boolean
  porLotes?: boolean
}

export function estimaCoste(
  paginas: number,
  tarifa: TarifaDelMotor,
  opciones: OpcionesDeEstimacion = {},
): Estimacion {
  if (!Number.isInteger(paginas) || paginas < 0) {
    throw new RangeError('Las paginas tienen que ser un entero no negativo')
  }
  const base = opciones.conAnotaciones
    ? (tarifa.usdPorMilPaginasAnotadas ?? tarifa.usdPorMilPaginas)
    : tarifa.usdPorMilPaginas

  if (base === null || base === undefined) {
    return {
      paginas,
      costeUsd: null,
      mensaje: `${paginas} pagina(s). Coste DESCONOCIDO: el motor no declara tarifa. No se estima en cero.`,
    }
  }

  const descuento = opciones.porLotes ? (tarifa.descuentoPorLote ?? 0) : 0
  if (descuento < 0 || descuento >= 1) throw new RangeError('El descuento va entre 0 y 1')
  const costeUsd = (paginas / 1000) * base * (1 - descuento)
  return {
    paginas,
    costeUsd,
    mensaje: `${paginas} pagina(s) · aproximadamente ${costeUsd.toFixed(2)} USD${descuento > 0 ? ' (con descuento por lotes)' : ''}`,
  }
}

/** Suma estimaciones sin inventar: si alguna es desconocida, el total tambien lo es. */
export function sumaEstimaciones(estimaciones: readonly Estimacion[]): Estimacion {
  const paginas = estimaciones.reduce((s, e) => s + e.paginas, 0)
  if (estimaciones.some((e) => e.costeUsd === null)) {
    return {
      paginas,
      costeUsd: null,
      mensaje: `${paginas} pagina(s). Total DESCONOCIDO: alguna parte no tiene tarifa declarada.`,
    }
  }
  const costeUsd = estimaciones.reduce((s, e) => s + (e.costeUsd ?? 0), 0)
  return { paginas, costeUsd, mensaje: `${paginas} pagina(s) · aproximadamente ${costeUsd.toFixed(2)} USD` }
}
