/**
 * `./almacenes/archivo`: versiones y alertas en archivos JSON de un directorio local (el laboratorio). Escritura
 * atómica (temporal + rename) y concurrencia optimista: si otra mano movió el tablero, se rechaza, no se pisa.
 */
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Alerta, AlmacenAlertas } from '../alertas.js'
import type { AlmacenVersiones, Historial } from '../versiones.js'

const seguro = (t: string) => { if (!/^[a-z0-9][a-z0-9_-]{0,60}$/.test(t)) throw new Error(`nombre de tablero inválido: ${t}`); return t }

async function leeJson<T>(ruta: string): Promise<T | null> {
  try { return JSON.parse(await readFile(ruta, 'utf8')) as T } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e }
}

async function escribe(ruta: string, datos: unknown): Promise<void> {
  const tmp = `${ruta}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, `${JSON.stringify(datos, null, 1)}\n`)
  await rename(tmp, ruta)
}

export function archivoVersiones(dir: string): AlmacenVersiones {
  const ruta = (t: string) => join(dir, `${seguro(t)}.json`)
  return {
    lee: (t) => leeJson<Historial>(ruta(t)),
    async guarda(h, esperada) {
      await mkdir(dir, { recursive: true })
      const previo = await leeJson<Historial>(ruta(h.tablero))
      if ((previo?.actual ?? null) !== esperada) throw new Error(`conflicto de versión en ${h.tablero}: se esperaba ${esperada} y hay ${previo?.actual ?? null}`)
      await escribe(ruta(h.tablero), h)
    },
    async lista() {
      try { return (await readdir(dir)).filter((f) => f.endsWith('.json') && !f.startsWith('_')).map((f) => f.slice(0, -5)).sort() } catch { return [] }
    },
  }
}

export function archivoAlertas(dir: string): AlmacenAlertas {
  const ruta = join(dir, '_alertas.json')
  return {
    async lista() { return (await leeJson<Alerta[]>(ruta)) ?? [] },
    async guarda(a) {
      await mkdir(dir, { recursive: true })
      const todas = ((await leeJson<Alerta[]>(ruta)) ?? []).filter((x) => x.id !== a.id)
      await escribe(ruta, [...todas, a])
    },
  }
}
