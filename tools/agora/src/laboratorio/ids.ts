/** Ids estables del laboratorio: un uuid v4 derivado de una clave legible («persona:paula»). Datos FICTICIOS. */
import { createHash } from 'node:crypto'

export function uid(clave: string): string {
  const h = createHash('sha256').update(`agora-lab:${clave}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`
}
