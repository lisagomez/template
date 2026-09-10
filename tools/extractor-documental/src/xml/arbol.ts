/**
 * El arbol de un XML, con los espacios de nombres RESUELTOS. Puro, y sin recursion.
 *
 * LA REGLA QUE ORDENA EL MODULO: se resuelve por la direccion del espacio de nombres, jamas por el
 * prefijo.
 *
 * `cfdi:` es una convencion de quien emitio el documento, no una norma. El mismo comprobante puede
 * venir con `c:`, con `t:`, o sin prefijo declarando el espacio por defecto, y sigue siendo el
 * mismo esquema. Un lector que busque la cadena "cfdi:Comprobante" funciona con los XML del emisor
 * con el que se probo y falla en silencio con el siguiente — y "en silencio" aqui significa cero
 * campos, que es indistinguible de un documento vacio.
 *
 * LA OTRA REGLA, la que casi todo el mundo se salta: un atributo SIN prefijo no esta en el espacio
 * por defecto, esta en NINGUNO. `xmlns="...cfd/4"` pone al elemento `Comprobante` en ese espacio,
 * pero NO pone ahi a su atributo `Total`. Quien lo confunde busca `Total` dentro del espacio del
 * SAT, no lo encuentra en ningun documento del mundo, y acaba culpando al emisor.
 *
 * El arbol se construye con una pila explicita, no con llamadas recursivas. Asi un XML de cien mil
 * niveles no desborda nada, y NO hace falta inventar un limite de profundidad — que seria
 * exactamente el umbral sin medir que esta casa se niega a fijar.
 */
import { analizaLexico } from './lexico.js'
import type { Pieza } from './lexico.js'

/** El espacio que el estandar preliga al prefijo `xml`, sin que nadie lo declare. */
const ESPACIO_XML = 'http://www.w3.org/XML/1998/namespace'

export interface Atributo {
  /**
   * La direccion del espacio, o `null`.
   *
   * `null` es lo NORMAL, no un fallo: un atributo sin prefijo no pertenece a ningun espacio.
   */
  readonly espacio: string | null
  readonly nombreLocal: string
  /** Como venia escrito. Solo para ensenarselo a una persona; nunca para resolver. */
  readonly prefijo: string | null
  readonly valor: string
}

export interface Elemento {
  readonly espacio: string | null
  readonly nombreLocal: string
  readonly prefijo: string | null
  readonly atributos: readonly Atributo[]
  readonly hijos: readonly Elemento[]
  /** El texto directo del elemento, ya decodificado. En un comprobante solo lo llevan las hojas. */
  readonly texto: string
  readonly linea: number
}

export interface DocumentoXml {
  readonly raiz: Elemento
  /**
   * Los espacios declarados en la raiz, por prefijo. La cadena vacia es el espacio por defecto.
   *
   * Sirve para diagnosticar un documento que no se reconoce: lo primero que hay que mirar cuando
   * un CFDI "no es un CFDI" es que direccion declaro de verdad.
   */
  readonly espaciosEnLaRaiz: Readonly<Record<string, string>>
}

function malFormado(mensaje: string, linea: number): never {
  throw new SyntaxError(`XML mal formado en la linea ${linea}: ${mensaje}`)
}

function parte(nombre: string): { prefijo: string | null; local: string } {
  const dosPuntos = nombre.indexOf(':')
  if (dosPuntos === -1) return { prefijo: null, local: nombre }
  return { prefijo: nombre.slice(0, dosPuntos), local: nombre.slice(dosPuntos + 1) }
}

/** Lo que se esta construyendo. Mutable a proposito, y privado: lo publico sale ya de solo lectura. */
interface EnObra {
  espacio: string | null
  nombreLocal: string
  prefijo: string | null
  atributos: Atributo[]
  hijos: Elemento[]
  texto: string
  linea: number
}

type Ambito = Readonly<Record<string, string>>

/**
 * Las declaraciones `xmlns` de esta etiqueta, encima de las que ya habia.
 *
 * Se resuelven ANTES que el nombre del propio elemento, porque un elemento puede declarar el
 * espacio en el que el mismo esta. Y `xmlns=""` deshace el espacio por defecto en lugar de
 * declarar uno vacio, que es una diferencia que importa dentro de una addenda.
 */
function ambitoDe(pieza: Pieza & { tipo: 'apertura' }, padre: Ambito): Ambito {
  let propias: Record<string, string> | null = null
  for (const atributo of pieza.atributos) {
    if (atributo.nombre === 'xmlns') {
      propias ??= { ...padre }
      if (atributo.valor === '') delete propias['']
      else propias[''] = atributo.valor
    } else if (atributo.nombre.startsWith('xmlns:')) {
      const prefijo = atributo.nombre.slice(6)
      if (prefijo.length === 0) malFormado('una declaracion "xmlns:" sin prefijo', pieza.linea)
      propias ??= { ...padre }
      propias[prefijo] = atributo.valor
    }
  }
  return propias ?? padre
}

function resuelve(prefijo: string | null, ambito: Ambito, linea: number, que: string): string | null {
  if (prefijo === null) return null
  if (prefijo === 'xml') return ESPACIO_XML
  const direccion = ambito[prefijo]
  if (direccion === undefined) {
    // No es un nombre local con dos puntos dentro: es un documento roto. Tratarlo como nombre
    // haria que el elemento no case con ningun esquema y nadie sabria por que.
    malFormado(`el prefijo "${prefijo}:" de ${que} no esta declarado en ningun ambito`, linea)
  }
  return direccion
}

function atributosDe(pieza: Pieza & { tipo: 'apertura' }, ambito: Ambito): Atributo[] {
  const salida: Atributo[] = []
  for (const crudo of pieza.atributos) {
    if (crudo.nombre === 'xmlns' || crudo.nombre.startsWith('xmlns:')) continue
    const { prefijo, local } = parte(crudo.nombre)
    salida.push({
      // Sin prefijo, NINGUN espacio. Nunca el de por defecto: ver la cabecera del modulo.
      espacio: resuelve(prefijo, ambito, pieza.linea, `el atributo "${crudo.nombre}"`),
      nombreLocal: local,
      prefijo,
      valor: crudo.valor,
    })
  }
  return salida
}

function cierra(obra: EnObra): Elemento {
  return {
    espacio: obra.espacio,
    nombreLocal: obra.nombreLocal,
    prefijo: obra.prefijo,
    atributos: obra.atributos,
    hijos: obra.hijos,
    texto: obra.texto,
    linea: obra.linea,
  }
}

/** Convierte el XML en arbol. Lanza si esta mal formado; ver la cabecera de `lexico.ts`. */
export function analizaXml(fuente: string): DocumentoXml {
  const piezas = analizaLexico(fuente)
  const pila: EnObra[] = []
  const ambitos: Ambito[] = []
  let raiz: Elemento | null = null
  let espaciosEnLaRaiz: Ambito = {}

  for (const pieza of piezas) {
    if (pieza.tipo === 'texto') {
      const abierto = pila[pila.length - 1]
      if (abierto === undefined) {
        malFormado('hay texto fuera del elemento raiz', pieza.linea)
      }
      abierto.texto += pieza.valor
      continue
    }

    if (pieza.tipo === 'apertura') {
      if (raiz !== null && pila.length === 0) {
        malFormado('un XML tiene un solo elemento raiz, y aqui hay un segundo', pieza.linea)
      }
      const padre = ambitos[ambitos.length - 1] ?? {}
      const ambito = ambitoDe(pieza, padre)
      if (pila.length === 0) espaciosEnLaRaiz = ambito
      const { prefijo, local } = parte(pieza.nombre)
      const obra: EnObra = {
        espacio:
          prefijo === null
            ? (ambito[''] ?? null)
            : resuelve(prefijo, ambito, pieza.linea, `el elemento <${pieza.nombre}>`),
        nombreLocal: local,
        prefijo,
        atributos: atributosDe(pieza, ambito),
        hijos: [],
        texto: '',
        linea: pieza.linea,
      }
      if (pieza.vacio) {
        const terminado = cierra(obra)
        const padreEnObra = pila[pila.length - 1]
        if (padreEnObra === undefined) raiz = terminado
        else padreEnObra.hijos.push(terminado)
        continue
      }
      pila.push(obra)
      ambitos.push(ambito)
      continue
    }

    const abierto = pila.pop()
    ambitos.pop()
    if (abierto === undefined) {
      malFormado(`se cierra </${pieza.nombre}> sin que nada lo hubiera abierto`, pieza.linea)
    }
    const esperado = abierto.prefijo === null ? abierto.nombreLocal : `${abierto.prefijo}:${abierto.nombreLocal}`
    if (esperado !== pieza.nombre) {
      malFormado(`se abrio <${esperado}> y se cierra </${pieza.nombre}>`, pieza.linea)
    }
    const terminado = cierra(abierto)
    const padreEnObra = pila[pila.length - 1]
    if (padreEnObra === undefined) raiz = terminado
    else padreEnObra.hijos.push(terminado)
  }

  if (pila.length > 0) {
    const sinCerrar = pila[pila.length - 1]
    malFormado(`el elemento <${sinCerrar.nombreLocal}> se abrio y nunca se cerro`, sinCerrar.linea)
  }
  if (raiz === null) throw new SyntaxError('XML sin ningun elemento: no hay documento que leer')

  return { raiz, espaciosEnLaRaiz: espaciosEnLaRaiz }
}

// --- Navegacion ---------------------------------------------------------------------------------
// Siempre por direccion y nombre local. No hay ninguna funcion que busque por prefijo, y esa
// ausencia es deliberada: la que existe es la que se acaba usando.

export function hijos(elemento: Elemento, espacio: string, nombreLocal: string): readonly Elemento[] {
  return elemento.hijos.filter((h) => h.espacio === espacio && h.nombreLocal === nombreLocal)
}

export function hijo(elemento: Elemento, espacio: string, nombreLocal: string): Elemento | null {
  return elemento.hijos.find((h) => h.espacio === espacio && h.nombreLocal === nombreLocal) ?? null
}

/** Para los atributos normales, que NO estan en ningun espacio. Es el caso de todo el CFDI. */
export function atributo(elemento: Elemento, nombreLocal: string): string | null {
  const encontrado = elemento.atributos.find((a) => a.espacio === null && a.nombreLocal === nombreLocal)
  return encontrado === undefined ? null : encontrado.valor
}

/** Para el caso raro del atributo con prefijo, como `xsi:schemaLocation`. */
export function atributoConEspacio(
  elemento: Elemento,
  espacio: string,
  nombreLocal: string,
): string | null {
  const encontrado = elemento.atributos.find(
    (a) => a.espacio === espacio && a.nombreLocal === nombreLocal,
  )
  return encontrado === undefined ? null : encontrado.valor
}
