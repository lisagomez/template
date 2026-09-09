/**
 * Deteccion de lecturas de un escaner optico. TAR-32.
 *
 * §2.12 del SDD: **el escaner no es un dispositivo, es un teclado.** No hay API que preguntarle, no
 * emite un evento propio, no se puede enumerar. Lo unico que llega son pulsaciones, y el problema
 * entero es distinguir «esto lo tecleo un aparato» de «esto lo esta escribiendo una persona».
 *
 * HAY DOS VIAS, Y NO SON IGUALES DE BUENAS:
 *
 *   1. **Prefijo y sufijo configurados en el aparato.** Determinista. El escaner antepone y añade
 *      caracteres que una persona no teclearia, y la deteccion deja de ser una estimacion. Casi
 *      todos los lectores lo soportan y se configura una vez, escaneando un codigo del manual.
 *   2. **Ráfaga por tiempos.** Heuristica. Falla en las dos direcciones: un mecanografo rapido
 *      dispara un falso positivo, y un escaner lento sobre un lector USB saturado dispara un falso
 *      negativo.
 *
 * Este modulo implementa la 1 como via principal y deja la 2 como **respaldo declarado**, que es
 * exactamente lo que pide TAR-32. Y por eso TAR-34 —fijar los parametros de la ráfaga— sigue
 * bloqueada sin que eso bloquee nada: la via buena no necesita medir nada.
 */
import { esRafagaDeEscaner } from '../codigos.js'
import type { OpcionesDeRafaga } from '../codigos.js'

export interface Pulsacion {
  /** El caracter. Las teclas especiales llegan con su nombre: `Enter`, `Tab`, `Shift`... */
  tecla: string
  /** `performance.now()` o `Date.now()`. Solo se usa para el respaldo por tiempos. */
  instante: number
}

export interface ConfiguracionDelEscaner {
  /** Lo que el aparato antepone. Vacio = no configurado, y entonces solo queda el respaldo. */
  prefijo: string
  /** Lo que añade al final. Casi siempre `Enter`. */
  sufijo: string
  /** Solo para el respaldo. Ausente = el respaldo esta DESACTIVADO, que es lo correcto sin medir. */
  rafaga?: OpcionesDeRafaga
}

export type ViaDeDeteccion = 'prefijo_sufijo' | 'rafaga'

export interface LecturaDetectada {
  carga: string
  via: ViaDeDeteccion
  /**
   * `true` solo con la via determinista. Con la heuristica va `false`, y quien la use tiene que
   * tratar la lectura como sospechosa — no como un dato confirmado.
   */
  fiable: boolean
}

/**
 * Extrae la carga de una secuencia de pulsaciones.
 *
 * Devuelve `null` cuando no reconoce una lectura, y eso incluye el caso de «puede que si pero no
 * estoy seguro». Un `null` hace que la pulsacion siga su camino normal hacia el campo de texto,
 * que es lo que quiere una persona escribiendo; un falso positivo se COME lo que estaba
 * escribiendo y lo manda a otro sitio, que es mucho mas molesto de lo que suena.
 */
export function detectaLectura(
  pulsaciones: readonly Pulsacion[],
  configuracion: ConfiguracionDelEscaner,
): LecturaDetectada | null {
  const texto = pulsaciones.map((p) => (p.tecla.length === 1 ? p.tecla : '')).join('')
  const teclas = pulsaciones.map((p) => p.tecla)

  // --- Via 1: determinista ---
  const { prefijo, sufijo } = configuracion
  if (prefijo.length > 0 || sufijo.length > 0) {
    const empieza = prefijo.length === 0 || texto.startsWith(prefijo)
    // El sufijo suele ser `Enter`, que no es un caracter: se busca en las teclas, no en el texto.
    const terminaConTecla = sufijo.length > 0 && teclas[teclas.length - 1] === sufijo
    const terminaConTexto = sufijo.length > 0 && sufijo.length === 1 && texto.endsWith(sufijo)
    const termina = sufijo.length === 0 || terminaConTecla || terminaConTexto
    if (empieza && termina) {
      const sinPrefijo = texto.slice(prefijo.length)
      const carga = terminaConTexto ? sinPrefijo.slice(0, -sufijo.length) : sinPrefijo
      if (carga.length > 0) return { carga, via: 'prefijo_sufijo', fiable: true }
    }
    // Configurado pero sin encajar: NO se cae al respaldo. Si el aparato esta configurado y esto
    // no lleva su marca, es que lo escribio una persona. Probar la heuristica despues seria
    // reintroducir por la puerta de atras justo los falsos positivos que la via 1 elimina.
    return null
  }

  // --- Via 2: respaldo, solo si esta declarado ---
  if (configuracion.rafaga === undefined) return null
  const instantes = pulsaciones.map((p) => p.instante)
  if (!esRafagaDeEscaner(instantes, configuracion.rafaga)) return null
  const carga = texto.trim()
  return carga.length === 0 ? null : { carga, via: 'rafaga', fiable: false }
}

/**
 * Si la configuracion depende de la heuristica. Sirve para AVISARLO en pantalla.
 *
 * Un escaner sin configurar funciona «casi siempre», y ese casi es el problema: nadie investiga un
 * fallo que ocurre una vez de cada cien lecturas. Decirlo de entrada empuja a configurar el
 * aparato, que es cinco minutos y lo arregla del todo.
 */
export function dependeDeLaHeuristica(configuracion: ConfiguracionDelEscaner): boolean {
  return configuracion.prefijo.length === 0 && configuracion.sufijo.length === 0
}

export function avisoDeConfiguracion(configuracion: ConfiguracionDelEscaner): string | null {
  if (!dependeDeLaHeuristica(configuracion)) return null
  if (configuracion.rafaga === undefined) {
    return 'El escaner no esta configurado y la deteccion por tiempos esta desactivada: no se detectara ninguna lectura. Configura un prefijo y un sufijo en el aparato.'
  }
  return 'El escaner no esta configurado: se esta adivinando por velocidad de tecleo, y eso falla en las dos direcciones. Configura un prefijo y un sufijo en el aparato.'
}
