/**
 * El puerto semántico del laboratorio: MetricFlow caliente sobre golfo_norte (DuckDB). Un solo lugar para las rutas,
 * que usan la corrida, la foto del catálogo, la medición y el lienzo. Los CSV se leen de `.datos/` (fuera de git).
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { puertoMetricFlow } from '../dist/metricflow/index.js'

export const PROYECTO_GN = join(import.meta.dirname, 'golfo_norte')
export const DATOS_GN = process.env.ESTUDIO_GN_DATOS ?? join(import.meta.dirname, '..', '..', '..', '.datos', 'estudio-dashboards', 'golfo_norte', 'data', 'raw')
export const DUCKDB_GN = join(homedir(), '.cache', 'estudio-dashboards-semantica', 'golfo_norte', 'golfo_norte.duckdb')

export function puertoGolfoNorte(opciones = {}) {
  return puertoMetricFlow({ proyecto: PROYECTO_GN, perfiles: PROYECTO_GN, entorno: { GN_DATOS: DATOS_GN, GN_DUCKDB: DUCKDB_GN }, ...opciones })
}
