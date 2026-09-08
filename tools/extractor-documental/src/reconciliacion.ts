/**
 * Reconciliacion de VALORES contra un catalogo existente. Puro, y el corazon de la herramienta.
 *
 * Mapear el campo "Proveedor" a la columna `facturas.proveedor_id` es lo facil: es elegir de una
 * lista. Lo dificil es resolver que "ACME S.A. de C.V." ES la fila 1874 de `proveedores` y no una
 * nueva. El alta automatica es como acaban conviviendo "ACME SA" y "ACME S.A. de C.V." como dos
 * proveedores distintos, con las facturas repartidas entre los dos y el saldo de ninguno cuadrando.
 * No falla ruidosamente: se descubre meses despues, cuando separarlas ya es un proyecto.
 *
 * Por eso aqui NO se decide nada: se ordenan candidatos y se etiqueta el resultado. Dar de alta es
 * de quien confirma.
 */

import type { FormatoDeCampo } from './tipos.js'
import { normalizaIdentificador } from './busqueda.js'

export type EstadoDeResolucion = 'resuelto' | 'ambiguo' | 'sin_resolver'

export interface FilaDeCatalogo {
  id: string
  etiqueta: string
}

export interface Candidato {
  fila: FilaDeCatalogo
  /** 0 a 1. */
  similitud: number
}

export interface Resolucion {
  estado: EstadoDeResolucion
  /** Ordenados de mas a menos parecido. Se muestran SIEMPRE, tambien al proponer un alta. */
  candidatos: readonly Candidato[]
  /** Solo cuando el estado es `resuelto`. En los otros dos casos es `null`, nunca "el mejor". */
  elegida: FilaDeCatalogo | null
}

/** Sufijos societarios: distinguen la forma juridica, no la entidad. Estorban al comparar. */
const SUFIJOS = /\b(s\s?a\s?p?i?|s\s?de\s?r\s?l|s\s?l|s\s?a|de\s?c\s?v|inc|ltd|llc|gmbh|bv)\b/g

/**
 * Normaliza para comparar: sin diacriticos, sin puntuacion, sin sufijos societarios, en minusculas.
 *
 * Se quitan los diacriticos porque "Muñoz" y "Munoz" son la misma empresa escrita por dos personas
 * distintas, y tratarlas como dos es exactamente el duplicado que este modulo existe para evitar.
 */
export function normaliza(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.,;:()"'`]/g, ' ')
    .replace(SUFIJOS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function bigramas(texto: string): readonly string[] {
  const t = ` ${texto} `
  return Array.from({ length: Math.max(0, t.length - 1) }, (_, i) => t.slice(i, i + 2))
}

/**
 * Coeficiente de Dice sobre bigramas: 1 identicos, 0 nada en comun.
 *
 * Se elige frente a la distancia de edicion porque tolera mejor el reordenamiento de palabras
 * ("Grupo ACME" / "ACME Grupo"), que es como la gente escribe los nombres de empresa.
 */
export function similitud(a: string, b: string): number {
  const na = normaliza(a)
  const nb = normaliza(b)
  if (na === nb) return na.length === 0 ? 0 : 1
  if (na.length === 0 || nb.length === 0) return 0
  const ba = bigramas(na)
  const restantes = new Map<string, number>()
  for (const g of bigramas(nb)) restantes.set(g, (restantes.get(g) ?? 0) + 1)
  let comunes = 0
  for (const g of ba) {
    const n = restantes.get(g) ?? 0
    if (n > 0) {
      comunes += 1
      restantes.set(g, n - 1)
    }
  }
  return (2 * comunes) / (ba.length + bigramas(nb).length)
}

export interface OpcionesDeResolucion {
  /**
   * Minimo para que una fila sea candidata. **Obligatorio a proposito**: no hay valor por defecto
   * defendible hasta medirlo sobre catalogos reales, y un default inventado falla en las dos
   * direcciones — llena la cola de falsos ambiguos, o deja pasar duplicados.
   */
  umbral: number
  /**
   * Si el segundo candidato queda a menos de esto del primero, el caso es `ambiguo` en vez de
   * `resuelto`: dos filas casi igual de parecidas son una decision humana, no un desempate.
   */
  margenDeAmbiguedad: number
  /** Cuantos candidatos devolver como maximo. La UI no puede pintar diez mil. */
  maximoCandidatos?: number
  /**
   * `texto` por defecto. Pasar `identificador` aqui es un ERROR y revienta: sirve para que quien
   * enrute campos genericamente no cuele un GTIN por la via difusa sin enterarse.
   */
  formato?: FormatoDeCampo
}

/**
 * Resuelve un valor extraido contra las filas de un catalogo.
 *
 * Nunca devuelve `elegida` en `ambiguo` ni en `sin_resolver`. Ofrecer "el mejor" en esos casos es
 * como el sello de goma se cuela: quien revisa acepta lo que ya viene rellenado.
 */
export function resuelveValor(
  valor: string,
  filas: readonly FilaDeCatalogo[],
  opciones: OpcionesDeResolucion,
): Resolucion {
  const { umbral, margenDeAmbiguedad, maximoCandidatos = 5, formato = 'texto' } = opciones
  // No es un aviso: es una barrera. Un GTIN y otro que difiere en un digito se parecen un 95%, y
  // emparejarlos por similitud mete stock en el SKU equivocado. Los identificadores van por
  // `resuelveIdentificador`, por igualdad exacta.
  if (formato === 'identificador') {
    throw new TypeError(
      'Un identificador no se resuelve por similitud: usa resuelveIdentificador(). ' +
        'Dos identificadores que difieren en un digito se parecen muchisimo y son cosas distintas.',
    )
  }
  if (umbral < 0 || umbral > 1) throw new RangeError('el umbral va entre 0 y 1')
  if (margenDeAmbiguedad < 0 || margenDeAmbiguedad > 1) throw new RangeError('el margen va entre 0 y 1')

  const candidatos = filas
    .map((fila) => ({ fila, similitud: similitud(valor, fila.etiqueta) }))
    .filter((c) => c.similitud >= umbral)
    .sort((a, b) => b.similitud - a.similitud)
    .slice(0, maximoCandidatos)

  if (candidatos.length === 0) return { estado: 'sin_resolver', candidatos: [], elegida: null }

  const segundo = candidatos[1]
  const empatan = segundo !== undefined && candidatos[0].similitud - segundo.similitud < margenDeAmbiguedad
  if (empatan) return { estado: 'ambiguo', candidatos, elegida: null }
  return { estado: 'resuelto', candidatos, elegida: candidatos[0].fila }
}

export interface AltaPropuesta {
  catalogo: string
  valor: string
  /** Los parecidos van CON la propuesta: es lo que hace que el duplicado salte a la vista. */
  candidatos: readonly Candidato[]
}

/**
 * Construye la propuesta de alta de un valor sin resolver. Devuelve un dato, no un efecto: aqui no
 * se escribe nada, y esa es la garantia entera.
 */
export function proponeAlta(catalogo: string, valor: string, resolucion: Resolucion): AltaPropuesta {
  if (resolucion.estado === 'resuelto') {
    throw new Error(`No se propone alta de "${valor}": ya se resolvio a una fila existente`)
  }
  return { catalogo, valor, candidatos: resolucion.candidatos }
}

/**
 * Resuelve un IDENTIFICADOR (GTIN, SSCC, RFC, numero de guia) por igualdad exacta.
 *
 * Se normaliza solo lo que no cambia la identidad: espacios y mayusculas. NO se quitan
 * diacriticos ni sufijos societarios como en `normaliza()` — en un identificador cada caracter
 * significa algo, y "limpiarlo" es corromperlo.
 *
 * Nunca devuelve candidatos parecidos: o esta, o no esta. Ofrecer "el mas parecido" para un
 * identificador es invitar a que alguien lo acepte.
 */
export function resuelveIdentificador(
  valor: string,
  filas: readonly FilaDeCatalogo[],
): Resolucion {
  // La misma normalizacion que usa el indice de busqueda, importada y no copiada: si divergieran,
  // la busqueda no encontraria lo que aqui si se resolvio, y el fallo seria invisible.
  const buscado = normalizaIdentificador(valor)
  const exactas = filas.filter((f) => normalizaIdentificador(f.etiqueta) === buscado)
  if (exactas.length === 1) {
    return { estado: 'resuelto', candidatos: [{ fila: exactas[0], similitud: 1 }], elegida: exactas[0] }
  }
  if (exactas.length > 1) {
    // El catalogo tiene el mismo identificador dos veces: es un problema del catalogo, no de la
    // lectura, y lo decide una persona.
    return {
      estado: 'ambiguo',
      candidatos: exactas.map((fila) => ({ fila, similitud: 1 })),
      elegida: null,
    }
  }
  return { estado: 'sin_resolver', candidatos: [], elegida: null }
}
