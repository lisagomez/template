/** El token de tarea: lo firma el orquestador, lo verifica la pasarela; sin firma válida no hay alcance. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emiteTokenDeTarea, verificaTokenDeTarea } from '../dist/index.js'

const S = 'secreto-de-laboratorio-para-tareas-0123456789'
const A = '00000000-0000-4000-8000-0000000000a0'
const B = '00000000-0000-4000-8000-0000000000b0'

test('un token válido se verifica y trae su consultora', () => {
  const t = emiteTokenDeTarea(S, { consultora: A, tarea: 't1', rol: 'soporte_sap_agente', exp: 2_000 })
  assert.equal(verificaTokenDeTarea(S, t, 1_000).consultora, A)
})

test('cambiar la consultora del cuerpo rompe la firma', () => {
  const t = emiteTokenDeTarea(S, { consultora: A, tarea: 't1', rol: 'soporte_sap_agente', exp: 2_000 })
  const [, sello] = t.split('.')
  const cuerpoB = Buffer.from(JSON.stringify({ consultora: B, tarea: 't1', rol: 'soporte_sap_agente', exp: 2_000 })).toString('base64url')
  assert.throws(() => verificaTokenDeTarea(S, `${cuerpoB}.${sello}`, 1_000), /firma/)
})

test('otro secreto, vencido, mal formado o con rol inventado: rechazado', () => {
  const t = emiteTokenDeTarea(S, { consultora: A, tarea: 't1', rol: 'soporte_sap_agente', exp: 2_000 })
  assert.throws(() => verificaTokenDeTarea('otro-secreto-de-al-menos-treinta-y-dos-caracteres', t, 1_000), /firma/)
  assert.throws(() => verificaTokenDeTarea(S, t, 3_000), /venció/)
  assert.throws(() => verificaTokenDeTarea(S, 'abc', 1_000), /mal formado/)
  assert.throws(() => emiteTokenDeTarea(S, { consultora: A, tarea: 't', rol: 'service_role' as 'soporte_sap_agente', exp: 2 }), /rol de servicio desconocido/)
  assert.throws(() => emiteTokenDeTarea('corto', { consultora: A, tarea: 't', rol: 'soporte_sap_agente', exp: 2 }), /32 caracteres/)
})
