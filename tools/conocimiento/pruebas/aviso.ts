/**
 * El aviso de versión nueva (PRP-005 Fase 7, TAR-18, spec 004 RF-16): un proyecto que consume el
 * conocimiento se ENTERA de que hay una versión nueva, y nada cambia solo.
 *
 * Ensayo hermético: un proyecto consumidor temporal con el `vigila-versiones.mjs` del template, que es
 * el que heredan los proyectos derivados, y un registro npm FALSO en 127.0.0.1 donde se «publican»
 * versiones. Sin red externa, así que corre dentro de `validate`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const corre = promisify(execFile)
const NOMBRE = '@tu-scope/conocimiento'
const vigilante = fileURLToPath(new URL('../../../scripts/vigila-versiones.mjs', import.meta.url))

let publicada = '0.2.0'
const registro = createServer((req, res) => {
  const ok = req.url === `/${NOMBRE.replace('/', '%2F')}/latest`
  res.writeHead(ok ? 200 : 404, { 'content-type': 'application/json' })
  res.end(ok ? JSON.stringify({ name: NOMBRE, version: publicada }) : '{}')
})
await new Promise<void>((listo) => registro.listen(0, '127.0.0.1', () => listo()))
const direccion = registro.address()
const url = `http://127.0.0.1:${typeof direccion === 'object' && direccion ? direccion.port : 0}`

/** Un proyecto derivado del template: fija la versión EXACTA y trae el vigilante del template. */
function consumidor(dependencia: string, resolved?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'consumidor-'))
  mkdirSync(join(dir, 'scripts'))
  copyFileSync(vigilante, join(dir, 'scripts', 'vigila-versiones.mjs'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'consumidor', version: '1.0.0', dependencies: { [NOMBRE]: dependencia } }, null, 2))
  const entrada = { version: '0.2.0', ...(resolved ? { resolved } : {}) }
  writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { [`node_modules/${NOMBRE}`]: entrada } }, null, 2))
  return dir
}

async function vigila(dir: string): Promise<{ codigo: number; salida: string }> {
  try {
    const { stdout } = await corre('node', ['scripts/vigila-versiones.mjs', `--registro=${url}`], { cwd: dir })
    return { codigo: 0, salida: stdout }
  } catch (e) {
    const err = e as { code: number; stdout: string; stderr: string }
    return { codigo: err.code, salida: `${err.stdout}${err.stderr}` }
  }
}

const huella = (dir: string) => readFileSync(join(dir, 'package.json'), 'utf8') + readFileSync(join(dir, 'package-lock.json'), 'utf8')

test('RF-16: el consumidor se entera de la versión nueva, una sola vez, y su pin no se mueve', async (t) => {
  const dir = consumidor('0.2.0')
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const antes = huella(dir)

  publicada = '0.2.0'
  const alDia = await vigila(dir)
  assert.equal(alDia.codigo, 0, alDia.salida)
  assert.match(alDia.salida, /Todo lo pineado sigue siendo lo ultimo publicado/)

  publicada = '0.3.0'
  const aviso = await vigila(dir)
  assert.equal(aviso.codigo, 1, 'una versión nueva publicada se avisa con exit 1')
  assert.match(aviso.salida, /menor.*@tu-scope\/conocimiento.*0\.2\.0 → 0\.3\.0/)
  assert.match(aviso.salida, /Esto PROPONE, no aplica/)
  assert.equal(huella(dir), antes, 'el aviso no toca package.json ni el lockfile')

  const otraVez = await vigila(dir)
  assert.equal(otraVez.codigo, 0, 'la misma versión no se vuelve a avisar: el silencio es la señal')
  assert.match(otraVez.salida, /Sin novedades/)

  publicada = '1.0.0'
  const mayor = await vigila(dir)
  assert.equal(mayor.codigo, 1)
  assert.match(mayor.salida, /MAYOR.*0\.2\.0 → 1\.0\.0/)
  assert.equal(huella(dir), antes)
})

test('instalado desde el tarball (sin publicar): no hay aviso posible, y lo dice sin falsa alarma', async (t) => {
  const dir = consumidor('file:../tu-scope-conocimiento-0.2.0.tgz', 'file:../tu-scope-conocimiento-0.2.0.tgz')
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const r = await vigila(dir)
  assert.equal(r.codigo, 0, r.salida)
  assert.match(r.salida, /se instaló desde un archivo: sin registro no hay aviso de versión nueva/)
  assert.doesNotMatch(r.salida, /No existen en el registro/)
})

test('el registro falso se cierra', () => {
  registro.close()
  registro.closeAllConnections()
})
