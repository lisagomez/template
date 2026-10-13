/**
 * La ingesta de documentos de una incidencia, sobre el extractor documental (`TPL-extractor-documental`)
 * inyectado por puertos: el producto no reescribe la lectura, la compone.
 *
 * Reglas del producto (spec del goal, restricción 6):
 *   · se valida por BYTES, no por extensión, y por tamaño: lo que miente o pesa de más se rechaza;
 *   · XML (CFDI) por `./xml`, sin motor; PDF con texto por capa 0; imagen por el motor LOCAL;
 *   · un motor externo NO entra: los tickets llevan datos de terceros y ninguna firma lo autoriza;
 *   · sin umbral medido, cada campo va a revisión humana (D9);
 *   · Word y Excel se guardan como adjunto, sin extracción, y se dice;
 *   · el texto extraído es DATO: va delimitado y ninguna decisión del producto lee instrucciones.
 */
import { createHash } from 'node:crypto'
import { mensajeDe, transaccionDe } from './categoriza.js'

export interface PaginaOcr { readonly markdown: string; readonly confianza?: number }

export type ClasePorBytes = 'pdf' | 'imagen' | 'xml' | 'zip' | 'desconocido'

export interface PuertosIngesta {
  /** La clase por bytes del extractor (`clasePorBytes`, 0.8.0): nunca por el nombre. */
  readonly clasePorBytes: (bytes: Uint8Array) => ClasePorBytes
  readonly leeCapaCero: (pdf: Uint8Array) => Promise<{ hayTexto: boolean; paginas: readonly string[]; motivo: string | null }>
  readonly leeCfdi: (xml: Uint8Array) => { esCfdi: boolean; motivo: string | null; campos: ReadonlyArray<{ clave: string; valor: string }> }
  /** El motor LOCAL de OCR (Tesseract por zonas), o null si no hay. */
  readonly ocr: { readonly modelo: string; readonly extrae: (imagen: Uint8Array) => Promise<readonly PaginaOcr[]> } | null
}

export interface ConfigIngesta {
  readonly bytesMaximos: number
  /** Cuántos adjuntos admite una incidencia (C3, O4): el siguiente se rechaza. */
  readonly adjuntosMaximos: number
  /** Las páginas de OCR de la consultora en el periodo (C3, O4; en producción, `ss_presupuesto.tope_paginas_ocr`). */
  readonly paginasOcrMaximas: number
  readonly motor: 'local' | 'externo'
  readonly decisionC4: string | null
}

/** Lo ya consumido: adjuntos de ESTA incidencia y páginas de OCR de SU consultora en el periodo. */
export interface UsoIngesta { readonly adjuntos: number; readonly paginasOcr: number }

export type Via = 'capa0' | 'xml' | 'ocr_local' | 'sin_extraccion'

export interface CampoConEvidencia {
  readonly campo: string
  readonly valor: string
  /** El fragmento del documento del que salió (o el atributo del XML). */
  readonly evidencia: string
  readonly via: Via
  /** Del motor cuando la hay; null en capa 0 y XML (texto que ya venía en el documento). */
  readonly confianza: number | null
  /** Sin umbral medido, todo campo va a revisión humana. */
  readonly estado: 'por_revisar'
}

export type ResultadoIngesta =
  | { readonly aceptado: false; readonly nombre: string; readonly motivo: string }
  | {
      readonly aceptado: true; readonly nombre: string; readonly sha256: string; readonly tipoMime: string; readonly bytes: number
      readonly via: Via; readonly campos: readonly CampoConEvidencia[]; readonly texto: string; readonly aviso: string | null
      /** Las páginas de OCR que gastó este archivo (0 fuera del motor). */
      readonly paginasOcr: number
    }

/** Un motor externo no entra: el dato de un ticket es de terceros (límite de C5), con o sin firma. */
export function validaConfig(c: ConfigIngesta): void {
  if (c.motor === 'externo') {
    throw new Error(c.decisionC4
      ? 'motor externo rechazado aun con decisión C4: los tickets llevan datos de terceros y ninguna firma lo autoriza (límite de C5)'
      : 'motor externo sin decisión C4: rechazado (y con ella también: datos de terceros, límite de C5)')
  }
  if (!(c.bytesMaximos > 0)) throw new Error('la ingesta necesita un tamaño máximo')
  if (!(Number.isInteger(c.adjuntosMaximos) && c.adjuntosMaximos > 0)) throw new Error('la ingesta necesita un máximo de adjuntos por incidencia')
  if (!(Number.isInteger(c.paginasOcrMaximas) && c.paginasOcrMaximas >= 0)) throw new Error('la ingesta necesita un tope de páginas de OCR por consultora')
}

/** Lo que cada extensión DECLARA ser. Se compara con la clase por bytes: si no coinciden, miente. */
const DECLARADOS: Readonly<Record<string, ClasePorBytes>> = {
  pdf: 'pdf', png: 'imagen', jpg: 'imagen', jpeg: 'imagen', webp: 'imagen', xml: 'xml', docx: 'zip', xlsx: 'zip',
}

const MIME: Readonly<Record<ClasePorBytes, string>> = {
  pdf: 'application/pdf', imagen: 'image/*', xml: 'application/xml', zip: 'application/zip', desconocido: 'application/octet-stream',
}

const linea = (texto: string, i: number): string => {
  const a = texto.lastIndexOf('\n', i) + 1
  const b = texto.indexOf('\n', i)
  return texto.slice(a, b < 0 ? undefined : b).trim().slice(0, 160)
}

/** Los campos SAP de un texto, cada uno con la línea de la que salió. */
export function camposSap(texto: string, via: Via, confianza: number | null): CampoConEvidencia[] {
  const out: CampoConEvidencia[] = []
  const pon = (campo: string, valor: string | null | undefined, i: number) => {
    if (valor) out.push({ campo, valor, evidencia: linea(texto, Math.max(0, i)), via, confianza, estado: 'por_revisar' })
  }
  const t = transaccionDe(texto)
  pon('transaccion', t, t ? texto.toUpperCase().indexOf(t) : -1)
  const m = mensajeDe(texto)
  pon('mensaje', m?.mensaje, m ? texto.indexOf(m.mensaje.split(' ')[0]!) : -1)
  pon('modulo', m?.modulo, m ? texto.indexOf(m.mensaje.split(' ')[0]!) : -1)
  const nota = /\b(?:nota|note)\s*(?:sap\s*)?(\d{6,7})\b/i.exec(texto)
  pon('nota_sap', nota?.[1], nota?.index ?? -1)
  const soc = /(?:sociedad|company code)\s*(\d{4})/i.exec(texto)
  pon('sociedad', soc?.[1], soc?.index ?? -1)
  const per = /(?:periodo|period)\s*(\d{4}[-/]\d{2})/i.exec(texto)
  pon('periodo', per?.[1], per?.index ?? -1)
  return out
}

/** Delimita el texto de un documento: es DATO de la incidencia, nunca instrucción. */
export const delimitaDocumento = (nombre: string, texto: string): string =>
  `<<<DOCUMENTO ${nombre.replace(/[<>]/g, '')}\n${texto.replaceAll('<<<', '‹‹‹').replaceAll('>>>', '›››')}\nDOCUMENTO>>>`

type Lectura = { via: Via; campos: CampoConEvidencia[]; texto: string; aviso: string | null; paginasOcr: number }

async function lee(p: PuertosIngesta, tipo: ClasePorBytes, bytes: Uint8Array, paginasOcrRestantes: number): Promise<Lectura> {
  const r = await leeSinOcr(p, tipo, bytes)
  if (r) return { ...r, paginasOcr: 0 }
  if (!p.ocr) return { via: 'sin_extraccion', campos: [], texto: '', aviso: 'imagen sin motor local de OCR configurado: queda como adjunto', paginasOcr: 0 }
  if (paginasOcrRestantes <= 0) return { via: 'sin_extraccion', campos: [], texto: '', aviso: 'la consultora llegó a su tope de páginas de OCR del periodo: la imagen queda como adjunto, sin extracción', paginasOcr: 0 }
  // El tope se mira antes de leer y también después (PRP-010 H-23): de lo que devuelva el motor solo cuenta y se usa lo
  // que cabe en las páginas que le quedan al periodo, así que la cuenta nunca pasa del tope.
  const leidas = await p.ocr.extrae(bytes)
  const paginas = leidas.slice(0, paginasOcrRestantes)
  const texto = paginas.map((x) => x.markdown).join('\n')
  const confianza = paginas[0]?.confianza ?? null
  const aviso = leidas.length > paginas.length ? `el tope de OCR del periodo alcanzó para ${paginas.length} de ${leidas.length} páginas: el resto queda sin extracción` : null
  return { via: 'ocr_local', campos: camposSap(texto, 'ocr_local', confianza), texto, aviso, paginasOcr: Math.max(1, paginas.length) }
}

/** XML, PDF y Office se leen sin motor; una imagen devuelve null (va al OCR local, si hay y si queda tope). */
async function leeSinOcr(p: PuertosIngesta, tipo: ClasePorBytes, bytes: Uint8Array): Promise<Omit<Lectura, 'paginasOcr'> | null> {
  if (tipo === 'xml') {
    const c = p.leeCfdi(bytes)
    if (!c.esCfdi) return { via: 'sin_extraccion', campos: [], texto: '', aviso: `XML guardado sin extracción: ${c.motivo ?? 'no es un CFDI'}` }
    const campos = c.campos.map((x) => ({ campo: x.clave, valor: x.valor, evidencia: `XML: ${x.clave}`, via: 'xml' as const, confianza: null, estado: 'por_revisar' as const }))
    return { via: 'xml', campos, texto: c.campos.map((x) => `${x.clave}: ${x.valor}`).join('\n'), aviso: 'el sello del CFDI no se verifica: leer bien no es autenticar' }
  }
  if (tipo === 'pdf') {
    const r = await p.leeCapaCero(bytes)
    if (r.hayTexto) { const texto = r.paginas.join('\n'); return { via: 'capa0', campos: camposSap(texto, 'capa0', null), texto, aviso: null } }
    return { via: 'sin_extraccion', campos: [], texto: '', aviso: `PDF sin texto propio (${r.motivo ?? 'escaneado'}): sin rasterizador local, queda como adjunto` }
  }
  if (tipo === 'zip') return { via: 'sin_extraccion', campos: [], texto: '', aviso: 'Word o Excel: el extractor no lee este formato; se guarda como adjunto, sin extracción' }
  return null
}

/**
 * Ingiere un archivo: valida adjuntos, bytes y tamaño, lee por su vía y deja cada campo por revisar.
 * `uso` es lo ya consumido (adjuntos de la incidencia, páginas de OCR de la consultora): el tope se
 * aplica sobre él, así que el llamador lo pasa siempre y suma `paginasOcr` del resultado.
 */
export async function ingiere(p: PuertosIngesta, c: ConfigIngesta, archivo: { nombre: string; bytes: Uint8Array }, uso: UsoIngesta): Promise<ResultadoIngesta> {
  validaConfig(c)
  const { nombre, bytes } = archivo
  if (uso.adjuntos >= c.adjuntosMaximos) return { aceptado: false, nombre, motivo: `la incidencia ya tiene ${uso.adjuntos} adjuntos y el máximo es ${c.adjuntosMaximos}` }
  if (bytes.byteLength === 0) return { aceptado: false, nombre, motivo: 'el archivo está vacío' }
  if (bytes.byteLength > c.bytesMaximos) return { aceptado: false, nombre, motivo: `pesa ${bytes.byteLength} bytes y el máximo es ${c.bytesMaximos}` }
  const ext = nombre.toLowerCase().split('.').pop() ?? ''
  const declarado = DECLARADOS[ext]
  if (!declarado) return { aceptado: false, nombre, motivo: `formato no admitido (.${ext})` }
  const real = p.clasePorBytes(bytes)
  if (real !== declarado) return { aceptado: false, nombre, motivo: `el archivo dice ser .${ext} y sus bytes son de tipo ${real}` }
  const r = await lee(p, real, bytes, c.paginasOcrMaximas - uso.paginasOcr)
  return { aceptado: true, nombre, sha256: createHash('sha256').update(bytes).digest('hex'), tipoMime: MIME[real], bytes: bytes.byteLength, ...r }
}

/**
 * Los archivos de una incidencia, uno tras otro, con el uso acumulado: el que pasa de un tope lo dice. `uso` es lo que la
 * incidencia YA tiene (sus adjuntos) y lo que la consultora ya gastó de OCR: los adjuntos se cuentan por incidencia, no
 * por lote (PRP-010 H-23); si no, subir de cinco en cinco no tenía tope. La base lo exige también (`ss_adjunto_tope`).
 */
export async function ingiereTodos(p: PuertosIngesta, c: ConfigIngesta, archivos: ReadonlyArray<{ nombre: string; bytes: Uint8Array }>, uso: UsoIngesta): Promise<{ resultados: ResultadoIngesta[]; paginasOcr: number }> {
  const resultados: ResultadoIngesta[] = []
  let adjuntos = uso.adjuntos, paginasOcr = uso.paginasOcr
  for (const a of archivos) {
    const r = await ingiere(p, c, a, { adjuntos, paginasOcr })
    if (r.aceptado) { adjuntos++; paginasOcr += r.paginasOcr }
    resultados.push(r)
  }
  return { resultados, paginasOcr }
}
