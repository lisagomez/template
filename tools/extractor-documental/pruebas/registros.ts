import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abreLote, cierraLote, admiteAltas, exigeAbierto, tituloSugerido } from '../dist/registros.js'
import type { DatosDeLote } from '../dist/registros.js'

const AHORA = new Date('2026-09-07T10:00:00.000Z')
const datos = (extra: Partial<DatosDeLote> = {}): DatosDeLote => ({
  id: 'l1', organizacionId: 'org-1', titulo: 'Conteo almacen norte',
  tipoTrabajo: 'inventario', creadoPor: 'lisa', rol: 'operario', ...extra,
})

test('un lote nace abierto, con su titulo y su organizacion', () => {
  const l = abreLote(datos(), AHORA)
  assert.equal(l.estado, 'abierto')
  assert.equal(l.titulo, 'Conteo almacen norte')
  assert.equal(l.organizacionId, 'org-1')
  assert.equal(l.cerradoEn, null)
})

test('sin titulo no hay lote: no se podria recuperar despues', () => {
  assert.throws(() => abreLote(datos({ titulo: '   ' }), AHORA), /titulo es obligatorio/)
})

test('el titulo NO es unico: dos lotes pueden llamarse igual', () => {
  // Forzar unicidad hace que el segundo dia alguien escriba "Conteo almacen 2", que es peor.
  const a = abreLote(datos({ id: 'l1' }), AHORA)
  const b = abreLote(datos({ id: 'l2' }), new Date('2026-09-08T10:00:00.000Z'))
  assert.equal(a.titulo, b.titulo)
  assert.notEqual(a.id, b.id)
})

test('un operario abre lotes pero NO los cierra', () => {
  const l = abreLote(datos(), AHORA)
  assert.throws(() => cierraLote(l, 'operario'), /no puede "cerrar_lote"/)
  assert.equal(cierraLote(l, 'revisor', AHORA).estado, 'cerrado')
})

test('un lote cerrado no admite documentos nuevos ni se cierra dos veces', () => {
  const cerrado = cierraLote(abreLote(datos(), AHORA), 'revisor', AHORA)
  assert.equal(admiteAltas(cerrado), false)
  assert.throws(() => exigeAbierto(cerrado), /esta cerrado/)
  assert.throws(() => cierraLote(cerrado, 'revisor'), /no se puede cerrar dos veces/)
})

/** Contra el "prueba 2" no se valida: se ofrece un buen defecto que el humano acepta o cambia. */
test('el titulo sugerido sale del contenido, no de la nada', () => {
  assert.equal(
    tituloSugerido({ tipoTrabajo: 'facturas', documentos: 12, contraparte: 'ACME', fecha: AHORA }),
    'Facturas · ACME · 12 documentos · 07/09',
  )
  assert.equal(
    tituloSugerido({ tipoTrabajo: 'trazabilidad', documentos: 1, fecha: AHORA }),
    'Trazabilidad · 1 documento · 07/09',
  )
})
