#!/usr/bin/env node
/**
 * ss-simulador — el SAP SIMULADO de un cliente del laboratorio: ver su estado, simular (dry-run) la
 * solución de un caso de la matriz o ejecutarla. Ejecutar exige `--ejecutar` Y una aprobación
 * humana que exista en la sala (`--sala` es el archivo de estado de la sala del laboratorio): sin la
 * fila de aprobación de ESA tarea y ESE artefacto, no corre. La huella se recalcula sobre lo que se va a
 * ejecutar (tarea, versión, regla, parámetros y pasos): un `--param` distinto del aprobado no corre (PRP-010
 * H-11). Nunca toca un SAP real.
 *
 * Uso:  ss-simulador estado --cliente alimentos-del-bajio
 *       ss-simulador simula --regla SS-MM-PERIODO --param sociedad=1000 --param periodo=2026-10
 *       ss-simulador ejecuta --regla … --param … --ejecutar --sala sala.json --tarea T --version 1 --sha <sha256>
 */
import { readFileSync } from 'node:fs'
import { aprobado } from '../../sala-a2a/dist/index.js'
import { sapDeLaboratorio, simula, ejecuta, pasosDe, MATRIZ_LABORATORIO, ayuda } from '../dist/index.js'

export const DESCRIPCION = { nombre: 'ss-simulador', que: 'estado, simulación y ejecución contra el SAP simulado', uso: 'ss-simulador estado|simula|ejecuta [--regla R --param k=v … --ejecutar --sala archivo --tarea T --version N --sha S]', readOnly: false, dryRunPorDefecto: true }

const argv = process.argv.slice(2)
if (argv.includes('--help') || !argv.length) { console.log(ayuda(DESCRIPCION)); process.exit(argv.length ? 0 : 2) }
const valor = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined }
const params = Object.fromEntries(argv.flatMap((x, i) => (x === '--param' && argv[i + 1]?.includes('=') ? [argv[i + 1].split('=')] : [])))
const sap = sapDeLaboratorio(valor('cliente') ?? 'alimentos-del-bajio', valor('sistema') === 'ECC' ? 'ECC' : 'S4HANA')
const [orden] = argv

if (orden === 'estado') { console.log(JSON.stringify(sap, null, 1)); process.exit(0) }
const caso = MATRIZ_LABORATORIO.find((e) => e.regla === valor('regla'))
if (!caso) { console.error(`no hay caso «${valor('regla')}» en la matriz`); process.exit(2) }
const pasos = pasosDe(caso, params)

try {
  if (orden === 'simula' || !argv.includes('--ejecutar')) {
    const r = simula(sap, pasos)
    console.log(JSON.stringify({ modo: 'simulacion (dry-run): no cambia nada', pasos: r.resultados.map(({ antes, despues, reversible }) => ({ antes, despues, reversible })) }, null, 1))
  } else {
    const sala = JSON.parse(readFileSync(valor('sala') ?? '', 'utf8'))
    const fila = aprobado(sala, valor('tarea') ?? '', valor('sha') ?? '')
    const artefacto = { taskId: valor('tarea') ?? '', version: Number(valor('version') ?? 1), regla: caso.regla, parametros: params, pasos }
    const r = ejecuta(sap, artefacto, fila ? { taskId: fila.taskId, sha256: fila.sha256, decididaPor: fila.decididaPor } : null)
    console.log(JSON.stringify({ modo: 'ejecucion en el simulador', aprobadoPor: fila?.decididaPor, pasos: r.resultados.map(({ antes, despues }) => ({ antes, despues })) }, null, 1))
  }
} catch (e) {
  console.error(`✗ ${e.message}`)
  process.exit(1)
}
