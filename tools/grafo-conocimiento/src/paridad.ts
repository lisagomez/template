/**
 * Formato del corpus de paridad: la salida EXACTA del motor de Hermes, compactada sin pérdida.
 *
 * Crudo pesaba 2,98 MB para 782 casos, casi todo repetición: el checklist general de un ámbito
 * vuelve en cada keyword de sus categorías. Aquí las salidas se guardan una vez, y sus textos y
 * fuentes en tablas. El eco de la descripción y el disclaimer se reconstruyen desde la entrada.
 * `expandeSalida` devuelve lo que devolvió Python, campo a campo, y el generador lo comprueba caso
 * por caso antes de escribir (medicion/genera-paridad.mjs).
 */
import { z } from 'zod'
import { SalidaHermes } from './hermes.js'

const Indice = z.number().int().nonnegative()

const SalidaCompacta = z.strictObject({
  contexto: SalidaHermes.shape.contexto,
  estado: SalidaHermes.shape.estado,
  conceptos: z.array(
    z.strictObject({
      categoria: z.string().nullable(),
      estado: z.string(),
      razon: Indice,
      fuente: Indice.nullable(),
      banderas: z.array(Indice),
      checklist: z.array(Indice),
    }),
  ),
  banderas_rojas: z.array(Indice),
  checklist: z.array(Indice),
  fuentes: z.array(Indice),
})

const Entrada = z.strictObject({
  conceptos: z.array(z.strictObject({ descripcion: z.string().min(1), importe: z.number().optional() })).min(1),
  contexto: z.strictObject({ jurisdiccion: z.string(), dimension: z.string(), regimen: z.string(), fecha: z.string() }),
})

export const CasoParidad = z.strictObject({
  id: z.string().regex(/^[a-z_]+-\d{4}$/),
  familia: z.string(),
  entrada: Entrada,
  salida: Indice,
})

export const CorpusParidad = z.strictObject({
  formato: z.literal('corpus-paridad/1'),
  procedencia: z.looseObject({ commit: z.string(), seed_sha256: z.string(), motor_sha256: z.string(), python: z.string() }),
  familias: z.record(z.string(), z.number().int().positive()),
  disclaimer: z.string().min(1),
  textos: z.array(z.string()),
  fuentes: z.array(SalidaHermes.shape.fuentes.element),
  salidas: z.array(SalidaCompacta),
  casos: z.array(CasoParidad).min(1),
})

export type CorpusParidad = z.infer<typeof CorpusParidad>
export type CasoParidad = z.infer<typeof CasoParidad>

/** Reconstruye la salida exacta de Hermes para un caso del corpus. */
export function expandeSalida(corpus: CorpusParidad, caso: CasoParidad): SalidaHermes {
  const s = corpus.salidas[caso.salida]
  if (!s) throw new Error(`${caso.id}: salida ${caso.salida} fuera de la tabla`)
  const texto = (i: number) => {
    const t = corpus.textos[i]
    if (t === undefined) throw new Error(`${caso.id}: texto ${i} fuera de la tabla`)
    return t
  }
  const fuente = (i: number) => {
    const f = corpus.fuentes[i]
    if (!f) throw new Error(`${caso.id}: fuente ${i} fuera de la tabla`)
    return f
  }
  return {
    contexto: s.contexto,
    estado: s.estado,
    conceptos: s.conceptos.map((x, n) => ({
      descripcion: caso.entrada.conceptos[n]?.descripcion ?? '',
      categoria: x.categoria,
      estado: x.estado,
      razon: texto(x.razon),
      fuente: x.fuente === null ? null : fuente(x.fuente),
      banderas: x.banderas.map(texto),
      checklist: x.checklist.map(texto),
    })),
    banderas_rojas: s.banderas_rojas.map(texto),
    checklist: s.checklist.map(texto),
    fuentes: s.fuentes.map(fuente),
    disclaimer: corpus.disclaimer,
  }
}

interface CasoCrudo {
  id: string
  familia: string
  entrada: z.infer<typeof Entrada>
}

/** Compacta las salidas crudas de Hermes (una por caso, en orden). Inverso de `expandeSalida`. */
export function compactaCorpus(
  procedencia: CorpusParidad['procedencia'],
  casos: CasoCrudo[],
  crudas: SalidaHermes[],
): CorpusParidad {
  const textos = new Map<string, number>()
  const fuentes = new Map<string, number>()
  const salidas = new Map<string, number>()
  const tablaFuentes: CorpusParidad['fuentes'] = []
  const tablaSalidas: CorpusParidad['salidas'] = []
  const t = (x: string) => {
    if (!textos.has(x)) textos.set(x, textos.size)
    return textos.get(x)!
  }
  const f = (x: CorpusParidad['fuentes'][number]) => {
    const k = JSON.stringify(x)
    if (!fuentes.has(k)) {
      fuentes.set(k, tablaFuentes.length)
      tablaFuentes.push(x)
    }
    return fuentes.get(k)!
  }
  const familias: Record<string, number> = {}
  const casosCompactos = casos.map((c, n) => {
    const s = crudas[n]!
    const comp = {
      contexto: s.contexto,
      estado: s.estado,
      conceptos: s.conceptos.map((x) => ({
        categoria: x.categoria,
        estado: x.estado,
        razon: t(x.razon),
        fuente: x.fuente === null ? null : f(x.fuente),
        banderas: x.banderas.map(t),
        checklist: x.checklist.map(t),
      })),
      banderas_rojas: s.banderas_rojas.map(t),
      checklist: s.checklist.map(t),
      fuentes: s.fuentes.map(f),
    }
    const k = JSON.stringify(comp)
    if (!salidas.has(k)) {
      salidas.set(k, tablaSalidas.length)
      tablaSalidas.push(comp)
    }
    familias[c.familia] = (familias[c.familia] ?? 0) + 1
    return { ...c, salida: salidas.get(k)! }
  })
  return {
    formato: 'corpus-paridad/1',
    procedencia,
    familias,
    disclaimer: crudas[0]?.disclaimer ?? '',
    textos: [...textos.keys()],
    fuentes: tablaFuentes,
    salidas: tablaSalidas,
    casos: casosCompactos,
  }
}
