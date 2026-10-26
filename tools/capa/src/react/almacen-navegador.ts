/**
 * Almacén de la memoria del producto en el navegador (`localStorage`). Cada lectura y escritura va en
 * try/catch: en una ventana privada o con los datos bloqueados, la capa sigue funcionando en memoria y lo dice
 * (`persistente`), en vez de romperse.
 */
import type { Almacen } from '../memoria.js'

export class AlmacenNavegador implements Almacen {
  readonly prefijo: string
  persistente = true
  private readonly respaldo = new Map<string, string>()

  constructor(prefijo = 'capa:') {
    this.prefijo = prefijo
  }

  private local(): Storage | null {
    try {
      return typeof window === 'undefined' ? null : window.localStorage
    } catch {
      return null
    }
  }

  async lee(clave: string) {
    try {
      const v = this.local()?.getItem(this.prefijo + clave)
      if (v !== undefined && v !== null) return v
    } catch {
      this.persistente = false
    }
    return this.respaldo.get(clave) ?? null
  }

  async escribe(clave: string, valor: string) {
    this.respaldo.set(clave, valor)
    try {
      this.local()?.setItem(this.prefijo + clave, valor)
    } catch {
      this.persistente = false
    }
  }

  async borra(clave: string) {
    this.respaldo.delete(clave)
    try {
      this.local()?.removeItem(this.prefijo + clave)
    } catch {
      this.persistente = false
    }
  }

  async claves(prefijo: string) {
    const todas = new Set([...this.respaldo.keys()].filter((k) => k.startsWith(prefijo)))
    try {
      const ls = this.local()
      for (let i = 0; ls && i < ls.length; i++) {
        const k = ls.key(i)
        if (k?.startsWith(this.prefijo + prefijo)) todas.add(k.slice(this.prefijo.length))
      }
    } catch {
      this.persistente = false
    }
    return [...todas].sort()
  }
}
