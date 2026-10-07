/**
 * Imprime la tabla del aislamiento de tres niveles (la misma que exige `pruebas/aislamiento.ts`).
 * Uso: node tools/soporte-sap/evidencia/aislamiento.ts   · Exit 1 si alguna comprobación falla.
 */
import { baseSoporte } from '../pruebas/_base.ts'
import { revisaAislamiento } from '../pruebas/_aislamiento.ts'

const filas = await revisaAislamiento(await baseSoporte())
console.log('| # | Intento (con el rol real) | Esperado | Visto | |\n|---|---|---|---|---|')
filas.forEach(([que, esperado, ok, visto], i) => console.log(`| ${i + 1} | ${que} | ${esperado} | ${visto} | ${ok ? '✓' : '✗'} |`))
const malas = filas.filter((f) => !f[2]).length
console.log(`\n${filas.length - malas}/${filas.length} en verde · Postgres efímero (PGlite), propuesta de esquema aplicada dos veces, nada aplicado a una base real`)
process.exit(malas ? 1 : 0)
