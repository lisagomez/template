/**
 * `proponer_metrica`: cuando lo pedido no existe en el catálogo, el Estudio no lo inventa: propone la métrica como
 * DIFF del YAML semántico, listo para un PR que abre una persona con la prueba y la firma del dueño. Este módulo no
 * escribe en el proyecto dbt ni abre nada: devuelve texto.
 *
 * Si la métrica necesita una medida que ningún modelo semántico tiene (NPS, visitas web), no hay YAML que proponer:
 * hace falta un dato nuevo (fuente, ELT, modelo dbt) y la propuesta lo dice así.
 */
import { z } from 'zod'
import { metrica, type Catalogo } from './catalogo.js'
import type { Validado } from './valida.js'

const nombre = z.string().regex(/^[a-z_][a-z0-9_]*$/)
export const propuestaEsquema = z.object({
  nombre,
  etiqueta: z.string().min(1).max(80),
  descripcion: z.string().min(1).max(400),
  tipo: z.enum(['simple', 'ratio', 'derived']),
  medida: nombre.optional(),
  numerador: nombre.optional(),
  denominador: nombre.optional(),
  expr: z.string().max(300).optional(),
  metricas: z.array(nombre).max(6).optional(),
  dueno: z.string().min(1).max(60),
  unidad: z.string().min(1).max(20),
  archivo: z.string().max(200).default('models/semantic/sem_metricas.yml'),
}).strict()
export type PropuestaMetrica = z.input<typeof propuestaEsquema>

export interface Propuesta {
  readonly tipo: 'diff' | 'requiere_datos'
  readonly nombre: string
  /** Diff unificado contra el archivo semántico (solo `diff`). */
  readonly diff: string | null
  readonly motivo: string
  readonly siguientePaso: string
}

const yaml = (p: z.infer<typeof propuestaEsquema>): string[] => {
  const tp = p.tipo === 'simple' ? [`      measure: ${p.medida}`]
    : p.tipo === 'ratio' ? [`      numerator: ${p.numerador}`, `      denominator: ${p.denominador}`]
      : [`      expr: ${p.expr}`, '      metrics:', ...(p.metricas ?? []).map((m) => `        - name: ${m}`)]
  return ['', `  - name: ${p.nombre}`, `    label: "${p.etiqueta.replace(/"/g, "'")}"`, `    description: "${p.descripcion.replace(/"/g, "'")}"`, `    type: ${p.tipo}`, '    type_params:', ...tp, `    meta: {dueno: "${p.dueno}", unidad: "${p.unidad}"}`]
}

export function proponeMetrica(cat: Catalogo, entrada: unknown): Validado<Propuesta> {
  const r = propuestaEsquema.safeParse(entrada)
  if (!r.success) return { ok: false, errores: r.error.issues.map((e) => ({ codigo: 'esquema', ruta: e.path.join('.'), mensaje: e.message })) }
  const p = r.data
  if (metrica(cat, p.nombre)) return { ok: false, errores: [{ codigo: 'esquema', ruta: 'nombre', mensaje: `«${p.nombre}» ya existe: se usa, no se duplica` }] }
  const medidas = new Set([...cat.metricas.values()].map((m) => m.medida).filter((m): m is string => Boolean(m)))
  const faltan = p.tipo === 'simple' ? (p.medida && medidas.has(p.medida) ? [] : [p.medida ?? '(sin medida)'])
    : (p.tipo === 'ratio' ? [p.numerador, p.denominador] : p.metricas ?? []).filter((m) => !m || !metrica(cat, m)).map((m) => m ?? '(vacío)')
  if (faltan.length) {
    return { ok: true, valor: { tipo: 'requiere_datos', nombre: p.nombre, diff: null, motivo: `no existe en la capa: ${faltan.join(', ')}. Antes que la métrica hace falta el dato (fuente, ELT y modelo dbt).`, siguientePaso: 'abrir una solicitud de datos con el dueño; la métrica se propone cuando exista su medida' } }
  }
  const lineas = yaml(p)
  const diff = [`--- a/${p.archivo}`, `+++ b/${p.archivo}`, `@@ métricas: se agrega ${p.nombre} al final @@`, ...lineas.map((l) => `+${l}`)].join('\n')
  return { ok: true, valor: { tipo: 'diff', nombre: p.nombre, diff, motivo: 'la métrica se compone de piezas que ya existen en la capa', siguientePaso: `una persona abre el PR con este diff, una prueba de la métrica y la aprobación de ${p.dueno}; el Estudio no lo abre` } }
}
