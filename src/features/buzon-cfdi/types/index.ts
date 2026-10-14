/**
 * Los tipos del buzón de CFDI (spec 015) y las entradas de usuario, validadas con Zod. Un CFDI recibido entra
 * como XML (lo que manda, RF-9) o como su representación impresa (PDF o foto: se lee con evidencia por campo).
 */
import { z } from 'zod'
import type { ResultadoDeExtraccion } from '../../a2a/esquema.ts'

export type CampoLeido = ResultadoDeExtraccion['campos'][number] & { readonly revisado?: boolean }

export type TipoDeDocumento = 'xml' | 'impresa'
export type EstadoDeDocumento = 'en_revision' | 'receptor_ajeno' | 'emparejada' | 'confirmado'

/** Un campo en que el XML y su impresa no dicen lo mismo (RF-14). Manda el XML; la persona la revisa. */
export interface Discrepancia {
  readonly clave: string
  readonly xml: string
  readonly impresa: string
  readonly revisada: boolean
}

export interface DocumentoDelBuzon {
  readonly id: string
  readonly pyme_id: string
  readonly nombre_archivo: string
  readonly tipo: TipoDeDocumento
  readonly ruta: string | null
  readonly uuid: string | null
  readonly rfc_receptor: string | null
  readonly campos: readonly CampoLeido[]
  readonly discrepancias: readonly Discrepancia[]
  readonly estado: EstadoDeDocumento
  readonly recibido_en: string
  readonly confirmado_en: string | null
}

export const RFC = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/
export const UUID_DB = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export const altaDePyme = z.object({
  rfc: z.string().trim().toUpperCase().regex(RFC, 'RFC con formato de persona moral o física (12 o 13 caracteres)'),
  nombre: z.string().trim().min(1).max(200),
})

export const consentimiento = z.object({
  pyme_id: z.string().regex(UUID_DB),
  firmado_en: z.iso.date(),
})

export const revision = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('campo'), clave: z.string().min(1).max(80), valor: z.string().max(500) }),
  z.object({ accion: z.literal('discrepancia'), clave: z.string().min(1).max(80) }),
  z.object({ accion: z.literal('confirmar') }),
])
export type Revision = z.infer<typeof revision>

/** El registro de horas de un mes: el mismo formulario el mes previo y el del piloto (RF-20), sin persona (RF-21). */
export const horasDelMes = z.object({
  pyme_id: z.string().regex(UUID_DB),
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'mes con forma AAAA-MM'),
  fase: z.enum(['previo', 'piloto']),
  horas: z.coerce.number().min(0).max(744),
  cfdi_recibidos: z.preprocess((v) => (v === '' || v === null || v === undefined ? null : v), z.coerce.number().int().min(0).nullable()),
}).refine((h) => h.fase === 'piloto' || h.cfdi_recibidos !== null, { message: 'el mes previo necesita cuántos CFDI se capturaron a mano', path: ['cfdi_recibidos'] })

