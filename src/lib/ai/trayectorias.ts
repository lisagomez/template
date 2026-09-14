/**
 * Trayectorias de la linea de aplicacion (spec 011, RF-7).
 *
 * Cierra la otra mitad de `contabilidad.ts`: aquello registra cuanto costo una llamada; esto deja
 * la traza de FORMA de cada llamada —clase de tarea, modelo pineado, tokens, coste— en el mismo
 * formato que usan la fabrica y las herramientas. Y con la misma regla que ya rige ahi: sin datos
 * de uso, coste `null` y cobertura incompleta; nunca cero.
 *
 * Lo que una trayectoria de app NO lleva, a proposito: el prompt, la respuesta, el usuario, ni
 * ningun identificador de negocio. Conteos y nombres. El `Emisor` se inyecta como el
 * `Registrador`: la logica se prueba sin base de datos ni disco.
 */
import type { EventoDeUso, Registrador } from './contabilidad.ts'

export interface Trayectoria {
  version: 1
  id: string
  linea: 'aplicacion'
  origen: { tipo: 'llamada'; referencia: string }
  cuando: { inicio: string; fin?: string }
  actor: { feature?: string; tarea: string }
  modelos: Record<string, number>
  acciones: { llamadasAlModelo: number }
  uso: { entrada: number; salida: number; cacheLectura?: number } | null
  costoUsd: number | null
  tiempos: { totalMs: number | null }
  gates: never[]
  resultado: { errores: number }
  cobertura: { completa: boolean; faltan: string[] }
}

export interface Emisor {
  emite(trayectoria: Trayectoria): Promise<void>
}

/** Id corto y estable: sin contenido, solo la tarea y el instante. */
function idDe(referencia: string): string {
  let h = 2166136261
  for (const c of `aplicacion:${referencia}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
  return `aplicacion-${h.toString(16).padStart(8, '0')}`
}

export interface DetalleDeLlamada {
  feature?: string
  /** Milisegundos que tardo la llamada; `null` si no se midio, y se declara. */
  duracionMs?: number | null
  /** Verdadero si la llamada fallo (la app decide que cuenta como fallo). */
  fallo?: boolean
}

export function trayectoriaDeUso(evento: EventoDeUso, detalle: DetalleDeLlamada = {}): Trayectoria {
  const faltan: string[] = []
  if (evento.uso === null) faltan.push('uso')
  if (evento.costoUsd === null && evento.uso !== null) faltan.push('costo')
  if (detalle.duracionMs === undefined || detalle.duracionMs === null) faltan.push('tiempos')
  const referencia = `${evento.tarea}:${evento.cuando}`
  return {
    version: 1,
    id: idDe(referencia),
    linea: 'aplicacion',
    origen: { tipo: 'llamada', referencia: idDe(referencia).slice(-8) },
    cuando: { inicio: evento.cuando },
    actor: { ...(detalle.feature ? { feature: detalle.feature } : {}), tarea: evento.tarea },
    modelos: { [evento.modelo]: 1 },
    acciones: { llamadasAlModelo: 1 },
    uso: evento.uso === null ? null : { entrada: evento.uso.entrada, salida: evento.uso.salida, ...(evento.uso.cacheados !== undefined ? { cacheLectura: evento.uso.cacheados } : {}) },
    costoUsd: evento.uso === null ? null : evento.costoUsd,
    tiempos: { totalMs: detalle.duracionMs ?? null },
    gates: [],
    resultado: { errores: detalle.fallo === true ? 1 : 0 },
    cobertura: { completa: faltan.length === 0, faltan },
  }
}

/**
 * Un `Registrador` que ademas emite la trayectoria de cada llamada. Envuelve al real: la
 * contabilidad no cambia, y quien no quiera trayectorias sigue usando el suyo.
 */
export function conTrayectoria(registrador: Registrador, emisor: Emisor, detalle: () => DetalleDeLlamada = () => ({})): Registrador {
  return {
    async guarda(evento) {
      await registrador.guarda(evento)
      await emisor.emite(trayectoriaDeUso(evento, detalle()))
    },
    resumen: () => registrador.resumen(),
  }
}
