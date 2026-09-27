/**
 * De lo que un motor LEYO en la foto (texto) a fechas y lotes, de forma DETERMINISTA. El motor
 * transcribe; aqui se decide que significa, y lo que no se puede decidir se dice.
 *
 * Tres reglas que salen de fotos reales (docs/goals/foto-articulo-y-caducidad-leida.md):
 * - Unas cifras pegadas SIN rotulo no son una fecha: la clave del proveedor (12076239) o un
 *   codigo de linea tambien son cifras. Con rotulo (CAD, EXP, BEST BEFORE...) o con el formato
 *   aprendido del articulo, si.
 * - La ambiguedad se ENSENA: 03/04/26 es 3 de abril o 4 de marzo; 241123 es 24/11/23 o 23/11/24.
 *   Nunca se elige en silencio.
 * - Un dia imposible (38/10/26) no se «arregla»: se dice, y si cambiando UNA cifra 8/9/6 por 0
 *   sale una fecha valida (el cero con diagonal de las impresoras de inyeccion), se sugiere.
 */
export type TipoFecha = 'caducidad' | 'consumo-preferente' | 'fabricacion' | 'sin-rotulo'

export type FormatoFecha =
  | 'DD/MM/AA' | 'DD/MM/AAAA' | 'MM/DD/AA' | 'MM/DD/AAAA' | 'AAAA/MM/DD'
  | 'DDMMAA' | 'AAMMDD' | 'DDMMAAAA' | 'AAAAMMDD'
  | 'DD MES AA' | 'DD MES AAAA' | 'MES AA' | 'MES AAAA' | 'MM/AA' | 'MM/AAAA' | 'JULIANO AADDD'

export interface LecturaDeFecha {
  readonly iso: string
  readonly formato: FormatoFecha
  /** Mes y año sin dia: vale hasta el ultimo dia del mes. */
  readonly finDeMes?: boolean
}

export interface CandidatoFecha {
  readonly tipo: TipoFecha
  /** El rotulo tal como se leyo («CAD», «BEST BEFORE»...). */
  readonly rotulo?: string
  /** El fragmento tal como se leyo. */
  readonly texto: string
  readonly inicio: number
  /** Una = sin ambiguedad; dos o mas = la persona elige. Vacia si `invalida`. */
  readonly lecturas: readonly LecturaDeFecha[]
  readonly invalida?: string
  /** Si es invalida: variantes cambiando UNA cifra (posible cero con diagonal). Propuestas, no datos. */
  readonly sugerencias?: readonly LecturaDeFecha[]
  /** El formato aprendido del articulo resolvio la ambiguedad. */
  readonly aprendido?: boolean
}

export interface LoteLeido {
  readonly valor: string
  /** Llevaba rotulo (LOTE, LOT) o la forma L + cifras: mas fiable que un codigo suelto. */
  readonly rotulado: boolean
}

export interface FechasLeidas {
  readonly texto: string
  readonly candidatos: readonly CandidatoFecha[]
  readonly lotes: readonly LoteLeido[]
  /** «FECHA DE CADUCIDAD Y LOTE INDICADOS EN EL ENVASE»: la fecha no esta en esta cara. */
  readonly remite: boolean
}

export interface FormatoAprendido {
  readonly formato: FormatoFecha
  readonly tipo: Exclude<TipoFecha, 'sin-rotulo'>
}

const MESES: readonly (readonly string[])[] = [
  ['ENE', 'ENERO', 'JAN', 'JANUARY'], ['FEB', 'FEBRERO', 'FEBRUARY'], ['MAR', 'MARZO', 'MARCH'], ['ABR', 'ABRIL', 'APR', 'APRIL'],
  ['MAY', 'MAYO'], ['JUN', 'JUNIO', 'JUNE'], ['JUL', 'JULIO', 'JULY'], ['AGO', 'AGOSTO', 'AUG', 'AUGUST'],
  ['SEP', 'SEPT', 'SEPTIEMBRE', 'SETIEMBRE', 'SEPTEMBER'], ['OCT', 'OCTUBRE', 'OCTOBER'], ['NOV', 'NOVIEMBRE', 'NOVEMBER'], ['DIC', 'DICIEMBRE', 'DEC', 'DECEMBER'],
]
/** El mes admite 0 donde va una O («AG0», «0CT», «N0V»): las impresoras de inyeccion los dibujan igual. */
const mesRegex = (m: string) => m.replace(/O/g, '[O0]')
const TODOS_MESES = MESES.flat().sort((a, b) => b.length - a.length).map(mesRegex).join('|')
const mesDe = (t: string): number => MESES.findIndex((ms) => ms.includes(t.replace(/0/g, 'O'))) + 1

const ROTULOS: readonly { readonly tipo: Exclude<TipoFecha, 'sin-rotulo'>; readonly re: RegExp }[] = [
  { tipo: 'consumo-preferente', re: /CONS(?:UMIR|UMO)?\.?\s*PREF(?:ERENTE(?:MENTE)?)?\.?(?:\s*ANTES\s*DE(?:L)?)?|BEST\s*BEF(?:ORE)?|BEST\s*BY|\bBBE?\b|\bC\.?P\.?(?=\s*\d)/g },
  { tipo: 'caducidad', re: /FECHA\s*DE\s*CADUCIDAD|F(?:ECH)?\.?\s*CAD(?:UC)?\.?|CADUCIDAD|CADUCA|\bCAD\b\.?|(?<=[^A-Z]|^)CAD(?=\d)|\bEXP(?:IRA|IRY|\.)?\b|(?<=[^A-Z]|^)EXP(?=\d)|\bVENCE\b|\bVENC\.?|\bVTO\b|USE\s*BY/g },
  { tipo: 'fabricacion', re: /ELAB(?:ORADO|ORACION)?\.?|\bFAB(?:RICACION|RICADO)?\b\.?|\bPROD(?:UCIDO|UCCION)?\b\.?|\bMFG\b|\bMFD\b|ENVASADO|\bPKD\b/g },
]

const REMITE = /(CADUCIDAD|LOTE|CONSUMO|FECHA|EXP|BEST)[A-Z\s,.Y]{0,40}?(INDICAD[OA]S?|IMPRES[OA]S?|VER|VEASE|SEE)\s+(EN\s+)?(EL\s+|LA\s+)?(ENVASE|EMPAQUE|EMBALAJE|TAPA|FONDO|BASE|CUELLO|BOTTOM|LID|CAP|PACKAGE|ETIQUETA)/

const esBisiesto = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0
const diasDelMes = (a: number, m: number) => [31, esBisiesto(a) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 0
const dos = (n: number) => String(n).padStart(2, '0')
const anio = (t: string) => (t.length === 2 ? 2000 + Number(t) : Number(t))

/** `AAAA-MM-DD` si la fecha existe; si no, por que no. */
export function fechaValida(a: number, m: number, d: number): { iso: string } | { motivo: string } {
  if (m < 1 || m > 12) return { motivo: `el mes ${dos(m)} no existe` }
  if (d < 1 || d > diasDelMes(a, m)) return { motivo: `el día ${dos(d)} no existe en ${dos(m)}/${a}` }
  return { iso: `${a}-${dos(m)}-${dos(d)}` }
}

const ultimoDia = (a: number, m: number): string => `${a}-${dos(m)}-${dos(diasDelMes(a, m))}`

interface Coincidencia { readonly inicio: number; readonly texto: string; readonly opciones: readonly Opcion[]; readonly suelta: boolean }
/** Una forma de leer el fragmento: año, mes, dia (dia 0 = fin de mes) y su formato. */
interface Opcion { readonly a: number; readonly m: number; readonly d: number; readonly formato: FormatoFecha }

const PATRONES: readonly { readonly re: RegExp; readonly suelta: boolean; readonly lee: (g: string[]) => Opcion[] }[] = [
  { re: /\b(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\b/g, suelta: false, lee: ([a, m, d]) => [{ a: Number(a), m: Number(m), d: Number(d), formato: 'AAAA/MM/DD' }] },
  {
    re: /(?<![\d/.-])(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?![\d/.-])/g, suelta: false,
    lee: ([x, y, a]) => {
      const f4 = a!.length === 4
      const dmy: Opcion = { a: anio(a!), m: Number(y), d: Number(x), formato: f4 ? 'DD/MM/AAAA' : 'DD/MM/AA' }
      const mdy: Opcion = { a: anio(a!), m: Number(x), d: Number(y), formato: f4 ? 'MM/DD/AAAA' : 'MM/DD/AA' }
      return x === y ? [dmy] : Number(x) > 12 ? [dmy] : Number(y) > 12 ? [mdy] : [dmy, mdy]
    },
  },
  { re: new RegExp(`(?<!\\d)(\\d{1,2})\\s?[/.-]?\\s?(${TODOS_MESES})\\s?[/.-]?\\s?(\\d{4}|\\d{2})(?!\\d)`, 'g'), suelta: false, lee: ([d, mes, a]) => [{ a: anio(a!), m: mesDe(mes!), d: Number(d), formato: a!.length === 4 ? 'DD MES AAAA' : 'DD MES AA' }] },
  { re: new RegExp(`(?<![\\dA-Z])(${TODOS_MESES})\\s?[/.-]?\\s?(\\d{4}|\\d{2})(?!\\d)`, 'g'), suelta: false, lee: ([mes, a]) => [{ a: anio(a!), m: mesDe(mes!), d: 0, formato: a!.length === 4 ? 'MES AAAA' : 'MES AA' }] },
  { re: /(?<![\d/.-])(\d{1,2})[/.-](\d{4}|\d{2})(?![\d/.-])/g, suelta: true, lee: ([m, a]) => [{ a: anio(a!), m: Number(m), d: 0, formato: a!.length === 4 ? 'MM/AAAA' : 'MM/AA' }] },
  {
    re: /(?<!\d)(\d{8}|\d{6})(?!\d)/g, suelta: true,
    lee: ([t]) => t!.length === 6
      ? [{ a: anio(t!.slice(4)), m: Number(t!.slice(2, 4)), d: Number(t!.slice(0, 2)), formato: 'DDMMAA' }, { a: anio(t!.slice(0, 2)), m: Number(t!.slice(2, 4)), d: Number(t!.slice(4)), formato: 'AAMMDD' }]
      : [{ a: Number(t!.slice(4)), m: Number(t!.slice(2, 4)), d: Number(t!.slice(0, 2)), formato: 'DDMMAAAA' }, { a: Number(t!.slice(0, 4)), m: Number(t!.slice(4, 6)), d: Number(t!.slice(6)), formato: 'AAAAMMDD' }],
  },
  { re: /(?<!\d)(\d{2})(\d{3})(?!\d)/g, suelta: true, lee: ([a, ddd]) => [{ a: anio(a!), m: 1, d: Number(ddd), formato: 'JULIANO AADDD' }] },
]

/** Todas las coincidencias, sin solaparse: la primera forma (mas especifica) gana su tramo. */
function coincidencias(t: string): Coincidencia[] {
  const tomadas: [number, number][] = []
  const libre = (i: number, f: number) => tomadas.every(([a, b]) => f <= a || i >= b)
  const salida: Coincidencia[] = []
  for (const p of PATRONES) {
    p.re.lastIndex = 0
    for (let m = p.re.exec(t); m; m = p.re.exec(t)) {
      const fin = m.index + m[0].length
      if (!libre(m.index, fin)) continue
      tomadas.push([m.index, fin])
      salida.push({ inicio: m.index, texto: m[0], opciones: p.lee(m.slice(1)), suelta: p.suelta })
    }
  }
  return salida.sort((a, b) => a.inicio - b.inicio)
}

/** La opcion como fecha: el dia 0 es fin de mes; el juliano cuenta dias desde el 1 de enero. */
function aLectura(o: Opcion): LecturaDeFecha | { motivo: string } {
  if (o.formato === 'JULIANO AADDD') {
    const total = esBisiesto(o.a) ? 366 : 365
    if (o.d < 1 || o.d > total) return { motivo: `el día juliano ${o.d} no existe en ${o.a}` }
    const f = new Date(Date.UTC(o.a, 0, o.d))
    return { iso: f.toISOString().slice(0, 10), formato: o.formato }
  }
  if (o.d === 0) return o.m >= 1 && o.m <= 12 ? { iso: ultimoDia(o.a, o.m), formato: o.formato, finDeMes: true } : { motivo: `el mes ${dos(o.m)} no existe` }
  const v = fechaValida(o.a, o.m, o.d)
  return 'iso' in v ? { iso: v.iso, formato: o.formato } : v
}

/** Cambiando UNA cifra 8, 9 o 6 por 0, ¿sale una fecha valida? Solo si sale exactamente una. */
function sugerenciasDe(c: Coincidencia, tipo: TipoFecha, hoy?: string): LecturaDeFecha[] {
  const variantes: LecturaDeFecha[] = []
  for (let i = 0; i < c.texto.length; i++) {
    if (!'869'.includes(c.texto[i]!)) continue
    const texto = c.texto.slice(0, i) + '0' + c.texto.slice(i + 1)
    for (const m of coincidencias(texto)) for (const o of m.opciones) {
      const l = aLectura(o)
      if ('iso' in l && m.texto === texto && !plausible(l.iso, tipo, hoy) && !variantes.some((v) => v.iso === l.iso)) variantes.push(l)
    }
  }
  return variantes.length === 1 ? variantes : []
}

interface Rotulo { readonly tipo: Exclude<TipoFecha, 'sin-rotulo'>; readonly texto: string; readonly inicio: number; readonly fin: number }

function rotulos(t: string): Rotulo[] {
  const r: Rotulo[] = []
  for (const x of ROTULOS) {
    x.re.lastIndex = 0
    for (let m = x.re.exec(t); m; m = x.re.exec(t)) r.push({ tipo: x.tipo, texto: m[0].trim(), inicio: m.index, fin: m.index + m[0].length })
  }
  return r
}

/**
 * El rotulo de una fecha: el mas cercano ANTES (a menos de 14 caracteres y SIN cifras de por
 * medio: «BEST BEFORE 14/06/ 5/27» no le da rotulo a «5/27», que es un pedazo mal leido). Si no
 * hay, uno pegado DESPUES (el texto girado se lee a veces fecha-primero: «14/06/26 BEST BEFORE»)
 * que no tenga su propia fecha delante.
 */
function rotuloDe(t: string, c: Coincidencia, todas: readonly Coincidencia[]): { tipo: Exclude<TipoFecha, 'sin-rotulo'>; texto: string } | undefined {
  const lista = rotulos(t)
  const antes = lista.filter((r) => r.fin <= c.inicio && c.inicio - r.fin <= 14 && !/\d/.test(t.slice(r.fin, c.inicio)))
    .sort((a, b) => b.fin - a.fin)[0]
  if (antes) return { tipo: antes.tipo, texto: antes.texto }
  const fin = c.inicio + c.texto.length
  const despues = lista.find((r) => r.inicio >= fin && r.inicio - fin <= 3 && !todas.some((o) => o.inicio >= r.fin && o.inicio - r.fin <= 14 && !/\d/.test(t.slice(r.fin, o.inicio))))
  return despues ? { tipo: despues.tipo, texto: despues.texto } : undefined
}

/** Ventana de años plausibles: una caducidad no es de hace 3 años ni de dentro de 12; una fabricacion, no del futuro. */
function plausible(iso: string, tipo: TipoFecha, hoy?: string): string | undefined {
  if (!hoy) return undefined
  const dias = (Date.parse(iso) - Date.parse(hoy)) / 86_400_000
  const [min, max] = tipo === 'fabricacion' ? [-6 * 366, 31] : [-3 * 366, 12 * 366]
  return dias < min || dias > max ? `el año ${iso.slice(0, 4)} no es plausible para una fecha de ${tipo === 'fabricacion' ? 'fabricación' : 'caducidad'}` : undefined
}

/** Normaliza para buscar: mayusculas, sin acentos, un espacio. Las posiciones cambian poco. */
export const normalizaImpreso = (t: string): string => t.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ \t]+/g, ' ')

function candidatoDe(t: string, c: Coincidencia, todas: readonly Coincidencia[], aprendido?: FormatoAprendido, hoy?: string): CandidatoFecha | undefined {
  const rotulo = rotuloDe(t, c, todas)
  const conFormato = aprendido ? c.opciones.filter((o) => o.formato === aprendido.formato) : []
  // Cifras sueltas sin rotulo ni formato aprendido: no son fecha (la clave del proveedor tambien son cifras).
  if (c.suelta && !rotulo && conFormato.length === 0) return undefined
  const opciones = conFormato.length > 0 ? conFormato : c.opciones
  const tipo: TipoFecha = rotulo?.tipo ?? (conFormato.length > 0 ? aprendido!.tipo : 'sin-rotulo')
  const leidas = opciones.map(aLectura).map((l) => ('iso' in l && plausible(l.iso, tipo, hoy) ? { motivo: plausible(l.iso, tipo, hoy)! } : l))
  const validas = leidas.filter((l): l is LecturaDeFecha => 'iso' in l)
  const base = { tipo, texto: c.texto, inicio: c.inicio, ...(rotulo ? { rotulo: rotulo.texto } : {}), ...(conFormato.length > 0 ? { aprendido: true } : {}) }
  if (validas.length > 0) return { ...base, lecturas: validas }
  const motivo = leidas.find((l): l is { motivo: string } => 'motivo' in l)?.motivo ?? 'no es una fecha'
  const sugerencias = sugerenciasDe(c, tipo, hoy)
  return { ...base, lecturas: [], invalida: motivo, ...(sugerencias.length > 0 ? { sugerencias } : {}) }
}

const LOTE_ROTULADO = /\bL(?:OTE|OT)?\s*[:.#]\s*(?=[A-Z0-9-]*\d)([A-Z0-9][A-Z0-9-]{1,19})|\bLOTE?\s+(?=[A-Z0-9-]*\d)([A-Z0-9][A-Z0-9-]{1,19})|\b(L\d[A-Z0-9]{2,19})\b/g
const CODIGO_SUELTO = /\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{5,20}\b/g

/** Lotes: primero los rotulados (LOTE, LOT, L + cifras); los codigos sueltos, despues y marcados. */
function lotesDe(t: string, fechas: readonly CandidatoFecha[]): LoteLeido[] {
  const lotes: LoteLeido[] = []
  const agrega = (valor: string, rotulado: boolean) => { if (valor.length <= 20 && !lotes.some((l) => l.valor === valor)) lotes.push({ valor, rotulado }) }
  LOTE_ROTULADO.lastIndex = 0
  for (let m = LOTE_ROTULADO.exec(t); m; m = LOTE_ROTULADO.exec(t)) agrega((m[1] ?? m[2] ?? m[3])!, true)
  const tocaFecha = (i: number, f: number) => fechas.some((x) => i < x.inicio + x.texto.length && f > x.inicio)
  CODIGO_SUELTO.lastIndex = 0
  for (let m = CODIGO_SUELTO.exec(t); m; m = CODIGO_SUELTO.exec(t)) {
    if (tocaFecha(m.index, m.index + m[0].length) || lotes.some((l) => l.valor.includes(m![0])) || ROTULOS.some((r) => new RegExp(`^(${r.re.source})$`).test(m![0])) || new RegExp(`^\\d{1,2}(${TODOS_MESES})\\d{2,4}$`).test(m[0])) continue
    agrega(m[0], false)
  }
  return lotes
}

/** Lo leido en la foto, interpretado: fechas con su tipo, lotes y si la fecha esta en otra cara. */
export function leeFechasImpresas(texto: string, aprendido?: FormatoAprendido, hoy?: string): FechasLeidas {
  const t = normalizaImpreso(texto)
  const todas = coincidencias(t)
  const candidatos = todas.map((c) => candidatoDe(t, c, todas, aprendido, hoy)).filter((c): c is CandidatoFecha => c !== undefined)
  return { texto, candidatos, lotes: lotesDe(t, candidatos), remite: REMITE.test(t) }
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** «jueves 30 de octubre de 2026»: la fecha dicha sin ambiguedad posible. */
export function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number) as [number, number, number]
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay()
  return `${DIAS_SEMANA[dia]} ${d} de ${NOMBRES_MES[m - 1]} de ${a}`
}

/** Suma dias a una fecha ISO (fabricacion + vida util). */
export function sumaDiasIso(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}

export const TEXTO_TIPO_FECHA: Readonly<Record<TipoFecha, string>> = {
  caducidad: 'caducidad', 'consumo-preferente': 'consumo preferente', fabricacion: 'fabricación', 'sin-rotulo': 'sin rótulo (¿caducidad o fabricación?)',
}
