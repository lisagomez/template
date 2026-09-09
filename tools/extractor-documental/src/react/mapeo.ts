/**
 * Las decisiones del mapeo campo→columna y del valor huerfano. TAR-21 y TAR-22.
 *
 * §5.1 del SDD marca la jerarquia y conviene tenerla presente al leer esto: mapear el campo
 * «Proveedor» a la columna `facturas.proveedor_id` es la parte FACIL —es elegir de una lista—. Lo
 * dificil, y donde se gana o se pierde la herramienta, es resolver que «ACME S.A. de C.V.» **es la
 * fila 1874** de proveedores y no una nueva.
 *
 * Por eso este archivo no resuelve valores: eso ya lo hace `reconciliacion.ts`, probado. Aqui esta
 * lo que hace falta ENCIMA para que una persona pueda decidir: que columnas se ofrecen, como se
 * distingue lo que ya existe de lo que se propone, y que un alta no pueda escribirse sola.
 */
import type { DescriptorDeEsquema } from '../esquema.js'
import type { AltaPropuesta, FilaDeCatalogo, OpcionesDeResolucion, Resolucion } from '../reconciliacion.js'
import { parecidosA, proponeAlta, resuelveIdentificador, resuelveValor } from '../reconciliacion.js'
import type { CampoExtraido, FormatoDeCampo } from '../tipos.js'

export interface ColumnaOfrecida {
  tabla: string
  columna: string
  tipo: string
  /** `true` si la tabla ya existe en el proyecto. Es lo que RF-27 pide distinguir. */
  preexistente: boolean
  /** `true` si la tabla esta marcada como catalogo: contra ella se resuelven VALORES, no solo columnas. */
  esCatalogo: boolean
  etiqueta: string
}

/**
 * Las columnas que se le pueden ofrecer al revisor (RF-27).
 *
 * Todas vienen del descriptor, o sea de lo que el integrador DECLARO. No hay introspeccion, ni
 * falta: §2.6 explica que la unica via de introspeccion exige clave secreta, y una herramienta que
 * pide `service_role` para funcionar amplia el privilegio de forma permanente en todo proyecto que
 * la instale (C7). Un descriptor vacio devuelve lista vacia, y eso es un estado NORMAL: el
 * proyecto no tiene catalogos todavia (§2.8).
 */
export function columnasOfrecidas(descriptor: DescriptorDeEsquema): ColumnaOfrecida[] {
  return descriptor.tablas.flatMap((tabla) =>
    tabla.columnas.map((columna) => ({
      tabla: tabla.nombre,
      columna: columna.nombre,
      tipo: columna.tipo,
      preexistente: true,
      esCatalogo: tabla.esCatalogo === true,
      etiqueta: `${tabla.nombre}.${columna.nombre}`,
    })),
  )
}

export type EstadoDelMapeo = 'sin_mapear' | 'resuelto' | 'ambiguo' | 'sin_resolver'

export interface MapeoDeCampo {
  clave: string
  valor: string
  estado: EstadoDelMapeo
  /** La columna elegida por la persona. `null` mientras no elija: no se adivina. */
  destino: ColumnaOfrecida | null
  resolucion: Resolucion | null
  /**
   * El alta que se PROPONE, con sus parecidos al lado. `null` salvo en `sin_resolver`.
   * Que exista aqui no la escribe: es una propuesta, y RF-30 exige confirmacion explicita.
   */
  alta: AltaPropuesta | null
}

export interface OpcionesDeMapeo {
  /** Obligatorias: el umbral y el margen se miden (TAR-25), no se heredan de un default. */
  resolucion: OpcionesDeResolucion
  /** Filas del catalogo de destino. Vacio = catalogo sin filas, que resuelve a `sin_resolver`. */
  filas: readonly FilaDeCatalogo[]
}

/**
 * Resuelve el valor de un campo contra el catalogo de su columna destino.
 *
 * La bifurcacion por `formato` NO es una optimizacion: `resuelveValor` **lanza** ante un
 * identificador, a proposito, porque dos GTIN que difieren en un digito se parecen un 95 % y
 * emparejarlos mete stock en el SKU equivocado. Aqui se elige la via correcta antes de llamar.
 */
export function mapeaCampo(
  campo: CampoExtraido,
  destino: ColumnaOfrecida | null,
  opciones: OpcionesDeMapeo,
): MapeoDeCampo {
  const base = { clave: campo.clave, valor: campo.valor }
  if (destino === null) {
    return { ...base, estado: 'sin_mapear', destino: null, resolucion: null, alta: null }
  }

  const formato: FormatoDeCampo = campo.formato ?? 'texto'
  const resolucion =
    formato === 'identificador'
      ? resuelveIdentificador(campo.valor, opciones.filas)
      : resuelveValor(campo.valor, opciones.filas, opciones.resolucion)

  // Al proponer un alta, los parecidos NO pueden salir de la resolucion: si se propone es porque
  // ninguno alcanzo el umbral, asi que esa lista viene vacia por definicion. Se piden aparte con
  // `parecidosA`, que no filtra — sin eso el revisor da de alta "ACME Servicios Industriales" sin
  // ver que "ACME S.A. de C.V." ya existe, y el flujo que existe para evitar duplicados los crea.
  const alta =
    resolucion.estado === 'sin_resolver'
      ? {
          ...proponeAlta(destino.tabla, campo.valor, resolucion),
          candidatos: parecidosA(campo.valor, opciones.filas),
        }
      : null

  return { ...base, estado: resolucion.estado, destino, resolucion, alta }
}

/**
 * Lo que hay que confirmar antes de escribir nada (RF-30 · RF-19).
 *
 * Devuelve la lista de altas propuestas. Es una LISTA, no una accion: en este paquete no existe
 * ninguna funcion que las escriba, igual que no existe ninguna que ejecute el SQL del modelo. La
 * garantia de «ninguna ruta la escribe sin confirmacion» no se cumple prometiendola — se cumple
 * porque la ruta no esta.
 */
export function altasPendientes(mapeos: readonly MapeoDeCampo[]): readonly AltaPropuesta[] {
  return mapeos.map((m) => m.alta).filter((a): a is AltaPropuesta => a !== null)
}

/**
 * Si el conjunto de mapeos puede darse por terminado sin que una persona toque nada mas.
 *
 * `ambiguo` y `sin_resolver` bloquean, y `sin_mapear` tambien: un campo que nadie mapeo no es un
 * campo resuelto, y contarlo como tal es como se guardan documentos a medias creyendo que estan
 * completos.
 */
export function requiereDecisionHumana(mapeos: readonly MapeoDeCampo[]): boolean {
  return mapeos.some((m) => m.estado !== 'resuelto')
}
