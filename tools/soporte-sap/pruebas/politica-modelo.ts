/**
 * D7 (externo solo anonimizado): qué modelo puede recibir cada clase de dato de los clientes. Lo crudo no sale a un
 * proveedor externo ni con decisión C4; lo anonimizado y lo generalizado, solo con ella. Dónde corre el modelo se
 * deduce de la dirección, no de una etiqueta. Y un módulo del producto que importe un SDK de modelo pasa por la política.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { alojamientoDe, puedeLlamar, type ClaseDeDato } from '../dist/index.js'
import { lee, RAIZ } from './_ayuda.ts'

const EXTERNO = 'https://openrouter.ai/api/v1'
const LOCAL = 'http://127.0.0.1:11434'

test('D7 · lo crudo (ticket, chat, documento) no va a un proveedor externo, ni con decisión C4; a uno autohospedado sí', () => {
  for (const clase of ['ticket', 'chat', 'documento'] as const) {
    assert.equal(puedeLlamar(clase, EXTERNO, null).permitido, false, `${clase} sin C4`)
    const conC4 = puedeLlamar(clase, EXTERNO, 'C4-proveedor-2026-10')
    assert.equal(conC4.permitido, false, `${clase} con C4`)
    assert.match(conC4.motivo, /lo crudo no va a un proveedor externo/)
    assert.equal(puedeLlamar(clase, LOCAL, null).permitido, true, `${clase} autohospedado`)
  }
  assert.equal(puedeLlamar('otra' as ClaseDeDato, EXTERNO, 'C4').permitido, false, 'una clase desconocida falla cerrado')
  assert.equal(puedeLlamar('toString' as ClaseDeDato, EXTERNO, 'C4').permitido, false, 'ni una clave heredada')
})

test('D7 · lo anonimizado y lo generalizado van a un externo solo con su decisión C4; lo que no lleva texto de clientes sigue el routing', () => {
  for (const clase of ['sandbox', 'nucleo'] as const) {
    assert.match(puedeLlamar(clase, EXTERNO, null).motivo, /solo con su decisión C4/, `${clase} sin C4`)
    assert.equal(puedeLlamar(clase, EXTERNO, '  ').permitido, false, `${clase} con una C4 en blanco`)
    assert.equal(puedeLlamar(clase, EXTERNO, 'C4-proveedor-2026-10').permitido, true, `${clase} con C4`)
  }
  for (const clase of ['metrica', 'codigo'] as const) assert.equal(puedeLlamar(clase, EXTERNO, null).permitido, true, clase)
})

test('D7 · dónde corre el modelo se deduce de la dirección: solo la propia máquina o una red privada es autohospedado', () => {
  for (const url of ['http://localhost:11434', 'http://127.0.0.1:8080', 'http://10.0.0.5', 'http://172.16.0.1', 'http://172.31.255.1', 'http://192.168.1.10', 'http://[::1]:11434', 'http://[fd12::1]']) {
    assert.equal(alojamientoDe(url), 'autohospedado', url)
  }
  for (const url of [EXTERNO, 'https://api.openai.com/v1', 'http://203.0.113.7:11434', 'http://172.32.0.1', 'http://192.169.0.1', 'http://127.0.0.1.nip.io', 'http://localhost@api.openai.com', 'http://ollama:11434', 'no es una dirección', 'http://999.1.1.1']) {
    assert.equal(alojamientoDe(url), 'externo', url)
  }
  assert.equal(puedeLlamar('ticket', 'http://203.0.113.7:11434', null).permitido, false, 'un servidor público con un puerto de Ollama sigue siendo externo')
})

/** Un SDK de modelo, o el módulo de IA de la app (`src/lib/ai`). */
const SDK_DE_MODELO = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"](ai|@ai-sdk\/[^'"]+|openai|@anthropic-ai\/[^'"]+|@openrouter\/[^'"]+|ollama|@google\/generative-ai|@mistralai\/[^'"]+|cohere-ai|@\/lib\/ai(?:\/[^'"]*)?|(?:\.\.\/)+lib\/ai(?:\/[^'"]*)?)['"]/
const DEL_PRODUCTO = ['tools/soporte-sap/src', 'tools/soporte-sap/clis', 'src/features/soporte-sap', 'src/app']
const codigoDelProducto = () => DEL_PRODUCTO.flatMap((d) => readdirSync(join(RAIZ, d), { recursive: true, encoding: 'utf8' })
  .map((f) => `${d}/${f}`)
  .filter((f) => /\.(ts|tsx|mjs|js)$/.test(f) && (!f.startsWith('src/app') || f.includes('soporte-sap'))))

test('D7 · un módulo del producto que importa un SDK de modelo o el lib/ai de la app pasa por la política (puedeLlamar)', () => {
  for (const muestra of ["import { generateText } from 'ai'", "import { openai } from '@ai-sdk/openai'", "const o = require('openai')", "import { resuelve } from '@/lib/ai/routing'", "import x from '../../lib/ai/contabilidad'", "await import('ollama')"]) {
    assert.match(muestra, SDK_DE_MODELO, `control positivo: ${muestra}`)
  }
  assert.doesNotMatch("import { aisla } from './aislamiento.js'", SDK_DE_MODELO, 'control negativo')
  const archivos = codigoDelProducto()
  assert.ok(archivos.some((f) => f.endsWith('politica-modelo.ts')) && archivos.some((f) => f.endsWith('runtime.ts')), 'recorre el dominio y la app')
  const sinPolitica = archivos.filter((f) => { const t = lee(f); return SDK_DE_MODELO.test(t) && !/\bpuedeLlamar\(/.test(t) })
  assert.deepEqual(sinPolitica, [], 'un módulo que llama a un modelo sin pasar por la política de D7')
})
