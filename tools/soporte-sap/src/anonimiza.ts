/**
 * El anonimizador antes del sandbox: FAIL-CLOSED (v2, tras la revisión adversarial del 2026-10-04,
 * que encontró 54 fugas en 63 entradas en la v1: el banco de prueba era circular).
 *
 *   1. Todo caso de RR. HH. o nómina (nómina, finiquito, aguinaldo, IMSS, PTU, infotipos…) se
 *      anonimiza y va SIEMPRE a cuarentena: revisión humana antes del sandbox. Es daño a terceros
 *      y no es firmable (límite de C5).
 *   2. Lo demás pasa por detectores tolerantes a separadores, mayúsculas, ofuscación y OCR: correos
 *      (también «[arroba]»), RFC y CURP partidos o con O por 0, números largos con guiones o
 *      espacios, etiquetas personales con números cortos, montos, fechas, domicilios, usuarios SAP y
 *      NOMBRES reconocidos por NO ser vocabulario (no por estar en una lista de nombres).
 *   3. Si después queda cualquier señal, el caso no entra: cuarentena con los TIPOS, nunca el dato.
 *
 * Los números largos se generalizan a [NUMERO] aunque sean técnicos: el sandbox aprende el problema,
 * no el documento. `generaliza` además quita lo que identifica al cliente, para el núcleo (D1).
 */
import { esVocabulario, normalizaPalabra } from './lexico.js'

export interface Validadores {
  readonly rfc: (v: string) => boolean
  readonly curp: (v: string) => boolean
  readonly nss: (v: string) => boolean
}

export type TipoDato =
  | 'RFC' | 'CURP' | 'NSS' | 'CLABE' | 'CORREO' | 'TELEFONO' | 'NUMERO' | 'DATO_PERSONAL' | 'USUARIO' | 'MONTO'
  | 'FECHA' | 'DOMICILIO' | 'NOMBRE'

export interface Anonimizado {
  readonly texto: string
  readonly reemplazos: Readonly<Partial<Record<TipoDato, number>>>
  readonly senales: readonly string[]
  readonly veredicto: 'entra' | 'cuarentena'
}

type Cuenta = Partial<Record<TipoDato, number>>
const marca = (c: Cuenta, t: TipoDato): string => { c[t] = (c[t] ?? 0) + 1; return `[${t}]` }

export const CONTEXTO_PERSONAL = /\b(n[oó]minas?|finiquitos?|aguinaldos?|imss|idse|sua|infonavit|ptu|incapacidad(?:es)?|vacaciones|emplead[oa]s?|trabajador(?:a|es|as)?|colaborador(?:a|es|as)?|liquidaci[oó]n|sueldos?|salarios?|pa20|pa30|pa40|pc00_\w+|infotipos?|hcm|personal)\b/i

const CORREO = /[\w.%+-]+@[\w.-]+\.[a-z]{2,}/gi
const CORREO_OFUSCADO = /[\w.%+-]+\s*(?:\[\s*(?:arroba|at)\s*\]|\(\s*(?:arroba|at)\s*\)|\s+arroba\s+)\s*[\w-]+(?:\s*(?:\.|\s+punto\s+)\s*[\w-]+)+/gi
const ETIQUETA_PERSONAL = /\b(pernr|emplead[oa]|n[oú]m(?:ero)?\.?\s*(?:de\s+)?personal|no\.?\s*(?:de\s+)?personal|no\.?\s*de\s+emplead[oa]|nss|cuenta(?:\s+bancaria)?|clabe|tel(?:[eé]fono)?|cel(?:ular)?|whatsapp|ext\.?|c\.?\s?p\.?)(\s*[:#]?\s*)(\+?\d[\d\s\-.()]*\d|\d)/gi
const MONTO = /(?:\$|\bmxn\b|\bm\.n\.)\s?\d[\d,.\s]*\d|\b\d[\d,.\s]*\d\s?(?:pesos|mxn|m\.n\.)/gi
const MESES = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre'
const FECHA = new RegExp(`\\b\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}\\b|\\b\\d{1,2}\\s+de\\s+(?:${MESES})(?:\\s+de(?:l)?\\s+\\d{4})?\\b`, 'gi')
const DOMICILIO = /\b(?:calle|av\.?|avenida|blvd\.?|boulevard|calzada|calz\.|col\.?|colonia|domicilio|int\.)\s+[^,;\n]{1,40}/gi
const NUMERO_LARGO = /(?<![\w])\+?\d(?:[\s\-.()]{0,2}\d){6,}(?![\w])/g
const USUARIO = /(\b(?:[Uu]suario(?:\s+SAP)?|USUARIO(?:\s+SAP)?|[Uu]ser|ID\s+SAP\b[^.\n]{0,40}?\bes|[Dd]esbloquear|[Bb]loquear|[Rr]esetear))(\s*[:=]?\s*)([A-Z][A-Z0-9._]{2,15})\b/g
const TRATAMIENTO = /\b(?:Lic|Ing|Sr|Sra|Srta|Dr|Dra|Mtro|Mtra|Arq|Prof|C\.P)\.?\s+(?:[A-ZÁÉÍÓÚÑ][\p{L}'-]*\.?\s*){1,4}/gu
const SECUENCIA = /(?<![\p{L}\p{N}_])(?:[A-ZÁÉÍÓÚÑ][\p{L}'-]+|[A-ZÁÉÍÓÚÑ]\.)(?:,?\s+(?:(?:de|del)\s+(?:la\s+|los\s+)?|y\s+)?(?:[A-ZÁÉÍÓÚÑ][\p{L}'-]+|[A-ZÁÉÍÓÚÑ]\.)){1,5}/gu
const ANTES_DE_VERBO = /\b([\p{L}][\p{L}'.-]*(?:\s+[\p{L}][\p{L}'.-]*){0,3})(\s+(?:\([^)]*\)\s+)?)(?=reporta|report[oó]|dice|pide|solicita|comenta|indica)/gu
const TRAS_DISPARADOR = /\b(soy|me llamo|de parte de|atte\.?|atentamente|seg[uú]n|contactar a|llamar a|escribir a|habl[eé] con|mensaje de|correo de)(\s+)((?:[\p{L}][\p{L}'.-]*\s*){1,4})/giu

/** RFC y CURP aunque vengan en minúsculas, partidos por espacios, guiones o saltos, o con O por 0. */
function reemplazaIdentificadores(texto: string, c: Cuenta): string {
  const trozos = [...texto.matchAll(/[A-Za-z0-9Ññ&]+/g)].map((m) => ({ ini: m.index!, fin: m.index! + m[0].length, t: m[0].toUpperCase() }))
  const D = '[0-9OIL]'
  const RFC = new RegExp(`^[A-ZÑ&]{3,4}${D}{6}[A-Z0-9]{3}$`)
  const CURP = new RegExp(`^[A-Z]{4}${D}{6}[HM][A-Z]{5}[A-Z0-9]${D}$`)
  const tramos: Array<{ ini: number; fin: number; tipo: TipoDato }> = []
  for (let i = 0; i < trozos.length; i++) {
    let junto = ''
    for (let j = i; j < Math.min(i + 5, trozos.length); j++) {
      if (j > i && !/^[\s\-.]{1,2}$/.test(texto.slice(trozos[j - 1]!.fin, trozos[j]!.ini))) break
      junto += trozos[j]!.t
      const tipo: TipoDato | null = CURP.test(junto) ? 'CURP' : RFC.test(junto) ? 'RFC' : null
      if (tipo) { tramos.push({ ini: trozos[i]!.ini, fin: trozos[j]!.fin, tipo }); i = j; break }
      if (junto.length > 18) break
    }
  }
  let out = texto
  for (const tr of tramos.reverse()) out = out.slice(0, tr.ini) + marca(c, tr.tipo) + out.slice(tr.fin)

  return out
}

function tipoDeNumero(digitos: string, v: Validadores): TipoDato {
  if (digitos.length === 18) return 'CLABE'
  if (digitos.length === 11 && v.nss(digitos)) return 'NSS'
  if (digitos.length === 10 || (digitos.length >= 12 && digitos.startsWith('52'))) return 'TELEFONO'
  return 'NUMERO'
}

/** Nombres: secuencias con mayúscula que no son vocabulario, tras un tratamiento, o junto a un verbo de reporte. */
function reemplazaNombres(texto: string, c: Cuenta): string {
  let t = texto.replace(TRATAMIENTO, () => `${marca(c, 'NOMBRE')} `)
  t = t.replace(SECUENCIA, (m) => {
    const palabras = m.split(/[\s,]+/).filter((p) => !/^(de|del|la|los|y)$/i.test(p))
    return palabras.some((p) => !esVocabulario(p)) ? marca(c, 'NOMBRE') : m
  })
  const sinVocabulario = (frase: string) => frase.split(/\s+/).filter((p) => p && !esVocabulario(p) && !/^\[/.test(p))
  t = t.replace(TRAS_DISPARADOR, (m, disp: string, esp: string, resto: string) => {
    const palabras = resto.trim().split(/\s+/)
    let k = 0
    while (k < palabras.length && !esVocabulario(palabras[k]!) && !/^\[/.test(palabras[k]!)) k++
    return k ? `${disp}${esp}${marca(c, 'NOMBRE')} ${palabras.slice(k).join(' ')}`.trimEnd() + (m.endsWith(' ') ? ' ' : '') : m
  })
  t = t.replace(ANTES_DE_VERBO, (m, frase: string, sep: string) => {
    const palabras = frase.split(/\s+/)
    let k = palabras.length
    while (k > 0 && !esVocabulario(palabras[k - 1]!) && !/^\[/.test(palabras[k - 1]!)) k--
    if (k === palabras.length || !sinVocabulario(palabras.slice(k).join(' ')).length) return m
    return `${palabras.slice(0, k).join(' ')}${k ? ' ' : ''}${marca(c, 'NOMBRE')}${sep}`
  })
  return t
}

function aplicaDetectores(texto: string, v: Validadores, c: Cuenta): string {
  let t = texto.replace(CORREO, () => marca(c, 'CORREO')).replace(CORREO_OFUSCADO, () => marca(c, 'CORREO'))
  t = reemplazaIdentificadores(t, c)
  t = t.replace(ETIQUETA_PERSONAL, (_m, etq: string, sep: string) => `${etq}${sep}${marca(c, 'DATO_PERSONAL')}`)
  t = t.replace(MONTO, () => marca(c, 'MONTO')).replace(FECHA, () => marca(c, 'FECHA')).replace(DOMICILIO, () => marca(c, 'DOMICILIO'))
  t = t.replace(NUMERO_LARGO, (m, pos: number, todo: string) => {
    const tecnico = /\b(pedido|documento|doc\.?|orden|material|factura|idoc|entrega|folio|oc|fi|sd|mm)\s*\w{0,3}\s*$/i.test(todo.slice(Math.max(0, pos - 24), pos))
    return marca(c, tecnico ? 'NUMERO' : tipoDeNumero(m.replace(/\D/g, ''), v))
  })
  t = t.replace(USUARIO, (_m, etq: string, sep: string) => `${etq}${sep}${marca(c, 'USUARIO')}`)
  return reemplazaNombres(t, c)
}

/**
 * Las ÚNICAS señales que guarda la cuarentena: el tipo, nunca el dato. La base exige esta misma lista
 * (`ss_cuarentena_solo_senales`) y `pruebas/cierre-base.ts` vigila que no se separen (PRP-010 H-03).
 */
export const SENALES = {
  personal: 'caso de RR. HH. o nómina: revisión humana obligatoria antes del sandbox',
  correo: 'queda algo con forma de correo',
  digitos: 'queda una secuencia larga de dígitos',
  tratamiento: 'queda un tratamiento seguido de un nombre',
  usuario: 'queda un posible usuario SAP',
} as const

/** Lo que queda después de reemplazar y que podría ser personal: si aparece, no entra. */
function senalesResiduales(t: string): string[] {
  const s = new Set<string>()
  if (/@|\barroba\b|\(at\)|\[at\]|\bpunto\s+com\b|\b[\w-]+\.(?:com|mx|net|org|edu|gob)\b/i.test(t)) s.add(SENALES.correo)
  if (/\d(?:[\s\-.()]{0,2}\d){6,}/.test(t)) s.add(SENALES.digitos)
  if (/\b(?:Lic|Ing|Sr|Sra|Srta|Dr|Dra|Mtro|Mtra)\.?\s+\p{L}/u.test(t)) s.add(SENALES.tratamiento)
  if (/(su01|contrase[nñ]a|desbloque|bloquead|\brol\b)/i.test(t) && /\b[A-Z]{5,15}\b/.test(t.replace(/\b[A-Z]{2,5}\d\w*\b/g, ''))) {
    const sueltas = [...t.matchAll(/\b[A-Z]{5,15}\b/g)].map((m) => m[0]).filter((p) => !esVocabulario(p))
    if (sueltas.length) s.add(SENALES.usuario)
  }
  return [...s]
}

/** Anonimiza para el sandbox. Fail-closed: caso de personal o señal residual → cuarentena. */
export function anonimiza(texto: string, v: Validadores): Anonimizado {
  const cuenta: Cuenta = {}
  const t = aplicaDetectores(texto, v, cuenta)
  const senales = senalesResiduales(t)
  if (CONTEXTO_PERSONAL.test(texto)) senales.unshift(SENALES.personal)
  return { texto: t, reemplazos: cuenta, senales, veredicto: senales.length ? 'cuarentena' : 'entra' }
}

/** Para proponer al NÚCLEO (D1): anonimiza y además quita lo que identifica al cliente. */
export function generaliza(texto: string, v: Validadores, clientes: readonly string[]): Anonimizado {
  const a = anonimiza(texto, v)
  let t = a.texto.replace(/\b(Z[A-Z0-9_]{2,30})\b/g, '[TRANSACCION_Z]').replace(/\b(sociedad|company code)\s*\d{4}\b/gi, '$1 [SOCIEDAD]')
  for (const cl of clientes) t = t.replace(new RegExp(cl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[CLIENTE]')
  return { ...a, texto: t }
}

export { normalizaPalabra }
