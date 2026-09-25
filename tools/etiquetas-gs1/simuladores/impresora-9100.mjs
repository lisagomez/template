#!/usr/bin/env node
/**
 * Una Zebra de mentira en TCP: guarda los bytes de cada trabajo tal cual llegan y contesta ~HS
 * con el formato real de Host Status (tres lineas <STX>...<ETX>). Sirve para las pruebas y para
 * la demo sin impresora: NO sustituye la prueba con una Zebra de verdad.
 *
 *   node simuladores/impresora-9100.mjs [--puerto 9101] [--sin-papel] [--dir recibidos/]
 */
import { createServer } from 'node:net'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const STX = '\x02'
const ETX = '\x03'

export function estadoHost({ sinPapel = false, enPausa = false, cabezalAbierto = false } = {}) {
  const l1 = `${STX}030,${sinPapel ? 1 : 0},${enPausa ? 1 : 0},0406,000,0,0,0,000,0,0,0${ETX}\r\n`
  const l2 = `${STX}001,0,${cabezalAbierto ? 1 : 0},0,0,2,4,0,00000000,1,000${ETX}\r\n`
  const l3 = `${STX}1234,0${ETX}\r\n`
  return l1 + l2 + l3
}

/** @param {{ puerto?: number, host?: string, dir?: string }} opciones */
export function simulaImpresora(opciones = {}) {
  const recibidos = []
  const estado = { sinPapel: false, enPausa: false, cabezalAbierto: false }
  const servidor = createServer((s) => {
    const trozos = []
    s.on('data', (d) => {
      trozos.push(d)
      if (Buffer.concat(trozos).toString('latin1').startsWith('~HS')) { s.end(estadoHost(estado)); trozos.length = 0 }
    })
    s.on('end', () => {
      const datos = Buffer.concat(trozos)
      if (datos.length === 0) return
      recibidos.push(datos)
      if (opciones.dir) {
        mkdirSync(opciones.dir, { recursive: true })
        writeFileSync(join(opciones.dir, `trabajo-${String(recibidos.length).padStart(3, '0')}.zpl`), datos)
      }
    })
    s.on('error', () => {})
  })
  return {
    recibidos,
    estado,
    escucha: () => new Promise((resolve) => servidor.listen(opciones.puerto ?? 0, opciones.host ?? '127.0.0.1', () => resolve(servidor.address().port))),
    cierra: () => new Promise((resolve) => servidor.close(() => resolve())),
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d }
  const sim = simulaImpresora({ puerto: Number(arg('--puerto', '9101')), dir: arg('--dir', undefined) })
  sim.estado.sinPapel = process.argv.includes('--sin-papel')
  const puerto = await sim.escucha()
  console.log(`impresora simulada en 127.0.0.1:${puerto}${sim.estado.sinPapel ? ' (SIN PAPEL)' : ''}`)
  setInterval(() => {}, 1 << 30)
}
