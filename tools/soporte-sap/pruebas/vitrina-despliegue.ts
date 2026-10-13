/**
 * La vitrina en Vercel: qué existe en ese despliegue y qué no puede llegar a él. Las reglas se prueban con el mismo
 * comparador de rutas de Next que las aplica, y el barrido mira lo que la vitrina importa.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { RAIZ, lee } from './_ayuda.ts'

const config = await import(pathToFileURL(join(RAIZ, 'next.config.ts')).href)
const { envFueraDeGit } = await import(pathToFileURL(join(RAIZ, 'scripts', 'vitrina', 'sin-env.mjs')).href) as {
  envFueraDeGit: (salida: string, enGit: Set<string>) => string[]
}
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

/** Una salida de `vercel build` de mentira: cada función declara en su `.vc-config.json` qué archivos lleva. */
function salidaCon(funciones: Record<string, string[]>): string {
  const salida = mkdtempSync(join(tmpdir(), 'vitrina-salida-'))
  for (const [nombre, lleva] of Object.entries(funciones)) {
    const dir = join(salida, 'functions', `${nombre}.func`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, '.vc-config.json'), JSON.stringify({ filePathMap: Object.fromEntries(lleva.map((a) => [a, a])) }))
  }
  return salida
}

test('vitrina · a Vercel no sube un .env fuera de Git: el candado lo nombra, también en una función enlazada', () => {
  const enGit = new Set(['.env.local.example', '.env.production.example', 'package.json'])
  const sucia = salidaCon({ pagina: ['package.json', '.env.local.example'], api: ['tools/x/.env.production'] })
  const limpia = salidaCon({ pagina: ['package.json', '.env.local.example', '.env.production.example'] })
  try {
    // Vercel enlaza funciones con un symlink a otro directorio: lo que solo está detrás del enlace también cuenta.
    const enlazada = join(sucia, 'enlazada.func')
    mkdirSync(enlazada)
    writeFileSync(join(enlazada, '.vc-config.json'), JSON.stringify({ filePathMap: { '.env.local': '.env.local' } }))
    symlinkSync(enlazada, join(sucia, 'functions', 'pagina.rsc.func'))
    assert.deepEqual(envFueraDeGit(sucia, enGit), ['.env.local', 'tools/x/.env.production'], 'lo que no está en Git se nombra')
    assert.deepEqual(envFueraDeGit(limpia, enGit), [], 'los ejemplos de Git pasan')
  } finally {
    rmSync(sucia, { recursive: true, force: true })
    rmSync(limpia, { recursive: true, force: true })
  }
})

test('vitrina · despliega.sh corre el candado de .env entre el build y la subida', () => {
  const pasos = lee('scripts/vitrina/despliega.sh').split('\n').filter((l) => !l.trim().startsWith('#'))
  const donde = (re: RegExp) => pasos.findIndex((l) => re.test(l))
  const build = donde(/\$VERCEL build/), candado = donde(/^node scripts\/vitrina\/sin-env\.mjs\b/), subida = donde(/\$VERCEL deploy/)
  assert.ok(build >= 0 && subida >= 0, 'el guion construye y sube')
  assert.ok(candado > build && candado < subida, 'el candado va después del build y antes de subir')
  assert.match(lee('scripts/vitrina/despliega.sh'), /^set -euo pipefail$/m, 'y su error para el guion')
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
