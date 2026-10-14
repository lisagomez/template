/**
 * La firma de la sección en vivo: Vercel firma cada petición que pasa al laboratorio local, y el portero de la máquina
 * del laboratorio la verifica. La llave NUNCA viaja: por el túnel va una firma HMAC-SHA256 de esa petición (método,
 * ruta, cuerpo) y de su instante. Si el proveedor del túnel la ve, o alguien la copia, no le sirve para otra petición,
 * ni para la misma pasada la ventana, ni dos veces (el portero recuerda las que ya vio).
 *
 * Sin dependencias: lo importan la ruta de Vercel (Next) y el portero (Node a pelo).
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const CABECERA_FIRMA = 'x-soporte-en-vivo-firma'
/** Lo más que puede tardar una petición firmada en llegar al portero, en las dos direcciones del reloj. */
export const VENTANA_MS = 60_000
/** Un secreto más corto se adivina: el portero y la ruta de Vercel no arrancan con él. */
export const LARGO_MINIMO_DEL_SECRETO = 32

export interface Peticion { readonly metodo: string; readonly ruta: string; readonly cuerpo: Uint8Array | string }

const sha256 = (x: Uint8Array | string): string => createHash('sha256').update(x).digest('hex')
const mac = (secreto: string, t: number, p: Peticion): string =>
  createHmac('sha256', secreto).update(`${t}\n${p.metodo.toUpperCase()}\n${p.ruta}\n${sha256(p.cuerpo)}`).digest('hex')

export const secretoValido = (s: string | undefined): s is string => typeof s === 'string' && s.length >= LARGO_MINIMO_DEL_SECRETO

/** La cabecera para una petición: `t=<ms>,v1=<hmac>`. */
export function firma(secreto: string, p: Peticion, t = Date.now()): string {
  if (!secretoValido(secreto)) throw new Error(`el secreto de la sección en vivo necesita ${LARGO_MINIMO_DEL_SECRETO} caracteres o más`)
  return `t=${t},v1=${mac(secreto, t, p)}`
}

export type Verificacion = { readonly ok: true } | { readonly ok: false; readonly motivo: string }

/**
 * ¿La cabecera firma ESTA petición, dentro de la ventana y por primera vez? `vistas` guarda las firmas aceptadas con su
 * vencimiento; quien llama conserva el mapa entre peticiones.
 */
export function verifica(secreto: string, cabecera: string | null, p: Peticion, vistas: Map<string, number>, ahora = Date.now()): Verificacion {
  if (!secretoValido(secreto)) return { ok: false, motivo: 'sin secreto' }
  const m = /^t=(\d{1,16}),v1=([0-9a-f]{64})$/.exec(cabecera ?? '')
  if (!m) return { ok: false, motivo: 'sin firma' }
  const t = Number(m[1])
  if (Math.abs(ahora - t) > VENTANA_MS) return { ok: false, motivo: 'firma fuera de la ventana' }
  const esperada = Buffer.from(mac(secreto, t, p), 'hex')
  if (!timingSafeEqual(esperada, Buffer.from(m[2]!, 'hex'))) return { ok: false, motivo: 'firma que no es de esta petición' }
  for (const [f, vence] of vistas) if (vence < ahora) vistas.delete(f)
  if (vistas.has(m[2]!)) return { ok: false, motivo: 'firma ya usada' }
  vistas.set(m[2]!, t + VENTANA_MS)
  return { ok: true }
}
