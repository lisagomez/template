#!/usr/bin/env node
/**
 * ss-mapea — el FDE PROPONE el mapeo de un exporte de tickets al esquema contextual y muestra la
 * cuenta que saldría. Solo lectura: no aprueba (eso es de una persona en la app) ni guarda nada.
 *
 * Uso:  ss-mapea --exporte exporte.json --consultora andina [--desfase -360]
 *       ss-mapea --laboratorio andina|boreal      (usa el exporte sucio sintético del laboratorio)
 *   El exporte es un JSON con { herramienta, columnas, filas }.
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { similitud, digitoVerificadorRfc, digitoVerificadorCurp } from '../../extractor-documental/dist/index.js'
import { proponeMapeo, cuentaPrevia, exporteSucio, generaCorpus, leeArgumentos, ayuda } from '../dist/index.js'

export const DESCRIPCION = { nombre: 'ss-mapea', que: 'propone el mapeo de un exporte de tickets y muestra la cuenta', uso: 'ss-mapea --exporte archivo.json --consultora c | --laboratorio andina|boreal', readOnly: true, dryRunPorDefecto: false }

const a = leeArgumentos(process.argv.slice(2), ['exporte', 'consultora', 'desfase', 'laboratorio'])
if (a.banderas.has('help')) { console.log(ayuda(DESCRIPCION)); process.exit(0) }
const lab = a.valores.laboratorio
const e = lab
  ? exporteSucio(generaCorpus({ rfc: digitoVerificadorRfc, curp: digitoVerificadorCurp }), lab)
  : a.valores.exporte ? { consultora: a.valores.consultora, ...JSON.parse(readFileSync(a.valores.exporte, 'utf8')) } : null
if (!e?.consultora) { console.error(ayuda(DESCRIPCION)); process.exit(2) }

const m = proponeMapeo({ consultora: e.consultora, herramienta: e.herramienta, version: 1, columnas: e.columnas, muestras: e.filas.slice(0, 500), desfaseFechasMin: Number(a.valores.desfase ?? -360), similitud })
// Vista previa de la PROPUESTA: solo cuenta. Cargar algo exige el mapeo aprobado por una persona en la app.
const vista = cuentaPrevia(m, e.filas, (s) => createHash('sha256').update(s).digest('hex'))
console.log(JSON.stringify({ propuesta: { columnas: m.columnas, sinMapear: m.sinMapear, propuestosPorSimilitud: m.propuestosPorSimilitud, estado: m.estado },
  vistaPrevia: { ...vista, motivos: vista.motivos.slice(0, 10) } }, null, 1))
