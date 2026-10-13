/**
 * El gate del analista de producto (`npm run prueba:analista`, PRP-009). `node --test`.
 *
 * Prueba el contrato A2A con los tipos y constantes del SDK instalado, que NINGUNA ruta lo sirve
 * (enumerando `src/app`, no buscando una lista), que el verificador tumba cada siembra y que la
 * ultima corrida de `docs/analisis/` esta en verde. Si alguien edita el informe y rompe una cita,
 * este gate se pone rojo: la evidencia no se afirma una vez, se vuelve a comprobar en cada validate.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { A2A_PROTOCOL_VERSION, TaskState } from '@a2a-js/sdk'
import { ESTADO_INICIAL, MOTIVOS_DE_RECHAZO, SALIDAS, TRANSICIONES, puedePasar, tarjetaDelAnalista } from './tarjeta.ts'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aqui, '..', '..')
const verificador = join(aqui, 'verifica-evidencia.mjs')

function archivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? archivos(join(dir, e.name)) : [join(dir, e.name)]))
}

test('la Card usa los tipos y la version del SDK, y ofrece UNA capacidad con la regla de oro a la vista', () => {
  const card = tarjetaDelAnalista('http://app:3000/')
  assert.equal(card.supportedInterfaces[0].protocolVersion, A2A_PROTOCOL_VERSION)
  assert.equal(card.supportedInterfaces[0].url, 'http://app:3000/a2a/analista')
  assert.equal(card.skills.length, 1)
  assert.match(card.skills[0].description, /GRADO de evidencia/)
  assert.match(card.skills[0].description, /hipotesis, nunca un hallazgo/)
  assert.deepEqual(card.defaultOutputModes, SALIDAS)
})

test('la Card exige clave y no nombra nada del interior (modelo, proveedor, rutas, ramas)', () => {
  const card = tarjetaDelAnalista('http://app:3000')
  assert.equal(card.securityRequirements.length, 1)
  const texto = JSON.stringify(card)
  for (const interior of [/claude|opus|sonnet|haiku|openrouter/i, /docs\/analisis|scripts\//, /golden/i, /\.env/]) {
    assert.doesNotMatch(texto, interior)
  }
})

test('las transiciones: terminales sin salida, REJECTED solo antes de trabajar, INPUT_REQUIRED vuelve a WORKING', () => {
  assert.equal(ESTADO_INICIAL, TaskState.TASK_STATE_SUBMITTED)
  for (const terminal of [TaskState.TASK_STATE_COMPLETED, TaskState.TASK_STATE_FAILED, TaskState.TASK_STATE_REJECTED, TaskState.TASK_STATE_CANCELED]) {
    assert.deepEqual(TRANSICIONES.get(terminal), [])
  }
  const haciaRechazo = [...TRANSICIONES].filter(([, a]) => a.includes(TaskState.TASK_STATE_REJECTED)).map(([de]) => de)
  assert.deepEqual(haciaRechazo, [TaskState.TASK_STATE_SUBMITTED])
  assert.ok(puedePasar(TaskState.TASK_STATE_INPUT_REQUIRED, TaskState.TASK_STATE_WORKING))
  assert.ok(!puedePasar(TaskState.TASK_STATE_WORKING, TaskState.TASK_STATE_REJECTED))
  const alcanzables = new Set([ESTADO_INICIAL])
  for (let i = 0; i < TRANSICIONES.size; i++) for (const de of [...alcanzables]) for (const a of TRANSICIONES.get(de) ?? []) alcanzables.add(a)
  assert.equal(alcanzables.size, TRANSICIONES.size, 'todo estado declarado es alcanzable desde SUBMITTED')
})

test('el catalogo de rechazos es cerrado, en espanol y sin nombres del interior', () => {
  for (const motivo of Object.values(MOTIVOS_DE_RECHAZO)) {
    assert.match(motivo, /^El analista |^Servir |^Hay fuentes /)
    assert.doesNotMatch(motivo, /\/|golden|\.env|\.json/)
  }
})

test('NINGUNA ruta sirve al analista: se enumera src/app entero, no se busca una lista', () => {
  const rutas = archivos(join(raiz, 'src', 'app')).filter((f) => /\/route\.tsx?$/.test(f))
  assert.ok(rutas.length > 0, 'la enumeracion encontro rutas: si no, la prueba no prueba nada')
  for (const ruta of rutas) {
    assert.doesNotMatch(relative(raiz, ruta), /analista/, `${relative(raiz, ruta)} parece servir al analista`)
    assert.doesNotMatch(readFileSync(ruta, 'utf8'), /analista-producto/, `${relative(raiz, ruta)} importa el contrato del analista`)
  }
  // git grep sale 1 cuando no encuentra nada: eso es lo esperado, no un error
  const usos = spawnSync('git', ['grep', '-l', 'analista-producto/tarjeta', '--', 'src'], { cwd: raiz, encoding: 'utf8' })
  assert.equal(usos.stdout.trim(), '', `src/ importa el contrato del analista: ${usos.stdout}`)
})

test('el verificador tumba cada siembra (la prueba de la prueba)', () => {
  const r = spawnSync(process.execPath, [verificador, '--prueba'], { cwd: raiz, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /(\d+) de \1 siembras cazadas/)
})

test('la ultima corrida de docs/analisis/ esta en verde', () => {
  const r = spawnSync(process.execPath, [verificador], { cwd: raiz, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /Evidencia verificada/)
})
