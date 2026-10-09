/**
 * Las pantallas de la fase 2 del PRP-010: la impugnación en la app (H-10). La prueba lee el runtime, que no corre
 * fuera de Next; el recorrido de Playwright la ejercita de punta a punta (paso 14). Las reglas son las de
 * `ss_impugnacion` en la base (tanda 1b): las prueba `cierre-base.ts`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lee } from './_ayuda.ts'

const cuerpoDe = (codigo: string, funcion: string) => { const d = codigo.indexOf(`function ${funcion}(`); return codigo.slice(d, codigo.indexOf('\n}\n', d)) }

test('H-10 · en la app, impugna el cliente de la incidencia con su motivo, y la consultora la resuelve a su nombre sin reabrirla', () => {
  const runtime = lee('src/features/soporte-sap/services/runtime.ts')
  const impugna = cuerpoDe(runtime, 'impugna'), resuelve = cuerpoDe(runtime, 'resuelveImpugnacion')
  assert.match(impugna, /if \(s\.rol !== 'cliente'\) throw new Rechazo/, 'impugna el cliente')
  assert.match(impugna, /x\.cliente === s\.organizacion/, 'solo su incidencia')
  assert.match(impugna, /motivo\.trim\(\)\.length < 10\) throw new Rechazo/, 'con un motivo de 10 caracteres o más')
  assert.match(resuelve, /if \(s\.rol !== 'consultor'\) throw new Rechazo/, 'resuelve el consultor')
  assert.match(resuelve, /x\.consultora === s\.organizacion/, 'de su consultora')
  assert.match(resuelve, /if \(m\.estado !== 'abierta'\) throw new Rechazo\('una impugnación resuelta no se reabre/, 'una resuelta no se reabre')
  assert.match(resuelve, /m\.resueltaPor = s\.usuario; m\.resuelta = ahora\(\)/, 'a su nombre y con fecha')
  assert.doesNotMatch(resuelve, /m\.(motivo|campo|por)\s*=/, 'no reescribe la queja')
  assert.match(lee('src/app/api/soporte-sap/route.ts'), /tipo: z\.literal\('impugna'\)[^\n]*campo: z\.enum\(\['prioridad', 'categoria', 'complejidad', 'pausa', 'resolucion'\]\)[^\n]*motivo: z\.string\(\)\.trim\(\)\.min\(10\)/, 'la ruta exige lo mismo, también la pausa')
})

test('pausa unilateral · en la app, pausar dice qué se le pide al cliente, y el cliente de la incidencia la reanuda al responder', () => {
  const runtime = lee('src/features/soporte-sap/services/runtime.ts')
  const pide = cuerpoDe(runtime, 'pideAlCliente'), responde = cuerpoDe(runtime, 'respuestaDelCliente')
  assert.match(pide, /if \(s\.rol !== 'consultor'\) throw new Rechazo/, 'pausa el consultor')
  assert.match(pide, /x\.consultora === s\.organizacion/, 'de su consultora')
  assert.match(pide, /if \(pide\.trim\(\)\.length < 10\) throw new Rechazo/, 'diciendo qué pide')
  assert.match(pide, /anota\(i, 'ESPERA_CLIENTE', s\.usuario, \{ pide: pide\.trim\(\) \}\)/, 'y lo pedido queda en la cadena')
  assert.match(responde, /\(s\.rol === 'cliente' && x\.cliente === s\.organizacion\)/, 'el cliente de la incidencia reanuda')
  assert.match(responde, /\(s\.rol === 'consultor' && x\.consultora === s\.organizacion\)/, 'o su consultor')
  assert.match(responde, /if \(i\.estado !== 'espera_cliente'\) throw new Rechazo/, 'solo si algo se le pidió')
  assert.match(runtime, /if \(a\.tipo === 'espera_cliente'\) return pideAlCliente\(s, a\.incidencia, a\.pide\)\n  return respuestaDelCliente\(s, a\.incidencia\)/, 'la acción llega a las dos')
  assert.match(lee('src/app/api/soporte-sap/route.ts'), /tipo: z\.literal\('espera_cliente'\)[^\n]*pide: z\.string\(\)\.trim\(\)\.min\(10\)/, 'la ruta exige lo mismo')
  assert.match(lee('src/features/soporte-sap/components/incidencias.tsx'), /rol === 'cliente'[\s\S]*data-prueba="cliente-reanuda"/, 'y el cliente tiene con qué')
})
