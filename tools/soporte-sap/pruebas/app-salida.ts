/**
 * D8 (PRP-012, fase 3) en la app, EJECUTADA como en `app.ts`: cuándo vence cada original, quién registra la salida de un
 * cliente, qué queda congelado y quién descarga su export. Los contratos del laboratorio no dicen todavía N ni la gracia
 * (DP-4), así que en la app nada vence; la regla con N se prueba sobre la misma función que usa la pantalla.
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { vencimientoDeOriginal } from '../dist/index.js'
import { RAIZ } from './_ayuda.ts'

register('./_app.mjs', import.meta.url)
process.env['SOPORTE_SAP_LABORATORIO'] = '1'
delete process.env['TESSERACT_CMD']
const SERVICIOS = join(RAIZ, 'src', 'features', 'soporte-sap', 'services')
const rt = await import(pathToFileURL(join(SERVICIOS, 'runtime.ts')).href)
const { vista } = await import(pathToFileURL(join(SERVICIOS, 'vistas.ts')).href)
const { SESIONES } = await import(pathToFileURL(join(SERVICIOS, 'tipos.ts')).href)
const { GET, POST } = await import(pathToFileURL(join(RAIZ, 'src', 'app', 'api', 'soporte-sap', 'route.ts')).href)
const { NextRequest } = await import('next/server')
const { cliente, consultor, superadmin, experto } = SESIONES

const BAJIO = 'alimentos-del-bajio'
const CFDI = { nombre: 'cfdi-rechazado.xml', bytes: readFileSync(join(RAIZ, 'tools', 'soporte-sap', 'documentos', 'cfdi-rechazado.xml')) }
const FB01 = { titulo: 'FB01 no deja contabilizar', descripcion: 'FB01 marca F5 201: el periodo contable no está abierto en sociedad 1000 para el periodo 2026/10', archivos: [] }
const vence = (id: string) => vista(cliente).incidencias.find((x: { id: string }) => x.id === id).adjuntos[0].vence as string
const salidaDe = (s: unknown, c: string) => vista(s).salidas.find((x: { cliente: string }) => x.cliente === c)
const descarga = (rol: string, c: string) => GET(new NextRequest(`http://lab/api/soporte-sap?rol=${rol}&export=${encodeURIComponent(c)}`))

beforeEach(() => rt.actua(superadmin, { tipo: 'reinicia' }))

test('D8 · en la app, cada original dice cuándo vence con la regla de la base: abierta, se guarda; impugnada, no vence; sin N en el contrato, tampoco', async () => {
  const id = await rt.levanta(cliente, { ...FB01, archivos: [CFDI] })
  assert.match(vence(id), /mientras la incidencia siga abierta/)
  rt.actua(consultor, { tipo: 'resuelve', incidencia: id })
  assert.match(vence(id), /el contrato todavía no dice cuántos días se guarda \(D8, DP-4\)/, 'resuelta, y el contrato del laboratorio no dice N')
  rt.actua(cliente, { tipo: 'impugna', incidencia: id, campo: 'resolucion', motivo: 'no quedó resuelto: sigue saliendo el F5 201' })
  assert.match(vence(id), /no vence mientras haya una impugnación abierta/)
  assert.deepEqual(vista(superadmin).incidencias.flatMap((x: { adjuntos: unknown[] }) => x.adjuntos), [], 'el laboratorio no ve los originales')
})

test('D8 · vencimientoDeOriginal: N días después de la ÚLTIMA resolución, la de la incidencia o la de una impugnación', () => {
  const p = { resueltaEn: '2026-01-01T10:00:00.000Z', impugnaciones: [{ estado: 'rechazada', resuelta: '2026-01-10T10:00:00.000Z' }], dias: 30 }
  const antes = vencimientoDeOriginal(p, '2026-02-01T00:00:00.000Z')
  assert.deepEqual([antes.estado, antes.fecha], ['vence', '2026-02-09T10:00:00.000Z'], 'cuenta desde la impugnación, que se resolvió después')
  assert.equal(vencimientoDeOriginal(p, '2026-02-10T00:00:00.000Z').estado, 'vencido')
  assert.equal(vencimientoDeOriginal({ ...p, impugnaciones: [...p.impugnaciones, { estado: 'abierta', resuelta: null }] }, '2027-01-01T00:00:00.000Z').estado, 'impugnada', 'con una abierta, nunca')
  assert.equal(vencimientoDeOriginal({ ...p, dias: null }, '2030-01-01T00:00:00.000Z').estado, 'sin_plazo', 'sin N, nunca')
})

test('D8 · en la app, la salida la registra una persona del cliente o de su consultora: el laboratorio no, ni la de un cliente ajeno, ni dos veces', () => {
  for (const s of [superadmin, experto]) assert.throws(() => rt.actua(s, { tipo: 'registra_salida', cliente: BAJIO }), /del cliente o de su consultora \(D8, DP-2\)/, s.rol)
  assert.throws(() => rt.actua(cliente, { tipo: 'registra_salida', cliente: 'aceros-del-norte' }), /DP-2/, 'el cliente, solo la suya')
  assert.throws(() => rt.actua(consultor, { tipo: 'registra_salida', cliente: 'bebidas-del-sur' }), /DP-2/, 'la consultora, solo la de sus clientes')
  rt.actua(consultor, { tipo: 'registra_salida', cliente: 'aceros-del-norte' })
  assert.equal(salidaDe(consultor, 'aceros-del-norte').registrada.por, 'usr-consultor-andina', 'a su nombre')
  assert.throws(() => rt.actua(consultor, { tipo: 'registra_salida', cliente: 'aceros-del-norte' }), /ya está registrada/)
  assert.equal(salidaDe(consultor, BAJIO).registrada, null, 'la de su vecino no se registró')
})

test('D8 · en la app, con la salida registrada el cliente se congela: no levanta, nadie atiende ni impugna lo suyo, y su reloj se detiene', async () => {
  const id = await rt.levanta(cliente, FB01)
  rt.actua(cliente, { tipo: 'registra_salida', cliente: BAJIO })
  const congelado = /la salida de este cliente está registrada \(D8\)/
  await assert.rejects(rt.levanta(cliente, FB01), congelado, 'no levanta')
  for (const [s, a] of [[consultor, { tipo: 'responde', incidencia: id, texto: 'Ya lo revisamos' }], [consultor, { tipo: 'resuelve', incidencia: id }], [consultor, { tipo: 'escala', incidencia: id }],
    [consultor, { tipo: 'espera_cliente', incidencia: id, pide: 'el log completo del job' }], [cliente, { tipo: 'impugna', incidencia: id, campo: 'prioridad', motivo: 'esto detiene la planta entera' }],
    [cliente, { tipo: 'revoca_nucleo' }]] as const) assert.throws(() => rt.actua(s, a), congelado, a.tipo)
  await new Promise((listo) => setTimeout(listo, 20))
  const i = vista(cliente).incidencias.find((x: { id: string }) => x.id === id)
  assert.equal(i.congelada, true)
  assert.equal(i.reloj.tramos.at(-1).hasta, salidaDe(cliente, BAJIO).registrada.fecha, 'el reloj se detuvo al registrarla')
  rt.actua(consultor, { tipo: 'consiente_nucleo' })
  assert.ok(vista(consultor).conocimientoComun.find((c: { organizacion: string }) => c.organizacion === 'andina').vigente, 'su consultora sigue')
})

test('D8 · en la app, el export lo descargan el cliente y su consultora, y nadie más; su huella es la de su contenido y sin gracia no se borra nada', async () => {
  const id = await rt.levanta(cliente, FB01)
  const r = await POST(new NextRequest('http://lab/api/soporte-sap?rol=cliente', { method: 'POST', body: JSON.stringify({ tipo: 'registra_salida', cliente: BAJIO }), headers: { 'content-type': 'application/json' } }))
  assert.equal(r.status, 200, 'la ruta acepta la acción')
  const suya = await descarga('cliente', BAJIO)
  assert.equal(suya.status, 200)
  assert.match(suya.headers.get('content-disposition') ?? '', /attachment; filename="export-alimentos-del-bajio\.json"/)
  const cuerpo = await suya.text()
  const s = salidaDe(cliente, BAJIO)
  assert.equal(createHash('sha256').update(cuerpo).digest('hex'), s.registrada.export.sha256, 'la huella es la del contenido')
  assert.deepEqual(JSON.parse(cuerpo).incidencias.map((x: { id: string }) => x.id), [id])
  assert.equal(await (await descarga('consultor', BAJIO)).text(), cuerpo, 'su consultora descarga el mismo')
  for (const rol of ['superadmin', 'experto']) assert.equal((await descarga(rol, BAJIO)).status, 404, `${rol}: el laboratorio no lee exportes`)
  assert.equal((await descarga('cliente', 'aceros-del-norte')).status, 404, 'sin salida registrada no hay export')
  assert.equal((await descarga('cliente', '../alimentos-del-bajio')).status, 404, 'el nombre se valida')
  assert.equal(salidaDe(superadmin, BAJIO).registrada.export, null, 'el laboratorio ve la baja, no el export')
  assert.match(s.gracia, /por decidir/)
  assert.match(s.registrada.estado, /no se borra nada hasta que la diga \(D8, DP-4\)/)
})
