/**
 * El puerto 9100 en crudo: se abre, se escriben los bytes, se cierra. La impresora no contesta
 * nada a un trabajo; "impreso" aqui significa "la impresora recibio los bytes y cerro bien".
 * Para saber si hay papel se pregunta aparte con ~HS (Host Status), que si contesta.
 */
import { connect } from 'node:net'

export function enviaTcp(host: string, puerto: number, datos: Buffer, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = connect({ host, port: puerto })
    let listo = false
    const termina = (e?: Error) => {
      if (listo) return
      listo = true
      s.destroy()
      if (e) reject(e)
      else resolve()
    }
    s.setTimeout(timeoutMs, () => termina(new Error(`sin respuesta en ${timeoutMs} ms`)))
    s.once('error', (e) => termina(e))
    s.once('connect', () => s.end(datos))
    s.once('close', (conError) => termina(conError ? new Error('conexion cerrada con error') : undefined))
  })
}

export interface EstadoHost {
  readonly sinPapel: boolean
  readonly enPausa: boolean
  readonly cabezalAbierto: boolean
  readonly sinCinta: boolean
}

/** Lineas de ~HS: <STX>aaa,b,c,...<ETX>. b = sin papel, c = pausa; linea 2: o = cabezal, p = cinta. */
export function parseaEstadoHost(texto: string): EstadoHost | undefined {
  const lineas = [...texto.matchAll(/\x02([^\x03]*)\x03/g)].map((m) => (m[1] ?? '').split(','))
  const [l1, l2] = lineas
  if (!l1 || !l2 || l1.length < 3 || l2.length < 4) return undefined
  return { sinPapel: l1[1] === '1', enPausa: l1[2] === '1', cabezalAbierto: l2[2] === '1', sinCinta: l2[3] === '1' }
}

export function consultaEstadoHost(host: string, puerto: number, timeoutMs: number): Promise<EstadoHost> {
  return new Promise((resolve, reject) => {
    const s = connect({ host, port: puerto })
    let recibido = ''
    const termina = (e?: Error) => {
      s.destroy()
      const estado = parseaEstadoHost(recibido)
      if (estado) resolve(estado)
      else reject(e ?? new Error('la impresora no contestó a ~HS'))
    }
    s.setTimeout(timeoutMs, () => termina(new Error(`~HS sin respuesta en ${timeoutMs} ms`)))
    s.once('error', (e) => termina(e))
    s.once('connect', () => s.write('~HS'))
    s.on('data', (d: Buffer) => {
      recibido += d.toString('latin1')
      if ((recibido.match(/\x03/g) ?? []).length >= 3) termina()
    })
    s.once('close', () => termina())
  })
}

export function problemaDeEstado(e: EstadoHost): string | undefined {
  if (e.sinPapel) return 'sin papel'
  if (e.cabezalAbierto) return 'cabezal abierto'
  if (e.sinCinta) return 'sin cinta'
  if (e.enPausa) return 'en pausa'
  return undefined
}
