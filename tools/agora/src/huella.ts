/**
 * Huellas: JSON canónico (JCS, RFC 8785: llaves en orden de unidades UTF-16, números y cadenas como los serializa
 * ECMAScript) y su SHA-256. Es lo que A2A usa para firmar una Agent Card, y lo que Ágora usa para que «lo aprobado
 * sea exactamente lo que se aplica»: la base guarda este texto y recalcula su huella.
 */
import { createHash } from 'node:crypto'

export function canoniza(v: unknown): string {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v)
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('JCS no admite NaN ni infinito')
    return JSON.stringify(v)
  }
  if (Array.isArray(v)) return `[${v.map((x) => canoniza(x === undefined ? null : x)).join(',')}]`
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canoniza(o[k])}`).join(',')}}`
  }
  throw new Error(`JCS no admite ${typeof v}`)
}

export const sha256 = (texto: string | Uint8Array): string => createHash('sha256').update(texto).digest('hex')

export const huella = (v: unknown): string => sha256(canoniza(v))

/** «9f2c…e41a»: la huella corta que se le enseña a una persona. */
export const corta = (h: string | null | undefined): string => (h ? `${h.slice(0, 4)}…${h.slice(-4)}` : '—')
