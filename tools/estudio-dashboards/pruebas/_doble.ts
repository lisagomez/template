/**
 * Doble del puerto semántico para las pruebas del núcleo: el catálogo es la FOTO REAL de Golfo Norte
 * (`evaluacion/catalogo-golfo-norte.json`, leída de MetricFlow), y las filas son números deterministas por
 * métrica y clave. Sirve para probar la lógica (validar, parchear, versionar, resolver), no las cifras: las cifras
 * se prueban contra la capa real en `integracion-metricflow.ts` y en la tabla de cifras.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CatalogoCrudo, ConsultaSemantica, PuertoSemantico, ResultadoSemantico } from '../dist/index.js'

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
export const FOTO = JSON.parse(readFileSync(join(RAIZ, 'evaluacion', 'catalogo-golfo-norte.json'), 'utf8')) as CatalogoCrudo & { dominios: Record<string, string[]> }
export const tablero = (n: string) => JSON.parse(readFileSync(join(RAIZ, 'laboratorio', 'tableros', `${n}.json`), 'utf8'))

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 17)

function meses(p: { desde: string; hasta: string }): string[] {
  const salida: string[] = []
  let [a, m] = p.desde.split('-').map(Number) as [number, number]
  while (`${a}-${String(m).padStart(2, '0')}` <= p.hasta) { salida.push(`${a}-${String(m).padStart(2, '0')}-01`); m++; if (m > 12) { m = 1; a++ } }
  return salida
}

export interface Doble extends PuertoSemantico { readonly pedidas: ConsultaSemantica[]; readonly simultaneas: { ahora: number; max: number } }

/** `desordena`: cada respuesta tarda 0–6 ms según la consulta, así llegan en otro orden que el de las peticiones. */
export function doble(opciones: { falla?: boolean; desordena?: boolean } = {}): Doble {
  const pedidas: ConsultaSemantica[] = []
  const simultaneas = { ahora: 0, max: 0 }
  return {
    pedidas,
    simultaneas,
    async catalogo() { return { version: FOTO.version, metricas: FOTO.metricas } },
    async valores(_m, d) { return FOTO.dominios[d] ?? [] },
    async consulta(c): Promise<ResultadoSemantico> {
      if (opciones.falla) throw new Error('la capa no responde')
      pedidas.push(c)
      simultaneas.max = Math.max(simultaneas.max, ++simultaneas.ahora)
      try { if (opciones.desordena) await new Promise((ok) => setTimeout(ok, Math.abs(hash(JSON.stringify(c))) % 7)) } finally { simultaneas.ahora-- }
      const periodo = c.periodo ?? { desde: '2025-01', hasta: '2026-09' }
      const ejes = (c.agrupar ?? []).map((d) => (d.startsWith('metric_time__') ? meses(periodo) : FOTO.dominios[d] ?? ['∅']))
      const combinaciones = ejes.reduce<string[][]>((acc, vals) => acc.flatMap((fila) => vals.map((v) => [...fila, v])), [[]])
      const filas = combinaciones.map((k) => [...k, ...c.metricas.map((m) => Math.abs(hash(`${m}|${k.join('|')}|${periodo.desde}|${JSON.stringify(c.filtros ?? [])}`)) % 10000 / 10)])
      return { columnas: [...(c.agrupar ?? []), ...c.metricas], filas, sql: `-- doble: ${c.metricas.join(', ')}`, truncada: false, ms: 1 }
    },
  }
}
