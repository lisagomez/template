/**
 * D7 (decidida el 2026-10-10: «externo solo anonimizado»): qué modelo puede recibir cada clase de dato de los clientes.
 * Lo crudo (ticket, chat, documentos y adjuntos) nunca va a un proveedor externo, tampoco con pesos abiertos: solo a un
 * modelo autohospedado. Lo anonimizado (sandbox) y lo generalizado (núcleo) pueden ir a uno externo con su decisión C4
 * (sin conservación ni entrenamiento, y con el anonimizador medido, D9). Lo que no lleva texto de clientes sigue el
 * routing.
 *
 * Dónde corre el modelo no se declara: se deduce de la dirección de su servidor. Solo es autohospedado un servidor en la
 * propia máquina o en una red privada; un nombre, aunque sea el de un servicio de Docker, es externo (falla cerrado: se
 * usa la IP). Brecha: una dirección privada puede ser un túnel a un proveedor externo, y eso no se ve desde aquí.
 *
 * Hoy el producto no llama a ningún modelo. El día que lo haga (CDC del routing), la llamada pasa por `puedeLlamar`.
 */

export type ClaseDeDato = 'ticket' | 'chat' | 'documento' | 'sandbox' | 'nucleo' | 'metrica' | 'codigo'
export type Alojamiento = 'autohospedado' | 'externo'
export type ReglaExterna = 'prohibido' | 'con_c4' | 'routing'

/** Lo que admite cada clase en un modelo externo. Uno autohospedado las recibe todas. */
export const EXTERNO_D7: Readonly<Record<ClaseDeDato, ReglaExterna>> = {
  ticket: 'prohibido', chat: 'prohibido', documento: 'prohibido',
  sandbox: 'con_c4', nucleo: 'con_c4',
  metrica: 'routing', codigo: 'routing',
}

export interface VeredictoModelo { readonly permitido: boolean; readonly alojamiento: Alojamiento; readonly motivo: string }

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

/** ¿Dónde corre el modelo de esa dirección? Solo la propia máquina o una red privada es autohospedado. */
export function alojamientoDe(url: string): Alojamiento {
  let host: string
  try { host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '') } catch { return 'externo' }
  if (host === 'localhost' || host === '::1') return 'autohospedado'
  if (/^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host)) return 'autohospedado'
  const ip = IPV4.exec(host)?.slice(1).map(Number)
  if (!ip || ip.some((n) => n > 255)) return 'externo'
  const [a, b] = ip as [number, number]
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ? 'autohospedado' : 'externo'
}

/** ¿Puede ir un dato de esta clase al modelo de esa dirección? `c4`: la referencia a la decisión C4 de ese proveedor. */
export function puedeLlamar(clase: ClaseDeDato, url: string, c4: string | null): VeredictoModelo {
  const alojamiento = alojamientoDe(url)
  if (alojamiento === 'autohospedado') return { permitido: true, alojamiento, motivo: 'modelo autohospedado: el dato no sale' }
  const regla: ReglaExterna = Object.hasOwn(EXTERNO_D7, clase) ? EXTERNO_D7[clase] : 'prohibido'
  if (regla === 'prohibido') return { permitido: false, alojamiento, motivo: `${clase}: lo crudo no va a un proveedor externo de modelos, tampoco con pesos abiertos (D7)` }
  if (regla === 'con_c4' && !c4?.trim()) return { permitido: false, alojamiento, motivo: `${clase}: a un proveedor externo, solo con su decisión C4 (D7)` }
  return { permitido: true, alojamiento, motivo: regla === 'con_c4' ? `${clase}: anonimizado, con la decisión C4 ${c4}` : `${clase}: sin texto de clientes, sigue el routing` }
}
