/**
 * Los CLIs del producto contra su contrato: el manifiesto lista exactamente los archivos de
 * `clis/`; cada uno responde `--help` como «no medido»; lo que cambia estado simula por defecto; y
 * el simulador no ejecuta sin la fila de aprobación humana de la sala.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { salaVacia, agregaParticipante, creaCanal, publica, registraAprobacion } from '../../sala-a2a/dist/index.js'
import { HERRAMIENTA } from './_ayuda.ts'
import { huellaDePlan, pasosDe, MATRIZ_LABORATORIO } from '../dist/index.js'

const DIR = join(HERRAMIENTA, 'clis')
const manifiesto = JSON.parse(readFileSync(join(DIR, 'manifiesto.json'), 'utf8')) as { producto: string; clis: Array<{ nombre: string; archivo: string; readOnly: boolean; dryRunPorDefecto: boolean; grado: string }> }
const corre = (archivo: string, args: string[]) => spawnSync(process.execPath, [join(DIR, archivo), ...args], { encoding: 'utf8', timeout: 60_000 })

test('el manifiesto lista exactamente los CLIs de la carpeta, del producto y sin grado', () => {
  const archivos = readdirSync(DIR).filter((f) => f.endsWith('.mjs')).sort()
  assert.deepEqual(manifiesto.clis.map((c) => c.archivo).sort(), archivos)
  assert.equal(manifiesto.producto, 'soporte-sap')
  assert.ok(manifiesto.clis.every((c) => c.grado === 'no medido'))
  assert.ok(manifiesto.clis.every((c) => c.readOnly || c.dryRunPorDefecto), 'lo que cambia estado simula por defecto')
})

for (const c of manifiesto.clis) {
  test(`${c.nombre} --help: dice qué hace y que no está medido`, () => {
    const r = corre(c.archivo, ['--help'])
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, new RegExp(`^${c.nombre} — `))
    assert.match(r.stdout, /grado: no medido/)
  })
}

test('ss-simulador: sin --ejecutar simula; con --ejecutar y sin aprobación no corre; con la fila humana sí', () => {
  const base = ['ejecuta', '--regla', 'SS-BC-USUARIO', '--param', 'usuario=ALMACEN01']
  assert.match(corre('ss-simulador.mjs', base).stdout, /dry-run/)
  const dir = mkdtempSync(join(tmpdir(), 'sala-'))
  const regla = MATRIZ_LABORATORIO.find((e) => e.regla === 'SS-BC-USUARIO')!
  const sha = huellaDePlan({ taskId: 'tarea-7', version: 1, regla: regla.regla, parametros: { usuario: 'ALMACEN01' }, pasos: pasosDe(regla, { usuario: 'ALMACEN01' }) })
  let sala = creaCanal(agregaParticipante(salaVacia(), 'ten-a', 'usr-experto'), { id: 'c1', tenant: 'ten-a', slug: 'andina', nombre: 'Andina', departamento: null })
  sala = publica(sala, { id: 'm1', canal: 'c1', autor: { tipo: 'agente', id: 'soporte-sap-a2a' }, cuerpo: 'plan', creado: 'x', bloques: [{ tipo: 'acciones', acciones: ['aprobar'], sha256: sha, taskId: 'tarea-7' }] })
  writeFileSync(join(dir, 'sin.json'), JSON.stringify(sala))
  const sin = corre('ss-simulador.mjs', [...base, '--ejecutar', '--sala', join(dir, 'sin.json'), '--tarea', 'tarea-7', '--sha', sha])
  assert.equal(sin.status, 1)
  assert.match(sin.stderr, /sin aprobación humana/)
  writeFileSync(join(dir, 'con.json'), JSON.stringify(registraAprobacion(sala, { principal: { tipo: 'humano', id: 'usr-experto' } }, { id: 'a1', mensaje: 'm1', accion: 'aprobar', decidida: 'x' })))
  const con = corre('ss-simulador.mjs', [...base, '--ejecutar', '--sala', join(dir, 'con.json'), '--tarea', 'tarea-7', '--sha', sha])
  assert.equal(con.status, 0, con.stderr)
  assert.match(con.stdout, /"aprobadoPor": "usr-experto"/)
  assert.match(con.stdout, /ALMACEN01: activo/)
  // PRP-010 H-11: con la misma aprobación, otro `--param` es otro artefacto y no corre.
  const otro = corre('ss-simulador.mjs', ['ejecuta', '--regla', 'SS-BC-USUARIO', '--param', 'usuario=VENTAS02', '--ejecutar', '--sala', join(dir, 'con.json'), '--tarea', 'tarea-7', '--sha', sha])
  assert.equal(otro.status, 1, otro.stdout)
  assert.match(otro.stderr, /la aprobación es de otro artefacto/)
})

test('ss-triage: el caso de MIGO sale con su regla y su fuente sintética', () => {
  const r = corre('ss-triage.mjs', ['--sistema', 'S4HANA', 'MIGO M7 053 en sociedad 1000 periodo 2026/10'])
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /"regla": "SS-MM-PERIODO"/)
  assert.match(r.stdout, /no es una nota de SAP/)
})
