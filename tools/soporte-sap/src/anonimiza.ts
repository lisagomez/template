/**
 * El anonimizador antes del sandbox (v3). La v1 dejaba pasar 54 de 63 entradas de un revisor adversarial: su banco
 * era circular. La v2 cerró esas, y la revisión del 2026-10-07 le encontró 5 formas nuevas que entraban con el dato
 * («pepe gonzalez de almacen», «jgarcia», «doña Lupita», «El chofer Ramiro», «rosa punto elena en gmail»). La v3
 * (PRP-010 H-04) se mide contra un banco que escribió alguien que no leyó este archivo (`pruebas/_banco-independiente.ts`).
 *
 *   1. Todo caso de RR. HH. o nómina (nómina, finiquito, aguinaldo, IMSS, PTU, infotipos…) se anonimiza y va
 *      SIEMPRE a cuarentena. Es daño a terceros y no es firmable (límite de C5).
 *   2. Lo demás pasa por detectores tolerantes a separadores, mayúsculas, ofuscación y OCR: correos (también
 *      «[arroba]», «[dot]» o «punto … en gmail»), RFC y CURP partidos o con O por 0, números largos con cualquier
 *      separador, etiquetas personales, montos, fechas, domicilios, usuarios (SAP, de red, «inicial+apellido»,
 *      «nombre.apellido») y NOMBRES: por no ser vocabulario con mayúscula, por su contexto (tratamiento, firma,
 *      saludo, puesto, verbo de reporte) o por ser un nombre común (`nombres.ts`), también en minúsculas.
 *   3. Si después queda cualquier señal, el caso no entra: cuarentena con los TIPOS, nunca el dato.
 *
 * NO es «cero fugas»: un nombre en minúsculas, sin contexto y que no está en la lista de nombres comunes pasa. Las
 * dos cerraduras que no dependen de este archivo son la cuarentena y la restricción de la base sobre el sandbox; y
 * antes de salir del laboratorio se mide sobre un corpus real (D9).
 *
 * Los números largos se generalizan a [NUMERO] aunque sean técnicos: el sandbox aprende el problema, no el documento.
 * `generaliza` además quita lo que identifica al cliente, para el núcleo (D1, PRP-010 H-19).
 */
import { esVocabulario, normalizaPalabra } from './lexico.js'
import { esNombreConocido, esApellido } from './nombres.js'

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

export const CONTEXTO_PERSONAL = /\b(n[oó]minas?|finiquitos?|aguinaldos?|imss|idse|sua|infonavit|ptu|incapacidad(?:es)?|vacaciones|emplead[oa]s?|trabajador(?:a|es|as)?|colaborador(?:a|es|as)?|liquidaci[oó]n|sueldos?|salarios?|quincenas?|recibos? de pago|pa20|pa30|pa40|pc00_\w+|infotipos?|hcm|personal)\b/i

/** Lo que separa dígitos en un teléfono o una cuenta: espacios, guiones, puntos, paréntesis y los de un procesador de texto. */
const SEP = String.raw`[\s\-.()·•–]`
const PROVEEDOR = 'gmail|hotmail|yahoo|outlook|live|icloud|protonmail|proton|prodigy|aol|msn'
const AT = String.raw`(?:\s*@\s*|\s*\[\s*(?:arroba|at)\s*\]\s*|\s*\(\s*(?:arroba|at)\s*\)\s*|\s+arroba\s+)`
const DOT = String.raw`(?:\s*\.\s*|\s+punto\s+|\s*\[\s*(?:dot|punto)\s*\]\s*|\s*\(\s*(?:dot|punto)\s*\)\s*)`
const PARTE = String.raw`[\p{L}\p{N}_%+-]+`
const CORREO = new RegExp(String.raw`${PARTE}(?:${DOT}${PARTE})*${AT}[\p{L}\p{N}-]+(?:${DOT}[\p{L}\p{N}-]+)+`, 'giu')
/** «rosa punto elena en gmail»: la dirección sin @ ni dominio completo, dicha con el proveedor. */
const CORREO_DICHO = new RegExp(String.raw`${PARTE}(?:${DOT}${PARTE})*\s+(?:en|arroba|at)\s+(?:${PROVEEDOR})\b(?:${DOT}[\p{L}]+)*`, 'giu')
const ETIQUETA_PERSONAL = /\b(pernr|emplead[oa]|n[oú]m(?:ero)?\.?\s*(?:de\s+)?personal|no\.?\s*(?:de\s+)?personal|no\.?\s*de\s+emplead[oa]|nss|cuenta(?:\s+bancaria)?|clabe|tel(?:[eé]fono)?|cel(?:ular)?|whatsapp|ext\.?|c\.?\s?p\.?)(\s*[:#]?\s*)(\+?\d[\d\s\-.()·•–]*\d|\d)/gi
const MONTO = /(?:\$|\bmxn\b|\bm\.n\.)\s?\d[\d,.\s]*\d|\b\d[\d,.\s]*\d\s?(?:pesos|mxn|m\.n\.)/gi
const MESES = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre'
const FECHA = new RegExp(`(?<![\\d-])\\b\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}\\b(?![-/]\\d)|\\b\\d{1,2}\\s+de\\s+(?:${MESES})(?:\\s+de(?:l)?\\s+\\d{4})?\\b`, 'gi')
const DOMICILIO = /\b(?:calle|av\.?|avenida|blvd\.?|boulevard|calzada|calz\.|col\.?|colonia|domicilio|int\.)\s+[^,;\n]{1,40}/gi
const NUMERO_LARGO = new RegExp(String.raw`(?<![\w])\+?\d(?:${SEP}{0,2}\d){6,}(?![\w])`, 'g')

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

// --- Usuarios ------------------------------------------------------------------------------------------------

/** Una transacción, un objeto de autorización o una palabra: lo que va tras «desbloquear» y NO es un usuario. */
const noEsUsuario = (v: string): boolean => esVocabulario(v) || /^[A-Z]{1,4}\d{1,3}[A-Z]?$/i.test(v) || /^[A-Z]{1,4}_[A-Z_]+$/.test(v)
const USUARIO = /(\b(?:usuario(?:\s+sap)?|user|id\s+sap\b[^.\n]{0,40}?\bes|desbloque\w*|bloque\w*|resete\w*)(?![\p{L}\p{N}_]))((?:\s*[:=]\s*|\s+)(?:al?\s+)?(?:(?:el|su)\s+usuario\s+)?)([A-Za-z][A-Za-z0-9._]{2,30})(?![\p{L}\p{N}_])/giu
const USUARIO_DE_RED = /\b[A-Za-z][\w-]{1,15}\\[A-Za-z][\w.-]{1,30}/g
const NOMBRE_PUNTO_APELLIDO = /(?<![\p{L}\p{N}_.])([\p{L}]{1,20})[._]([\p{L}]{2,20})(?![\p{L}\p{N}_]|\.[\p{L}])/gu
const INICIAL_Y_APELLIDO = /(?<![\p{L}\p{N}_])([\p{L}]{4,22})(\d{0,3})(?![\p{L}\p{N}_])/gu

function reemplazaUsuarios(texto: string, c: Cuenta): string {
  let t = texto.replace(USUARIO_DE_RED, () => marca(c, 'USUARIO'))
  t = t.replace(USUARIO, (m, etq: string, sep: string, valor: string) => (noEsUsuario(valor) ? m : `${etq}${sep}${marca(c, 'USUARIO')}`))
  t = t.replace(NOMBRE_PUNTO_APELLIDO, (m, a: string, b: string) =>
    (esNombreConocido(a) || esNombreConocido(b)) && !esVocabulario(a) && !esVocabulario(b) ? marca(c, 'USUARIO') : m)
  return t.replace(INICIAL_Y_APELLIDO, (m, p: string) => ((esApellido(p.slice(1)) || esApellido(p.slice(2))) && !esVocabulario(p) ? marca(c, 'USUARIO') : m))
}

// --- Nombres -------------------------------------------------------------------------------------------------

const MAYUS = 'A-ZÁÉÍÓÚÑÜ'
/** Una palabra con mayúscula inicial y alguna minúscula (no una sigla ni un código), o una inicial con punto. */
const PAL = String.raw`(?:[${MAYUS}](?=[\p{L}'-]*\p{Ll})[\p{L}'-]+|[${MAYUS}]\.)(?![\p{L}\p{N}_])`
const SECUENCIA = new RegExp(String.raw`(?<![\p{L}\p{N}_])${PAL}(?:,?\s+(?:(?:de|del)\s+(?:la\s+|los\s+)?|y\s+)?${PAL}){1,5}`, 'gu')
const SUELTA = new RegExp(String.raw`(?<![\p{L}\p{N}_\[])[${MAYUS}](?=[\p{L}'-]*\p{Ll})[\p{L}'-]+(?![\p{L}\p{N}_])`, 'gu')
const INICIALES = new RegExp(String.raw`(?<![\p{L}\p{N}_])(?:[${MAYUS}]\.){2,}`, 'gu')
const TRATAMIENTO = /\b(?:lic|licenciad[oa]|ing|inge|ingenier[oa]|sr|sra|srta|señor(?:a|ita)?|don|doña|dr|dra|doctor(?:a)?|mtro|mtra|maestr[oa]|arq|prof|profe|c\.\s?p)\.?\s+((?:[\p{L}][\p{L}'.-]*\s*){1,6})/giu
const PUESTO = 'chofer|almacenista|capturista|gerente|jef[ea]|supervisor(?:a)?|compañer[oa]|encargad[oa]|comprador(?:a)?|vendedor(?:a)?|cajer[oa]|becari[oa]|secretari[oa]|tesorer[oa]'
const SALUDO = 'hola|saludos|gracias|buen(?:os|as)\\s+(?:d[ií]as|tardes|noches)|cc:?'
const TRAS_DISPARADOR = new RegExp(String.raw`\b(soy|me llamo|de parte de|atte\.?|atentamente|seg[uú]n|contactar a|llamar a|escribir a|habl[eé] con|mensaje de|correo de|${PUESTO}|${SALUDO})([\s,:]+)((?:[\p{L}][\p{L}'.-]*\s*){1,6})`, 'giu')
const ANTES_DE_VERBO = /\b([\p{L}][\p{L}'.-]*(?:\s+[\p{L}][\p{L}'.-]*){0,3})(\s+(?:\([^)]*\)\s+)?)(?=reporta|report[oó]|dice|pide|solicita|comenta|indica)/gu

const esMarca = (p: string) => /^\[/.test(p)
const CONECTOR = /^(de|del|la|las|los|y)$/i
const esDeNombre = (p: string) => !esVocabulario(p) && !esMarca(p) && !/^[a-z]$/.test(p)
/** Cuántas palabras seguidas, desde el inicio, son el nombre: las que no son vocabulario y los «de la» entre ellas. */
function inicioDeNombre(palabras: readonly string[]): number {
  let k = 0
  for (let i = 0; i < palabras.length; i++) {
    if (esDeNombre(palabras[i]!)) k = i + 1
    else if (!(k && CONECTOR.test(palabras[i]!))) break
  }
  return k
}

/** Lo que va después de un disparador (tratamiento, firma, saludo, puesto): las palabras que no son vocabulario. */
function trasDisparador(c: Cuenta, antes: string, resto: string, m: string): string {
  const palabras = resto.trim().split(/\s+/)
  const k = inicioDeNombre(palabras)
  return k ? `${antes}${marca(c, 'NOMBRE')} ${palabras.slice(k).join(' ')}`.trimEnd() + (m.endsWith(' ') ? ' ' : '') : m
}

/** Un nombre suelto con mayúscula a media frase (no al inicio, donde la mayúscula no dice nada) y que no es vocabulario. */
function reemplazaSueltas(texto: string, c: Cuenta): string {
  return texto.replace(SUELTA, (m: string, pos: number, todo: string) => {
    const antes = todo.slice(0, pos)
    const previo = antes.replace(/[\s"'«(]+$/, '')
    const inicioDeFrase = previo === '' || /[.!?¡¿]$/.test(previo) || /\n[\s"'«(]*$/.test(antes)
    return inicioDeFrase || esVocabulario(m) ? m : marca(c, 'NOMBRE')
  })
}

/** Un nombre común en cualquier caja, más lo pegado a él que no es vocabulario («pepe gonzalez», «MARIA DE LA LUZ CUAUHTLE»). */
function reemplazaConocidos(texto: string, c: Cuenta): string {
  const ps = [...texto.matchAll(/[\p{L}\p{N}_'-]+/gu)].map((m) => ({ ini: m.index!, fin: m.index! + m[0].length, p: m[0] }))
  const libre = (i: number) => texto[ps[i]!.ini - 1] !== '[' && !/\d/.test(ps[i]!.p) && !/^[a-z]$/.test(ps[i]!.p) && !esVocabulario(ps[i]!.p)
  const pegada = (i: number, j: number) => /^\s+$/.test(texto.slice(ps[i]!.fin, ps[j]!.ini))
  const tramos: Array<[number, number]> = []
  for (let i = 0; i < ps.length; i++) {
    if (!libre(i) || !esNombreConocido(ps[i]!.p)) continue
    let a = i, b = i
    while (a > 0 && pegada(a - 1, a) && libre(a - 1)) a--
    for (let j = b + 1; j < ps.length && pegada(j - 1, j); j++) {
      if (libre(j)) b = j
      else if (!CONECTOR.test(ps[j]!.p)) break
    }
    tramos.push([ps[a]!.ini, ps[b]!.fin]); i = b
  }
  let out = texto
  for (const [ini, fin] of tramos.reverse()) out = out.slice(0, ini) + marca(c, 'NOMBRE') + out.slice(fin)
  return out
}

function reemplazaNombres(texto: string, c: Cuenta): string {
  let t = texto.replace(INICIALES, () => marca(c, 'NOMBRE'))
  t = t.replace(TRATAMIENTO, (m, resto: string) => trasDisparador(c, '', resto, m))
  t = t.replace(SECUENCIA, (m) => (m.split(/[\s,]+/).filter((p) => !CONECTOR.test(p)).some((p) => !esVocabulario(p)) ? marca(c, 'NOMBRE') : m))
  t = reemplazaConocidos(t, c)
  t = t.replace(TRAS_DISPARADOR, (m, disp: string, sep: string, resto: string) => trasDisparador(c, `${disp}${sep}`, resto, m))
  t = t.replace(ANTES_DE_VERBO, (m, frase: string, sep: string) => {
    const palabras = frase.split(/\s+/)
    let k = palabras.length
    while (k > 0 && esDeNombre(palabras[k - 1]!)) k--
    if (k === palabras.length) return m
    return `${palabras.slice(0, k).join(' ')}${k ? ' ' : ''}${marca(c, 'NOMBRE')}${sep}`
  })
  return reemplazaSueltas(t, c)
}

function aplicaDetectores(texto: string, v: Validadores, c: Cuenta): string {
  let t = texto.replace(CORREO, () => marca(c, 'CORREO')).replace(CORREO_DICHO, () => marca(c, 'CORREO'))
  t = reemplazaIdentificadores(t, c)
  t = t.replace(ETIQUETA_PERSONAL, (_m, etq: string, sep: string) => `${etq}${sep}${marca(c, 'DATO_PERSONAL')}`)
  t = t.replace(MONTO, () => marca(c, 'MONTO')).replace(FECHA, () => marca(c, 'FECHA')).replace(DOMICILIO, () => marca(c, 'DOMICILIO'))
  t = t.replace(NUMERO_LARGO, (m, pos: number, todo: string) => {
    const tecnico = /\b(pedido|documento|doc\.?|orden|material|factura|idoc|entrega|folio|oc|fi|sd|mm)\s*\w{0,3}\s*$/i.test(todo.slice(Math.max(0, pos - 24), pos))
    return marca(c, tecnico ? 'NUMERO' : tipoDeNumero(m.replace(/\D/g, ''), v))
  })
  return reemplazaNombres(reemplazaUsuarios(t, c), c)
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

/** Lo que queda después de reemplazar y que podría ser personal: si aparece, no entra. Las marcas no cuentan. */
function senalesResiduales(texto: string): string[] {
  const t = texto.replace(/\[[A-Z_]+\]/g, ' ')
  const s = new Set<string>()
  if (new RegExp(String.raw`@|\barroba\b|\(at\)|\[at\]|\bpunto\s+com\b|\b[\w-]+\.(?:com|mx|net|org|edu|gob)\b|\b(?:gmail|hotmail|yahoo|icloud|protonmail)\b`, 'i').test(t)) s.add(SENALES.correo)
  if (new RegExp(String.raw`\d(?:${SEP}{0,2}\d){6,}`).test(t)) s.add(SENALES.digitos)
  if (/\b(?:Lic|Ing|Inge|Sr|Sra|Srta|Dr|Dra|Mtro|Mtra|Doña|Don)\.?\s+\p{L}/u.test(t)) s.add(SENALES.tratamiento)
  if (/(su01|contrase[nñ]a|desbloque|bloquead|\brol\b)/i.test(t) && /\b[A-Z]{5,15}\b/.test(t.replace(/\b[A-Z]{2,5}\d\w*\b/g, ''))) {
    const sueltas = [...t.matchAll(/\b[A-Z]{5,15}\b/g)].map((m) => m[0]).filter((p) => !esVocabulario(p))
    if (sueltas.length) s.add(SENALES.usuario)
  }
  return [...s]
}

/** Anonimiza para el sandbox. Caso de personal o señal residual → cuarentena. */
export function anonimiza(texto: string, v: Validadores): Anonimizado {
  const cuenta: Cuenta = {}
  const t = aplicaDetectores(texto, v, cuenta)
  const senales = senalesResiduales(t)
  if (CONTEXTO_PERSONAL.test(texto)) senales.unshift(SENALES.personal)
  return { texto: t, reemplazos: cuenta, senales, veredicto: senales.length ? 'cuarentena' : 'entra' }
}

export { normalizaPalabra }
