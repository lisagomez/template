/**
 * Llaves ES256 (P-256) y firmas compactas: los tokens JWT de un agente externo y la firma JWS de su Agent Card
 * (la tarjeta se canoniza con JCS sin `signatures` y se firma; su huella fijada es el SHA-256 de ese texto).
 * Solo `node:crypto`: nada que instalar.
 */
import { createECDH, createPrivateKey, createPublicKey, sign, verify, type KeyObject, type JsonWebKey } from 'node:crypto'
import { canoniza, huella, sha256 } from './huella.js'

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url')

export interface ParDeLlaves { privada: KeyObject; publica: JsonWebKey; kid: string; huella: string }

/** Un par de llaves a partir de un escalar fijo (laboratorio: el socio simulado siempre tiene la misma llave). */
export function llavesDesde(semilla: string, kid: string): ParDeLlaves {
  const escalar = Buffer.from(sha256(`agora-llave:${semilla}`), 'hex')
  const ecdh = createECDH('prime256v1')
  ecdh.setPrivateKey(escalar)
  const punto = ecdh.getPublicKey()
  const publica: JsonWebKey = { kty: 'EC', crv: 'P-256', x: b64u(punto.subarray(1, 33)), y: b64u(punto.subarray(33, 65)) }
  const privada = createPrivateKey({ key: { ...publica, d: b64u(escalar) }, format: 'jwk' })
  return { privada, publica, kid, huella: huellaDeLlave(publica) }
}

/** La huella de una llave pública: SHA-256 de su JWK canónica (solo kty, crv, x, y). */
export const huellaDeLlave = (jwk: JsonWebKey): string => huella({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })

export function firmaCompacta(cabecera: Record<string, unknown>, carga: string, privada: KeyObject): string {
  const h = b64u(JSON.stringify(cabecera))
  const firma = sign('sha256', Buffer.from(`${h}.${carga}`), { key: privada, dsaEncoding: 'ieee-p1363' })
  return `${h}.${carga}.${b64u(firma)}`
}

export function verificaCompacta(token: string, jwk: JsonWebKey): { cabecera: Record<string, unknown>; carga: string } | null {
  const partes = token.split('.')
  if (partes.length !== 3 || partes.some((p) => !/^[A-Za-z0-9_-]*$/.test(p))) return null
  const [h, c, f] = partes as [string, string, string]
  try {
    const cabecera = JSON.parse(Buffer.from(h, 'base64url').toString('utf8')) as Record<string, unknown>
    if (cabecera.alg !== 'ES256') return null
    const llave = createPublicKey({ key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y } as JsonWebKey, format: 'jwk' })
    const ok = verify('sha256', Buffer.from(`${h}.${c}`), { key: llave, dsaEncoding: 'ieee-p1363' }, Buffer.from(f, 'base64url'))
    return ok ? { cabecera, carga: c } : null
  } catch {
    return null
  }
}

/** Un JWT ES256 (cabecera con kid). */
export const firmaJwt = (claims: Record<string, unknown>, par: ParDeLlaves): string =>
  firmaCompacta({ alg: 'ES256', typ: 'JWT', kid: par.kid }, b64u(JSON.stringify(claims)), par.privada)

export function leeJwt(token: string): { cabecera: Record<string, unknown>; claims: Record<string, unknown> } | null {
  const partes = token.split('.')
  if (partes.length !== 3) return null
  try {
    return { cabecera: JSON.parse(Buffer.from(partes[0]!, 'base64url').toString('utf8')), claims: JSON.parse(Buffer.from(partes[1]!, 'base64url').toString('utf8')) }
  } catch {
    return null
  }
}

/** La Agent Card sin `signatures`, canónica: lo que se firma y lo que se huella. */
export function cuerpoDeTarjeta(tarjeta: Record<string, unknown>): string {
  const resto: Record<string, unknown> = { ...tarjeta }
  delete resto.signatures
  return canoniza(resto)
}

export const huellaDeTarjeta = (tarjeta: Record<string, unknown>): string => sha256(cuerpoDeTarjeta(tarjeta))

/** Firma una tarjeta como dice A2A: JWS con carga separada (detached) sobre su JCS sin `signatures`. */
export function firmaTarjeta(tarjeta: Record<string, unknown>, par: ParDeLlaves): Record<string, unknown> {
  const carga = b64u(cuerpoDeTarjeta(tarjeta))
  const [prot, , firma] = firmaCompacta({ alg: 'ES256', kid: par.kid, typ: 'JOSE' }, carga, par.privada).split('.')
  return { ...tarjeta, signatures: [{ protected: prot, signature: firma }] }
}

/** ¿Alguna firma de la tarjeta es válida con la llave fijada? */
export function tarjetaFirmada(tarjeta: Record<string, unknown>, jwk: JsonWebKey): boolean {
  const firmas = Array.isArray(tarjeta.signatures) ? (tarjeta.signatures as Array<{ protected?: string; signature?: string }>) : []
  const carga = b64u(cuerpoDeTarjeta(tarjeta))
  return firmas.some((s) => typeof s.protected === 'string' && typeof s.signature === 'string' && verificaCompacta(`${s.protected}.${carga}.${s.signature}`, jwk) !== null)
}
