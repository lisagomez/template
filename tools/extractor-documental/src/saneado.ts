/**
 * Saneado del texto que sale de un documento, ANTES de pintarlo, guardarlo o mandarselo a un modelo.
 *
 * QUE PROBLEMA RESUELVE, Y POR QUE NO LO RESUELVE `esc()`. Escapar HTML impide que el texto se
 * ejecute como marcado — necesario, y no basta. Quedan dos cosas que un escapador no ve:
 *
 *   1. **Ruido que ensucia.** Un PDF con fuentes embebidas cuela glifos sin mapear entre el texto
 *      bueno: caracteres de control que no se ven, se copian mal y contaminan un corpus.
 *   2. **Invisibles que ESCONDEN.** Y esto ya no es estetica. El guion suave (U+00AD) no se ve al
 *      renderizar, asi que una palabra partida con el se lee igual para una persona y para un
 *      modelo, pero **no coincide con ninguna busqueda literal**. Los overrides bidi (U+202A a
 *      U+202E) son peor: invierten el orden visual, asi que lo que se lee en pantalla puede no ser
 *      lo que hay en el dato. Un revisor aprueba lo que ve; lo que se guarda es otra cosa.
 *
 * Medido sobre un CFDI real: 2916 caracteres, de los que **45 eran controles** invisibles.
 *
 * Y una anecdota que vale como prueba de que el problema no es teorico: los dos primeros intentos
 * de escribir este archivo fueron RECHAZADOS por el arnes, porque el comando llevaba esos mismos
 * caracteres de control literales y "quedarian ocultos en el dialogo de aprobacion". El vector
 * existe, y no solo dentro de los PDF. Por eso aqui las clases van en escapes `\u`, nunca como
 * bytes literales: una regex con controles dentro es ilegible y no se puede revisar.
 *
 * LO QUE ESTE MODULO NO HACE, y es deliberado:
 *
 *   - **No quita caracteres imprimibles raros.** Ese mismo CFDI traia eszett, U con dieresis, thorn
 *     y varias vocales acentuadas sueltas — casi con seguridad glifos mal decodificados, pero los
 *     apellidos y topinomos que los usan de verdad son datos legitimos, y no hay forma de
 *     distinguirlos sin inventar. Borrarlos seria corromper un dato en silencio, que es justo lo
 *     que la capa 0 se niega a hacer.
 *   - **No decide si el texto es una instruccion.** Detectar intenciones por patrones es una
 *     carrera que se pierde. Lo que impide la inyeccion de prompt es de arquitectura —lo extraido
 *     entra como DATOS, jamas como instrucciones (§6 del SDD)—, y esto solo le quita al atacante la
 *     ofuscacion con la que evadiria cualquier revision, humana o automatica.
 *   - **No calla lo que quita.** Devuelve la cuenta. Un saneado silencioso es indistinguible de un
 *     documento que ya venia limpio, y esa diferencia importa: muchos invisibles en una factura es
 *     una senal, no un detalle de formato.
 */

/**
 * Controles C0 salvo tabulador (U+0009) y salto de linea (U+000A), mas DEL (U+007F) y los
 * controles C1 (U+0080 a U+009F). Ninguno de estos es jamas un dato: son restos de glifos sin
 * mapear.
 */
const CONTROLES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g

/**
 * Invisibles y marcas de formato con los que se esconde texto.
 *
 * U+00AD guion suave · U+180E separador mongol · U+200B a U+200D anchura cero ·
 * U+200E y U+200F marcas LTR/RTL · U+202A a U+202E **overrides bidi**, los que hacen que lo
 * mostrado no sea lo almacenado · U+2060 unificador · U+2066 a U+2069 aislantes direccionales ·
 * U+FEFF BOM.
 */
const INVISIBLES = /[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g

/** Espacio duro (U+00A0): se ve igual que un espacio y rompe las comparaciones de valores. */
const ESPACIO_DURO = /\u00A0/g

/**
 * Repertorio que aparece de verdad en un documento de negocio en espanol: letras ASCII, digitos,
 * espacio, puntuacion corriente y los acentos del castellano.
 */
const REPERTORIO = /[A-Za-z0-9 .,;:()\-\/$%#@*+=&'"!?\u00B0\u00BA\u00AA\u00E1\u00E9\u00ED\u00F3\u00FA\u00FC\u00F1\u00C1\u00C9\u00CD\u00D3\u00DA\u00DC\u00D1]/

/**
 * Fraccion minima del repertorio para que una LINEA cuente como texto.
 *
 * ESTE NUMERO ESTA MEDIDO, no elegido. Sobre el CFDI que destapo el caso, las 73 lineas se
 * reparten asi:
 *
 *     28 %, 33 %  ← las dos lineas de glifos mal decodificados
 *     (nada entre el 40 % y el 95 %)
 *     98 %-100 %  ← las 71 lineas de texto real
 *
 * Un abismo de 65 puntos porcentuales sin una sola linea dentro. Cualquier corte en ese hueco da
 * exactamente el mismo resultado, asi que el valor concreto no es una apuesta: 0,6 es su centro.
 *
 * Y NO es un umbral de los que esta casa se niega a fijar. TAR-17 y TAR-25 son umbrales sobre la
 * CALIDAD DE UN DATO —confianza y similitud— que dependen del motor y del catalogo de cada
 * proyecto, y que a ojo fallan en las dos direcciones. Esto es un criterio de FORMA sobre el
 * repertorio de caracteres, con la misma naturaleza que el `IMPRIMIBLE_MINIMO` que `capa-cero.ts`
 * ya usa. Aquellos siguen sin fijarse.
 */
const REPERTORIO_MINIMO = 0.6

/**
 * Por debajo de esta longitud una linea no se juzga, y pasa siempre.
 *
 * En una linea de dos o tres caracteres, uno raro dispara la fraccion y tiraria un dato corto y
 * perfectamente valido. Las dos lineas de basura del caso real tenian 28 y 56 caracteres.
 */
const LARGO_MINIMO_PARA_JUZGAR = 8

/** `true` si la linea parece texto de verdad y no un flujo de glifos. */
function pareceLineaDeTexto(linea: string): boolean {
  if (linea.length < LARGO_MINIMO_PARA_JUZGAR) return true
  const dentro = [...linea].filter((c) => REPERTORIO.test(c)).length
  return dentro / linea.length >= REPERTORIO_MINIMO
}

export interface TextoSaneado {
  texto: string
  /** Cuantos controles se quitaron. */
  controles: number
  /** Cuantos invisibles se quitaron. Un numero alto aqui NO es ruido: es una senal. */
  invisibles: number
  /** Lineas vacias o de un solo caracter suelto que se descartaron. */
  lineasVacias: number
  /**
   * Las lineas que se descartaron por no parecer texto, CONSERVADAS.
   *
   * No se tiran: descartar en silencio es indistinguible de no haber tenido nunca ese contenido, y
   * si alguna vez el criterio se equivoca con una linea legitima, esto es lo unico que permite
   * verlo. Quien pinte esto puede ofrecer mirarlas.
   */
  lineasDescartadas: readonly string[]
}

/** `true` si se toco algo. Para decidir si hay que avisar, sin comparar cadenas enteras. */
export function huboCambios(resultado: TextoSaneado): boolean {
  return (
    resultado.controles > 0 ||
    resultado.invisibles > 0 ||
    resultado.lineasVacias > 0 ||
    resultado.lineasDescartadas.length > 0
  )
}

/**
 * Sanea el texto de un documento. Puro y sin dependencias, como todo el nucleo.
 *
 * El orden importa: primero se cuentan y quitan los invisibles —antes de tocar los espacios, para
 * que un guion suave metido DENTRO de una palabra no se confunda con separacion— y despues se
 * normaliza el espaciado.
 */
export function saneaTextoExtraido(texto: string): TextoSaneado {
  const controles = (texto.match(CONTROLES) ?? []).length
  const invisibles = (texto.match(INVISIBLES) ?? []).length

  let salida = texto.replace(INVISIBLES, '').replace(CONTROLES, '')
  salida = salida.replace(ESPACIO_DURO, ' ')
  // El retorno de carro suelto de un PDF no es una linea nueva de nadie.
  salida = salida.replace(/\r\n?/g, '\n')

  const antes = salida.split('\n')
  /**
   * Se descartan las lineas vacias, y las de un solo caracter SOLO si ese caracter no es del
   * repertorio.
   *
   * La primera version tiraba toda linea de un caracter, y se llevaba por delante datos de verdad:
   * en un CFDI real desaparecian el simbolo de moneda, un "+" y un digito suelto de una tabla de
   * importes. Un glifo suelto ilegible si es basura; un "$" no. La diferencia la marca el
   * repertorio, que es el mismo criterio que ya decide por linea mas abajo.
   */
  const conContenido = antes
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l) => l.length > 1 || (l.length === 1 && REPERTORIO.test(l)))
  const lineasVacias = antes.length - conContenido.length

  // Y ahora por LINEA, no por caracter. Un glifo suelto podria ser un dato; una linea entera fuera
  // del repertorio no lo es. Juzgar la linea permite tirar la basura sin tocar los caracteres
  // raros que si aparecen dentro de texto legitimo.
  const lineas = conContenido.filter(pareceLineaDeTexto)
  const lineasDescartadas = conContenido.filter((l) => !pareceLineaDeTexto(l))

  return { texto: lineas.join('\n'), controles, invisibles, lineasVacias, lineasDescartadas }
}

/**
 * Resumen en espanol de lo que se quito, para ensenarselo a una persona.
 *
 * Devuelve `null` cuando no se toco nada: asi quien lo use no tiene que decidir si hay algo que
 * decir, y no se pinta un aviso vacio.
 */
export function resumenDeSaneado(resultado: TextoSaneado): string | null {
  if (!huboCambios(resultado)) return null
  const partes: string[] = []
  if (resultado.controles > 0) partes.push(`${resultado.controles} caracter(es) de control`)
  if (resultado.invisibles > 0) {
    partes.push(`${resultado.invisibles} invisible(s) — revisa este documento: los invisibles esconden texto`)
  }
  if (resultado.lineasVacias > 0) partes.push(`${resultado.lineasVacias} linea(s) sin contenido`)
  if (resultado.lineasDescartadas.length > 0) {
    partes.push(`${resultado.lineasDescartadas.length} linea(s) que no parecen texto`)
  }
  return `Se limpiaron ${partes.join(' · ')}`
}
