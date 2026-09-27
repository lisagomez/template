/**
 * Seudonimos de operador (Node). La cadena es inmutable y por eso NO guarda nombres: guarda
 * `op-xxxxxxxx`, aleatorio (no un hash del nombre, que se revierte probando nombres). El mapeo a
 * la persona vive en este archivo aparte, y `olvida` lo borra: la cadena sigue verificando, pero
 * ya nadie puede decir quien era.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'

export interface Seudonimos {
  /** El seudonimo de la persona; lo crea la primera vez. */
  de(persona: string): Promise<string>
  /** A quien corresponde un seudonimo (undefined si se olvido o nunca existio). */
  quien(seudonimo: string): Promise<string | undefined>
  /** Borra el mapeo de la persona (derecho de cancelacion). Devuelve si existia. */
  olvida(persona: string): Promise<boolean>
}

type Mapa = Record<string, string>

export function seudonimosEnArchivo(ruta: string): Seudonimos {
  let cola: Promise<unknown> = Promise.resolve()
  const carga = async (): Promise<Mapa> => {
    try { return JSON.parse(await readFile(ruta, 'utf8')) as Mapa } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {}
      throw e
    }
  }
  const guarda = async (m: Mapa): Promise<void> => {
    await mkdir(dirname(ruta), { recursive: true })
    const temporal = join(dirname(ruta), `.${randomBytes(6).toString('hex')}.tmp`)
    await writeFile(temporal, JSON.stringify(m, null, 1), { mode: 0o600 })
    await rename(temporal, ruta)
  }
  const serie = <T>(f: () => Promise<T>): Promise<T> => {
    const paso = cola.then(f)
    cola = paso.catch(() => undefined)
    return paso
  }
  const clave = (persona: string) => persona.trim().toLocaleLowerCase('es')
  return {
    de: (persona) => serie(async () => {
      const m = await carga()
      const k = clave(persona)
      if (m[k]) return m[k]
      const usados = new Set(Object.values(m))
      let s = ''
      do s = `op-${randomBytes(4).toString('hex')}`; while (usados.has(s))
      await guarda({ ...m, [k]: s })
      return s
    }),
    quien: (seudonimo) => serie(async () => Object.entries(await carga()).find(([, s]) => s === seudonimo)?.[0]),
    olvida: (persona) => serie(async () => {
      const m = await carga()
      const k = clave(persona)
      if (!m[k]) return false
      const { [k]: _fuera, ...resto } = m
      void _fuera
      await guarda(resto)
      return true
    }),
  }
}
