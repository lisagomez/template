/**
 * La credencial POR TRABAJO del agente de impresion.
 *
 * El sistema (el servidor de la app, que guarda el secreto) firma un ticket de vida corta que
 * dice: esta impresora, este sitio, EXACTAMENTE este ZPL (su SHA-256), estas copias, hasta tal
 * hora, y un nonce de un solo uso. El navegador lo lleva al agente pero no puede alterarlo: si
 * cambia la impresora, el ZPL o las copias, la firma deja de cuadrar. Asi el agente nunca es un
 * rele abierto al 9100 aunque escuche en la red de la tienda.
 *
 * Formato: `v1.<base64url(json)>.<base64url(hmac-sha256)>`. Sin dependencias fuera de node:crypto.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export interface DatosTicket {
  readonly impresora: string
  readonly sitio: string
  /** SHA-256 del ZPL en base64url. */
  readonly huellaZpl: string
  readonly copias: number
  /** Segundos desde 1970. */
  readonly vence: number
  readonly nonce: string
  readonly operador: string
}

export const VIDA_MAXIMA_TICKET_S = 600

export function huellaDe(zpl: string): string {
  return createHash('sha256').update(zpl, 'utf8').digest('base64url')
}

const firma = (cuerpo: string, secreto: string): Buffer => createHmac('sha256', secreto).update(`v1.${cuerpo}`).digest()

export function secretoValido(secreto: string | undefined): secreto is string {
  return typeof secreto === 'string' && secreto.length >= 32
}

export interface PedidoTicket {
  readonly impresora: string
  readonly sitio: string
  readonly zpl: string
  readonly copias?: number
  readonly operador: string
  readonly vidaS?: number
  readonly ahora?: number
}

export function emiteTicket(p: PedidoTicket, secreto: string): string {
  if (!secretoValido(secreto)) throw new Error('secreto del agente ausente o corto (minimo 32 caracteres)')
  const ahora = p.ahora ?? Math.floor(Date.now() / 1000)
  const datos: DatosTicket = {
    impresora: p.impresora, sitio: p.sitio, huellaZpl: huellaDe(p.zpl), copias: p.copias ?? 1,
    vence: ahora + Math.min(p.vidaS ?? 120, VIDA_MAXIMA_TICKET_S), nonce: randomBytes(16).toString('base64url'), operador: p.operador,
  }
  const cuerpo = Buffer.from(JSON.stringify(datos)).toString('base64url')
  return `v1.${cuerpo}.${firma(cuerpo, secreto).toString('base64url')}`
}

export type Verificacion = { readonly ok: true; readonly datos: DatosTicket } | { readonly ok: false; readonly motivo: string }

export function verificaTicket(token: string, secreto: string, ahora = Math.floor(Date.now() / 1000)): Verificacion {
  const partes = token.split('.')
  if (partes.length !== 3 || partes[0] !== 'v1') return { ok: false, motivo: 'credencial mal formada' }
  const [, cuerpo = '', dada = ''] = partes
  const esperada = firma(cuerpo, secreto)
  const recibida = Buffer.from(dada, 'base64url')
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return { ok: false, motivo: 'firma inválida' }
  let datos: DatosTicket
  try {
    datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as DatosTicket
  } catch {
    return { ok: false, motivo: 'credencial ilegible' }
  }
  if (typeof datos.vence !== 'number' || datos.vence < ahora) return { ok: false, motivo: 'credencial vencida' }
  if (datos.vence - ahora > VIDA_MAXIMA_TICKET_S) return { ok: false, motivo: 'credencial con vida demasiado larga' }
  return { ok: true, datos }
}

/** Huella del token completo, para consultar el estado de SU trabajo sin guardar el token. */
export function huellaToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}
