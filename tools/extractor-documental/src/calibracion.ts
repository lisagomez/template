/**
 * Las metricas del piloto de `docs/INVESTIGACION-OCR-MISTRAL.md` §8.
 *
 * QUE ES ESTO Y QUE NO ES, porque la diferencia es todo el punto:
 *
 * Esto **no fija ningun umbral**. TAR-17, TAR-25 y TAR-34 siguen bloqueadas despues de este
 * archivo, y tienen que seguirlo: el umbral correcto depende de cuanto cuesta un error que se cuela
 * frente a cuanto cuesta una hora de revision humana, y eso **no lo sabe la herramienta**. Lo sabe
 * quien paga las dos cosas.
 *
 * Lo que esto hace es dar la REGLA DE MEDIR. `curvaDeUmbral()` no devuelve un numero recomendado:
 * devuelve la tabla del intercambio —cuantos van a la cola, cuantos errores se cuelan, cuanto
 * trabajo humano cuesta cada punto— para que la decision se tome con los datos delante en vez de a
 * ojo. Un «umbral sugerido» aqui seria exactamente el numero inventado que esas tres tareas estan
 * bloqueadas para impedir, solo que con una funcion detras que le da aire de medicion.
 *
 * §8 lo dice de la correlacion confianza↔error: es «la medicion mas valiosa de las cinco», porque
 * sin ella la cola humana se dimensiona a ciegas.
 *
 * Cero dependencias, puro, y se prueba sin corpus: lo que se prueba es la aritmetica, no los datos.
 */

/** Distancia de edicion. La base de CER y WER. */
export function distanciaDeEdicion(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let previa = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const actual = [i]
    for (let j = 1; j <= b.length; j++) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1
      actual[j] = Math.min(actual[j - 1] + 1, previa[j] + 1, previa[j - 1] + coste)
    }
    previa = actual
  }
  return previa[b.length]
}

/**
 * Character Error Rate. `null` cuando la referencia esta vacia.
 *
 * El `null` no es pereza: dividir por cero daria `Infinity` o `NaN`, y cualquiera de los dos
 * contaminaria un promedio sin que nadie lo note. Una pagina sin texto de referencia no tiene CER
 * — no es que tenga CER cero.
 */
export function cer(referencia: string, obtenido: string): number | null {
  if (referencia.length === 0) return null
  return distanciaDeEdicion([...referencia], [...obtenido]) / referencia.length
}

/** Word Error Rate. Mismo criterio con el `null`. */
export function wer(referencia: string, obtenido: string): number | null {
  const palabras = (t: string) => t.trim().split(/\s+/).filter((p) => p.length > 0)
  const ref = palabras(referencia)
  if (ref.length === 0) return null
  return distanciaDeEdicion(ref, palabras(obtenido)) / ref.length
}

export interface MuestraDeCampo {
  clave: string
  /** Lo que dijo el motor. */
  obtenido: string
  /** La transcripcion de referencia, hecha a mano. Es el trabajo aburrido que hace que esto valga. */
  referencia: string
  /** La confianza que declaro el motor, 0 a 1. */
  confianza: number
}

/** Un campo acierta si coincide exactamente tras normalizar espacios y mayusculas. */
export function aciertaCampo(muestra: MuestraDeCampo): boolean {
  const normaliza = (t: string) => t.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es')
  return normaliza(muestra.obtenido) === normaliza(muestra.referencia)
}

/**
 * Porcentaje de campos correctos: lo que de verdad consume el negocio.
 *
 * §8 lo separa del CER a proposito, y merece la pena entender por que: **el CER puede ser bueno y
 * el campo estar mal**. Reconocer «1.234,56» como «1.234,66» son dos caracteres de 8 —CER del
 * 0,25, excelente— y un importe equivocado. La calidad bruta y la utilidad no son la misma cosa.
 */
export function precisionDeCampos(muestras: readonly MuestraDeCampo[]): number | null {
  if (muestras.length === 0) return null
  return muestras.filter(aciertaCampo).length / muestras.length
}

export interface CorrelacionConfianzaError {
  /**
   * Correlacion punto-biserial entre la confianza y el acierto. De -1 a 1.
   *
   * Cerca de 1: la confianza predice el acierto, y un umbral SIRVE.
   * Cerca de 0: **la confianza no dice nada**, y ningun umbral va a funcionar — hay que cambiar de
   * motor o de estrategia, no buscar el corte perfecto. Esa es la conclusion que §8 quiere que se
   * pueda sacar, y la que no se puede sacar a ojo.
   */
  r: number | null
  confianzaMediaAciertos: number | null
  confianzaMediaFallos: number | null
  aciertos: number
  fallos: number
  /** En espanol y sin adornos. Si no se puede calcular, lo dice. */
  lectura: string
}

export function correlacionConfianzaError(muestras: readonly MuestraDeCampo[]): CorrelacionConfianzaError {
  const aciertos = muestras.filter(aciertaCampo)
  const fallos = muestras.filter((m) => !aciertaCampo(m))
  const media = (xs: readonly MuestraDeCampo[]) =>
    xs.length === 0 ? null : xs.reduce((s, m) => s + m.confianza, 0) / xs.length

  const base = {
    confianzaMediaAciertos: media(aciertos),
    confianzaMediaFallos: media(fallos),
    aciertos: aciertos.length,
    fallos: fallos.length,
  }

  if (aciertos.length === 0 || fallos.length === 0) {
    return {
      ...base,
      r: null,
      lectura:
        'No se puede correlacionar: el corpus no tiene de las dos clases. Sin fallos no hay nada que ' +
        'predecir, y sin aciertos tampoco. Necesitas una muestra con ambas.',
    }
  }

  const todas = muestras.map((m) => m.confianza)
  const mediaTotal = todas.reduce((s, c) => s + c, 0) / todas.length
  const desviacion = Math.sqrt(todas.reduce((s, c) => s + (c - mediaTotal) ** 2, 0) / todas.length)
  if (desviacion === 0) {
    return {
      ...base,
      r: null,
      lectura:
        'Todas las confianzas son iguales: el motor no las esta diferenciando, asi que ningun umbral ' +
        'puede separar aciertos de fallos. El problema no es donde cortar.',
    }
  }

  const p = aciertos.length / muestras.length
  const m1 = base.confianzaMediaAciertos ?? 0
  const m0 = base.confianzaMediaFallos ?? 0
  const r = ((m1 - m0) / desviacion) * Math.sqrt(p * (1 - p))

  const lectura =
    r >= 0.5
      ? `La confianza predice el acierto (r = ${r.toFixed(2)}): un umbral sirve, y la curva dice donde ponerlo.`
      : r >= 0.2
        ? `La confianza predice el acierto solo a medias (r = ${r.toFixed(2)}): un umbral ayuda, pero dejara pasar errores con confianza alta.`
        : `La confianza NO predice el acierto (r = ${r.toFixed(2)}): ningun umbral va a funcionar. Cambia de motor o de estrategia; buscar el corte perfecto es perder el tiempo.`

  return { ...base, r, lectura }
}

export interface PuntoDeLaCurva {
  umbral: number
  /** Cuantos superan el umbral y se dan por buenos sin revisar. */
  aceptados: number
  /** De esos, cuantos estaban MAL. Son los que se cuelan: el coste de subir el umbral. */
  erroresColados: number
  /** Cuantos caen a la cola humana. */
  aCola: number
  /** De esos, cuantos estaban BIEN. Es trabajo humano gastado de mas. */
  revisionInnecesaria: number
}

/**
 * La tabla del intercambio. **No devuelve un umbral recomendado, y es deliberado.**
 *
 * Cada fila dice que pasa si cortas ahi: cuantos errores se cuelan y cuanta revision se gasta de
 * mas. Elegir entre esas dos columnas exige saber cuanto cuesta cada una en ESTE negocio —una
 * factura mal capturada no cuesta lo mismo en una gestoria que en una tienda— y eso no esta en los
 * datos. Devolver un «sugerido» seria fingir que si.
 */
export function curvaDeUmbral(
  muestras: readonly MuestraDeCampo[],
  pasos = 20,
): readonly PuntoDeLaCurva[] {
  if (pasos < 1) throw new RangeError('pasos tiene que ser al menos 1')
  const puntos: PuntoDeLaCurva[] = []
  for (let i = 0; i <= pasos; i++) {
    const umbral = i / pasos
    const aceptados = muestras.filter((m) => m.confianza >= umbral)
    const aCola = muestras.filter((m) => m.confianza < umbral)
    puntos.push({
      umbral,
      aceptados: aceptados.length,
      erroresColados: aceptados.filter((m) => !aciertaCampo(m)).length,
      aCola: aCola.length,
      revisionInnecesaria: aCola.filter(aciertaCampo).length,
    })
  }
  return puntos
}

export interface MuestraDeSimilitud {
  valor: string
  candidato: string
  similitud: number
  /** Si de verdad son la misma entidad. Lo decide una persona, y por eso es un corpus etiquetado. */
  esLaMisma: boolean
}

export interface PuntoDeSimilitud {
  umbral: number
  /** Emparejados por encima del umbral que NO eran la misma entidad: se fusionan dos cosas distintas. */
  falsosPositivos: number
  /** Los que eran la misma y quedaron por debajo: se crea un duplicado. */
  falsosNegativos: number
  emparejados: number
}

/**
 * La misma tabla para el umbral de similitud (TAR-25). Tampoco recomienda nada.
 *
 * Las dos columnas de error no son simetricas, y quien elija tiene que saberlo: un falso positivo
 * **fusiona dos entidades distintas** —y deshacerlo despues es arqueologia—, un falso negativo
 * **crea un duplicado**, que es feo pero se limpia. Cual duele mas depende del catalogo.
 */
export function curvaDeSimilitud(
  muestras: readonly MuestraDeSimilitud[],
  pasos = 20,
): readonly PuntoDeSimilitud[] {
  if (pasos < 1) throw new RangeError('pasos tiene que ser al menos 1')
  const puntos: PuntoDeSimilitud[] = []
  for (let i = 0; i <= pasos; i++) {
    const umbral = i / pasos
    const emparejados = muestras.filter((m) => m.similitud >= umbral)
    puntos.push({
      umbral,
      emparejados: emparejados.length,
      falsosPositivos: emparejados.filter((m) => !m.esLaMisma).length,
      falsosNegativos: muestras.filter((m) => m.similitud < umbral && m.esLaMisma).length,
    })
  }
  return puntos
}
