/**
 * Generalizar para el NÚCLEO (D1; PRP-010 H-19): lo que lee toda consultora no dice de quién es. Además de
 * anonimizar, quita
 *   - los objetos propios del cliente: Z… y Y… en cualquier caja (también tras `/n`), los de un namespace propio
 *     (`/ACME/…`) y los campos ZZ/YY de una tabla estándar (`VBAK-ZZRUTA`). Los estándar que empiezan con Z
 *     (`BSEG-ZLSCH`, `EKKO-ZTERM`) y las palabras («ya», «zona») se quedan;
 *   - la estructura del cliente: sociedad, centro, almacén y organización de ventas o compras, con su código en
 *     cualquier forma («Sociedad: 2000», `BUKRS = 'MX10'`, «soc 2300», «Plnt 4100 / SLoc 0002») y en listas
 *     («sociedades 1100, 1200 y 1300; en la 1400»);
 *   - el nombre de la consultora y del cliente: completo o sin la razón social, sin acentos, en cualquier caja,
 *     su palabra distintiva y sus siglas.
 * Ayuda, no garantiza: el control es la firma del superadministrador, y la base rechaza lo que suba con un
 * identificador, un nombre de organización o un objeto propio (`ss_priv.propuesta_nucleo_generalizada`).
 */
import { anonimiza, type Anonimizado, type Validadores } from './anonimiza.js'
import { esVocabulario, normalizaPalabra } from './lexico.js'

/** Namespaces de SAP: no identifican a nadie. Cualquier otro es de un cliente o de un partner. */
const NAMESPACES_SAP: ReadonlySet<string> = new Set(['sapapo', 'scwm', 'scmtms', 'ui2', 'ui5', 'iwfnd', 'iwbep', 'bobf', 'sapsll', 'saptrx'])
const NAMESPACE = /(?:(?<![\w/])|(?<=\/[nNoO]))\/([A-Za-z0-9_]{2,10})\/[A-Za-z0-9_]*/g
const OBJETO_Z = /(?:(?<![\p{L}\p{N}_/-])|(?<=\/[nNoO]))([ZzYy][\p{L}\p{N}_]{2,40})(?![\p{L}\p{N}_])/gu
const CAMPO_ZZ = /(?<=[\p{L}\p{N}]-)(?:ZZ|YY)[\p{L}\p{N}_]*/giu
/** Campos ESTÁNDAR de SAP que empiezan con Z (pago, asignación, posición): no son del cliente. */
const Z_ESTANDAR: ReadonlySet<string> = new Set(['zlsch', 'zterm', 'zfbdt', 'zuonr', 'zlspr', 'zeile', 'zbd1t', 'zbd2t', 'zbd3t', 'zbd1p', 'zbd2p', 'zwels', 'zahls', 'zbukr', 'zinkz'])
const esPropio = (o: string) => !Z_ESTANDAR.has(o.toLowerCase()) && (/[\d_]/.test(o) || o === o.toUpperCase() || !esVocabulario(o))

function quitaObjetosPropios(texto: string): string {
  return texto
    .replace(NAMESPACE, (m, ns: string) => (NAMESPACES_SAP.has(ns.toLowerCase()) ? m : '[OBJETO_PROPIO]'))
    .replace(OBJETO_Z, (m, o: string) => (esPropio(o) ? '[OBJETO_PROPIO]' : m))
    .replace(CAMPO_ZZ, '[OBJETO_PROPIO]')
}

const UNIDADES: ReadonlyArray<readonly [marca: string, palabras: string]> = [
  ['[SOCIEDAD]', String.raw`sociedad(?:es)?|soc\.?|company\s+codes?|co\.?\s?cd|bukrs`],
  ['[ORG]', String.raw`centros?\s+de\s+(?:costos?|beneficios?)|ceco|cebe|[aá]rea\s+de\s+control|kokrs|kostl|prctr|org(?:anizaci[oó]n(?:es)?)?\.?\s+(?:de\s+)?(?:ventas|vtas\.?|compras)|sales\s+orgs?|purch(?:asing)?\.?\s+orgs?|vkorg|ekorg`],
  ['[CENTRO]', String.raw`centros?|plnt|plants?|plantas?|werks`],
  ['[ALMACEN]', String.raw`almac[eé]n(?:es)?|alm\.?|sloc|lgort`],
]
/** Un código de unidad: 2 a 10 letras o dígitos con al menos un dígito, entre comillas o no. */
const CODIGO = String.raw`['"]?(?=[A-Za-z]{0,3}\d)[A-Za-z0-9]{2,10}['"]?(?![\p{L}\p{N}_])`
const ENTRE_CODIGOS = String.raw`\s*(?:,|;|\/|\by\b|\be\b|\bo\b)\s*(?:(?:en\s+)?(?:la|el|los|las)\s+)?`

function quitaEstructura(texto: string): string {
  let t = texto
  for (const [m, palabras] of UNIDADES) {
    const re = new RegExp(String.raw`(?<![\p{L}\p{N}_])(${palabras})([\s:=#]+(?:es\s+)?)(${CODIGO}(?:${ENTRE_CODIGOS}${CODIGO})*)`, 'giu')
    t = t.replace(re, (_x, unidad: string, sep: string, lista: string) => `${unidad}${sep}${lista.replace(new RegExp(CODIGO, 'gu'), m)}`)
  }
  return t
}

const RAZON_SOCIAL = /,?\s*(?:s\.?\s*a\.?\s*p\.?\s*i\.?|s\.?\s*a\.?|s\.?\s*de\s+r\.?\s*l\.?|s\.?\s*c\.?|a\.?\s*c\.?|inc\.?|llc|ltd\.?)(?:\s*de\s+c\.?\s*v\.?)?\s*$/i
const VARIANTES: Readonly<Record<string, string>> = { a: 'aáàä', e: 'eéèë', i: 'iíìï', o: 'oóòö', u: 'uúùü', n: 'nñ' }
/** El nombre como expresión que acepta acentos o no, cualquier caja y cualquier espacio o coma entre palabras. */
function patron(s: string): string | null {
  const palabras = s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().split(/[\s,;]+/).filter(Boolean)
  const letra = (ch: string) => (VARIANTES[ch] ? `[${VARIANTES[ch]}]` : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return palabras.length ? palabras.map((w) => [...w].map(letra).join('')).join(String.raw`[\s,;]+`) : null
}

/** Las formas en que se nombra a una organización: completa, sin razón social, su palabra distintiva y sus siglas. */
function formasDe(nombre: string): { palabras: string[]; siglas: string[] } {
  const base = nombre.replace(RAZON_SOCIAL, '').trim()
  const tokens = base.split(/\s+/).filter(Boolean)
  const distintivas = tokens.filter((t) => normalizaPalabra(t).length >= 4 && !esVocabulario(t))
  const iniciales = (ts: string[]) => ts.map((t) => normalizaPalabra(t)[0] ?? '').join('').toUpperCase()
  const siglas = [iniciales(tokens), iniciales(tokens.filter((t) => !/^(de|del|la|las|el|los|y)$/i.test(t)))].filter((s) => s.length >= 3)
  return { palabras: [...new Set([nombre, base, ...distintivas])], siglas: [...new Set(siglas)] }
}

function quitaOrganizaciones(texto: string, nombres: readonly string[]): string {
  let t = texto
  for (const n of nombres) {
    const { palabras, siglas } = formasDe(n)
    for (const p of palabras.sort((a, b) => b.length - a.length)) {
      const re = patron(p)
      if (re) t = t.replace(new RegExp(String.raw`(?<![\p{L}\p{N}])${re}(?![\p{L}\p{N}])`, 'giu'), '[CLIENTE]')
    }
    for (const s of siglas) t = t.replace(new RegExp(String.raw`(?<![\p{L}\p{N}])${s}(?![\p{L}\p{N}])`, 'gu'), '[CLIENTE]')
  }
  return t
}

/** Para proponer al NÚCLEO: sin objetos propios, sin estructura, sin nombres de organización, y además anonimizado. */
export function generaliza(texto: string, v: Validadores, nombres: readonly string[]): Anonimizado {
  return anonimiza(quitaOrganizaciones(quitaEstructura(quitaObjetosPropios(texto)), nombres), v)
}
