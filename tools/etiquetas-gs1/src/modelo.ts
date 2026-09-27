/**
 * El modelo que persiste el almacen inyectado. Un solo documento versionado: sitios, catalogo,
 * bitacora de asignaciones (solo se anade), numeros emitidos (nunca se reusan), existencias por
 * lote y sitio, impresoras e importaciones.
 */
import type { Evento } from './cadena.js'
import type { Consumibles } from './consumibles.js'
import type { Conteo } from './conteo.js'
import type { PerfilImpresora } from './etiqueta.js'
import type { FormatoFecha, TipoFecha } from './fechas-impresas.js'
import type { Categoria } from './semaforo.js'

export type TipoSitio = 'cedis' | 'sucursal'

export interface Sitio {
  readonly clave: string
  readonly nombre: string
  readonly tipo: TipoSitio
  /** URL del agente local de impresion del sitio (p. ej. http://127.0.0.1:9180). */
  readonly agente?: string
  /** GLN del sitio (13 cifras, numerado con el prefijo de la casa): va en (414) de sus etiquetas de ubicacion. */
  readonly gln?: string
}

/** Zonas dentro de un sitio, en el orden en que viaja la mercancia. */
export type Zona = 'recibo' | 'almacen' | 'piso' | 'merma'

/** De donde salio cada codigo. Es la traza de la regla mixta. */
export type Regla =
  | 'fabricante'          // 1. el GTIN que trae el fabricante, se conserva
  | 'propio'              // 2. marca propia: numerado ahora con el prefijo de la empresa
  | 'propio-existente'    //    marca propia que ya tenia numero con nuestro prefijo
  | 'derivado-caja'       //    GTIN-14 de caja derivado de la pieza de marca propia (indicador 1-8)
  | 'igual-unidad'        //    la caja es la unidad de venta (1 pieza por caja)
  | 'interno'             // 3. sin nada: codigo de circulacion restringida, solo vale en la cadena
  | 'interno-existente'   //    codigo interno que ya existia

export type Nivel = 'unidad' | 'caja'

export interface Articulo {
  readonly sku: string
  readonly descripcion: string
  readonly categoria: string
  readonly sitios: readonly string[]
  readonly marcaPropia: boolean
  readonly gtinUnidad?: string
  readonly reglaUnidad?: Regla
  readonly gtinCaja?: string
  readonly reglaCaja?: Regla
  readonly unidadesPorCaja: number
  readonly cajasPorTarima?: number
  readonly vidaUtilDias?: number
  readonly notas: readonly string[]
}

export interface Asignacion {
  readonly gtin: string
  readonly sku: string
  readonly nivel: Nivel
  readonly regla: Regla
  readonly operador: string
  /** ISO con hora. */
  readonly fecha: string
  readonly importacion: string
  /** El codigo que tenia antes, si lo sustituye (p. ej. un interno que pasa a GTIN del fabricante). */
  readonly anterior?: string
}

export interface Configuracion {
  /** Prefijo de empresa GS1 (GCP) que GS1 Mexico asigno a la casa. Parametro de instalacion. */
  readonly prefijoEmpresa: string
  /** Prefijo de circulacion restringida: 04 (dentro de una empresa, lo que dice la norma) o 02/20-29. */
  readonly prefijoInterno: string
  /** Digito de extension del SSCC (0-9). */
  readonly extensionSscc: number
  readonly categorias: readonly Categoria[]
  /** Los umbrales siguen siendo los de ejemplo (nadie los ha fijado todavia). */
  readonly categoriasDeEjemplo: boolean
  readonly sitios: readonly Sitio[]
  /** Labelary saca el ZPL fuera de la empresa (C4): apagado salvo decision expresa. */
  readonly labelaryPermitido: boolean
}

export interface Contadores {
  readonly propio: number
  readonly interno: number
  readonly sscc: number
}

export type OrigenExistencia = 'etiquetado' | 'recepcion' | 'semilla' | 'conteo'

export interface Existencia {
  readonly id: string
  readonly sitio: string
  readonly sku: string
  readonly gtin: string
  readonly lote: string
  /** ISO `AAAA-MM-DD`. */
  readonly caducidad: string
  /** En cajas. */
  readonly cantidad: number
  readonly sscc?: string
  readonly origen: OrigenExistencia
  readonly actualizado: string
  /** Zona dentro del sitio. Sin zona (datos anteriores) cuenta como `recibo`. */
  readonly zona?: Zona
  /** Rack-nivel-posicion dentro del almacen (p. ej. `B-04-2`). */
  readonly posicion?: string
}

/** Bitacora de movimientos entre zonas (solo se anade). */
export interface Movimiento {
  readonly id: string
  readonly fecha: string
  readonly sitio: string
  readonly sku: string
  readonly gtin: string
  readonly lote: string
  readonly caducidad: string
  readonly cajas: number
  readonly de: readonly Zona[]
  readonly a: Zona
  readonly sscc?: string
  readonly operador: string
}

export interface Importacion {
  readonly id: string
  readonly archivo: string
  readonly huella: string
  readonly operador: string
  readonly fecha: string
  readonly resumen: Readonly<Record<string, number>>
}

export interface EstadoAlmacen {
  readonly version: number
  readonly configuracion: Configuracion
  readonly articulos: Readonly<Record<string, Articulo>>
  readonly asignaciones: readonly Asignacion[]
  /** Todo GTIN o SSCC que la casa emitio o registro como suyo. Nunca se reusa. */
  readonly emitidos: readonly string[]
  readonly contadores: Contadores
  readonly existencias: readonly Existencia[]
  readonly impresoras: readonly PerfilImpresora[]
  readonly importaciones: readonly Importacion[]
  /** Rollos, presupuestos y consumo. Opcional: los almacenes anteriores no lo traen. */
  readonly consumibles?: Consumibles
  /** Movimientos entre zonas. Opcional por la misma razon. */
  readonly movimientos?: readonly Movimiento[]
  /**
   * La cadena de eventos de cada sitio (solo se agrega). Es la fuente: existencias, zonas y
   * posiciones son su PROYECCION, y se comprueba que coincidan (`proyeccion.ts`).
   */
  readonly eventos?: Readonly<Record<string, readonly Evento[]>>
  /** Devoluciones al proveedor por rechazo en recepcion, con la evidencia. */
  readonly devoluciones?: readonly Devolucion[]
  /** Inventarios fisicos: sesiones de conteo ciego (el resultado entra a la cadena como CONTEO). */
  readonly conteos?: readonly Conteo[]
  /**
   * Fotos de los articulos (solo se agrega): la vigente de cada vista es la ultima. Cambiarla no
   * borra la anterior; la foto vive fuera (almacen de fotos, por su huella SHA-256).
   */
  readonly fotos?: readonly FotoArticulo[]
  /** Como imprime la fecha cada articulo, aprendido de la primera confirmacion (solo se agrega). */
  readonly formatosFecha?: readonly FormatoFechaArticulo[]
}

/** Vistas de la ficha: `caducidad` es la foto de DONDE viene impresa la fecha, con su nota. */
export type VistaFoto = 'principal' | 'frente' | 'etiqueta' | 'caja' | 'caducidad'

export interface FotoArticulo {
  readonly sku: string
  readonly vista: VistaFoto
  /** `sha256:<hex>` de la foto normalizada (sin EXIF). Vacia si `retirada`. */
  readonly huella: string
  readonly miniatura?: string
  readonly ancho?: number
  readonly alto?: number
  /** Para `caducidad`: donde esta impresa y como se ve mejor («cuello, por encima del liquido»). */
  readonly nota?: string
  /** La vista se quito (la foto anterior sigue en el historial). */
  readonly retirada?: boolean
  /** Seudonimo de quien la puso. */
  readonly operador: string
  readonly fecha: string
}

export interface FormatoFechaArticulo {
  readonly sku: string
  readonly formato: FormatoFecha
  readonly tipo: Exclude<TipoFecha, 'sin-rotulo'>
  readonly operador: string
  readonly fecha: string
  /** El RECIBIDO cuya confirmacion lo fijo. */
  readonly evento?: string
}

/** La devolucion que genera un rechazo en recepcion: lo leido, la regla y el evento que la prueba. */
export interface Devolucion {
  readonly folio: string
  readonly fecha: string
  readonly sitio: string
  readonly sku: string
  readonly gtin: string
  readonly lote: string
  readonly caducidad: string
  readonly cajas: number
  /** La lectura tal como se capturo (texto legible, con parentesis). */
  readonly lectura: string
  readonly diasRestantes: number
  readonly minimoDias: number
  readonly regla: string
  readonly evento: { readonly seq: number; readonly hash: string }
}
