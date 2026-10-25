#!/usr/bin/env node
/**
 * Mide el enrutador de la capa (sin LLM) con la composición y el enchufe reales de la mesa (goal «capa Arbrain», fase 5),
 * con frases que NO están entre los ejemplos del enchufe, salvo las marcadas «(ejemplo)». Imprime qué intención sale, con
 * qué confianza y contra qué alternativas; las que no deben casar con nada van con `null`.
 *
 *   node src/features/soporte-sap/mesa/pruebas/mide-enrutador.mjs [raíz del repo]
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const W = process.argv[2] ?? process.cwd()
const capa = await import(pathToFileURL(join(W, 'tools/capa/dist/index.js')).href)
const lee = (r) => JSON.parse(readFileSync(join(W, r), 'utf8'))
const ENCHUFE = lee('src/features/soporte-sap/enchufe.json')
const c = capa.compone(lee('productos/composiciones/soporte-sap.json'), [ENCHUFE])
if (!c.ok) { console.error(c.problemas); process.exit(1) }
const enr = capa.creaEnrutador(c.producto.intenciones)
const ejemplos = new Set(ENCHUFE.intenciones.flatMap((i) => i.ejemplos.map((e) => e.toLowerCase())))

const P = 'soporte-sap.prueba-caso', E = 'soporte-sap.explica-paso', N = 'soporte-sap.ensenado'
const FRASES = [
  ['prueba este caso', P],
  ['prueba este caso: la app de Fiori abre en blanco tras el transporte', P],
  ['prueba este caso: MIGO da M7 053', P],
  ['¿puedes probar este caso?', P],
  ['pruébame este caso: la VF01 no crea la factura', P],
  ['corre el caso otra vez', P],
  ['vuelve a probar el último', P],
  ['a ver qué dice el agente', P],
  ['¿por qué dijiste no lo sé en el paso 3?', E],
  ['por que dijiste no lo se en el paso tres', E],
  ['¿qué te faltó en el tercer paso?', E],
  ['¿por qué no lo sabías?', E],
  ['explícame por qué no supiste', E],
  ['qué faltaba en el paso 3', E],
  ['muéstrame lo que te enseñé', N],
  ['¿qué te he enseñado hasta ahora?', N],
  ['enséñame lo que aprendiste de mí', N],
  ['lista lo que te enseñé', N],
  ['¿qué cosas te enseñé?', N],
  ['abre la mesa del experto', 'soporte-sap.abre-mesa'],
  ['cómo se usa la mesa del experto', 'soporte-sap.abre-kit'],
  ['recuerda que los viernes cerramos a las dos', null],
  ['hola', null],
  ['gracias', null],
  ['borra mi último caso', null],
  ['manda esto al laboratorio', null],
  ['Una app del launchpad de Fiori abre en blanco después del transporte de ayer, a todos los usuarios de la planta.', null],
]

let bien = 0
const filas = []
for (const [frase, espera] of FRASES) {
  const v = enr.resuelve(frase)
  const sale = v.intencion?.id ?? null
  const ok = sale === espera
  if (ok) bien++
  const marca = ejemplos.has(frase.toLowerCase()) ? ' (ejemplo)' : ''
  filas.push(`${ok ? '✓' : '✗'} ${(sale ?? `—${v.motivo}`).replace('soporte-sap.', '').padEnd(20)} ${v.confianza.toFixed(2)}  ${frase.slice(0, 80)}${marca}   [${v.alternativas.map((a) => `${a.id.replace('soporte-sap.', '')}:${a.confianza}`).join(' ')}]${ok ? '' : `  ← esperaba ${espera ?? 'ninguna'}`}`)
}
console.log(filas.join('\n'))
console.log(`\n${bien}/${FRASES.length} como se esperaba · umbral ${capa.UMBRAL ?? 0.5} · intenciones en la mesa: ${c.producto.intenciones.map((i) => i.id).join(', ')}`)
