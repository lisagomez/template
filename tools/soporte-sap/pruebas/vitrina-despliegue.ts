/**
 * La vitrina en Vercel: qué existe en ese despliegue y qué no puede llegar a él. Las reglas se prueban con el mismo
 * comparador de rutas de Next que las aplica, y el barrido mira lo que la vitrina importa.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { RAIZ } from './_ayuda.ts'

const config = await import(pathToFileURL(join(RAIZ, 'next.config.ts')).href)
const { getPathMatch } = createRequire(join(RAIZ, 'package.json'))('next/dist/shared/lib/router/utils/path-match') as {
  getPathMatch: (ruta: string, o: { removeUnnamedParams: boolean; strict: boolean }) => (p: string) => false | object
}
const casa = (source: string) => getPathMatch(source, { removeUnnamedParams: true, strict: true })

test('vitrina · lo que va a Vercel no lleva SOPORTE_SAP_LABORATORIO: con ella, el build falla', () => {
  for (const valor of ['1', '0', '']) {
    assert.throws(() => config.compruebaDespliegue({ VERCEL: '1', SOPORTE_SAP_LABORATORIO: valor }), /no va a Vercel/, `en Vercel, con «${valor}»`)
    assert.throws(() => config.compruebaDespliegue({ VITRINA_SOPORTE_SAP: '1', SOPORTE_SAP_LABORATORIO: valor }), /no va a Vercel/, `en la vitrina, con «${valor}»`)
  }
  assert.doesNotThrow(() => config.compruebaDespliegue({ VERCEL: '1', VITRINA_SOPORTE_SAP: '1' }))
  assert.doesNotThrow(() => config.compruebaDespliegue({ SOPORTE_SAP_LABORATORIO: '1' }), 'en la máquina del laboratorio, sí')
})

test('vitrina · en su despliegue solo existe la vitrina: otra página lleva a ella y otra API da 404', () => {
  assert.deepEqual(config.reglasDeLaVitrina({}), { redirects: [], rewrites: [] }, 'sin VITRINA_SOPORTE_SAP no cambia nada')
  const { redirects, rewrites } = config.reglasDeLaVitrina({ VITRINA_SOPORTE_SAP: '1' })
  const pagina = casa(redirects[0].source), api = casa(rewrites[0].source)
  assert.equal(redirects[0].destination, '/vitrina/soporte-sap')
  for (const p of ['/', '/soporte-sap', '/reel', '/buzon/subir', '/laboratorio-voz', '/vitrinas']) assert.ok(pagina(p), `${p} lleva a la vitrina`)
  for (const p of ['/vitrina/soporte-sap', '/vitrina/soporte-sap/deck', '/_next/static/x.js', '/manifest.json', '/icons/dictado-180.png']) assert.equal(pagina(p), false, `${p} se sirve`)
  for (const p of ['/api/soporte-sap', '/api/buzon/sube', '/api/a2a', '/api/dictado/movil']) assert.ok(api(p), `${p} no existe`)
  assert.equal(api('/api/vitrina/soporte-sap/en-vivo'), false, 'la de la vitrina, sí')
})

const archivos = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const r = join(dir, n)
  return statSync(r).isDirectory() ? archivos(r) : /\.(ts|tsx|mjs)$/.test(n) ? [r] : []
})
const DE_LA_VITRINA = [join(RAIZ, 'src', 'features', 'soporte-sap', 'vitrina'), join(RAIZ, 'src', 'app', 'vitrina'), join(RAIZ, 'src', 'app', 'api', 'vitrina')]

test('vitrina · no enciende el laboratorio: nada suyo importa el runtime ni lee su variable', () => {
  const malos = DE_LA_VITRINA.flatMap(archivos).filter((a) => !a.endsWith('genera.mjs'))
    .filter((a) => /from ['"][^'"]*services\/runtime['"]|process\.env\[?['"]?SOPORTE_SAP_LABORATORIO/.test(readFileSync(a, 'utf8')))
  assert.deepEqual(malos.map((a) => relative(RAIZ, a)), [])
})

test('vitrina · el secreto de la sección en vivo vive solo en el servidor', () => {
  const todos = archivos(join(RAIZ, 'src'))
  assert.deepEqual(todos.filter((a) => /NEXT_PUBLIC_EN_VIVO/.test(readFileSync(a, 'utf8'))).map((a) => relative(RAIZ, a)), [], 'ninguna variable pública')
  const leen = todos.filter((a) => /EN_VIVO_SECRETO'?\]/.test(readFileSync(a, 'utf8'))).map((a) => relative(RAIZ, a))
  assert.deepEqual(leen.sort(), ['src/features/soporte-sap/vitrina/en-vivo/portero.ts', 'src/features/soporte-sap/vitrina/en-vivo/proxy.ts'], 'la leen la puerta de Vercel y el portero, nadie más')
  for (const a of leen) assert.doesNotMatch(readFileSync(join(RAIZ, a), 'utf8'), /^'use client'/m)
  const clientes = todos.filter((a) => /^'use client'/m.test(readFileSync(a, 'utf8')))
  assert.deepEqual(clientes.filter((a) => /en-vivo\/(proxy|portero|firma)/.test(readFileSync(a, 'utf8'))).map((a) => relative(RAIZ, a)), [], 'ningún componente de cliente importa la firma')
})
