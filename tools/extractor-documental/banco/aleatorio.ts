/**
 * Generador pseudoaleatorio CON SEMILLA. Es lo que hace la siembra reproducible.
 *
 * `Math.random()` no vale aqui, y no es un detalle de estilo: una base de prueba que sale distinta
 * en cada corrida convierte cualquier fallo en un fantasma. "En mi maquina el documento 7 cayo en
 * revision y en la tuya no" no se depura — se discute. Con semilla, la misma entrada da la misma
 * base bit a bit, y un fallo se reproduce citando un numero.
 *
 * Algoritmo: mulberry32. Treinta y dos bits de estado, distribucion suficiente para elegir de
 * listas y decidir ramas. NO es criptografico y no pretende serlo: aqui nada depende de que sea
 * impredecible, solo de que sea REPETIBLE.
 */

export interface Aleatorio {
  /** Real en [0, 1). */
  real(): number
  /** Entero en [min, max], los dos incluidos. */
  entero(min: number, max: number): number
  /** Un elemento de la lista. Lanza si esta vacia: devolver `undefined` en silencio esconde el bug. */
  elige<T>(lista: readonly T[]): T
  /** `true` con la probabilidad dada. */
  ocurre(probabilidad: number): boolean
}

/**
 * Deriva un estado inicial de 32 bits de una semilla de texto.
 *
 * Se admite texto y no solo numeros porque una semilla que se puede leer —`"abarrotes-2026"`— se
 * cita en un reporte de fallo mucho mejor que `1743821`.
 */
export function estadoDeSemilla(semilla: string): number {
  let h = 2166136261
  for (let i = 0; i < semilla.length; i += 1) {
    h ^= semilla.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function aleatorioCon(semilla: string): Aleatorio {
  let estado = estadoDeSemilla(semilla)

  const real = (): number => {
    estado = (estado + 0x6d2b79f5) >>> 0
    let t = estado
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    real,
    entero(min: number, max: number): number {
      if (max < min) throw new RangeError(`rango invertido: [${min}, ${max}]`)
      return min + Math.floor(real() * (max - min + 1))
    },
    elige<T>(lista: readonly T[]): T {
      if (lista.length === 0) throw new RangeError('no se puede elegir de una lista vacia')
      return lista[Math.floor(real() * lista.length)]
    },
    ocurre(probabilidad: number): boolean {
      return real() < probabilidad
    },
  }
}
