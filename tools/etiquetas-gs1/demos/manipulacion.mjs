#!/usr/bin/env node
/**
 * Demostracion de manipulacion, sobre ARCHIVOS reales (el almacen del sitio y el central, cada uno
 * en su JSON, como en una instalacion con `almacenes/archivo` y `almacenes/central`):
 *
 *   1. alterar la caducidad de un evento viejo editando el almacen;
 *   2. reescribir una sucursal entera recalculando TODA su cadena;
 *   3. borrar el ultimo evento antes del anclaje nocturno;
 *   4. tocar las existencias sin evento.
 *
 * Para cada caso: el registro antes y despues, y el veredicto del verificador. Datos ficticios
 * (prefijo 952). Las llaves Ed25519 se generan en memoria y no se escriben ni se imprimen.
 *
 *   npm run build && node demos/manipulacion.mjs
 */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  altaConExpediente, audita, CATEGORIAS_EJEMPLO, estadoVacio, integridadLocal, mueveConExpediente, nuevoEvento, parseaLectura, interpreta, preparaAncla,
  recibeAncla, recibeConExpediente, recibeTestigo, registraLlave, salida,
} from '../dist/index.js'
import { almacenEnArchivo } from '../dist/almacenes/archivo.js'
import { centralEnArchivo } from '../dist/almacenes/central.js'
import { firmaAncla, generaLlaves, idLlave, verificador } from '../dist/firma.js'

const HOY = new Date().toISOString().slice(0, 10)
const INICIO = Date.UTC(Number(HOY.slice(0, 4)), Number(HOY.slice(5, 7)) - 1, Number(HOY.slice(8, 10)))
const dia = (n) => new Date(INICIO + n * 86_400_000).toISOString().slice(0, 10)
const hora = (n, h) => new Date(INICIO + n * 86_400_000 + h * 3_600_000).toISOString()
const aammdd = (iso) => iso.slice(2).replace(/-/g, '')
const SITIOS = ['SUC-CENTRO', 'SUC-PONIENTE']
const GTIN = '19521111000010'

const dir = await mkdtemp(join(tmpdir(), 'expediente-'))
const rutaEstado = join(dir, 'estado.json')
const rutaCentral = join(dir, 'central.json')
const llaves = Object.fromEntries(SITIOS.map((s) => [s, generaLlaves()]))
const verifica = verificador(Object.fromEntries(SITIOS.map((s) => [idLlave(llaves[s].publica), llaves[s].publica])))

function paso(p) { if (!p.resultado.ok) throw new Error(p.resultado.motivo); return p.estado }
const lee = (e, t, d) => interpreta(parseaLectura(t).elementos, e, d)

/** Dos dias de operacion en dos sucursales, con su cadena. */
function opera() {
  let e = {
    ...estadoVacio({ sitios: SITIOS.map((clave) => ({ clave, nombre: clave, tipo: 'sucursal' })), categorias: CATEGORIAS_EJEMPLO }),
    articulos: { 'YOG-001': { sku: 'YOG-001', descripcion: 'Yogurt natural 1 kg', categoria: 'lacteos', sitios: SITIOS, marcaPropia: false, gtinCaja: GTIN, reglaCaja: 'fabricante', unidadesPorCaja: 12, vidaUtilDias: 35, notas: [] } },
  }
  for (const [i, sitio] of SITIOS.entries()) {
    const lote = `L44${71 + i}`
    const t = `(02)${GTIN}(37)48(17)${aammdd(dia(30))}(10)${lote}`
    e = paso(recibeConExpediente(e, lee(e, t, dia(-2)), sitio, hora(-2, 9), `r${i}`, 'op-0a1b2c3d', t))
    const caja = `(01)${GTIN}(17)${aammdd(dia(30))}(10)${lote}`
    e = paso(mueveConExpediente(e, { sitio, destino: 'almacen', lectura: lee(e, caja, dia(-2)), veces: 40, operador: 'op-0a1b2c3d' }, hora(-2, 11), `m${i}`, dia(-2), 'B-04-2'))
    e = paso(mueveConExpediente(e, { sitio, destino: 'piso', lectura: lee(e, caja, dia(-1)), veces: 12, operador: 'op-4e5f6a7b' }, hora(-1, 8), `p${i}`, dia(-1)))
    e = paso(salida(e, { sitio, tipo: 'VENDIDO', lote: { gtin: GTIN, lote, caducidad: dia(30) }, cajas: 5 }, dia(-1), hora(-1, 19), 'op-4e5f6a7b'))
  }
  return e
}

/** El central ancla cada noche y recibe un testigo de cabeza tras cada evento. */
async function anclaNoches(estado) {
  const central = centralEnArchivo(rutaCentral)
  await central.transaccion((c0) => {
    let c = c0
    for (const s of SITIOS) c = registraLlave(c, s, { id: idLlave(llaves[s].publica), publica: llaves[s].publica, registrada: hora(-3, 0) }, hora(-3, 0))
    for (const d of [-2, -1]) {
      for (const s of SITIOS) {
        const hasta = estado.eventos[s].filter((x) => x.fecha.slice(0, 10) <= dia(d))
        for (const x of hasta.filter((y) => y.fecha.slice(0, 10) === dia(d))) c = recibeTestigo(c, s, { seq: x.seq, cabeza: x.hash, fecha: x.fecha }).central
        const a = preparaAncla(s, hasta, c.anclas[s] ?? [], dia(d), hora(d, 23))
        if (a) c = recibeAncla(c, firmaAncla(a, llaves[s].privada), verifica, hora(d, 23)).central
      }
    }
    return { central: c, resultado: null }
  })
}

async function veredicto(titulo) {
  const e = JSON.parse(await readFile(rutaEstado, 'utf8'))
  const c = JSON.parse(await readFile(rutaCentral, 'utf8'))
  const a = audita(e.eventos, c, verifica, SITIOS)
  console.log(`  VEREDICTO (${titulo}):`)
  for (const i of a.sitios) {
    const p = integridadLocal(e, i.sitio)
    const ok = i.ok && p.ok
    console.log(`    ${ok ? '✓' : '✗'} ${i.sitio}: cadena ${i.cadena.ok ? '✓' : `✗ en #${i.cadena.rotura.seq}`} · proyección ${p.ok ? '✓' : '✗'} · anclas ${i.anclas.filter((x) => x.ok).length}/${i.anclas.length} ✓ · sin anclar ${i.sinAnclar}${ok ? '' : `\n        primer fallo: ${i.primerFallo ?? p.motivo}`}`)
  }
  for (const t of a.transferencias) console.log(`    ✗ enlace ${t.sitio} #${t.seq}: ${t.detalle}`)
}

const muestra = (ev) => JSON.stringify({ seq: ev.seq, tipo: ev.tipo, lote: ev.lote, datos: ev.datos, hash: ev.hash })
async function edita(cambia) { const e = JSON.parse(await readFile(rutaEstado, 'utf8')); cambia(e); await writeFile(rutaEstado, JSON.stringify(e, null, 1)) }

const limpio = opera()
await almacenEnArchivo(rutaEstado).transaccion(() => ({ estado: limpio, resultado: null }))
await anclaNoches(limpio)
const original = await readFile(rutaEstado, 'utf8')
const centralOriginal = await readFile(rutaCentral, 'utf8')
const restaura = async () => { await writeFile(rutaEstado, original); await writeFile(rutaCentral, centralOriginal) }
console.log(`Almacén: ${rutaEstado}\nCentral: ${rutaCentral}\nLlaves de sitio: generadas en memoria (no se escriben ni se imprimen).\n`)
await veredicto('sin tocar nada')

console.log('\n1) Alterar la caducidad del evento #1 de SUC-CENTRO editando el almacén')
let antes = limpio.eventos['SUC-CENTRO'][0]
console.log(`  ANTES:   ${muestra(antes)}`)
await edita((e) => { e.eventos['SUC-CENTRO'][0].lote.caducidad = dia(90) })
console.log(`  DESPUÉS: ${muestra(JSON.parse(await readFile(rutaEstado, 'utf8')).eventos['SUC-CENTRO'][0])}`)
await veredicto('caducidad alterada')
await restaura()

console.log('\n2) Reescribir SUC-PONIENTE entera: caducidad alargada y TODA la cadena recalculada (y las existencias)')
antes = limpio.eventos['SUC-PONIENTE'][0]
await edita((e) => {
  const nueva = []
  for (const x of e.eventos['SUC-PONIENTE']) nueva.push(nuevoEvento('SUC-PONIENTE', nueva, { tipo: x.tipo, lote: { ...x.lote, caducidad: dia(90) }, datos: x.datos, operador: x.operador, fecha: x.fecha }))
  e.eventos['SUC-PONIENTE'] = nueva
  e.existencias = e.existencias.map((x) => (x.sitio === 'SUC-PONIENTE' ? { ...x, caducidad: dia(90) } : x))
})
console.log(`  ANTES:   ${muestra(antes)}`)
console.log(`  DESPUÉS: ${muestra(JSON.parse(await readFile(rutaEstado, 'utf8')).eventos['SUC-PONIENTE'][0])}`)
await veredicto('sucursal reescrita')
await restaura()

console.log('\n3) Hoy se vende en SUC-CENTRO, el sitio avisa su cabeza al central, y alguien borra ese evento antes de la noche')
const e3 = paso(salida(limpio, { sitio: 'SUC-CENTRO', tipo: 'VENDIDO', lote: { gtin: GTIN, lote: 'L4471', caducidad: dia(30) }, cajas: 3 }, HOY, hora(0, 12), 'op-4e5f6a7b'))
const ultimo = e3.eventos['SUC-CENTRO'].at(-1)
await writeFile(rutaEstado, JSON.stringify(e3, null, 1))
await centralEnArchivo(rutaCentral).transaccion((c) => ({ central: recibeTestigo(c, 'SUC-CENTRO', { seq: ultimo.seq, cabeza: ultimo.hash, fecha: ultimo.fecha }).central, resultado: null }))
console.log(`  ANTES:   la cadena de SUC-CENTRO termina en ${muestra(ultimo)}`)
await veredicto('con la venta de hoy, aún sin anclar')
await edita((e) => { e.eventos['SUC-CENTRO'].pop(); e.existencias = limpio.existencias })
console.log(`  DESPUÉS: la cadena termina en #${JSON.parse(await readFile(rutaEstado, 'utf8')).eventos['SUC-CENTRO'].at(-1).seq} (y las existencias se devolvieron a mano: la proyección cuadra)`)
await veredicto('último evento borrado')
const e3b = JSON.parse(await readFile(rutaEstado, 'utf8'))
const intento = await centralEnArchivo(rutaCentral).transaccion((c) => {
  const a = preparaAncla('SUC-CENTRO', e3b.eventos['SUC-CENTRO'], c.anclas['SUC-CENTRO'], HOY, hora(0, 23))
  if (!a) {
    return { central: c, resultado: 'la sucursal no tiene nada nuevo que anclar; el central esperaba el evento que ya vio' }
  }
  const r = recibeAncla(c, firmaAncla(a, llaves['SUC-CENTRO'].privada), verifica, hora(0, 23))
  return { central: r.central, resultado: r.ok ? 'aceptada' : `RECHAZADA: ${r.motivo}` }
})
console.log(`  Ancla de esta noche: ${intento}`)
await writeFile(rutaEstado, JSON.stringify(e3, null, 1))
const e3c = JSON.parse(await readFile(rutaEstado, 'utf8'))
const sustituto = nuevoEvento('SUC-CENTRO', e3c.eventos['SUC-CENTRO'].slice(0, -1), { tipo: 'VENDIDO', lote: ultimo.lote, datos: { cajas: 1 }, operador: ultimo.operador, fecha: ultimo.fecha })
const intento2 = await centralEnArchivo(rutaCentral).transaccion((c) => {
  const a = preparaAncla('SUC-CENTRO', [...e3c.eventos['SUC-CENTRO'].slice(0, -1), sustituto], c.anclas['SUC-CENTRO'], HOY, hora(0, 23))
  const r = recibeAncla(c, firmaAncla(a, llaves['SUC-CENTRO'].privada), verifica, hora(0, 23))
  return { central: r.central, resultado: r.ok ? 'aceptada' : `RECHAZADA: ${r.motivo}` }
})
console.log(`  Y si lo sustituye por otra venta #${sustituto.seq} de 1 caja y ancla con la llave del sitio: ${intento2}`)
const incidente3 = JSON.parse(await readFile(rutaCentral, 'utf8')).incidentes.map((i) => `${i.sitio} · ${i.origen}: ${i.motivo}`).join(' | ')
await restaura()

console.log('\n4) Subir 5 cajas del almacén de SUC-PONIENTE sin evento')
const fila = limpio.existencias.find((x) => x.sitio === 'SUC-PONIENTE' && x.zona === 'almacen')
console.log(`  ANTES:   ${JSON.stringify({ sitio: fila.sitio, lote: fila.lote, zona: fila.zona, posicion: fila.posicion, cantidad: fila.cantidad })}`)
await edita((e) => { e.existencias = e.existencias.map((x) => (x.id === fila.id ? { ...x, cantidad: x.cantidad + 5 } : x)) })
console.log(`  DESPUÉS: ${JSON.stringify({ sitio: fila.sitio, lote: fila.lote, zona: fila.zona, posicion: fila.posicion, cantidad: fila.cantidad + 5 })}`)
await veredicto('existencias tocadas sin evento')
console.log(`\nIncidente que abrió el central en el caso 3: ${incidente3}`)
