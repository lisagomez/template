/**
 * La memoria del PRODUCTO: lo que el producto recuerda entre sesiones, separado por inquilino. No es el
 * cerebro personal de nadie: ningún producto lo lee, y nada de aquí viaja a él (solo conteos, por `resumen`).
 *
 * Cada módulo lee y escribe solo las claves que su enchufe declara (`memoria.lee` / `memoria.escribe`). El
 * almacén se inyecta: en memoria (pruebas), en archivo (`./almacenes/archivo`, Node) o en el navegador
 * (`./react`). El núcleo no toca ni disco ni red.
 */
import { KEBAB } from './enchufe.js'

export interface Almacen {
  lee(clave: string): Promise<string | null>
  escribe(clave: string, valor: string): Promise<void>
  borra(clave: string): Promise<void>
  claves(prefijo: string): Promise<string[]>
}

export class AlmacenEnMemoria implements Almacen {
  readonly datos = new Map<string, string>()
  async lee(clave: string) { return this.datos.get(clave) ?? null }
  async escribe(clave: string, valor: string) { this.datos.set(clave, valor) }
  async borra(clave: string) { this.datos.delete(clave) }
  async claves(prefijo: string) { return [...this.datos.keys()].filter((k) => k.startsWith(prefijo)).sort() }
}

/** La capa misma guarda aquí la conversación, el primer arranque y los ajustes. */
export const MODULO_CAPA = 'capa'
/** Un recuerdo no es un archivo: lo que pase de esto va al almacén del módulo, no a la memoria. */
export const TOPE_BYTES = 64 * 1024

export type Permisos = Readonly<Record<string, { lee: readonly string[]; escribe: readonly string[] }>>

export class MemoriaNegada extends Error {
  constructor(mensaje: string) { super(mensaje); this.name = 'MemoriaNegada' }
}

export interface MemoriaProducto {
  readonly producto: string
  readonly inquilino: string
  recuerda(modulo: string, clave: string, valor: unknown): Promise<void>
  recuerdo<T = unknown>(modulo: string, clave: string): Promise<T | null>
  olvida(modulo: string, clave: string): Promise<void>
  lista(modulo?: string): Promise<Array<{ modulo: string; clave: string }>>
}

/** `clave` o `clave:sufijo`: el permiso se da por la clave base que declara el enchufe. */
const CLAVE = /^[a-z0-9]+(-[a-z0-9]+)*(:[a-z0-9-]{1,80})?$/
const base = (clave: string) => clave.split(':')[0] ?? clave

export function creaMemoria(o: { almacen: Almacen; producto: string; inquilino: string; permisos: Permisos }): MemoriaProducto {
  for (const [campo, valor] of [['producto', o.producto], ['inquilino', o.inquilino]] as const) {
    if (!KEBAB.test(valor)) throw new MemoriaNegada(`${campo} «${valor}» no es kebab-case`)
  }
  const prefijo = `capa/${o.producto}/${o.inquilino}/`
  const ruta = (modulo: string, clave: string) => `${prefijo}${modulo}/${clave}`
  const puede = (modulo: string, clave: string, para: 'lee' | 'escribe') => {
    if (!CLAVE.test(clave)) throw new MemoriaNegada(`clave «${clave}» inválida`)
    if (modulo === MODULO_CAPA) return
    const p = o.permisos[modulo]
    const declaradas = para === 'lee' ? [...(p?.lee ?? []), ...(p?.escribe ?? [])] : p?.escribe ?? []
    if (!declaradas.includes(base(clave))) throw new MemoriaNegada(`${modulo} no declara «${base(clave)}» en memoria.${para} de su enchufe`)
  }
  return {
    producto: o.producto,
    inquilino: o.inquilino,
    async recuerda(modulo, clave, valor) {
      puede(modulo, clave, 'escribe')
      const json = JSON.stringify(valor)
      if (json === undefined) throw new MemoriaNegada('solo se recuerda lo que cabe en JSON')
      if (new TextEncoder().encode(json).length > TOPE_BYTES) throw new MemoriaNegada(`más de ${TOPE_BYTES} bytes: eso va al almacén del módulo`)
      await o.almacen.escribe(ruta(modulo, clave), json)
    },
    async recuerdo(modulo, clave) {
      puede(modulo, clave, 'lee')
      const crudo = await o.almacen.lee(ruta(modulo, clave))
      return crudo === null ? null : JSON.parse(crudo)
    },
    async olvida(modulo, clave) {
      puede(modulo, clave, 'escribe')
      await o.almacen.borra(ruta(modulo, clave))
    },
    async lista(modulo) {
      const claves = await o.almacen.claves(modulo ? `${prefijo}${modulo}/` : prefijo)
      return claves.map((k) => k.slice(prefijo.length)).map((k) => ({ modulo: k.split('/')[0] ?? '', clave: k.split('/').slice(1).join('/') }))
    },
  }
}
