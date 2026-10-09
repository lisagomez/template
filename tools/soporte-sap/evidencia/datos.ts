/**
 * De crudo a enriquecido con los dos exportes sucios: la cuenta, los duplicados, el rastro de un
 * valor limpio y uno enriquecido, y el crudo reconstruido. Uso: node tools/soporte-sap/evidencia/datos.ts
 */
import { createHmac } from 'node:crypto'
import { evaluaSeguro } from '../../grafo-conocimiento/dist/index.js'
import { similitud, digitoVerificadorRfc, digitoVerificadorCurp } from '../../extractor-documental/dist/index.js'
import {
  generaCorpus, exporteSucio, proponeMapeo, apruebaMapeo, aplicaMapeo, limpia, enriquece, conocimientoDeMatriz, MATRIZ_LABORATORIO, CLIENTES, type MotorReglas,
} from '../dist/index.js'

/** Una sal de PRUEBA: el importador seudonimiza con HMAC y su sal (PRP-010 H-32). */
const seudonimiza = { sal: 'sal-de-prueba-del-importador', hmac: (k: string, s: string) => createHmac('sha256', k).update(s).digest('hex') }
const corpus = generaCorpus({ rfc: digitoVerificadorRfc, curp: digitoVerificadorCurp })
const conocimiento = conocimientoDeMatriz(MATRIZ_LABORATORIO, '2026-10-04')
const motor: MotorReglas = (p) => evaluaSeguro(conocimiento, p, { hoy: '2026-10-04' }) as ReturnType<MotorReglas>
let malo = false

console.log('| Exporte | Herramienta | Entrada | Limpias | En revisión | Descartadas | Duplicados resueltos | Pruebas descartadas | ¿Cuadra? |\n|---|---|---|---|---|---|---|---|---|')
const ejemplos: string[] = []
for (const consultora of ['andina', 'boreal'] as const) {
  const e = exporteSucio(corpus, consultora)
  const propuesta = proponeMapeo({ consultora, herramienta: e.herramienta, version: 1, columnas: e.columnas, muestras: e.filas, desfaseFechasMin: -360, similitud })
  const m = apruebaMapeo(propuesta, { tipo: 'humano', id: 'usr-experto' }, [])
  const l = limpia(aplicaMapeo(m, e.filas, seudonimiza), CLIENTES.filter((c) => c.consultora === consultora).map((c) => ({ id: c.id, nombre: c.nombre })))
  const dup = l.descartadas.filter((d) => /duplicado/.test(d.motivo)).length
  const pru = l.descartadas.filter((d) => d.motivo === 'ticket de prueba').length
  if (!l.cuenta.cuadra) malo = true
  console.log(`| ${consultora} | ${e.herramienta} | ${l.cuenta.entrada} | ${l.cuenta.limpias} | ${l.cuenta.revision} | ${l.cuenta.descartadas} | ${dup} | ${pru} | ${l.cuenta.cuadra ? `✓ ${l.cuenta.limpias} + ${l.cuenta.revision} + ${l.cuenta.descartadas} = ${l.cuenta.entrada}` : '✗'} |`)
  const enr = enriquece(l, { motor, matriz: MATRIZ_LABORATORIO, sistemaDe: (id) => CLIENTES.find((c) => c.id === id)!.sistema, contratoDe: (id) => `sla-${id}` })
  const uno = enr.find((x) => x.incidencia.regla)!
  const cli = uno.rastro.find((r) => r.campo === 'clienteId')!
  const reg = uno.rastro.find((r) => r.campo === 'regla')!
  const crudoIgual = l.limpias.every(({ indice, rastro }) => rastro.filter((r) => r.fuente.startsWith('columna ')).every((r) => e.filas[indice]![r.fuente.slice(8)] === r.original))
  if (!crudoIgual) malo = true
  ejemplos.push(`- **${consultora}**, fila ${uno.indice} (${uno.incidencia.idOrigen}): limpio «${cli.original}» → \`${cli.valor}\` por «${cli.regla}»; enriquecido regla \`${reg.valor}\` por «${reg.regla}», fuente «${reg.fuente}». Crudo reconstruido desde el rastro: ${crudoIgual ? '✓ igual' : '✗ distinto'}. Motivos de revisión: ${[...new Set(l.revision.flatMap((r) => r.motivos))].slice(0, 3).join('; ')}.`)
}
console.log(`\n${ejemplos.join('\n')}`)
console.log(malo ? '\n✗ algo no cuadra' : '\n✓ las dos cuentas cierran y el crudo se reconstruye igual')
process.exit(malo ? 1 : 0)
