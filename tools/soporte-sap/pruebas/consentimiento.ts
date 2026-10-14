/**
 * D1 en el dominio (PRP-011): la misma regla que la base, con los mismos mensajes. Al núcleo, con el consentimiento
 * vigente de la consultora y del cliente de origen; revocar frena lo nuevo; un revocado no se reabre.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { faltaParaElNucleo, consiente, revoca, vigente, type Consentimientos } from '../dist/index.js'

const ORIGEN = { consultora: 'andina', cliente: 'alimentos-del-bajio' }

test('D1 · sin origen, o sin el consentimiento de la consultora o del cliente de origen, no sube; con los dos, sí', () => {
  let cs: Consentimientos = {}
  assert.match(faltaParaElNucleo(cs, null) ?? '', /origen registrado/)
  assert.match(faltaParaElNucleo(cs, ORIGEN) ?? '', /consultora de origen/)
  cs = consiente(cs, 'andina', 'usr-consultor-andina', '2026-10-10T10:00:00Z')
  assert.match(faltaParaElNucleo(cs, ORIGEN) ?? '', /cliente de origen/)
  cs = consiente(cs, 'alimentos-del-bajio', 'usr-cliente-bajio', '2026-10-10T10:05:00Z')
  assert.equal(faltaParaElNucleo(cs, ORIGEN), null)
  assert.doesNotMatch(String(faltaParaElNucleo({}, ORIGEN)), /andina|bajio/, 'dice qué falta, nunca de quién')
})

test('D1 · revocar frena lo nuevo; un consentimiento revocado no se reabre, se da uno nuevo y el historial queda', () => {
  let cs = consiente({}, 'andina', 'usr-consultor-andina', '2026-10-10T10:00:00Z')
  assert.throws(() => consiente(cs, 'andina', 'usr-consultor-andina', '2026-10-10T10:01:00Z'), /ya hay un consentimiento vigente/)
  cs = revoca(cs, 'andina', '2026-10-10T11:00:00Z')
  assert.equal(vigente(cs, 'andina'), null)
  assert.throws(() => revoca(cs, 'andina', '2026-10-10T11:01:00Z'), /no hay un consentimiento vigente/)
  cs = consiente(cs, 'andina', 'usr-consultor-andina', '2026-10-10T12:00:00Z')
  assert.deepEqual(cs['andina']!.map((c) => c.revocado), ['2026-10-10T11:00:00Z', null], 'el revocado se conserva; el nuevo es otro')
})
