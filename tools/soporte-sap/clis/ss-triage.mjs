#!/usr/bin/env node
/**
 * ss-triage — categoriza una incidencia y consulta la matriz problema-solución sobre el motor
 * REAL del grafo de conocimiento (conocimiento sintético del laboratorio). Solo lectura.
 *
 * Uso:  node tools/soporte-sap/clis/ss-triage.mjs --sistema S4HANA "texto de la incidencia"
 *       echo "texto" | node tools/soporte-sap/clis/ss-triage.mjs --sistema ECC
 */
import { readFileSync } from 'node:fs'
import { evaluaSeguro } from '../../grafo-conocimiento/dist/index.js'
import { categoriza, consultaMatriz, conocimientoDeMatriz, extraeParametros, MATRIZ_LABORATORIO, leeArgumentos, ayuda } from '../dist/index.js'

export const DESCRIPCION = { nombre: 'ss-triage', que: 'categoriza una incidencia y consulta la matriz sobre el grafo', uso: 'ss-triage --sistema S4HANA|ECC "texto"', readOnly: true, dryRunPorDefecto: false }

const a = leeArgumentos(process.argv.slice(2), ['sistema'])
if (a.banderas.has('help')) { console.log(ayuda(DESCRIPCION)); process.exit(0) }
const sistema = a.valores.sistema ?? 'S4HANA'
if (!['S4HANA', 'ECC'].includes(sistema)) { console.error('--sistema es S4HANA o ECC'); process.exit(2) }
const texto = a.posicionales.join(' ') || (process.stdin.isTTY ? '' : readFileSync(0, 'utf8'))
if (!texto.trim()) { console.error(ayuda(DESCRIPCION)); process.exit(2) }

const conocimiento = conocimientoDeMatriz(MATRIZ_LABORATORIO, new Date().toISOString().slice(0, 10))
const motor = (p) => evaluaSeguro(conocimiento, p)
const c = categoriza(texto)
const m = consultaMatriz(motor, MATRIZ_LABORATORIO, texto, sistema)
const salida = { clasificacion: c, matriz: m.tipo === 'sin_solucion' ? m : { tipo: m.tipo, regla: m.entrada.regla, grado: m.entrada.grado, fuente: m.fuente, solucion: m.entrada.solucion.resumen, parametros: extraeParametros(m.entrada, texto) } }
console.log(JSON.stringify(salida, null, 1))
