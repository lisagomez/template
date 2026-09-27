/**
 * Agente de impresion contra una Zebra simulada (TCP 9100): los bytes que llegan son el ZPL
 * exacto; sin credencial no entra nada; con la impresora caida o sin papel, reintenta hasta
 * que vuelve. El secreto se genera al vuelo: nunca hay uno escrito en el repo.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { creaAgente, emiteTicket, esquemaConfigAgente, type ConfigAgente } from '../dist/agente/index.js'
import { aZpl, disenaDesdeDatos, PERFIL_EJEMPLO } from '../dist/index.js'
import { simulaImpresora } from '../simuladores/impresora-9100.mjs'

const SECRETO = randomBytes(32).toString('base64url')
const SITIO = 'CEDIS-NTE'
const ZPL = aZpl(disenaDesdeDatos({ tipo: 'caja', producto: 'Yogurt natural 1 kg', gtin: '09521234000020', caducidad: '2026-10-30', lote: 'L4471' }, PERFIL_EJEMPLO, 2026), PERFIL_EJEMPLO)
const ORIGEN = 'http://localhost:3100'

const puertoLibre = () => new Promise<number>((r) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => r(p)) }) })

function config(puertoImpresora: number, extra: Partial<ConfigAgente> = {}): ConfigAgente {
  return esquemaConfigAgente.parse({
    sitio: SITIO, escucha: { host: '127.0.0.1', puerto: 0 }, origenes: [ORIGEN],
    impresoras: [{ id: 'zebra-rampa-1', nombre: 'Rampa 1', sitio: SITIO, host: '127.0.0.1', puerto: puertoImpresora }],
    reintentos: { maximo: 6, baseMs: 40, topeMs: 150 }, timeoutMs: 1000, ...extra,
  })
}

const ticket = (zpl = ZPL, x: { impresora?: string; sitio?: string; copias?: number; vidaS?: number; ahora?: number } = {}) =>
  emiteTicket({ impresora: x.impresora ?? 'zebra-rampa-1', sitio: x.sitio ?? SITIO, zpl, copias: x.copias ?? 1, operador: 'prueba', ...(x.vidaS ? { vidaS: x.vidaS } : {}), ...(x.ahora ? { ahora: x.ahora } : {}) }, SECRETO)

async function manda(base: string, cuerpo: unknown, t?: string, cabeceras: Record<string, string> = {}) {
  const r = await fetch(`${base}/v1/trabajos`, { method: 'POST', headers: { 'content-type': 'application/json', ...(t ? { authorization: `Ticket ${t}` } : {}), ...cabeceras }, body: JSON.stringify(cuerpo) })
  return { codigo: r.status, cuerpo: (await r.json()) as { id?: string; estado?: string; error?: string } }
}

async function espera(base: string, t: string, id: string, quiere: string, ms = 6000) {
  const hasta = Date.now() + ms
  let ultimo: { estado: string; intentos: number; ultimoError?: string } = { estado: '?', intentos: 0 }
  while (Date.now() < hasta) {
    ultimo = (await (await fetch(`${base}/v1/trabajos/${id}`, { headers: { authorization: `Ticket ${t}` } })).json()) as typeof ultimo
    if (ultimo.estado === quiere) return ultimo
    await new Promise((r) => setTimeout(r, 40))
  }
  throw new Error(`el trabajo quedo en ${JSON.stringify(ultimo)}, se esperaba ${quiere}`)
}

test('agente: el trabajo llega a la Zebra simulada y los bytes son EXACTAMENTE el ZPL', async () => {
  const imp = simulaImpresora()
  const agente = await creaAgente(config(await imp.escucha()), SECRETO)
  const dir = await agente.escucha()
  try {
    assert.equal(dir.address, '127.0.0.1')
    const t = ticket()
    const r = await manda(`http://127.0.0.1:${dir.port}`, { impresora: 'zebra-rampa-1', zpl: ZPL, copias: 1 }, t)
    assert.equal(r.codigo, 202)
    await espera(`http://127.0.0.1:${dir.port}`, t, r.cuerpo.id!, 'impreso')
    assert.equal(imp.recibidos.length, 1)
    assert.ok(Buffer.from(ZPL, 'utf8').equals(imp.recibidos[0]!), 'los bytes recibidos difieren del ZPL')
    console.log(`  bytes enviados ${Buffer.byteLength(ZPL)} = recibidos ${imp.recibidos[0]!.length}; iguales: ${Buffer.from(ZPL).equals(imp.recibidos[0]!)}`)
  } finally { await agente.detiene(); await imp.cierra() }
})

test('agente: sin credencial, con credencial falsa, ajena, vencida, reusada o con el ZPL cambiado → rechazado', async () => {
  const imp = simulaImpresora()
  const agente = await creaAgente(config(await imp.escucha()), SECRETO)
  const base = `http://127.0.0.1:${(await agente.escucha()).port}`
  const trabajo = { impresora: 'zebra-rampa-1', zpl: ZPL, copias: 1 }
  try {
    const casos: [string, Awaited<ReturnType<typeof manda>>, number][] = []
    casos.push(['sin credencial', await manda(base, trabajo), 401])
    const bueno = ticket()
    casos.push(['firma alterada', await manda(base, trabajo, bueno.slice(0, -3) + (bueno.endsWith('AAA') ? 'BBB' : 'AAA')), 401])
    casos.push(['firmada con otro secreto', await manda(base, trabajo, emiteTicket({ impresora: 'zebra-rampa-1', sitio: SITIO, zpl: ZPL, operador: 'x' }, randomBytes(32).toString('hex'))), 401])
    casos.push(['vencida', await manda(base, trabajo, ticket(ZPL, { ahora: Math.floor(Date.now() / 1000) - 3600 })), 401])
    casos.push(['de otro sitio', await manda(base, trabajo, ticket(ZPL, { sitio: 'SUC-CENTRO' })), 403])
    casos.push(['para otra impresora', await manda(base, trabajo, ticket(ZPL, { impresora: 'zebra-2' })), 403])
    casos.push(['impresora fuera de la lista', await manda(base, { ...trabajo, impresora: 'zebra-del-vecino' }, ticket(ZPL, { impresora: 'zebra-del-vecino' })), 403])
    casos.push(['ZPL cambiado tras firmar', await manda(base, { ...trabajo, zpl: ZPL.replace('L4471', 'L9999') }, bueno), 403])
    casos.push(['copias cambiadas', await manda(base, { ...trabajo, copias: 50 }, bueno), 403])
    casos.push(['campo extra (host)', await manda(base, { ...trabajo, host: '10.0.0.66' }, bueno), 400])
    const peligroso = '^XA^JUS^XZ'
    casos.push(['ZPL que guarda configuracion (^JUS)', await manda(base, { ...trabajo, zpl: peligroso }, ticket(peligroso)), 422])
    casos.push(['origen web no permitido', await manda(base, trabajo, bueno, { origin: 'https://evil.example' }), 403])
    casos.push(['credencial valida (control)', await manda(base, trabajo, bueno), 202])
    casos.push(['la misma credencial otra vez', await manda(base, trabajo, bueno), 409])
    for (const [nombre, r, esperado] of casos) {
      console.log(`  ${String(r.codigo).padEnd(4)} ${nombre.padEnd(38)} ${r.cuerpo.error ?? r.cuerpo.estado ?? ''}`)
      assert.equal(r.codigo, esperado, nombre)
    }
    await espera(base, bueno, casos.at(-2)![1].cuerpo.id!, 'impreso')
    assert.equal(imp.recibidos.length, 1, 'solo el trabajo autorizado llego a la impresora')
    const ajeno = await fetch(`${base}/v1/trabajos/${casos.at(-2)![1].cuerpo.id}`, { headers: { authorization: `Ticket ${ticket()}` } })
    assert.equal(ajeno.status, 404, 'con otra credencial no se ve el estado de un trabajo ajeno')
  } finally { await agente.detiene(); await imp.cierra() }
})

test('agente: con la impresora caida reintenta, y cuando vuelve imprime los mismos bytes', async () => {
  const puerto = await puertoLibre()
  const agente = await creaAgente(config(puerto), SECRETO)
  const base = `http://127.0.0.1:${(await agente.escucha()).port}`
  const imp = simulaImpresora({ puerto })
  try {
    const t = ticket()
    const r = await manda(base, { impresora: 'zebra-rampa-1', zpl: ZPL, copias: 1 }, t)
    assert.equal(r.codigo, 202)
    const caida = await espera(base, t, r.cuerpo.id!, 'reintentando')
    await new Promise((x) => setTimeout(x, 300))
    const mas = (await (await fetch(`${base}/v1/trabajos/${r.cuerpo.id}`, { headers: { authorization: `Ticket ${t}` } })).json()) as { intentos: number; ultimoError: string }
    console.log(`  impresora caida: estado ${caida.estado}, intentos ${mas.intentos}, error «${mas.ultimoError}»`)
    assert.ok(mas.intentos >= 2 && /ECONNREFUSED/.test(mas.ultimoError))
    await imp.escucha()
    const fin = await espera(base, t, r.cuerpo.id!, 'impreso')
    console.log(`  impresora de vuelta: ${fin.estado} tras ${fin.intentos} intentos; bytes iguales: ${Buffer.from(ZPL).equals(imp.recibidos[0]!)}`)
    assert.ok(Buffer.from(ZPL).equals(imp.recibidos[0]!))
  } finally { await agente.detiene(); await imp.cierra() }
})

test('agente: sin papel (~HS) no manda y reintenta; con papel imprime. Y agotados los reintentos, falla', async () => {
  const imp = simulaImpresora()
  imp.estado.sinPapel = true
  const agente = await creaAgente(config(await imp.escucha(), { consultaEstado: true }), SECRETO)
  const base = `http://127.0.0.1:${(await agente.escucha()).port}`
  try {
    const t = ticket()
    const r = await manda(base, { impresora: 'zebra-rampa-1', zpl: ZPL, copias: 1 }, t)
    const sin = await espera(base, t, r.cuerpo.id!, 'reintentando')
    assert.match(sin.ultimoError ?? '', /sin papel/)
    assert.equal(imp.recibidos.length, 0)
    imp.estado.sinPapel = false
    await espera(base, t, r.cuerpo.id!, 'impreso')
    assert.ok(Buffer.from(ZPL).equals(imp.recibidos[0]!))
  } finally { await agente.detiene(); await imp.cierra() }
  const agente2 = await creaAgente(config(await puertoLibre(), { reintentos: { maximo: 1, baseMs: 20, topeMs: 20 } }), SECRETO)
  const base2 = `http://127.0.0.1:${(await agente2.escucha()).port}`
  try {
    const t = ticket()
    const r = await manda(base2, { impresora: 'zebra-rampa-1', zpl: ZPL, copias: 1 }, t)
    const f = await espera(base2, t, r.cuerpo.id!, 'fallido')
    assert.equal(f.intentos, 2)
  } finally { await agente2.detiene() }
})

test('agente: no arranca sin secreto, y la configuracion rechaza claves desconocidas e impresoras de otro sitio', async () => {
  await assert.rejects(() => creaAgente(config(9), undefined), /ETIQUETAS_AGENTE_SECRETO/)
  assert.equal(esquemaConfigAgente.safeParse({ sitio: SITIO, impresoras: [{ id: 'a', nombre: 'a', sitio: SITIO, host: '10.0.0.5' }], relay: true }).success, false)
  assert.equal(esquemaConfigAgente.safeParse({ sitio: SITIO, impresoras: [{ id: 'a', nombre: 'a', sitio: 'OTRO', host: '10.0.0.5' }] }).success, false)
})
