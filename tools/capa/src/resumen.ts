/**
 * El resumen de un producto hacia el cerebro personal: SOLO conteos y enlaces. «3 casos nuevos, 1 enseñanza por
 * firmar», con el enlace a la pantalla donde se ven. Nunca el contenido: lo que escribe un cliente o el experto
 * se queda en su producto, y al cerebro personal no llega nada que permita leerlo (límite de C5: no firmable).
 *
 * Por eso el esquema es estricto en las tres puertas por donde se colaría texto: un campo de más se rechaza,
 * las claves son las que el producto DECLARÓ en su composición (no se puede inventar «caso-de-juan-perez») y un
 * enlace es una ruta en minúsculas, sin consulta ni fragmento (no se puede esconder texto en `?nota=`).
 */
import { z } from 'zod'
import { KEBAB } from './enchufe.js'

/** Una ruta o una URL https sin consulta, sin fragmento y en minúsculas. */
export const ENLACE = /^(https:\/\/[a-z0-9.-]+(:\d{2,5})?)?(\/[a-z0-9-]+)+\/?$/
export const TOPE_CONTEO = 1_000_000

export interface DeclaracionResumen { conteos: readonly string[]; enlaces: readonly string[] }

export function esquemaResumen(d: DeclaracionResumen) {
  const claveDe = (lista: readonly string[], que: string) =>
    z.string().regex(KEBAB).refine((k) => lista.includes(k), { message: `${que} no declarado por el producto` })
  return z.strictObject({
    resumen: z.literal(1),
    producto: z.string().regex(KEBAB),
    generado: z.iso.datetime(),
    conteos: z.record(claveDe(d.conteos, 'conteo'), z.number().int().min(0).max(TOPE_CONTEO)),
    enlaces: z.record(claveDe(d.enlaces, 'enlace'), z.string().max(200).regex(ENLACE)),
  })
}

export type Resumen = z.infer<ReturnType<typeof esquemaResumen>>

export function validaResumen(x: unknown, d: DeclaracionResumen): { ok: true; resumen: Resumen } | { ok: false; motivos: string[] } {
  const r = esquemaResumen(d).safeParse(x)
  if (r.success) return { ok: true, resumen: r.data }
  return { ok: false, motivos: r.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`) }
}

/** Lo que el resumen dice en una línea, para la agenda del cerebro: solo números y enlaces. */
export function lineaDeAgenda(r: Resumen): string {
  const cuentas = Object.entries(r.conteos).map(([k, n]) => `${n} ${k.replace(/-/g, ' ')}`).join(', ')
  const enlaces = Object.values(r.enlaces).join(' ')
  return `${r.producto}: ${cuentas || 'sin novedades'}${enlaces ? ` · ${enlaces}` : ''}`
}
