/**
 * Dónde guarda la capa lo suyo cuando corre en la mesa del experto. La conversación (y cualquier otra clave) vive en la
 * memoria de la PESTAÑA: lo que escribe el experto no se guarda en su navegador, y al recargar se va. Lo que se queda es lo
 * que se corrió, en el almacén de la mesa, por la API y con su identidad.
 *
 * La única excepción es el estado del primer arranque: si ya vio la guía, en qué paso va y cuánto quiere que le pregunte
 * (un booleano, un número y una opción de tres; nunca texto suyo). Va al navegador para no enseñarle la guía en cada carga,
 * y se reescribe con sus campos conocidos (`leeEstado`): aunque algo escribiera otra cosa en esa clave, no pasaría.
 */
import { AlmacenEnMemoria, leeEstado, type Almacen } from '../../../../../tools/capa/dist/index.js'
import { AlmacenNavegador } from '../../../../../tools/capa/dist/react/index.js'

/** `capa/<producto>/<inquilino>/capa/primer-arranque`: la clave de la memoria de la capa para la guía. */
export const ES_PRIMER_ARRANQUE = /^capa\/[a-z0-9-]+\/[a-z0-9-]+\/capa\/primer-arranque$/
export const PREFIJO_EN_EL_NAVEGADOR = 'capa:soporte-sap:'

export class AlmacenCapaDeLaMesa implements Almacen {
  readonly pestana: Almacen = new AlmacenEnMemoria()
  readonly navegador: Almacen

  constructor(navegador?: Almacen) {
    this.navegador = navegador ?? new AlmacenNavegador(PREFIJO_EN_EL_NAVEGADOR)
  }

  private de(clave: string): Almacen {
    return ES_PRIMER_ARRANQUE.test(clave) ? this.navegador : this.pestana
  }

  lee(clave: string): Promise<string | null> {
    return this.de(clave).lee(clave)
  }

  async escribe(clave: string, valor: string): Promise<void> {
    if (!ES_PRIMER_ARRANQUE.test(clave)) return this.pestana.escribe(clave, valor)
    let estado: unknown = null
    try { estado = JSON.parse(valor) } catch { /* ilegible: la guía vuelve a empezar */ }
    return this.navegador.escribe(clave, JSON.stringify(leeEstado(estado)))
  }

  borra(clave: string): Promise<void> {
    return this.de(clave).borra(clave)
  }

  async claves(prefijo: string): Promise<string[]> {
    return [...new Set([...(await this.pestana.claves(prefijo)), ...(await this.navegador.claves(prefijo))])].sort()
  }
}
