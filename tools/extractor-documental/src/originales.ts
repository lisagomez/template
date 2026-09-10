/**
 * El fichero original como EVIDENCIA. Puro: compone rutas y decide vencimientos, no toca storage.
 *
 * Para una factura o una guia, el PDF o la foto SON la prueba; el markdown extraido no lo es.
 */

/**
 * Ruta del objeto en el bucket privado.
 *
 * La convencion la decide la politica de seguridad, no la estetica: la RLS de `storage.objects` se
 * escribe sobre `(storage.foldername(name))[1]`, asi que **el primer segmento tiene que ser aquello
 * por lo que se autoriza** — la organizacion. Con la persona ahi, el revisor no podria leer lo que
 * subio el operario.
 *
 * El hash como nombre deduplica el mismo fichero subido dos veces DENTRO de una organizacion. La
 * deduplicacion se detiene en esa frontera a proposito: compartir objetos entre organizaciones
 * ahorraria almacenamiento y filtraria informacion — A podria deducir que B tiene esa factura.
 */
export function rutaDeOriginal(organizacionId: string, sha256: string, extension: string): string {
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('El sha256 tiene que ser hexadecimal de 64 caracteres')
  if (organizacionId.trim().length === 0) throw new Error('Sin organizacion no se puede componer una ruta protegible')
  if (organizacionId.includes('/')) throw new Error('La organizacion no puede llevar "/": romperia el primer segmento')
  const ext = extension.replace(/^\./, '').toLowerCase()
  if (!EXTENSIONES.includes(ext)) throw new Error(`Extension no admitida: ${ext}`)
  return `${organizacionId}/${sha256}.${ext}`
}

/**
 * Sin `xml` aqui, un CFDI se aceptaria en la ingesta y reventaria justo al guardar su evidencia
 * — y para un comprobante fiscal el XML es MAS evidencia que el PDF: el PDF solo lo representa.
 */
const EXTENSIONES: readonly string[] = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff', 'heic', 'xml']

export function extensionPermitida(extension: string): boolean {
  return EXTENSIONES.includes(extension.replace(/^\./, '').toLowerCase())
}

/** La organizacion a la que pertenece un objeto, leida de su ruta. Espejo de la politica RLS. */
export function organizacionDeRuta(ruta: string): string | null {
  const primero = ruta.split('/')[0]
  return primero && primero !== ruta ? primero : null
}

/**
 * Retencion: conservar indefinidamente documentos con datos personales de terceros no es
 * comodidad, es una decision de impacto. Se declara el plazo; vencer NO borra nada solo — borrar
 * es irreversible y va por gate humano.
 */
export function venceRetencion(guardadoEn: string, dias: number, ahora: Date = new Date()): boolean {
  if (dias <= 0) throw new RangeError('El plazo de retencion tiene que ser positivo')
  const limite = Date.parse(guardadoEn) + dias * 86_400_000
  return ahora.getTime() >= limite
}
