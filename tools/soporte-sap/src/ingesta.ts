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
  readonly motor: 'local' | 'externo'
  readonly decisionC4: string | null
}

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
    }

/** Un motor externo no entra: el dato de un ticket es de terceros (límite de C5), con o sin firma. */
export function validaConfig(c: ConfigIngesta): void {
  if (c.motor === 'externo') {
    throw new Error(c.decisionC4
      ? 'motor externo rechazado aun con decisión C4: los tickets llevan datos de terceros y ninguna firma lo autoriza (límite de C5)'
      : 'motor externo sin decisión C4: rechazado (y con ella también: datos de terceros, límite de C5)')
  }
  if (!(c.bytesMaximos > 0)) throw new Error('la ingesta necesita un tamaño máximo')
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

async function lee(p: PuertosIngesta, tipo: ClasePorBytes, bytes: Uint8Array): Promise<{ via: Via; campos: CampoConEvidencia[]; texto: string; aviso: string | null }> {
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
  if (!p.ocr) return { via: 'sin_extraccion', campos: [], texto: '', aviso: 'imagen sin motor local de OCR configurado: queda como adjunto' }
  const paginas = await p.ocr.extrae(bytes)
  const texto = paginas.map((x) => x.markdown).join('\n')
  const confianza = paginas[0]?.confianza ?? null
  return { via: 'ocr_local', campos: camposSap(texto, 'ocr_local', confianza), texto, aviso: null }
}

/** Ingiere un archivo: valida bytes y tamaño, lee por su vía y deja cada campo por revisar. */
export async function ingiere(p: PuertosIngesta, c: ConfigIngesta, archivo: { nombre: string; bytes: Uint8Array }): Promise<ResultadoIngesta> {
  validaConfig(c)
  const { nombre, bytes } = archivo
  if (bytes.byteLength === 0) return { aceptado: false, nombre, motivo: 'el archivo está vacío' }
  if (bytes.byteLength > c.bytesMaximos) return { aceptado: false, nombre, motivo: `pesa ${bytes.byteLength} bytes y el máximo es ${c.bytesMaximos}` }
  const ext = nombre.toLowerCase().split('.').pop() ?? ''
  const declarado = DECLARADOS[ext]
  if (!declarado) return { aceptado: false, nombre, motivo: `formato no admitido (.${ext})` }
  const real = p.clasePorBytes(bytes)
  if (real !== declarado) return { aceptado: false, nombre, motivo: `el archivo dice ser .${ext} y sus bytes son de tipo ${real}` }
  const r = await lee(p, real, bytes)
  return { aceptado: true, nombre, sha256: createHash('sha256').update(bytes).digest('hex'), tipoMime: MIME[real], bytes: bytes.byteLength, ...r }
}
