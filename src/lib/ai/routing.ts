/**
 * Routing por nivel de tarea, para el lado de la app.
 *
 * Lee el MISMO catalogo que vigila `npm run verifica:routing`
 * (`.claude/routing-modelos.json`), para que la fabrica y el runtime no puedan discrepar:
 * dos tablas de modelos en el mismo repo divergen, siempre.
 *
 * La regla es eficiencia por REPARTO, no por recorte. Y el fallo silencioso que este modulo
 * existe para impedir es el de PRP-001: una clase de tarea que nadie asigno hereda el
 * default caro y nadie se entera nunca. Por eso `modeloPara` no acepta una cadena
 * cualquiera: solo las clases declaradas, y TypeScript lo comprueba en el build.
 */
import catalogo from '../../../.claude/routing-modelos.json'

export type Nivel = 'ligero' | 'capaz' | 'razonamiento'
export type ClaseDeTarea = Exclude<keyof typeof catalogo.tareas, `_${string}`>

export interface Precio {
  /** USD por millon de tokens de entrada. */
  entrada: number
  /** USD por millon de tokens de salida. */
  salida: number
  /** USD por millon leidos del cache de prefijo: una decima parte de la entrada. */
  lectura_cache: number
}

export interface Eleccion {
  modelo: string
  nivel: Nivel
  precio: Precio
}

/** El modelo que le toca a una clase de tarea, con su precio para poder costearla. */
export function modeloPara(tarea: ClaseDeTarea): Eleccion {
  const nivel = catalogo.tareas[tarea] as Nivel
  const cfg = catalogo.niveles[nivel]
  return { modelo: cfg.modelo, nivel, precio: cfg.precio }
}

/**
 * Coste estimado de una llamada, en USD.
 *
 * `cacheados` son tokens de entrada servidos desde el cache de prefijo, que cuestan la
 * decima parte. Separarlos no es un detalle: es donde esta el ahorro del prefijo estable.
 */
export function costeUsd(
  tarea: ClaseDeTarea,
  tokens: { entrada: number; salida: number; cacheados?: number },
): number {
  const { precio } = modeloPara(tarea)
  const cacheados = tokens.cacheados ?? 0
  const frescos = Math.max(0, tokens.entrada - cacheados)
  return (
    (frescos * precio.entrada + cacheados * precio.lectura_cache + tokens.salida * precio.salida) / 1_000_000
  )
}

/** Las clases que NO se abaratan: deciden sobre riesgo, dinero o datos de terceros. */
export const noSeAbaratan: readonly string[] = catalogo.no_se_abaratan.clases
