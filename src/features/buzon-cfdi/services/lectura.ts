/**
 * El núcleo del buzón, puro (spec 015, fase 4): qué es cada documento leído, si es de la pyme, cómo se empareja
 * un XML con su impresa, qué falta revisar y cómo salen los confirmados. Sin red ni base: lo prueba `prueba:buzon`.
 *
 * La base vuelve a exigir lo que importa (RF-12, RF-13, RF-17): esto lo dice antes y en español.
 */
import type { ResultadoDeExtraccion } from '../../a2a/esquema.ts'
import type { CampoLeido, Discrepancia, DocumentoDelBuzon, EstadoDeDocumento, TipoDeDocumento } from '../types/index.ts'

/** Lo que trae el código QR de una impresa: lo único que se coteja contra el XML (RF-14). */
export const CLAVES_DE_COTEJO = ['uuid', 'rfc_emisor', 'rfc_receptor', 'total'] as const

const valorDe = (campos: readonly CampoLeido[], clave: string): string | null => {
  const v = campos.find((c) => c.clave === clave)?.valor.trim()
  return v ? v : null
}
const comoTexto = (v: string) => v.trim().toUpperCase()
const comoImporte = (v: string): number | null => {
  const n = Number(v.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : null
}
const iguales = (clave: string, a: string, b: string): boolean => {
  if (clave === 'total') {
    const [x, y] = [comoImporte(a), comoImporte(b)]
    return x !== null && y !== null && Math.abs(x - y) < 0.005
  }
  return comoTexto(a) === comoTexto(b)
}

export interface Clasificacion {
  readonly tipo: TipoDeDocumento
  readonly ruta: string
  readonly uuid: string | null
  readonly rfc_receptor: string | null
  readonly campos: CampoLeido[]
  readonly estado: Extract<EstadoDeDocumento, 'en_revision' | 'receptor_ajeno'>
  readonly avisos: string[]
}

/**
 * Lo que es un documento recién leído. El XML manda (RF-9). Si el receptor no es la pyme, no entra en su buzón
 * (RF-12); si no se pudo leer el receptor, se pide a la persona, porque sin él no se sabe de quién es.
 */
export function clasifica(leido: ResultadoDeExtraccion, rfcDeLaPyme: string): Clasificacion {
  const tipo: TipoDeDocumento = leido.ruta === 'xml' ? 'xml' : 'impresa'
  const campos: CampoLeido[] = leido.campos.map((c) => ({ ...c }))
  const avisos: string[] = []
  // Un identificador que no pasa su validación (un RFC con el dígito verificador mal) el extractor no lo da como
  // campo: lo lista aparte. Aquí no se pierde en silencio: entra con lo leído y marcado para revisión.
  for (const malo of leido.identificadoresInvalidos) {
    if (campos.some((c) => c.clave === malo.clave)) continue
    const delXml = malo.procedencia === 'xml'
    campos.push({ clave: malo.clave, valor: malo.valor, confianza: 0, procedencia: delXml ? 'xml' : 'ocr', evidencia: delXml ? 'exacto' : 'motor', revisionHumana: true })
    avisos.push(`«${malo.clave}» no pasa su validación (${malo.motivo}): revísalo antes de confirmar`)
  }
  const uuid = valorDe(campos, 'uuid')
  const receptor = valorDe(campos, 'rfc_receptor')
  if (!receptor) {
    campos.push({ clave: 'rfc_receptor', valor: '', confianza: 0, procedencia: 'ocr', evidencia: 'motor', revisionHumana: true })
    avisos.push('no se leyó el RFC del receptor: escríbelo antes de confirmar')
  }
  const ajeno = receptor !== null && comoTexto(receptor) !== comoTexto(rfcDeLaPyme)
  if (ajeno) avisos.push('el receptor de este CFDI no es la pyme de este buzón: no se puede confirmar aquí (RF-12)')
  if (!uuid) avisos.push('no se leyó el folio fiscal: no se podrá emparejar con su XML ni detectar si se repite')
  return {
    tipo,
    ruta: leido.ruta,
    uuid: uuid ? comoTexto(uuid) : null,
    rfc_receptor: receptor ? comoTexto(receptor) : null,
    campos,
    estado: ajeno ? 'receptor_ajeno' : 'en_revision',
    avisos,
  }
}

/** Las discrepancias entre un XML y su impresa, sobre lo que trae el QR (RF-14). Lo que una de las dos no trae, no se coteja. */
export function empareja(xml: readonly CampoLeido[], impresa: readonly CampoLeido[]): Discrepancia[] {
  const discrepancias: Discrepancia[] = []
  for (const clave of CLAVES_DE_COTEJO) {
    const [a, b] = [valorDe(xml, clave), valorDe(impresa, clave)]
    if (a !== null && b !== null && !iguales(clave, a, b)) discrepancias.push({ clave, xml: a, impresa: b, revisada: false })
  }
  return discrepancias
}

/** Lo que falta para poder confirmar, en palabras. Vacío = se puede (la base lo vuelve a comprobar, RF-17). */
export function pendientes(doc: Pick<DocumentoDelBuzon, 'estado' | 'campos' | 'discrepancias'>): string[] {
  if (doc.estado === 'confirmado') return []
  if (doc.estado === 'receptor_ajeno') return ['el receptor no es la pyme de este buzón']
  if (doc.estado === 'emparejada') return ['es la impresa de un XML que ya está en el buzón: se confirma el XML']
  return [
    ...doc.campos.filter((c) => c.revisionHumana).map((c) => `revisar el campo «${c.clave}»`),
    ...doc.discrepancias.filter((d) => !d.revisada).map((d) => `revisar la discrepancia en «${d.clave}» entre el XML y la impresa`),
  ]
}

/** La persona escribe un campo: queda como suyo, revisado y sin pedir más revisión. No se guarda quién fue (RF-21). */
export function revisaCampo(campos: readonly CampoLeido[], clave: string, valor: string): CampoLeido[] {
  if (!campos.some((c) => c.clave === clave)) throw new Error(`el documento no tiene el campo «${clave}»`)
  return campos.map((c) => (c.clave === clave
    ? { ...c, valor: valor.trim(), procedencia: 'humano' as const, revisionHumana: false, revisado: true }
    : c))
}

export function revisaDiscrepancia(discrepancias: readonly Discrepancia[], clave: string): Discrepancia[] {
  if (!discrepancias.some((d) => d.clave === clave)) throw new Error(`no hay discrepancia en «${clave}»`)
  return discrepancias.map((d) => (d.clave === clave ? { ...d, revisada: true } : d))
}

// --- Exportación de los confirmados (TAR-11) --------------------------------------------------------------------

export const COLUMNAS_CSV = ['uuid', 'fecha', 'rfc_emisor', 'nombre_emisor', 'rfc_receptor', 'tipo_de_comprobante', 'moneda', 'subtotal', 'total'] as const

/** Una celda segura: entre comillas, y sin que un valor que empieza por = + - @ se ejecute como fórmula al abrirlo. */
export function celda(valor: string): string {
  const seguro = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor
  return `"${seguro.replace(/"/g, '""')}"`
}

/**
 * Los CFDI confirmados de una pyme, en CSV para su sistema contable. Cada folio sale una vez: si están
 * confirmados el XML y su impresa, sale el XML (RF-9). Nada que no esté confirmado sale (RF-16).
 */
export function aCsv(documentos: readonly DocumentoDelBuzon[]): string {
  const confirmados = documentos.filter((d) => d.estado === 'confirmado')
  const conXml = new Set(confirmados.filter((d) => d.tipo === 'xml' && d.uuid).map((d) => d.uuid))
  const salen = confirmados.filter((d) => d.tipo === 'xml' || !d.uuid || !conXml.has(d.uuid))
  const filas = salen.map((d) => [
    ...COLUMNAS_CSV.map((clave) => celda(clave === 'uuid' ? d.uuid ?? '' : valorDe(d.campos, clave) ?? '')),
    celda(d.tipo), celda(d.confirmado_en ?? ''),
  ].join(','))
  return [[...COLUMNAS_CSV, 'origen', 'confirmado_en'].join(','), ...filas].join('\r\n') + '\r\n'
}
