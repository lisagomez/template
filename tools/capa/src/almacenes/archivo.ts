/**
 * Almacén de la memoria del producto en un archivo JSON (Node). Escribe a un temporal y renombra: un corte a
 * medias deja el archivo anterior, nunca uno roto. Una sola instancia por archivo (sin bloqueo entre procesos).
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Almacen } from '../memoria.js'

export class AlmacenEnArchivo implements Almacen {
  readonly ruta: string
  private cola: Promise<unknown> = Promise.resolve()

  constructor(ruta: string) {
    this.ruta = ruta
  }

  private async todo(): Promise<Record<string, string>> {
    try {
      return JSON.parse(await readFile(this.ruta, 'utf8')) as Record<string, string>
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {}
      throw e
    }
  }

  /** Las escrituras van en fila: dos `escribe` seguidos no se pisan. */
  private cambia(fn: (d: Record<string, string>) => void): Promise<void> {
    const siguiente = this.cola.then(async () => {
      const datos = await this.todo()
      fn(datos)
      await mkdir(dirname(this.ruta), { recursive: true })
      const temporal = `${this.ruta}.${process.pid}.tmp`
      await writeFile(temporal, `${JSON.stringify(datos, null, 2)}\n`)
      await rename(temporal, this.ruta)
    })
    this.cola = siguiente.catch(() => undefined)
    return siguiente
  }

  async lee(clave: string) { await this.cola; return (await this.todo())[clave] ?? null }
  escribe(clave: string, valor: string) { return this.cambia((d) => { d[clave] = valor }) }
  borra(clave: string) { return this.cambia((d) => { delete d[clave] }) }
  async claves(prefijo: string) { await this.cola; return Object.keys(await this.todo()).filter((k) => k.startsWith(prefijo)).sort() }
}
