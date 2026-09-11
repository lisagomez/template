/**
 * Clasificacion de lo que entra. Puro: recibe descripciones de archivo, no `File` ni `FileList`.
 *
 * Esa frontera es deliberada. Seleccionar una carpeta exige `input[webkitdirectory]` y arrastrarla
 * exige `DataTransferItem.webkitGetAsEntry()` con recorrido recursivo — dos API del DOM distintas.
 * Aqui llega el arbol ya aplanado, y por eso esto se prueba sin navegador.
 */
import type { ArchivoEntrante, Clasificacion, LimitesDelMotor, TipoDeArchivo } from './tipos.js'

const POR_EXTENSION: Readonly<Record<string, TipoDeArchivo>> = {
  pdf: 'pdf',
  png: 'imagen',
  jpg: 'imagen',
  jpeg: 'imagen',
  webp: 'imagen',
  tif: 'imagen',
  tiff: 'imagen',
  heic: 'imagen',
  xml: 'xml',
}

const POR_MIME: Readonly<Record<string, TipoDeArchivo>> = {
  'application/pdf': 'pdf',
  'image/png': 'imagen',
  'image/jpeg': 'imagen',
  'image/webp': 'imagen',
  'image/tiff': 'imagen',
  'image/heic': 'imagen',
  'application/xml': 'xml',
  'text/xml': 'xml',
}

// No se admite `text/plain` aunque Windows reporte asi algunos .xml: meteria cualquier .txt en la
// cola. El respaldo por extension de `tipoDe` ya cubre ese caso sin abrir la puerta.

function extensionDe(nombre: string): string {
  const punto = nombre.lastIndexOf('.')
  return punto === -1 ? '' : nombre.slice(punto + 1).toLowerCase()
}

/**
 * El MIME manda cuando viene; la extension es el respaldo. Al arrastrar una carpeta el navegador
 * a menudo no da MIME, y descartar por eso perderia archivos perfectamente validos.
 */
export function tipoDe(archivo: ArchivoEntrante): TipoDeArchivo | null {
  const porMime = archivo.tipoMime ? POR_MIME[archivo.tipoMime.toLowerCase()] : undefined
  return porMime ?? POR_EXTENSION[extensionDe(archivo.nombre)] ?? null
}

export function clasificaArchivo(archivo: ArchivoEntrante, limites?: LimitesDelMotor): Clasificacion {
  const tipo = tipoDe(archivo)
  if (tipo === null) {
    const ext = extensionDe(archivo.nombre)
    return { ...archivo, aceptado: false, motivo: `Formato no soportado${ext ? ` (.${ext})` : ''}: solo PDF, imagenes y XML` }
  }
  if (archivo.bytes <= 0) {
    return { ...archivo, aceptado: false, motivo: 'El archivo esta vacio' }
  }
  // El limite es DEL MOTOR, y un XML no pasa por ningun motor: se lee entero, en local y sin
  // coste. Rechazarlo por un tope que nunca se le va a aplicar seria rechazarlo por una razon
  // que no existe.
  if (limites && tipo !== 'xml' && archivo.bytes > limites.bytesMaximos) {
    const mb = (limites.bytesMaximos / 1_000_000).toFixed(0)
    return { ...archivo, aceptado: false, motivo: `Supera el limite del motor (${mb} MB)` }
  }
  return { ...archivo, aceptado: true, tipo }
}

export interface ResultadoDeIngesta {
  aceptados: readonly Clasificacion[]
  rechazados: readonly Clasificacion[]
}

/** Clasifica un arbol ya aplanado. Separa en dos listas porque la UI las pinta distinto. */
export function clasificaLote(
  archivos: readonly ArchivoEntrante[],
  limites?: LimitesDelMotor,
): ResultadoDeIngesta {
  const todos = archivos.map((a) => clasificaArchivo(a, limites))
  return {
    aceptados: todos.filter((c) => c.aceptado),
    rechazados: todos.filter((c) => !c.aceptado),
  }
}

/**
 * Trocea un documento en rangos de pagina que quepan en una peticion.
 *
 * Existe por el limite de 8 paginas de las anotaciones de documento: un expediente de 40 paginas
 * no se anota de una tacada, son cinco llamadas. El limite se pasa, no se asume.
 */
export function troceaPaginas(totalPaginas: number, porPeticion: number): readonly (readonly number[])[] {
  if (totalPaginas < 0) throw new RangeError('totalPaginas no puede ser negativo')
  if (porPeticion < 1) throw new RangeError('porPeticion tiene que ser al menos 1')
  const trozos: number[][] = []
  for (let inicio = 0; inicio < totalPaginas; inicio += porPeticion) {
    const fin = Math.min(inicio + porPeticion, totalPaginas)
    trozos.push(Array.from({ length: fin - inicio }, (_, i) => inicio + i))
  }
  return trozos
}

/** Detecta el tipo por los bytes y no por el nombre: un `.pdf` renombrado sigue siendo lo que es. */
export function tipoMimeDe(bytes: Uint8Array): string {
  const empieza = (...b: number[]) => b.every((v, i) => bytes[i] === v)
  if (empieza(0x25, 0x50, 0x44, 0x46)) return 'application/pdf'
  if (empieza(0x89, 0x50, 0x4e, 0x47)) return 'image/png'
  if (empieza(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (empieza(0x47, 0x49, 0x46, 0x38)) return 'image/gif'
  if (empieza(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57) return 'image/webp'
  return 'application/octet-stream'
}
