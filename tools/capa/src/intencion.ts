/**
 * Operar por intención, sin LLM: la persona pide el resultado en lenguaje simple y la capa encuentra qué
 * módulo lo hace, comparando lo dicho con los ejemplos que declara cada enchufe. Si no está seguro, no
 * adivina: dice que no sabe o pregunta entre dos. Un modelo (C8) se puede INYECTAR para lo que las reglas no
 * resuelven; sin él, el enrutador es determinista y medible.
 *
 * Reimplementa el contrato de `.claude/references/operacion-por-intencion.md` de Arbrain v0.2.10 (829a9e9):
 * entender el pedido, localizar la entrada sin pedir rutas, pedir aclaración solo si la ambigüedad cambia la
 * acción y nunca inventar. Allá lo hace un hook léxico para el agente; aquí, un enrutador para el producto.
 */
import type { Intencion } from './enchufe.js'

export interface IntencionRuteable extends Intencion { modulo: string }

export type MotivoVeredicto = 'coincide' | 'ambigua' | 'sin-coincidencia' | 'vacio' | 'cerebro'

export interface Veredicto {
  intencion: IntencionRuteable | null
  confianza: number
  alternativas: Array<{ id: string; confianza: number }>
  motivo: MotivoVeredicto
}

/** Un modelo que clasifica lo que las reglas no resolvieron. En el HECHO no hay: queda «no medido». */
export interface CerebroDeIntencion {
  clasifica(texto: string, opciones: ReadonlyArray<{ id: string; queHace: string }>, senal?: AbortSignal): Promise<{ id: string | null; confianza: number }>
}

export interface OpcionesEnrutador {
  /** Desde aquí se acepta (0–1). */
  umbral?: number
  /** Si la segunda intención queda a este cociente de la primera o más, es ambigua. */
  margen?: number
}

export const UMBRAL = 0.5
export const MARGEN = 0.92

const VACIAS = new Set(('a al algo algun alguna ante con como cual de del desde donde el ella ellas ellos en entre es esa ese eso esta este esto favor ha hay la las le les lo los me mi mis muy necesito no nos o para pero por porfa porfavor puedes que quiero se si sin sobre su sus te ti tu tus un una uno unos unas y ya yo dame dime haz hazme oye ok vale bueno quisiera podrias podria gustaria').split(' '))

const normaliza = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim()

/** Raíz barata para el español: sin la -s final y cortada a cinco letras («citas» y «cita» caen juntas). */
const raiz = (t: string) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t).slice(0, 5)

export const raices = (texto: string): string[] => [...new Set(normaliza(texto).split(' ').filter((t) => t && !VACIAS.has(t)).map(raiz))]

interface Indice { porIntencion: Array<{ intencion: IntencionRuteable; frases: string[][] }>; idf: Map<string, number> }

function indexa(intenciones: readonly IntencionRuteable[]): Indice {
  const porIntencion = intenciones.map((intencion) => ({ intencion, frases: [...intencion.ejemplos, intencion.queHace].map(raices) }))
  const documentos = porIntencion.length || 1
  const enCuantas = new Map<string, number>()
  for (const { frases } of porIntencion) for (const r of new Set(frases.flat())) enCuantas.set(r, (enCuantas.get(r) ?? 0) + 1)
  const idf = new Map([...enCuantas].map(([r, n]) => [r, Math.log(1 + documentos / n)]))
  return { porIntencion, idf }
}

/** Dice ponderado por idf entre lo pedido y una frase de ejemplo. */
function parecido(pedido: string[], frase: string[], idf: Map<string, number>): number {
  const peso = (r: string) => idf.get(r) ?? Math.log(2)
  const comunes = pedido.filter((r) => frase.includes(r)).reduce((s, r) => s + peso(r), 0)
  const total = pedido.reduce((s, r) => s + peso(r), 0) + frase.reduce((s, r) => s + peso(r), 0)
  return total ? (2 * comunes) / total : 0
}

export interface Enrutador {
  resuelve(texto: string): Veredicto
  /** Con un cerebro inyectado, lo que las reglas no resolvieron se le pregunta; sin él, igual que `resuelve`. */
  resuelveConCerebro(texto: string, cerebro: CerebroDeIntencion | null, senal?: AbortSignal): Promise<Veredicto>
  intenciones(): readonly IntencionRuteable[]
}

export function creaEnrutador(intenciones: readonly IntencionRuteable[], o: OpcionesEnrutador = {}): Enrutador {
  const umbral = o.umbral ?? UMBRAL
  const margen = o.margen ?? MARGEN
  const indice = indexa(intenciones)
  const resuelve = (texto: string): Veredicto => {
    const pedido = raices(texto)
    if (!pedido.length) return { intencion: null, confianza: 0, alternativas: [], motivo: 'vacio' }
    const puntajes = indice.porIntencion
      .map(({ intencion, frases }) => ({ intencion, confianza: Math.max(...frases.map((f) => parecido(pedido, f, indice.idf))) }))
      .sort((a, b) => b.confianza - a.confianza)
    const alternativas = puntajes.slice(0, 3).map((p) => ({ id: p.intencion.id, confianza: Math.round(p.confianza * 1000) / 1000 }))
    const [primera, segunda] = puntajes
    if (!primera || primera.confianza < umbral) return { intencion: null, confianza: primera?.confianza ?? 0, alternativas, motivo: 'sin-coincidencia' }
    if (segunda && segunda.confianza >= umbral && segunda.confianza / primera.confianza >= margen) {
      return { intencion: null, confianza: primera.confianza, alternativas, motivo: 'ambigua' }
    }
    return { intencion: primera.intencion, confianza: primera.confianza, alternativas, motivo: 'coincide' }
  }
  return {
    resuelve,
    intenciones: () => intenciones,
    async resuelveConCerebro(texto, cerebro, senal) {
      const v = resuelve(texto)
      if (v.intencion || !cerebro || v.motivo === 'vacio') return v
      const r = await cerebro.clasifica(texto, intenciones.map((i) => ({ id: i.id, queHace: i.queHace })), senal)
      const elegida = intenciones.find((i) => i.id === r.id) ?? null
      return elegida && r.confianza >= umbral ? { ...v, intencion: elegida, confianza: r.confianza, motivo: 'cerebro' } : v
    },
  }
}
