#!/usr/bin/env node
/**
 * Foto del catálogo de Golfo Norte (métricas, dimensiones alcanzables y dominios) leída de la capa REAL por el
 * puerto de MetricFlow. La usan el revisor del set de referencia y las pruebas del núcleo (que corren sin Python).
 * Uso: node tools/estudio-dashboards/laboratorio/catalogo.mjs   (después de corre.mjs, que construye target/)
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cargaCatalogo } from '../dist/index.js'
import { puertoGolfoNorte } from './puerto.mjs'

const puerto = puertoGolfoNorte()
try {
  const crudo = await puerto.catalogo()
  const cat = await cargaCatalogo(puerto)
  const salida = { version: crudo.version, metricas: crudo.metricas, dominios: Object.fromEntries(cat.dominios) }
  writeFileSync(join(import.meta.dirname, '..', 'evaluacion', 'catalogo-golfo-norte.json'), `${JSON.stringify(salida, null, 1)}\n`)
  console.log(`▸ ${crudo.metricas.length} métricas · ${cat.dominios.size} dimensiones con dominio · versión ${crudo.version}`)
} finally {
  await puerto.cierra()
}
