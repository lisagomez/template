/**
 * El modelo que persiste el almacen inyectado. Un solo documento versionado: sitios, catalogo,
 * bitacora de asignaciones (solo se anade), numeros emitidos (nunca se reusan), existencias por
 * lote y sitio, impresoras e importaciones.
 */
import type { PerfilImpresora } from './etiqueta.js'
import type { Categoria } from './semaforo.js'

export type TipoSitio = 'cedis' | 'sucursal'

export interface Sitio {
  readonly clave: string
  readonly nombre: string
  readonly tipo: TipoSitio
  /** URL del agente local de impresion del sitio (p. ej. http://127.0.0.1:9180). */
  readonly agente?: string
}

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

export type OrigenExistencia = 'etiquetado' | 'recepcion' | 'semilla'

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
}
