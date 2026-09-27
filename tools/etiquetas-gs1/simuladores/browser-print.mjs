#!/usr/bin/env node
/**
 * Simulador del servicio local de Zebra Browser Print (el que la app de Zebra levanta en
 * http://127.0.0.1:9100 y https://127.0.0.1:9101). Mismas rutas y formas que usa su SDK:
 *   GET  /available            → { printer: [Device...] }
 *   GET  /default?type=printer → Device
 *   POST /write  {device, data} → reenvia `data` a la impresora (TCP) del device
 *   POST /read   {device}       → ""
 * El cuerpo llega como text/plain (asi evita el preflight de CORS, como el SDK real).
 *
 *   node simuladores/browser-print.mjs --puerto 9190 --impresora 127.0.0.1:9101
 */
import { createServer } from 'node:http'
import { connect } from 'node:net'

/** @param {{ puerto?: number, impresora: { host: string, puerto: number }, nombre?: string }} o */
export function simulaBrowserPrint(o) {
  const dispositivo = {
    name: o.nombre ?? 'ZD421 simulada', uid: `${o.impresora.host}:${o.impresora.puerto}`, connection: 'network',
    deviceType: 'printer', version: 4, provider: 'com.zebra.ds.webdriver.desktop.provider.DefaultDeviceProvider', manufacturer: 'Zebra Technologies',
  }
  const escritos = []
  const reenvia = (datos) => new Promise((resolve, reject) => {
    const s = connect({ host: o.impresora.host, port: o.impresora.puerto }, () => s.end(datos))
    s.once('error', reject)
    s.once('close', () => resolve())
  })
  const servidor = createServer((req, res) => {
    res.setHeader('access-control-allow-origin', req.headers.origin ?? '*')
    const url = new URL(req.url ?? '/', 'http://bp')
    const json = (codigo, cuerpo) => { res.writeHead(codigo, { 'content-type': 'application/json' }); res.end(JSON.stringify(cuerpo)) }
    if (req.method === 'OPTIONS') { res.setHeader('access-control-allow-headers', 'content-type'); res.writeHead(204); return res.end() }
    if (req.method === 'GET' && url.pathname === '/available') return json(200, { printer: [dispositivo] })
    if (req.method === 'GET' && url.pathname === '/default') return json(200, dispositivo)
    if (req.method === 'POST' && (url.pathname === '/write' || url.pathname === '/read')) {
      let cuerpo = ''
      req.on('data', (d) => { cuerpo += d })
      req.on('end', async () => {
        try {
          const p = JSON.parse(cuerpo)
          if (p?.device?.uid !== dispositivo.uid) return json(400, { error: 'dispositivo desconocido' })
          if (url.pathname === '/read') { res.writeHead(200); return res.end('') }
          await reenvia(Buffer.from(String(p.data), 'utf8'))
          escritos.push(String(p.data))
          res.writeHead(200); res.end('')
        } catch (e) { res.writeHead(500); res.end(String(e)) }
      })
      return
    }
    res.writeHead(404); res.end()
  })
  return {
    escritos,
    escucha: () => new Promise((resolve) => servidor.listen(o.puerto ?? 0, '127.0.0.1', () => resolve(servidor.address().port))),
    cierra: () => new Promise((resolve) => { servidor.closeAllConnections(); servidor.close(() => resolve()) }),
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d }
  const [host, puerto] = arg('--impresora', '127.0.0.1:9101').split(':')
  const bp = simulaBrowserPrint({ puerto: Number(arg('--puerto', '9190')), impresora: { host, puerto: Number(puerto) } })
  console.log(`Browser Print simulado en http://127.0.0.1:${await bp.escucha()} → impresora ${host}:${puerto}`)
  setInterval(() => {}, 1 << 30)
}
