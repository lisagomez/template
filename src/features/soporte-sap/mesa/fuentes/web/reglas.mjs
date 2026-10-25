/**
 * Las reglas con que se lee la web de BASIS, sin red y sin efectos: qué es una mención de una transacción en una página
 * de SAP, qué número de nota trae un enlace, qué módulo es un producto, qué prioridad da un CVSS, cuándo cae un Patch Day
 * y qué cuenta como copiar la redacción de alguien. Las usan el generador (`generador.mjs`), la revisión (`revisa.mjs`),
 * las pruebas y la evidencia.
 *
 * Todo lo que escriben estas reglas va con palabras propias: de una página se toman hechos (un T-code, un número de nota,
 * un CVSS, un título) y nunca un párrafo. `pasajesCopiados` lo comprueba y el generador se niega a escribir si encuentra uno.
 */
import { createHash } from 'node:crypto'

/** Ocho palabras seguidas iguales a las de una captura son un pasaje copiado. */
export const PALABRAS_DE_UN_PASAJE = 8
/** Cuántas versiones afectadas se nombran en una hipótesis (las demás quedan en el dato). */
const VERSIONES_EN_TEXTO = 4

/** Un id sin cifras (el filtro de la mesa revisa toda la acción) y en otro espacio que los de sapstack. */
export const idWeb = (tipo, clave) => `${tipo}-${createHash('sha256').update(`web:${tipo}:${clave}`).digest('hex').slice(0, 12).replace(/[0-9]/g, (d) => 'ghijklmnop'[Number(d)])}`
export const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
export const lista = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}` : xs[0] ?? '')

// ── Notas y CVSS ───────────────────────────────────────────────────────────────────────────────

const NOTA_EN_URL = /(?:me\.sap\.com\/notes\/|launchpad\.support\.sap\.com\/#\/notes\/|service\.sap\.com\/sap\/support\/notes\/)0*(\d{3,8})(?![0-9])/
/** El número de SAP Note que trae un enlace, sin ceros a la izquierda; null si no es de una nota. */
export function notaDeUrl(url) {
  const m = NOTA_EN_URL.exec(String(url ?? ''))
  return m ? m[1] : null
}
/** La cita que `politica-cita.mjs` admite para una nota: el enlace a SAP for Me y el texto que la nombra. */
export const citaDeNota = (n) => ({ url: `https://me.sap.com/notes/${n}`, texto: `SAP Note ${n}` })

/** La escala de SAP para sus notas de seguridad, derivada del CVSS (no se captura: se calcula). */
export function prioridadDe(cvss) {
  if (cvss === null || cvss === undefined) return null
  if (cvss >= 9) return 'Hot News'
  if (cvss >= 7) return 'Alta'
  if (cvss >= 4) return 'Media'
  return 'Baja'
}

/**
 * El módulo de Soporte SAP de un producto de SAP, por su nombre en el registro. El orden importa: «S/4HANA HCM» es HCM y
 * «NetWeaver AS ABAP and S/4HANA» es BASIS. Lo que no casa queda fuera del alcance (null) y no entra como candidato.
 */
const MODULOS = [
  [/\bHCM\b|Human Capital|Payroll/i, 'HCM'],
  [/NetWeaver|ABAP|Kernel|KRNL|Web Dispatcher|Internet Communication Manager|Message Server|\bGateway\b|SAProuter|Host Agent|Enqueue|RFC ?SDK|Solution Manager|Support Tools Plug-In|Introscope|Content Server|SAP GUI|Business Connector|jConnect|Cloud Connector|\bHANA\b(?! Cloud)|Extended Passport|Visual Composer|Enterprise Portal|Adaptive Server|MaxDB|Diagnostics Agent/i, 'BASIS'],
  [/Financ|General Ledger|Asset Accounting|Accounts (?:Payable|Receivable)|Treasury/i, 'FI'],
  [/Materials Management|Purchas|Procurement|Inventory Management/i, 'MM'],
  [/Sales and Distribution|Billing|Order Management/i, 'SD'],
]
export function moduloDe(producto) {
  for (const [re, m] of MODULOS) if (re.test(producto)) return m
  return null
}

// ── Patch Day ──────────────────────────────────────────────────────────────────────────────────

/** Las 00:00 UTC de un día AAAA-MM-DD (sin escribir la hora a mano). */
export const diaUtc = (f) => new Date(Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10))))
/** La fecha y hora como la pide NVD (AAAA-MM-DD, la hora y milisegundos, sin zona). */
export const paraNvd = (d) => d.toISOString().slice(0, 23)

/** El Patch Day de un mes: el segundo martes (AAAA-MM-DD). */
export function patchDayDe(anio, mes) {
  const primero = new Date(Date.UTC(anio, mes - 1, 1)).getUTCDay()
  const primerMartes = 1 + ((2 - primero + 7) % 7)
  return new Date(Date.UTC(anio, mes - 1, primerMartes + 7)).toISOString().slice(0, 10)
}
export const esPatchDay = (fecha) => patchDayDe(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7))) === fecha
/** El primer Patch Day después de una fecha. */
export function proximoPatchDay(fecha) {
  let [a, m] = [Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7))]
  for (let i = 0; i < 3; i++) {
    const p = patchDayDe(a, m)
    if (p > fecha) return p
    if (m === 12) { a += 1; m = 1 } else m += 1
  }
  throw new Error(`no encontré el Patch Day después de ${fecha}`)
}

// ── Páginas de SAP-docs ────────────────────────────────────────────────────────────────────────

/** El Markdown de SAP-docs escapa `_`, `(` y `)`: se leen sin la barra. */
export const sinEscapes = (t) => t.replace(/\\([_()[\]*#.!-])/g, '$1')
const MARCA = /(?:transaction(?: code)?|transacci[oó]n|t-?code|\/n)\s*[`*]*$/i
const VERBO = /\b(?:in|via|through|run|open|use|start|call|choose)\s+[`*]*$/i
const NO_ES_TRANSACCION = /\b(table|program|report|function module|package|class)\s+[`*]*$/i
const NOMBRE = /\*([A-Za-z][A-Za-z /-]{2,40})\*\s*\(\s*(?:transaction\s+)?[`*]*$/i

/**
 * Las veces que una línea nombra un T-code conocido como transacción: tras «transaction», «/n», un verbo («in SM37»,
 * «run SU01») o en un título «Lock Check (SM12)». Tras «table», «program» o «report» lo nombra como otra cosa (eso
 * contradice a quien diga que es transacción). Un «SP01» que sigue a una versión («758 SP01/02») es un support package.
 */
export function mencionesEn(linea, conocidos) {
  const t = sinEscapes(linea)
  const out = []
  for (const m of t.matchAll(/(?<![A-Za-z0-9_/])([A-Z][A-Z0-9_]{2,14})(?![A-Za-z0-9_])/g)) {
    const tc = m[1]
    if (!conocidos.has(tc)) continue
    const antes = t.slice(Math.max(0, m.index - 60), m.index)
    const despues = t.slice(m.index + tc.length, m.index + tc.length + 4)
    if (/\d\s+$/.test(antes) || /^\/\d|^:/.test(despues)) continue
    const como = NO_ES_TRANSACCION.exec(antes)?.[1]?.toLowerCase() ?? null
    const marcada = MARCA.test(antes) || VERBO.test(antes) || /^#+ .*\($/.test(antes.trimEnd()) || /\($/.test(antes.trimEnd()) || /`$/.test(antes)
    if (!como && !marcada) continue
    out.push({ tcode: tc, como: como ?? 'transaccion', nombre: NOMBRE.exec(antes)?.[1]?.trim() ?? null })
  }
  return out
}

/** Las SAP Notes que cita una línea: el número y, si el enlace lleva texto que no es el número, ese texto (su título). */
export function notasEn(linea) {
  const t = sinEscapes(linea)
  const out = []
  for (const m of t.matchAll(/(?:\[([^\]]{1,160})\]\()?(https?:\/\/[^\s)]+)\)?/g)) {
    const n = notaDeUrl(m[2])
    if (!n) continue
    const texto = (m[1] ?? '').replace(/[*_`]/g, '').trim()
    out.push({ numero: n, titulo: texto && !/^(?:SAP Note\s*)?0*\d+$/i.test(texto) ? texto.replace(/^SAP Note\s*0*\d+\s*[-–:]\s*/i, '') : null })
  }
  return out
}

/** Las líneas de prosa de una página (lo que no es título, encabezado, tabla, imagen ni comentario). */
export const esProsa = (linea) => {
  const l = linea.trim()
  return l.length > 0 && !/^(#|<!--|!\[|\||<\/?(?:table|tr|th|td|p|div|span|a|img|br)\b|```)/i.test(l)
}

/** La URL de SAP Help de una página de SAP-docs, por su loio: `<ayuda>/<loio>.html` (la forma que usa SAP). */
export const ayudaDe = (ayuda, loio) => (ayuda && loio ? `${ayuda}/${loio}.html` : null)

// ── Lo que no se copia ─────────────────────────────────────────────────────────────────────────

const palabras = (t) => (String(t).toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '').match(/[\p{L}\p{N}]+/gu) ?? [])
/** Las tejas de `n` palabras de un texto: dos textos que comparten una comparten un pasaje de `n` palabras. */
export function tejas(texto, n = PALABRAS_DE_UN_PASAJE) {
  const p = palabras(texto)
  const s = new Set()
  for (let i = 0; i + n <= p.length; i++) s.add(p.slice(i, i + n).join(' '))
  return s
}

/**
 * Lo que un candidato escribe con palabras propias: la hipótesis, el destino y el aviso, SIN los hechos que se citan entre
 * comillas (el título de una nota o de una página, el nombre de un producto, las versiones), que sí se pueden copiar.
 */
export function textoPropio(c) {
  let t = [c.hipotesis, c.destino, c.aviso ?? ''].join(' \n ')
  const hechos = [c.titulo, c.seguridad?.producto, ...(c.seguridad?.versiones ?? []), ...(c.contexto ?? [])].filter((x) => typeof x === 'string' && x.length > 0)
  for (const h of hechos.sort((a, b) => b.length - a.length)) t = t.split(h).join(' ¦ ')
  return t
}

/** Los candidatos cuyo texto propio repite un pasaje de la prosa capturada. Vacío es que nada se copió. */
export function pasajesCopiados(candidatos, prosa, n = PALABRAS_DE_UN_PASAJE) {
  const capturado = new Set()
  for (const p of prosa) for (const x of tejas(p, n)) capturado.add(x)
  const out = []
  for (const c of candidatos) {
    const iguales = [...tejas(textoPropio(c), n)].filter((x) => capturado.has(x))
    if (iguales.length) out.push({ id: c.id, clave: c.clave, pasaje: iguales[0] })
  }
  return out
}

// ── Las hipótesis, con palabras propias ────────────────────────────────────────────────────────

export function hipotesisDeSeguridad(n, s) {
  const que = s.cves.length === 1 ? `la vulnerabilidad ${s.cves[0]}` : `${s.cves.length} vulnerabilidades (${lista(s.cves)})`
  const cuando = s.patchDay ? `en el Patch Day del ${s.publicada}` : `el ${s.publicada}, fuera del Patch Day`
  const cvss = s.cvss === null ? 'sin CVSS en el registro' : `CVSS ${s.cvss}, ${s.prioridad} en la escala de SAP`
  const versiones = s.versiones.length ? ` El registro nombra ${s.versiones.length} versión(es) afectada(s), entre ellas ${lista(s.versiones.slice(0, VERSIONES_EN_TEXTO))}.` : ''
  const explotada = s.explotada ? ` CISA la tiene como explotada activamente desde el ${s.explotada}.` : ''
  return `La SAP Note ${n} corrige ${que} en ${s.producto} (${cvss}), publicada ${cuando}.${versiones}${explotada} Para el experto: ¿aplica a los sistemas que atiende y ya está aplicada? De la nota solo van el número, el título y el enlace.`
}

export function hipotesisDePuntero(n, p) {
  const donde = p.seccion && p.seccion !== p.pagina ? `«${p.pagina}», en el apartado «${p.seccion}»` : `«${p.pagina}»`
  return `La documentación de SAP (${p.guia}) cita la SAP Note ${n} en ${donde}. Hipótesis: es la nota que hay que revisar al hacer ese paso. Solo el número y el enlace: el contenido es de SAP.`
}

export function hipotesisDeTransaccion(tc, m) {
  const nombre = m.nombre ? ` («${m.nombre}»)` : ''
  return `«${tc}»${nombre} es una transacción de AS ABAP que la documentación de SAP (${m.guia}) usa en «${m.pagina}». Hipótesis: es la transacción de ese paso en un sistema ABAP.`
}
