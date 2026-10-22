/**
 * Versiones de verdad: cada cambio es una versión; volver atrás es OTRA versión (como un revert), no borrar
 * historia; dos versiones se comparan componente a componente; una se puede fijar como oficial. El almacén se
 * inyecta (memoria o archivo en el laboratorio; Supabase está pausado y el núcleo no lo conoce).
 */
import type { Dashboard, Parche } from './esquema.js'

export interface Version {
  readonly n: number
  readonly padre: number | null
  readonly dashboard: Dashboard
  readonly autor: 'agente' | 'persona' | 'sistema'
  readonly instruccion: string | null
  readonly parche: Parche | null
  readonly resumen: string
  readonly cuando: string
}

export interface Historial {
  readonly tablero: string
  readonly versiones: readonly Version[]
  readonly actual: number
  readonly oficial: number | null
}

export interface AlmacenVersiones {
  lee(tablero: string): Promise<Historial | null>
  /** Guarda si la versión actual guardada sigue siendo `esperada` (concurrencia optimista); si no, lanza. */
  guarda(h: Historial, esperada: number | null): Promise<void>
  lista(): Promise<readonly string[]>
}

export function nuevoHistorial(tablero: string, dashboard: Dashboard, cuando = new Date().toISOString()): Historial {
  return { tablero, actual: 0, oficial: null, versiones: [{ n: 0, padre: null, dashboard, autor: 'sistema', instruccion: null, parche: null, resumen: 'tablero inicial', cuando }] }
}

export function versionActual(h: Historial): Version {
  const v = h.versiones[h.actual]
  if (!v) throw new Error(`el historial de ${h.tablero} no tiene la versión ${h.actual}`)
  return v
}

export function registra(h: Historial, v: Omit<Version, 'n' | 'padre'>): Historial {
  const n = h.versiones.length
  return { ...h, actual: n, versiones: [...h.versiones, { ...v, n, padre: h.actual }] }
}

/** Volver a la versión `n`: se registra una versión nueva con su contenido. La historia no se reescribe. */
export function vuelveA(h: Historial, n: number, cuando = new Date().toISOString()): Historial {
  const destino = h.versiones[n]
  if (!destino) throw new Error(`no existe la versión ${n}`)
  return registra(h, { dashboard: destino.dashboard, autor: 'persona', instruccion: null, parche: null, resumen: `volver a la versión ${n}`, cuando })
}

/** Deshacer = volver a la versión de la que salió la actual. */
export function deshace(h: Historial, cuando = new Date().toISOString()): Historial {
  const padre = versionActual(h).padre
  if (padre === null) throw new Error('no hay nada que deshacer: es el tablero inicial')
  return vuelveA(h, padre, cuando)
}

export function fijaOficial(h: Historial, n: number): Historial {
  if (!h.versiones[n]) throw new Error(`no existe la versión ${n}`)
  return { ...h, oficial: n }
}

export interface DiferenciaDashboard {
  readonly agregados: readonly string[]
  readonly quitados: readonly string[]
  readonly cambiados: readonly { readonly id: string; readonly campos: readonly string[] }[]
  readonly movidos: readonly string[]
  readonly globales: readonly { readonly campo: string; readonly antes: unknown; readonly despues: unknown }[]
}

function camposDistintos(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort()
}

/** Qué componentes y qué partes globales cambiaron de `a` a `b`. Las CIFRAS se comparan en `resolver.ts`. */
export function comparaVersiones(a: Dashboard, b: Dashboard): DiferenciaDashboard {
  const idsA = a.componentes.map((c) => c.id)
  const idsB = b.componentes.map((c) => c.id)
  const enA = new Map(a.componentes.map((c) => [c.id, c as Record<string, unknown>]))
  const comunes = idsB.filter((id) => enA.has(id))
  const ordenA = idsA.filter((id) => comunes.includes(id))
  return {
    agregados: idsB.filter((id) => !enA.has(id)),
    quitados: idsA.filter((id) => !idsB.includes(id)),
    cambiados: b.componentes.filter((c) => enA.has(c.id)).map((c) => ({ id: c.id, campos: camposDistintos(enA.get(c.id) ?? {}, c as Record<string, unknown>) })).filter((x) => x.campos.length),
    movidos: comunes.filter((id, i) => ordenA[i] !== id),
    globales: (['titulo', 'palanca', 'filtros', 'seleccion'] as const)
      .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
      .map((k) => ({ campo: k, antes: a[k] ?? null, despues: b[k] ?? null })),
  }
}

/** Almacén en memoria: pruebas y lienzo efímero. */
export function memoriaVersiones(): AlmacenVersiones {
  const datos = new Map<string, Historial>()
  return {
    async lee(t) { const h = datos.get(t); return h ? structuredClone(h) : null },
    async guarda(h, esperada) {
      const previo = datos.get(h.tablero)
      if ((previo?.actual ?? null) !== esperada) throw new Error(`conflicto de versión en ${h.tablero}: se esperaba ${esperada} y hay ${previo?.actual ?? null}`)
      datos.set(h.tablero, structuredClone(h))
    },
    async lista() { return [...datos.keys()].sort() },
  }
}
