/**
 * El runtime del laboratorio, EJECUTADO (PRP-010, tercera revisión: R3-14). Las pruebas de `pantallas.ts` leen el
 * código con expresiones regulares, y un sabotaje que borra justo la línea buscada las tumba sin probar la conducta.
 * Aquí cada rol actúa como en la app y se mira lo que queda: quién ve qué, qué dice la cadena, qué marca el reloj.
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { RAIZ } from './_ayuda.ts'

register('./_app.mjs', import.meta.url)
process.env['SOPORTE_SAP_LABORATORIO'] = '1'
delete process.env['TESSERACT_CMD']
const SERVICIOS = join(RAIZ, 'src', 'features', 'soporte-sap', 'services')
const rt = await import(pathToFileURL(join(SERVICIOS, 'runtime.ts')).href)
const { vista } = await import(pathToFileURL(join(SERVICIOS, 'vistas.ts')).href)
const { SESIONES } = await import(pathToFileURL(join(SERVICIOS, 'tipos.ts')).href)
const { cliente, consultor, superadmin } = SESIONES

type Evento = { tipo: string; actor: string; datos: Record<string, unknown> }
type Incidencia = { id: string; estado: string; cadena: Evento[]; planes: Array<{ mensaje: string | null }>; impugnaciones: Array<{ id: string }>; sla: Array<{ tipo: string }> }
const incidencia = (id: string): Incidencia => rt.estado().incidencias.find((x: Incidencia) => x.id === id)
const tipos = (id: string) => incidencia(id).cadena.map((e) => `${e.tipo}:${e.actor}`)
const FB01 = { titulo: 'FB01 no deja contabilizar', descripcion: 'FB01 marca F5 201: el periodo contable no está abierto en sociedad 1000 para el periodo 2026/10', archivos: [] }

beforeEach(() => rt.actua(superadmin, { tipo: 'reinicia' }))

test('DP-3 · en la app, el plan verificado no llega al laboratorio hasta que la consultora lo escala, a su nombre', async () => {
  const id = await rt.levanta(cliente, FB01)
  assert.deepEqual(vista(superadmin).incidencias.map((x: { id: string }) => x.id), [], 'sin escalar, el laboratorio no la ve')
  assert.equal(vista(superadmin).sala.length, 0, 'ni el plan en la sala')
  assert.ok(!tipos(id).some((t) => t.startsWith('ESCALADA')), 'el agente no escala')
  assert.throws(() => rt.actua(cliente, { tipo: 'escala', incidencia: id }), /la consultora/, 'el cliente no escala')
  rt.actua(consultor, { tipo: 'escala', incidencia: id })
  assert.deepEqual(vista(superadmin).incidencias.map((x: { id: string }) => x.id), [id], 'escalada por la consultora, sí')
  assert.ok(tipos(id).includes('ESCALADA:usr-consultor-andina'), 'a su nombre')
  assert.ok(incidencia(id).planes[0]!.mensaje, 'y el plan llega a la sala')
})

test('DP-4 · en la app, la primera respuesta es el mensaje del consultor, y el cliente lo lee', async () => {
  const id = await rt.levanta(cliente, FB01)
  rt.actua(consultor, { tipo: 'responde', incidencia: id, texto: 'Ya lo estamos revisando con el equipo de FI, te aviso en una hora' })
  const vc = vista(cliente).incidencias.find((x: { id: string }) => x.id === id)
  assert.match(JSON.stringify(vc.respuestas), /equipo de FI/, 'el cliente lee lo que se le respondió')
  assert.equal(incidencia(id).cadena.find((e) => e.tipo === 'PRIMERA_RESPUESTA')?.datos['mensaje'], 'Ya lo estamos revisando con el equipo de FI, te aviso en una hora')
})

test('R3-08 · en la app, aprobar y aplicar no resuelve: lo da por resuelto el consultor, y el cliente puede impugnarlo', async () => {
  const id = await rt.levanta(cliente, FB01)
  rt.actua(consultor, { tipo: 'escala', incidencia: id })
  rt.actua(superadmin, { tipo: 'decide', mensaje: incidencia(id).planes[0]!.mensaje, accion: 'aprobar' })
  assert.ok(tipos(id).includes('APLICADA_EN_SIMULADOR:agente:soporte-sap-a2a'), 'se aplicó')
  assert.ok(!tipos(id).some((t) => t.startsWith('RESUELTA')), 'pero no se resolvió solo')
  assert.notEqual(incidencia(id).estado, 'resuelta')
  assert.throws(() => rt.actua(superadmin, { tipo: 'resuelve', incidencia: id }), /consultora/, 'el laboratorio no resuelve')
  rt.actua(consultor, { tipo: 'resuelve', incidencia: id })
  assert.ok(tipos(id).includes('RESUELTA:usr-consultor-andina'), 'la resuelve una persona de la consultora')
  rt.actua(cliente, { tipo: 'impugna', incidencia: id, campo: 'resolucion', motivo: 'no quedó resuelto: sigue saliendo el F5 201' })
  assert.equal(incidencia(id).impugnaciones.length, 1, 'y el cliente impugna la resolución')
})

test('R3-09 · en la app, impugnar y resolver la impugnación quedan en la cadena, con quién', async () => {
  const id = await rt.levanta(cliente, FB01)
  rt.actua(cliente, { tipo: 'impugna', incidencia: id, campo: 'prioridad', motivo: 'esto detiene toda la planta, no es P4' })
  rt.actua(consultor, { tipo: 'resuelve_impugnacion', incidencia: id, impugnacion: incidencia(id).impugnaciones[0]!.id, decision: 'rechazada' })
  assert.deepEqual(tipos(id).filter((t) => t.startsWith('IMPUGNA')), ['IMPUGNADA:usr-cliente-bajio', 'IMPUGNACION_RESUELTA:usr-consultor-andina'])
})

test('pausa unilateral · en la app, el consultor pausa diciendo qué pide y el cliente la reanuda; nadie más', async () => {
  const id = await rt.levanta(cliente, FB01)
  assert.throws(() => rt.actua(consultor, { tipo: 'espera_cliente', incidencia: id, pide: 'dato' }), /lo que se le pide/, 'sin decir qué pide')
  assert.throws(() => rt.actua(cliente, { tipo: 'espera_cliente', incidencia: id, pide: 'me pauso yo solo el reloj' }), /consultor/, 'el cliente no pausa')
  rt.actua(consultor, { tipo: 'espera_cliente', incidencia: id, pide: 'el log de la ST22 del día del error' })
  assert.equal(vista(cliente).incidencias.find((x: { id: string }) => x.id === id).pide, 'el log de la ST22 del día del error', 'el cliente ve lo que se le pide')
  rt.actua(cliente, { tipo: 'responde_cliente', incidencia: id })
  assert.ok(tipos(id).includes('RESPUESTA_CLIENTE:usr-cliente-bajio'), 'y reanuda el reloj él mismo')
  assert.equal(incidencia(id).estado, 'en_atencion')
})

test('R3-18 · la ruta rechaza más de cinco adjuntos con su motivo, en vez de recortarlos en silencio', async () => {
  const { POST } = await import(pathToFileURL(join(RAIZ, 'src', 'app', 'api', 'soporte-sap', 'route.ts')).href)
  const { NextRequest } = await import('next/server')
  const sube = async (n: number) => {
    const f = new FormData()
    f.set('titulo', 'MIGO no contabiliza'); f.set('descripcion', 'M7 053 al contabilizar la entrada 101')
    for (let k = 0; k < n; k++) f.append('adjuntos', new File([`nota ${k}`], `nota-${k}.txt`, { type: 'text/plain' }))
    const cuerpo = new Response(f)
    const bytes = new Uint8Array(await cuerpo.arrayBuffer())
    const req = new NextRequest('http://lab/api/soporte-sap?rol=cliente', { method: 'POST', body: bytes,
      headers: { 'content-type': cuerpo.headers.get('content-type')!, 'content-length': String(bytes.length) } })
    const r = await POST(req)
    return { status: r.status, cuerpo: await r.json() as { error?: string } }
  }
  const seis = await sube(6)
  assert.equal(seis.status, 400)
  assert.match(seis.cuerpo.error ?? '', /5 adjuntos como máximo; llegaron 6/)
  assert.equal((await sube(5)).status, 200, 'control: cinco, sí')
})

