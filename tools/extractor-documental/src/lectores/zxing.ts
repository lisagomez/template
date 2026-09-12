/**
 * `LectorDeCodigos` para SERVIDOR (Node), sobre `zxing-wasm`.
 *
 * Es el hermano de `react/camara.ts`: aquel lee de una camara en el navegador; este lee los
 * codigos que ya estan dentro de una imagen de pagina. Existe porque las hojas oficiales de un
 * expediente —constancia de CURP, constancia de situacion fiscal— llevan el identificador en un
 * QR, exacto, y leerlo cuesta milisegundos frente a segundos de OCR. Medido el 2026-09-11: 14 de 84
 * paginas de 4 expedientes traian codigo.
 *
 * DOS REGLAS. (1) `zxing-wasm` es peerDependency OPCIONAL y se carga con `import()` dinamico
 * dentro de `lee`, nunca arriba: quien no lea codigos no lo instala. (2) EN NODE NO SE SALE A LA
 * RED: por defecto, `zxing-wasm` va a buscar su `.wasm` a un CDN. Aqui se le inyecta el binario
 * leido del propio paquete. Una prueba de contrato vigila que este archivo no mencione ningun CDN.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { LectorDeCodigos } from '../puertos.js'

export interface LecturaDeZxing {
  readonly text: string
  readonly format: string
  readonly isValid: boolean
}

/** Lo que este adaptador usa del modulo, y nada mas. Inyectable para probar sin el peer. */
export interface ModuloZxing {
  readBarcodes(
    imagen: Uint8Array | ArrayBuffer,
    opciones?: { formats?: readonly string[]; tryHarder?: boolean },
  ): Promise<readonly LecturaDeZxing[]>
  prepareZXingModule(opciones: { overrides?: { wasmBinary?: ArrayBuffer }; fireImmediately?: boolean }): unknown
}

export interface OpcionesDelLectorZxing {
  /** Nombres de zxing: 'QRCode', 'DataMatrix', 'PDF417', 'Code128'... Por defecto QR y Code128. */
  readonly formatos?: readonly string[]
  readonly tryHarder?: boolean
  /** Como se obtiene el modulo. Por defecto `import('zxing-wasm/reader')`. */
  readonly carga?: () => Promise<ModuloZxing>
  /** De donde sale el binario wasm. Por defecto, del propio paquete instalado. */
  readonly wasm?: () => Promise<ArrayBuffer>
}

export interface LectorZxing extends LectorDeCodigos {
  cargado(): boolean
}

const FORMATOS_POR_DEFECTO: readonly string[] = ['QRCode', 'Code128']

async function cargaPorDefecto(): Promise<ModuloZxing> {
  // El cast es deliberado: los tipos del paquete no se importan para no obligar a instalarlo.
  return (await import(/* @vite-ignore */ 'zxing-wasm/reader')) as unknown as ModuloZxing
}

async function wasmDelPaquete(): Promise<ArrayBuffer> {
  const ruta = fileURLToPath(import.meta.resolve('zxing-wasm/reader/zxing_reader.wasm'))
  const bytes = await readFile(ruta)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

export function lectorZxing(opciones: OpcionesDelLectorZxing = {}): LectorZxing {
  const formatos = opciones.formatos ?? FORMATOS_POR_DEFECTO
  const carga = opciones.carga ?? cargaPorDefecto
  const wasm = opciones.wasm ?? wasmDelPaquete
  let modulo: Promise<ModuloZxing> | null = null

  const prepara = async (): Promise<ModuloZxing> => {
    const m = await carga()
    m.prepareZXingModule({ overrides: { wasmBinary: await wasm() }, fireImmediately: true })
    return m
  }

  return {
    formatos,
    cargado: () => modulo !== null,
    async lee(imagen: Uint8Array): Promise<readonly string[]> {
      modulo ??= prepara()
      const m = await modulo
      const lecturas = await m.readBarcodes(imagen, { formats: formatos, tryHarder: opciones.tryHarder ?? true })
      // Cargas crudas: interpretarlas es de `analizaCarga`, no de aqui.
      return lecturas.filter((l) => l.isValid && l.text.length > 0).map((l) => l.text)
    },
  }
}
