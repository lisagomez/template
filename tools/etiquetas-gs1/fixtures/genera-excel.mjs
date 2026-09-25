#!/usr/bin/env node
/**
 * Genera `catalogo-v1.xlsx` desde `catalogo-v1.csv`, como lo dejaria Excel: las columnas de
 * codigos quedan como NUMERO (Excel se come el formato de texto en cuanto alguien pega), y la
 * celda que ya venia en notacion cientifica queda como texto. Las pruebas comprueban que el
 * Excel y el CSV dan el mismo plan de importacion.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import writeExcelFile from 'write-excel-file/node'

const aqui = dirname(fileURLToPath(import.meta.url))
const filas = readFileSync(join(aqui, 'catalogo-v1.csv'), 'utf8').trim().split('\n').map((l) => l.split(','))
const numericas = new Set(['gtin', 'gtin_caja', 'unidades_por_caja', 'cajas_por_tarima', 'vida_util_dias'])
const cabecera = filas[0]
const datos = filas.map((f, i) => f.map((v, j) => {
  if (i === 0) return { value: v, fontWeight: 'bold' }
  if (v === '') return null
  return numericas.has(cabecera[j]) && /^\d+$/.test(v) ? { value: Number(v), type: Number } : { value: v, type: String }
}))
await writeExcelFile(datos).toFile(join(aqui, 'catalogo-v1.xlsx'))
console.log('fixtures/catalogo-v1.xlsx escrito')
