/**
 * Configuracion del agente, validada con Zod (estricta: una clave desconocida es un error, no
 * se ignora). El SECRETO no vive aqui: llega por la variable de entorno ETIQUETAS_AGENTE_SECRETO
 * y nunca se imprime.
 */
import { readFile } from 'node:fs/promises'
import { isIP } from 'node:net'
import { z } from 'zod'

const clave = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/, 'solo letras, cifras, - y _ (hasta 40)')

export const esquemaImpresora = z.object({
  id: clave,
  nombre: z.string().min(1).max(60),
  sitio: clave,
  host: z.string().min(1).max(253).refine((h) => isIP(h) !== 0 || /^[A-Za-z0-9.-]+$/.test(h), 'host inválido'),
  puerto: z.number().int().min(1).max(65535).default(9100),
}).strict()

export const esquemaConfigAgente = z.object({
  sitio: clave,
  escucha: z.object({
    host: z.string().default('127.0.0.1'),
    puerto: z.number().int().min(0).max(65535).default(9180),
  }).strict().default({ host: '127.0.0.1', puerto: 9180 }),
  impresoras: z.array(esquemaImpresora).min(1),
  /** Origenes web que pueden llamar al agente desde el navegador (CORS). */
  origenes: z.array(z.string().url()).default([]),
  reintentos: z.object({
    maximo: z.number().int().min(0).max(50).default(8),
    baseMs: z.number().int().min(10).max(600_000).default(2000),
    topeMs: z.number().int().min(10).max(3_600_000).default(120_000),
  }).strict().default({ maximo: 8, baseMs: 2000, topeMs: 120_000 }),
  timeoutMs: z.number().int().min(100).max(120_000).default(10_000),
  maxBytes: z.number().int().min(1024).max(4_194_304).default(262_144),
  maxCopias: z.number().int().min(1).max(10_000).default(500),
  /** Preguntar ~HS (papel, pausa, cabezal) antes de mandar cada trabajo. */
  consultaEstado: z.boolean().default(false),
  /** Archivo donde persiste la cola; sin el, la cola vive en memoria. */
  archivoCola: z.string().optional(),
}).strict().superRefine((c, ctx) => {
  const ids = new Set<string>()
  c.impresoras.forEach((i, n) => {
    if (ids.has(i.id)) ctx.addIssue({ code: 'custom', path: ['impresoras', n, 'id'], message: 'id repetido' })
    ids.add(i.id)
    if (i.sitio !== c.sitio) ctx.addIssue({ code: 'custom', path: ['impresoras', n, 'sitio'], message: `la impresora es del sitio ${i.sitio} y el agente del ${c.sitio}` })
  })
})

export type ConfigAgente = z.infer<typeof esquemaConfigAgente>
export type ImpresoraAgente = z.infer<typeof esquemaImpresora>

export async function leeConfig(ruta: string): Promise<ConfigAgente> {
  const texto = await readFile(ruta, 'utf8')
  const r = esquemaConfigAgente.safeParse(JSON.parse(texto))
  if (!r.success) throw new Error(`configuracion invalida: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
  return r.data
}

/** Avisos que no impiden arrancar pero hay que decir. */
export function avisosConfig(c: ConfigAgente): string[] {
  const avisos: string[] = []
  if (c.escucha.host === '0.0.0.0' || c.escucha.host === '::') avisos.push('escucha en TODAS las interfaces: cualquiera en la red puede intentar mandarle trabajos (siguen necesitando credencial)')
  if (c.origenes.length === 0) avisos.push('sin origenes web permitidos: el navegador no podra llamarlo (solo servidor a servidor)')
  return avisos
}
