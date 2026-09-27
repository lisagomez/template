/**
 * @tu-scope/etiquetas-gs1/firma — Ed25519 con node:crypto (Node). La llave privada de cada sitio
 * llega por variable de entorno como PKCS#8 DER en base64 y NUNCA se imprime; el central guarda
 * solo las publicas (SPKI DER en base64) y las identifica por huella.
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto'
import { aHex, sha256 } from './sha256.js'
import type { AnclaFirmada, Ancla, VerificaFirma } from './anclaje.js'
import { mensajeDeAncla } from './anclaje.js'

export interface ParLlaves {
  readonly privada: string
  readonly publica: string
}

export function generaLlaves(): ParLlaves {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return {
    privada: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
    publica: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  }
}

/** Huella corta de una llave publica: `ed25519:` + 16 hex de su SHA-256. */
export function idLlave(publicaB64: string): string {
  return `ed25519:${aHex(sha256(Buffer.from(publicaB64, 'base64'))).slice(0, 16)}`
}

export function publicaDe(privadaB64: string): string {
  return createPublicKey(createPrivateKey({ key: Buffer.from(privadaB64, 'base64'), format: 'der', type: 'pkcs8' })).export({ type: 'spki', format: 'der' }).toString('base64')
}

export function firmaAncla(ancla: Ancla, privadaB64: string): AnclaFirmada {
  const llave = createPrivateKey({ key: Buffer.from(privadaB64, 'base64'), format: 'der', type: 'pkcs8' })
  const firma = sign(null, mensajeDeAncla(ancla), llave).toString('base64')
  return { ancla, firma, llave: idLlave(publicaDe(privadaB64)) }
}

/** Verificador con las llaves publicas registradas: `{ id → spki base64 }`. */
export function verificador(publicas: Readonly<Record<string, string>>): VerificaFirma {
  return (mensaje, firmaB64, id) => {
    const pub = publicas[id]
    if (!pub) return false
    try {
      return verify(null, mensaje, createPublicKey({ key: Buffer.from(pub, 'base64'), format: 'der', type: 'spki' }), Buffer.from(firmaB64, 'base64'))
    } catch {
      return false
    }
  }
}
