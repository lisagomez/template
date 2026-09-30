/**
 * Metricas del informe por periodos (spec 011, RF-12): que se mide de cada trayectoria y como se
 * junta un periodo. Sin disco: lo usa `informe.mjs` y lo prueba `prueba-trayectorias.ts`.
 *
 * Una TASA (errores por herramienta, rojos por gate, salida por llamada...) se guarda como
 * razon {num, den} y el periodo es total ÷ total, no la media de las tasas de cada sesion. Con la
 * media, una sesion de 47 usos pesaba lo mismo que una de 2000: dos sesiones cortas con 7 y 5
 * errores fabricaron cuatro informes seguidos de «regresion» de erroresPorHerramienta (+33 %)
 * mientras el agregado BAJABA de 0,028 a 0,025 (2026-09-30, PR #190).
 */

/** Una tasa de la trayectoria, o `null` si no hay denominador o falta el dato. */
export const razon = (num, den) => (num === null || num === undefined || !(den > 0) ? null : { num, den })

const esRazon = (v) => v !== null && typeof v === 'object'

/**
 * El valor de un periodo: total ÷ total si son razones, la media si son valores sueltos. Los
 * `null` no entran (los huecos no se suman como ceros); sin datos, `null`.
 */
export function agrega(valores) {
  const hay = valores.filter((v) => v !== null)
  if (hay.length === 0) return null
  if (hay.every(esRazon)) {
    const den = hay.reduce((a, v) => a + v.den, 0)
    return hay.reduce((a, v) => a + v.num, 0) / den
  }
  if (hay.some(esRazon)) throw new Error('agrega: razones y valores sueltos mezclados en la misma metrica')
  return hay.reduce((a, b) => a + b, 0) / hay.length
}

/** Metricas de una trayectoria; `ev` son sus evals (estructurales y de juicio) ya juntas. */
export function metricasDe(t, ev = {}) {
  const herr = Object.values(t.acciones.herramientas ?? {}).reduce((a, b) => a + b, 0)
  const valores = Object.values(ev)
  // La fabrica se compara por INTENSIDAD (por llamada, por gate, por herramienta), no por totales
  // de sesion: los totales crecen con la duracion y el primer informe fabrico cuatro regresiones
  // que solo decian que las sesiones del segundo periodo eran mas largas (2026-09-13).
  const llamadas = t.acciones.llamadasAlModelo ?? 0
  const gatesCorridos = t.gates.reduce((a, g) => a + (g.veces ?? 1), 0)
  const fabrica = t.linea === 'fabrica'
  return {
    salidaPorLlamada: t.uso && llamadas > 0 ? razon(t.uso.salida, llamadas) : t.linea === 'aplicacion' ? razon(t.uso?.salida, 1) : null,
    cacheRatio: t.uso ? razon(t.uso.cacheLectura ?? 0, t.uso.salida) : null,
    costoUsd: fabrica ? null : t.costoUsd,
    costoPorLlamada: fabrica ? razon(t.costoUsd, llamadas) : null,
    msPorLlamada: llamadas > 0 ? razon(t.tiempos.totalMs, llamadas) : fabrica ? null : razon(t.tiempos.totalMs, 1),
    aciertoEvals: valores.length ? valores.filter(Boolean).length / valores.length : null,
    revisionHumana: t.resultado.campos ? razon(t.resultado.revisionHumana ?? 0, t.resultado.campos) : null,
    gatesRojosPorGate: razon(t.gates.filter((g) => g.resultado === 'rojo').length, gatesCorridos),
    erroresPorHerramienta: razon(t.resultado.errores, herr),
    pagMin: t.resultado.metricas?.paginasPorMinutoMotor ?? null,
    // Dictado (linea herramientas, actor `dictado`): la latencia que vive quien dicta, p50 por sesion.
    latenciaP50Ms: t.resultado.metricas?.latenciaP50Ms ?? null,
  }
}

export const MEJOR_SI_SUBE = { cacheRatio: true, aciertoEvals: true, pagMin: true, latenciaP50Ms: false, salidaPorLlamada: false, costoUsd: false, costoPorLlamada: false, msPorLlamada: false, revisionHumana: false, gatesRojosPorGate: false, erroresPorHerramienta: false }
