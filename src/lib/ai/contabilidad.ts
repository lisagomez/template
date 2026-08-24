/**
 * Contabilidad de tokens y presupuesto.
 *
 * Cierra el lazo del routing: `routing.ts` decide qué modelo *debería* usarse y cuánto
 * *debería* costar; esto registra lo que de verdad se gastó. Sin esta mitad, las tarifas
 * del catálogo son una estimación bonita que nadie puede desmentir.
 *
 * Tres reglas heredadas de PRP-001, y ninguna es cosmética:
 *
 *   1. **No se inventan cifras.** Una llamada sin datos de uso se registra con coste `null`
 *      y el reporte dice cuántas filas van sin costear. Sumar como si fueran cero produce
 *      una factura que parece completa y no lo está — que es peor que un hueco declarado.
 *   2. **Se registra la llamada relevante, no cada micro-llamada.** Un registro que se
 *      infla deja de leerse, igual que un informe que exagera.
 *   3. **El aviso al 80 % avisa; el corte al 100 % lo decide la app.** Cortar
 *      automáticamente una función de cara al usuario es negarle el servicio a tus propios
 *      usuarios para proteger tu factura: puede ser correcto, pero es una decisión con
 *      víctima y se toma a propósito (C4), no por defecto de un módulo.
 */
import { modeloPara, costeUsd, type ClaseDeTarea } from './routing.ts'

export interface UsoDeTokens {
  entrada: number
  salida: number
  /** Tokens de entrada servidos desde el caché de prefijo: cuestan la décima parte. */
  cacheados?: number
}

export interface EventoDeUso {
  tarea: ClaseDeTarea
  modelo: string
  uso: UsoDeTokens | null
  /** `null` cuando el proveedor no devolvió uso: se declara, no se estima. */
  costoUsd: number | null
  cuando: string
}

/** Lo que el módulo necesita para persistir. Se inyecta: así la lógica se prueba sin BD. */
export interface Registrador {
  guarda(evento: EventoDeUso): Promise<void>
  /** Suma del periodo en curso y cuántas filas quedaron sin costear. */
  resumen(): Promise<{ gastadoUsd: number; filasSinCosto: number }>
}

/**
 * Registra una llamada. Si el proveedor no devolvió uso, se guarda igual con coste `null`:
 * la llamada ocurrió y el registro tiene que reflejarlo, aunque no se pueda costear.
 */
export async function registraUso(
  registrador: Registrador,
  tarea: ClaseDeTarea,
  uso: UsoDeTokens | null,
  cuando: Date = new Date(),
): Promise<EventoDeUso> {
  const { modelo } = modeloPara(tarea)
  const evento: EventoDeUso = {
    tarea,
    modelo,
    uso,
    costoUsd: uso ? costeUsd(tarea, uso) : null,
    cuando: cuando.toISOString(),
  }
  await registrador.guarda(evento)
  return evento
}

export type NivelDePresupuesto = 'ok' | 'aviso' | 'excedido'

export interface EstadoDePresupuesto {
  nivel: NivelDePresupuesto
  gastadoUsd: number
  presupuestoUsd: number
  porcentaje: number
  /** La app decide si lo honra. El módulo no corta nada por su cuenta. */
  recomiendaCortar: boolean
  /** Filas registradas sin coste: el resumen NO es completo mientras esto sea > 0. */
  filasSinCosto: number
  mensaje: string
}

/**
 * Estado del presupuesto. Función pura: se prueba sin BD, sin red y sin reloj.
 *
 * `filasSinCosto` no se ignora ni se estima — se propaga al mensaje, para que nadie lea una
 * cifra parcial como si fuera la factura.
 */
export function estadoPresupuesto(
  gastadoUsd: number,
  presupuestoUsd: number,
  filasSinCosto = 0,
  umbralAviso = 0.8,
): EstadoDePresupuesto {
  if (presupuestoUsd <= 0) {
    throw new RangeError('el presupuesto tiene que ser mayor que cero: sin techo no hay estado que calcular')
  }
  const porcentaje = gastadoUsd / presupuestoUsd
  const nivel: NivelDePresupuesto = porcentaje >= 1 ? 'excedido' : porcentaje >= umbralAviso ? 'aviso' : 'ok'
  const pct = Math.round(porcentaje * 100)
  const salvedad = filasSinCosto > 0 ? ` (${filasSinCosto} llamada(s) sin costear: la cifra real es MAYOR)` : ''
  const mensaje =
    nivel === 'excedido'
      ? `Presupuesto excedido: $${gastadoUsd.toFixed(2)} de $${presupuestoUsd.toFixed(2)} (${pct}%)${salvedad}`
      : nivel === 'aviso'
        ? `Presupuesto al ${pct}%: $${gastadoUsd.toFixed(2)} de $${presupuestoUsd.toFixed(2)}${salvedad}`
        : `Dentro de presupuesto: $${gastadoUsd.toFixed(2)} de $${presupuestoUsd.toFixed(2)} (${pct}%)${salvedad}`
  return { nivel, gastadoUsd, presupuestoUsd, porcentaje, recomiendaCortar: nivel === 'excedido', filasSinCosto, mensaje }
}

/** Estado del periodo en curso, leyendo del registrador. */
export async function estadoActual(
  registrador: Registrador,
  presupuestoUsd: number,
): Promise<EstadoDePresupuesto> {
  const { gastadoUsd, filasSinCosto } = await registrador.resumen()
  return estadoPresupuesto(gastadoUsd, presupuestoUsd, filasSinCosto)
}
