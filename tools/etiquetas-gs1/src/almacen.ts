/**
 * El almacen se INYECTA: el nucleo no sabe si detras hay un archivo JSON, IndexedDB o Postgres.
 * El contrato es un documento versionado y una transaccion que lo sustituye entero; quien
 * implemente sobre una base de datos lo traduce a filas (ver `migraciones/`).
 */
import { CATEGORIAS_EJEMPLO } from './semaforo.js'
import type { Configuracion, EstadoAlmacen } from './modelo.js'

export interface AlmacenEtiquetas {
  lee(): Promise<EstadoAlmacen>
  /** `cambia` recibe el estado vigente y devuelve el nuevo y un resultado. Serializado. */
  transaccion<T>(cambia: (estado: EstadoAlmacen) => { estado: EstadoAlmacen; resultado: T }): Promise<T>
}

export const CONFIGURACION_INICIAL: Configuracion = {
  prefijoEmpresa: '',
  prefijoInterno: '04',
  extensionSscc: 0,
  categorias: CATEGORIAS_EJEMPLO,
  categoriasDeEjemplo: true,
  sitios: [],
  labelaryPermitido: false,
}

export function estadoVacio(configuracion: Partial<Configuracion> = {}): EstadoAlmacen {
  return {
    version: 0,
    configuracion: { ...CONFIGURACION_INICIAL, ...configuracion },
    articulos: {},
    asignaciones: [],
    emitidos: [],
    contadores: { propio: 1, interno: 1, sscc: 1 },
    existencias: [],
    impresoras: [],
    importaciones: [],
  }
}

/** Almacen en memoria: pruebas y demos. Serializa las transacciones con una cola de promesas. */
export function almacenEnMemoria(inicial: EstadoAlmacen = estadoVacio()): AlmacenEtiquetas {
  let estado = inicial
  let cola: Promise<unknown> = Promise.resolve()
  return {
    async lee() { await cola; return estado },
    transaccion<T>(cambia: (e: EstadoAlmacen) => { estado: EstadoAlmacen; resultado: T }): Promise<T> {
      const paso = cola.then(() => {
        const r = cambia(estado)
        estado = r.estado
        return r.resultado
      })
      cola = paso.catch(() => undefined)
      return paso
    },
  }
}
