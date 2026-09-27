/**
 * Puente con el grafo de `hermes-os-a2a`: el corte pineado, el adaptador de su seed al contrato
 * y la forma de su salida (para leer el corpus de paridad).
 *
 * El adaptador NO arregla nada en silencio. Lo que el seed de Hermes hace distinto de lo que
 * decidió la Fase 0 (sus `_bajas`, un conflicto vivo) llega intacto a `validaConocimiento` y sale
 * como problema tipado. Lo único que aporta es lo que su formato no trae: el vocabulario por
 * dimensión, los dominios, y hacer explícitos los ausentes que su motor ya leía con default
 * (`regimen` → `_meta.regimen_default`; `categoria` y `veredicto_base` → `null`).
 */
import { z } from 'zod'
import type { Resultado } from './contrato.js'

/**
 * El corte del que sale el conocimiento: el mismo que Hermes tiene congelado desde el 2026-09-27
 * (hermes-os-a2a PR #317, `seed/CONGELADO.sha256`). Las huellas son del contenido en ese commit,
 * no del HEAD de un clon: el corpus se genera leyendo con `git show <commit>:<ruta>`.
 * Van con el prefijo `sha256:`: es un ancla pública, y así la reconoce `audita-secretos` (64 hex
 * sueltos tienen la forma de un token sin prefijo).
 */
export const CORTE_HERMES = {
  repo: 'lisagomez/hermes-os-a2a',
  commit: '97d9f9e34274d84633e7d365b6aa3a4dce496849',
  fecha: '2026-09-06',
  seed: 'businessos/grafo/seed/reglas.json',
  seed_sha256: 'sha256:c068719e20c01f59da342ce731381382a4eae85dc4efdcfb1b99f4b50c8aa7a8',
  motor: 'businessos/grafo/evaluador.py',
  motor_sha256: 'sha256:8213a8a8ae6e20603769bea7cc83b8d2b4885e065cd3e11bc993ea534abcdea1',
} as const

/**
 * Vocabulario por dimensión, declarado aquí porque el seed de Hermes no lo trae (su enum era
 * global). Medido sobre el corte: ningún impacto se sale de esta tabla. Que el gate de Hermes
 * aceptara `deducible` en una regla regulatoria es la divergencia estructural que esto cierra.
 */
export const VOCABULARIO_HERMES: Readonly<Record<string, readonly string[]>> = {
  fiscal: ['deducible', 'no_deducible', 'dudoso'],
  contable: ['deducible', 'no_deducible', 'dudoso'],
  contractual: ['deducible', 'no_deducible', 'dudoso'],
  regulatorio: ['permitido', 'no_permitido', 'dudoso'],
  'datos-personales': ['permitido', 'no_permitido', 'dudoso'],
}

/** Forma laxa del seed de Hermes: lo justo para leerlo; lo estricto es el contrato. */
const SeedHermes = z.looseObject({
  _meta: z.looseObject({ source_version: z.string(), regimen_default: z.string().default('PM_TITULO_II') }),
  _bajas: z.array(z.string()).optional(),
  jurisdicciones: z.array(z.looseObject({ codigo: z.string(), nombre: z.string() })),
  dimensiones: z.array(z.looseObject({ codigo: z.string(), nombre: z.string() })),
  categorias: z.array(z.looseObject({ clave: z.string() })),
  reglas: z.array(
    z.looseObject({
      jurisdiccion: z.string(),
      dimension: z.string(),
      vigente_hasta: z.string().nullable().optional(),
      impactos: z.array(
        z.looseObject({
          categoria: z.string().nullable().optional(),
          regimen: z.string().optional(),
          veredicto_base: z.string().nullable().optional(),
        }),
      ),
    }),
  ),
})

export interface OpcionesAdaptador {
  /** Versión que llevará el conocimiento adaptado (semver). */
  version: string
  /** Fecha de corte de los dominios: la del commit de Hermes del que sale. */
  corte: string
}

/**
 * Seed de Hermes → forma del contrato, sin validarla. Un dominio por (jurisdicción, dimensión)
 * con las categorías que sus reglas usan: es PROVISIONAL, la Fase 2 lo divide por dominio real
 * (drones de reparto, agentes de seguros…). Todas las fuentes de Hermes son leyes y normas
 * publicadas, así que todos sus dominios citan.
 */
export function desdeHermes(seed: unknown, opciones: OpcionesAdaptador): Record<string, unknown> {
  const s = SeedHermes.parse(seed)
  const regimenDefault = s._meta.regimen_default
  const nombreJur = new Map(s.jurisdicciones.map((j) => [j.codigo, j.nombre]))
  const nombreDim = new Map(s.dimensiones.map((d) => [d.codigo, d.nombre]))
  const categoriasPorAmbito = new Map<string, Set<string>>()
  for (const r of s.reglas) {
    const llave = `${r.jurisdiccion}\u0000${r.dimension}`
    const set = categoriasPorAmbito.get(llave) ?? new Set<string>()
    for (const i of r.impactos) if (i.categoria) set.add(i.categoria)
    categoriasPorAmbito.set(llave, set)
  }
  const dominios = [...categoriasPorAmbito]
    .filter(([, cats]) => cats.size > 0)
    .map(([llave, cats]) => {
      const [jurisdiccion = '', dimension = ''] = llave.split('\u0000')
      return {
        clave: `${jurisdiccion}-${dimension}`,
        nombre: `${nombreDim.get(dimension) ?? dimension} (${nombreJur.get(jurisdiccion) ?? jurisdiccion})`,
        jurisdiccion,
        dimension,
        cita: 'publica',
        corte: opciones.corte,
        procedencia: s._meta.source_version,
        categorias: [...cats].sort(),
      }
    })
  return {
    version: opciones.version,
    procedencia: s._meta.source_version,
    ...(s._bajas ? { _bajas: s._bajas } : {}),
    jurisdicciones: s.jurisdicciones,
    dimensiones: s.dimensiones.map((d) => ({ ...d, vocabulario: VOCABULARIO_HERMES[d.codigo] })),
    dominios,
    categorias: s.categorias,
    reglas: s.reglas.map((r) => ({
      ...r,
      vigente_hasta: r.vigente_hasta ?? null,
      // Ausente en Hermes = su motor lo lee con .get(): `None`. Aquí se hace explícito, mismo significado.
      impactos: r.impactos.map((i) => ({
        ...i,
        categoria: i.categoria ?? null,
        regimen: i.regimen ?? regimenDefault,
        veredicto_base: i.veredicto_base ?? null,
      })),
    })),
  }
}

// --- La salida del motor de Hermes (evaluador.evaluar), para leer el corpus --------------------

const FuenteHermes = z.strictObject({
  clave: z.string(),
  cita: z.string(),
  url: z.string(),
  vigencia: z.strictObject({ desde: z.string(), hasta: z.string().nullable() }),
})

export const SalidaHermes = z.strictObject({
  contexto: z.strictObject({ jurisdiccion: z.string(), dimension: z.string(), regimen: z.string(), fecha: z.string() }),
  estado: z.enum(['deducible', 'no_deducible', 'permitido', 'no_permitido', 'dudoso']),
  conceptos: z.array(
    z.strictObject({
      descripcion: z.string(),
      categoria: z.string().nullable(),
      estado: z.string(),
      razon: z.string(),
      fuente: FuenteHermes.nullable(),
      banderas: z.array(z.string()),
      checklist: z.array(z.string()),
    }),
  ),
  banderas_rojas: z.array(z.string()),
  checklist: z.array(z.string()),
  fuentes: z.array(FuenteHermes),
  disclaimer: z.string().min(1),
})

export type SalidaHermes = z.infer<typeof SalidaHermes>

/** El texto con el que el motor de Hermes marca el fail-safe (`evaluador.RAZON_SIN_REGLA`). */
export const RAZON_SIN_REGLA_HERMES = 'sin regla aplicable'

/**
 * Un `Resultado` de este motor en la forma de la salida de Hermes, para compararlos en la paridad.
 * Lo que aquí es fail-safe tipado (`veredicto: null`) allí era `estado: dudoso`. El disclaimer no
 * se traduce: el de Hermes era fiscal y este es genérico (divergencia declarada).
 */
export function aSalidaHermes(r: Resultado, disclaimer: string): SalidaHermes {
  const unicos = <T>(xs: T[]) => [...new Map(xs.map((x) => [JSON.stringify(x), x])).values()]
  return {
    contexto: { jurisdiccion: r.contexto.jurisdiccion, dimension: r.contexto.dimension, regimen: r.contexto.regimen, fecha: r.contexto.fecha },
    estado: (r.veredicto_global ?? 'dudoso') as SalidaHermes['estado'],
    conceptos: r.conceptos.map((c) => ({
      descripcion: c.descripcion,
      categoria: c.categoria,
      estado: c.veredicto ?? 'dudoso',
      razon: c.razon,
      fuente: c.fuente,
      banderas: c.banderas,
      checklist: c.checklist,
    })),
    banderas_rojas: unicos(r.conceptos.flatMap((c) => c.banderas)),
    checklist: unicos(r.conceptos.flatMap((c) => c.checklist)),
    fuentes: unicos(r.conceptos.flatMap((c) => c.fuentes)),
    disclaimer,
  }
}
