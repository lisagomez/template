/** Azar DETERMINISTA para el corpus sintético: misma semilla, mismo corpus (mulberry32). */
export interface Azar {
  /** [0, 1) */
  readonly siguiente: () => number
  readonly entero: (min: number, max: number) => number
  readonly elige: <T>(xs: readonly T[]) => T
  readonly prob: (p: number) => boolean
}

export function azar(semilla: number): Azar {
  let a = semilla >>> 0
  const siguiente = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const entero = (min: number, max: number): number => min + Math.floor(siguiente() * (max - min + 1))
  const elige = <T>(xs: readonly T[]): T => {
    if (xs.length === 0) throw new Error('elige sobre una lista vacía')
    return xs[Math.floor(siguiente() * xs.length)] as T
  }
  return { siguiente, entero, elige, prob: (p) => siguiente() < p }
}
