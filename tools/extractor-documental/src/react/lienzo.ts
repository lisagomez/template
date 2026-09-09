/**
 * Lienzo de modelado: las decisiones. TAR-23, RF-32 a RF-34.
 *
 * SOBRE `@xyflow/react`, y esto hay que decirlo tal cual: TAR-23 pedia **verificar primero** que
 * monta en React 19 y caer a SVG propio si no. Esa verificacion **no se ha hecho** — en este
 * entorno no esta instalado y no hay con que montar un componente (ni jsdom, ni testing-library,
 * ni navegador). Asi que no se afirma que falle: se afirma que **no se comprobo**, y se aplica el
 * respaldo que la propia tarea prevé. El SVG propio no arrastra dependencias, funciona en todos
 * los navegadores y se puede probar sin ninguno; si algun dia alguien verifica xyflow de verdad,
 * cambiarlo es sustituir la capa de pintado, no estas decisiones.
 *
 * DE POWER BI SE COPIA LA MITAD (§2.7). Se copia: una tarjeta por entidad, arrastrar una columna
 * sobre otra para crear la relacion, los indicadores `1` y `*` en los extremos, y la distincion
 * entre linea solida y punteada.
 *
 * NO se copia la direccion de filtro cruzado, y no es un recorte por tiempo: en Power BI describe
 * como se propagan los filtros al calcular agregaciones, que es un concepto de BI. Aqui lo que
 * existe es la cardinalidad y el sentido de la clave foranea. Traer esa perilla seria ofrecer un
 * control que no gobierna nada — y un control que no hace nada es peor que no tenerlo, porque
 * quien lo mueve cree haber decidido algo.
 */
import type { EntidadPropuesta, RelacionPropuesta } from '../modelo.js'
import type { DescriptorDeEsquema } from '../esquema.js'

export interface TarjetaDeEntidad {
  tabla: string
  columnas: readonly { nombre: string; tipo: string; esClave: boolean }[]
  /** `true` si la tabla ya existe en el proyecto: se pinta distinta y NO se puede editar. */
  preexistente: boolean
  x: number
  y: number
}

export interface LineaDeRelacion {
  desde: string
  hacia: string
  /** El `1` y el `*` de los extremos. El destino siempre es `1`: es la clave primaria. */
  cardinalidadOrigen: '1' | '*'
  cardinalidadDestino: '1'
  /**
   * Punteada cuando apunta a una tabla PREEXISTENTE: esa no se crea, se referencia. Solida cuando
   * las dos las propone el modelo. Es la misma convencion que Power BI y se entiende sin leyenda.
   */
  trazo: 'solida' | 'punteada'
  etiqueta: string
}

export interface Lienzo {
  tarjetas: readonly TarjetaDeEntidad[]
  lineas: readonly LineaDeRelacion[]
}

const ANCHO = 220
const SEPARACION_X = 300
const SEPARACION_Y = 40
const ALTO_FILA = 22
const ALTO_CABECERA = 34

export function altoDeTarjeta(tarjeta: TarjetaDeEntidad): number {
  return ALTO_CABECERA + tarjeta.columnas.length * ALTO_FILA
}

export const anchoDeTarjeta = (): number => ANCHO

/**
 * Coloca las tarjetas en dos columnas: lo PREEXISTENTE a la izquierda, lo propuesto a la derecha.
 *
 * No es estetica. Es la distincion que RF-27 pide hacer visible, y ponerla en la posicion —y no
 * solo en un color— la hace legible tambien para quien no distinga esos dos colores.
 */
export function construyeLienzo(
  entidades: readonly EntidadPropuesta[],
  relaciones: readonly RelacionPropuesta[],
  descriptor: DescriptorDeEsquema,
): Lienzo {
  const preexistentes = descriptor.tablas.map((tabla): TarjetaDeEntidad => ({
    tabla: tabla.nombre,
    columnas: tabla.columnas.map((c) => ({ nombre: c.nombre, tipo: c.tipo, esClave: c.esClavePrimaria === true })),
    preexistente: true,
    x: 0,
    y: 0,
  }))
  const propuestas = entidades.map((entidad): TarjetaDeEntidad => ({
    tabla: entidad.tabla,
    columnas: entidad.columnas.map((c) => ({ nombre: c.nombre, tipo: c.tipo, esClave: false })),
    preexistente: false,
    x: SEPARACION_X,
    y: 0,
  }))

  const apila = (tarjetas: TarjetaDeEntidad[]): TarjetaDeEntidad[] => {
    let y = 0
    return tarjetas.map((t) => {
      const colocada = { ...t, y }
      y += altoDeTarjeta(t) + SEPARACION_Y
      return colocada
    })
  }

  const lineas = relaciones.map((relacion): LineaDeRelacion => ({
    desde: relacion.desde,
    hacia: relacion.hacia,
    cardinalidadOrigen: relacion.cardinalidad,
    cardinalidadDestino: '1',
    trazo: relacion.haciaPreexistente ? 'punteada' : 'solida',
    etiqueta: `${relacion.columna} → ${relacion.hacia}.${relacion.hastaColumna}`,
  }))

  return { tarjetas: [...apila(preexistentes), ...apila(propuestas)], lineas }
}

export type ImpedimentoDeRelacion = 'misma_tabla' | 'destino_no_es_clave' | 'tipos_incompatibles'

/**
 * Si se puede crear la relacion que alguien acaba de arrastrar. RF-33 pide enseñar el detalle
 * ANTES de crearla, y esto es lo que ese detalle tiene que contener.
 *
 * Los tipos se comparan por FAMILIA y no por nombre exacto: `bigint` y `integer` son compatibles
 * como clave foranea, y rechazarlos por no llamarse igual seria un falso impedimento que obliga a
 * pelearse con la herramienta.
 */
export function impedimentosDeRelacion(
  origen: { tabla: string; tipo: string },
  destino: { tabla: string; tipo: string; esClave: boolean },
): readonly ImpedimentoDeRelacion[] {
  const faltan: ImpedimentoDeRelacion[] = []
  if (origen.tabla === destino.tabla) faltan.push('misma_tabla')
  if (!destino.esClave) faltan.push('destino_no_es_clave')
  if (familiaDeTipo(origen.tipo) !== familiaDeTipo(destino.tipo)) faltan.push('tipos_incompatibles')
  return faltan
}

export function familiaDeTipo(tipo: string): 'numero' | 'texto' | 'fecha' | 'otro' {
  const t = tipo.toLowerCase()
  if (/^(big)?(serial|int)|numeric|decimal|real|double/.test(t)) return 'numero'
  if (/char|text|uuid/.test(t)) return 'texto'
  if (/date|time/.test(t)) return 'fecha'
  return 'otro'
}
