/**
 * La medición del anonimizador (fail-closed) sobre el corpus sintético con datos sembrados y las
 * variantes adversariales. Uso: node tools/soporte-sap/evidencia/anonimizacion.ts · Exit 1 con fugas.
 */
import { anonimiza } from '../dist/index.js'
import { casosDelSandbox, mide, VALIDADORES } from '../pruebas/_anonimizacion.ts'

const casos = casosDelSandbox()
const m = mide(casos)
const porTipo: Record<string, number> = {}
for (const k of casos) for (const [t, n] of Object.entries(anonimiza(k.texto, VALIDADORES).reemplazos)) porTipo[t] = (porTipo[t] ?? 0) + (n ?? 0)
console.log('| Medida | Valor |\n|---|---|')
console.log(`| casos que irían al sandbox (corpus sin regla + nómina + adversariales) | ${m.casos} |`)
console.log(`| con datos personales sembrados | ${m.conDatosSembrados} |`)
console.log(`| entran (anonimizados) | ${m.entran} |`)
console.log(`| a cuarentena (no entran) | ${m.cuarentena} |`)
console.log(`| **fugas** (valor sembrado en un texto que entró) | **${m.fugas.length}** |`)
console.log(`\nReemplazos por tipo: ${Object.entries(porTipo).sort().map(([t, n]) => `${t} ${n}`).join(' · ')}`)
const dudoso = anonimiza('Le escribo por el finiquito de Xóchitl Tzompantzi Cuauhtle, no le llegó el pago', VALIDADORES)
console.log(`\nCaso dudoso («finiquito de Xóchitl Tzompantzi Cuauhtle»): ${dudoso.veredicto} — señales: ${dudoso.senales.join('; ')}`)
const nomina = anonimiza(casos.find((k) => k.sensibles.length > 5)!.texto, VALIDADORES)
console.log(`Nómina anonimizada (${nomina.veredicto}: no entra al sandbox y nadie la revisa hasta D14): «${nomina.texto}»`)
const entra = casos.map((k) => ({ k, r: anonimiza(k.texto, VALIDADORES) })).find(({ k, r }) => r.veredicto === 'entra' && k.sensibles.length > 1)
if (entra) console.log(`Ejemplo con datos que sí entra: «${entra.r.texto}»`)
console.log(m.fugas.length ? `\n✗ ${m.fugas.length} fuga(s)` : '\n✓ 0 fugas · corpus SINTÉTICO: medir sobre un corpus real con consentimiento queda pendiente (D9)')
process.exit(m.fugas.length ? 1 : 0)
