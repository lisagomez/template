/**
 * La tabla de AIs, leida del GS1 Barcode Syntax Dictionary (ver `datos.ts`).
 *
 * Una sola fuente para las tres preguntas que el resto del nucleo hace sin parar: ¿existe este
 * AI?, ¿cuanto mide y con que caracteres?, ¿lleva FNC1 detras? — y para las reglas de
 * combinacion (`req=` asociaciones obligatorias, `ex=` pares invalidos) de las GenSpecs §4.13-4.14.
 */
import { COMMIT_DICCIONARIO, LINEAS_DICCIONARIO } from './datos.js'

export { COMMIT_DICCIONARIO }

/** N numerico · X CSET 82 · Y CSET 39 · Z base64url (GenSpecs §7.11). */
export type TipoComponente = 'N' | 'X' | 'Y' | 'Z'

export interface Componente {
  readonly tipo: TipoComponente
  readonly min: number
  readonly max: number
  readonly opcional: boolean
  readonly linters: readonly string[]
}

export interface EntradaAi {
  readonly ai: string
  /** `*`: longitud predefinida, NO lleva FNC1 detras aunque le siga otro AI (Tabla 7-6). */
  readonly longitudPredefinida: boolean
  readonly componentes: readonly Componente[]
  /** Alternativas de asociacion obligatoria: basta con cumplir UNA; cada una exige TODOS sus AIs. */
  readonly requiere: readonly (readonly string[])[]
  /** Patrones de AIs con los que es invalido emparejarlo (`n` = cualquier digito). */
  readonly excluye: readonly string[]
  readonly titulo: string
  readonly longitudMin: number
  readonly longitudMax: number
}

function parseaComponente(txt: string): Componente {
  const opcional = txt.startsWith('[')
  const [tipoLong = '', ...linters] = txt.replace(/[[\]]/g, '').split(',')
  const m = /^([NXYZ])(\.\.)?(\d+)$/.exec(tipoLong)
  if (!m) throw new Error(`diccionario GS1: componente ilegible «${txt}»`)
  const n = Number(m[3])
  return { tipo: m[1] as TipoComponente, min: m[2] ? 1 : n, max: n, opcional, linters }
}

function expandeRango(ais: string): string[] {
  const [desde, hasta] = ais.split('-')
  if (!hasta || !desde) return [ais]
  const salida: string[] = []
  for (let i = Number(desde); i <= Number(hasta); i++) salida.push(String(i).padStart(desde.length, '0'))
  return salida
}

function parseaLinea(linea: string): EntradaAi[] {
  const [izq = '', titulo = ''] = linea.split(' # ')
  const partes = izq.trim().split(' ')
  const ais = partes.shift() ?? ''
  let flags = ''
  if (partes[0] && /^[*!?"$%&'()+,\-./:;<=>@[\\\]^_`{|}~]+$/.test(partes[0])) flags = partes.shift() ?? ''
  const componentes: Componente[] = []
  const requiere: string[][] = []
  const excluye: string[] = []
  for (const p of partes) {
    if (p.startsWith('req=')) requiere.push(...p.slice(4).split(',').map((alt) => alt.split('+')))
    else if (p.startsWith('ex=')) excluye.push(...p.slice(3).split(','))
    else if (p.startsWith('dlpkey')) continue
    else componentes.push(parseaComponente(p))
  }
  const longitudMin = componentes.filter((c) => !c.opcional).reduce((s, c) => s + c.min, 0)
  const longitudMax = componentes.reduce((s, c) => s + c.max, 0)
  return expandeRango(ais).map((ai) => ({
    ai, longitudPredefinida: flags.includes('*'), componentes, requiere, excluye,
    titulo: titulo.trim(), longitudMin, longitudMax,
  }))
}

const TABLA: ReadonlyMap<string, EntradaAi> = new Map(
  LINEAS_DICCIONARIO.flatMap(parseaLinea).map((e) => [e.ai, e]),
)

export function entradaAi(ai: string): EntradaAi | undefined {
  return TABLA.get(ai)
}

export function totalAis(): number {
  return TABLA.size
}

/**
 * El AI con que empieza `datos` en la posicion `desde`. Los AIs GS1 forman un codigo prefijo
 * (ningun AI es prefijo de otro), asi que a lo sumo uno de 2, 3 o 4 digitos coincide.
 */
export function aiAlInicio(datos: string, desde = 0): string | undefined {
  for (const n of [2, 3, 4]) {
    const candidato = datos.slice(desde, desde + n)
    if (candidato.length === n && TABLA.has(candidato)) return candidato
  }
  return undefined
}

/** `394n` casa con 3940..3949; `01` solo con 01. */
export function casaPatron(patron: string, ai: string): boolean {
  if (patron.length !== ai.length) return false
  for (let i = 0; i < patron.length; i++) if (patron[i] !== 'n' && patron[i] !== ai[i]) return false
  return true
}

/** Nombres en castellano para lo que se ve en pantalla; el resto usa el titulo GS1. */
const NOMBRES: Readonly<Record<string, string>> = {
  '00': 'SSCC (unidad logística)', '01': 'GTIN', '02': 'GTIN del contenido', '10': 'Lote',
  '11': 'Fecha de producción', '13': 'Fecha de empaque', '15': 'Consumir preferentemente antes de',
  '16': 'Vender antes de', '17': 'Fecha de caducidad', '20': 'Variante', '21': 'Número de serie',
  '30': 'Cantidad variable', '37': 'Unidades contenidas', '400': 'Orden de compra',
  '410': 'Entregar a (GLN)', '414': 'Ubicación (GLN)', '420': 'Código postal de destino',
  '90': 'Dato interno acordado', '91': 'Dato interno de la empresa',
}

export function nombreAi(ai: string): string {
  return NOMBRES[ai] ?? entradaAi(ai)?.titulo ?? `AI ${ai}`
}
