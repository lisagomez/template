import { test } from 'node:test'
import assert from 'node:assert/strict'
import { puede, accionesDe, exige } from '../dist/roles.js'
import type { Rol, Accion } from '../dist/roles.js'

const ROLES: Rol[] = ['operario', 'revisor', 'consulta']
const ACCIONES: Accion[] = [
  'crear_lote', 'escanear', 'corregir', 'validar', 'cerrar_lote', 'suprimir', 'exportar', 'consultar',
]

/**
 * Recorre la matriz ENTERA. Es lo que impide que un rol gane un permiso por descuido al tocar
 * otra cosa: si alguien anade una accion y se olvida de decidirla, esta prueba lo dice.
 */
test('la matriz completa es la esperada, rol por rol y accion por accion', () => {
  const esperado: Record<Rol, Accion[]> = {
    operario: ['crear_lote', 'escanear', 'consultar'],
    revisor: ACCIONES,
    consulta: ['consultar', 'exportar'],
  }
  for (const rol of ROLES) {
    for (const accion of ACCIONES) {
      assert.equal(puede(rol, accion), esperado[rol].includes(accion), `${rol} / ${accion}`)
    }
  }
})

/** El caso que motivo todo esto: quien escanea no puede validar lo que escaneo. */
test('un operario no valida, no cierra y no suprime', () => {
  assert.equal(puede('operario', 'validar'), false)
  assert.equal(puede('operario', 'cerrar_lote'), false)
  assert.equal(puede('operario', 'suprimir'), false)
  assert.throws(() => exige('operario', 'validar'), /no puede "validar"/)
})

test('consulta audita sin poder alterar lo auditado', () => {
  assert.ok(puede('consulta', 'consultar'))
  assert.ok(puede('consulta', 'exportar'))
  assert.equal(puede('consulta', 'escanear'), false)
  assert.equal(puede('consulta', 'corregir'), false)
})

test('accionesDe no expone la matriz para mutarla por accidente', () => {
  assert.deepEqual([...accionesDe('consulta')].sort(), ['consultar', 'exportar'])
})
