/**
 * La suite cuenta solo si se pone roja cuando debe: sin sabotaje, todo verde; con cada sabotaje
 * (S1–S11, en una base nueva), al menos la comprobación que lo vigila cae.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { baseSala, corre, SABOTAJES } from './_suite.ts'

test('sin sabotaje, la suite completa está en verde', async () => {
  const r = await corre(await baseSala())
  assert.deepEqual(r.filter((c) => !c.ok).map((c) => `${c.id}: ${c.que}`), [])
  assert.ok(r.length >= 14)
})

for (const s of SABOTAJES) {
  test(`sabotaje ${s.id} (${s.que}) pone la suite en rojo`, async () => {
    const r = await corre(await baseSala(s.sql ?? ''), s.opciones ?? {})
    const rojas = r.filter((c) => !c.ok).map((c) => c.id)
    for (const id of s.caza) assert.ok(rojas.includes(id), `${s.id} debía tumbar ${id}; cayeron: ${rojas.join(', ') || 'ninguna'}`)
  })
}
