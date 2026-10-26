/**
 * El enchufe: lo que cada activo con pantalla declara para entrar en la capa. Es un JSON junto al módulo
 * (`enchufe.json`), no código: el núcleo del módulo no importa la capa y sigue funcionando sin ella.
 *
 * Declara qué ranuras llena, qué intenciones atiende, qué acciones pasan por el freno, qué memoria lee o
 * escribe y qué sale de la máquina. El verificador (`scripts/capa/verifica-enchufes.mjs`) cruza esto con
 * las rutas reales y el inventario.
 */
import { z } from 'zod'
import { RANURAS, RANURAS_DE_LA_CAPA, type Ranura } from './ranuras.js'
import { pareceIrreversible } from './freno.js'

export const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/
/** `modulo.verbo`: el prefijo es el módulo, así dos módulos nunca reclaman la misma intención. */
export const ID_INTENCION = /^[a-z0-9]+(-[a-z0-9]+)*\.[a-z0-9]+(-[a-z0-9]+)*$/
export const RUTA = /^\/[A-Za-z0-9\-._/[\]]*$/

export const EsquemaIntencion = z.strictObject({
  id: z.string().regex(ID_INTENCION),
  queHace: z.string().min(3),
  /** Frases de ejemplo: el enrutador sin LLM las usa para reconocer la intención. */
  ejemplos: z.array(z.string().min(3)).min(2),
  /** Si solo consulta o si cambia algo. Lo que cambia algo pregunta según «cuánto pregunta» la persona. */
  efecto: z.enum(['lee', 'escribe']),
  irreversible: z.boolean(),
  /** La pantalla del módulo que muestra el resultado, si la hay. */
  pantalla: z.string().regex(RUTA).optional(),
})

export const EsquemaSalida = z.strictObject({
  que: z.enum(['audio', 'texto', 'datos']),
  aQuien: z.string().min(2),
  cuando: z.string().min(3),
})

export const EsquemaEnchufe = z.strictObject({
  enchufe: z.literal(1),
  modulo: z.string().regex(KEBAB),
  activo: z.string().regex(/^TPL-[a-z0-9-]+$/),
  nombre: z.string().min(2),
  /** Las rutas con pantalla que son de este módulo (todas, o el verificador lo dice). */
  pantallas: z.array(z.string().regex(RUTA)),
  ranuras: z.array(z.enum(RANURAS)).min(1),
  intenciones: z.array(EsquemaIntencion),
  freno: z.array(z.strictObject({ accion: z.string().regex(ID_INTENCION), porque: z.string().min(3) })),
  memoria: z.strictObject({ lee: z.array(z.string().regex(KEBAB)), escribe: z.array(z.string().regex(KEBAB)) }),
  /** Cómo sigue funcionando el módulo sin la capa: su núcleo no depende de ella. */
  sinCapa: z.string().min(3),
  /** Lo que sale de la máquina cuando el módulo trabaja (C4). Vacío: nada sale. */
  sale: z.array(EsquemaSalida),
})

export type Intencion = z.infer<typeof EsquemaIntencion>
export type Enchufe = z.infer<typeof EsquemaEnchufe>

export interface Problema { donde: string; que: string }

/** Las reglas que el esquema no puede decir solo: entre campos y contra el propio módulo. */
export function reglasDeEnchufe(e: Enchufe): Problema[] {
  const p: Problema[] = []
  const de = `enchufe de ${e.modulo}`
  const propias = (RANURAS_DE_LA_CAPA as readonly Ranura[]).filter((r) => e.ranuras.includes(r))
  if (propias.length) p.push({ donde: de, que: `declara ${propias.join(', ')}: esa ranura solo la llena la capa` })
  const ids = e.intenciones.map((i) => i.id)
  for (const id of ids.filter((x, k) => ids.indexOf(x) !== k)) p.push({ donde: de, que: `intención repetida: ${id}` })
  for (const i of e.intenciones) {
    if (!i.id.startsWith(`${e.modulo}.`)) p.push({ donde: `${de} · ${i.id}`, que: `la intención no lleva el prefijo del módulo («${e.modulo}.»)` })
    const frenada = e.freno.some((f) => f.accion === i.id)
    if (i.irreversible && !frenada) p.push({ donde: `${de} · ${i.id}`, que: 'es irreversible y no pasa por el freno' })
    if (i.irreversible && i.efecto !== 'escribe') p.push({ donde: `${de} · ${i.id}`, que: 'es irreversible y dice que solo lee' })
    if (!i.irreversible && pareceIrreversible(`${i.id} ${i.queHace}`)) {
      p.push({ donde: `${de} · ${i.id}`, que: 'parece irreversible (enviar, publicar, pagar, borrar…) y está declarada reversible' })
    }
    if (i.pantalla && !e.pantallas.includes(i.pantalla)) p.push({ donde: `${de} · ${i.id}`, que: `su pantalla ${i.pantalla} no está entre las del módulo` })
  }
  for (const f of e.freno) {
    if (!ids.includes(f.accion)) p.push({ donde: `${de} · freno`, que: `frena ${f.accion}, que no es una intención del módulo` })
  }
  if (e.intenciones.length && !e.ranuras.includes('intencion')) p.push({ donde: de, que: 'atiende intenciones y no declara la ranura «intencion»' })
  if (e.pantallas.length && !e.ranuras.includes('lienzo')) p.push({ donde: de, que: 'tiene pantallas y no declara la ranura «lienzo»' })
  return p
}

/** Valida un JSON de enchufe: el esquema y luego las reglas. */
export function validaEnchufe(x: unknown): { ok: true; enchufe: Enchufe } | { ok: false; problemas: Problema[] } {
  const r = EsquemaEnchufe.safeParse(x)
  if (!r.success) {
    const modulo = typeof (x as { modulo?: unknown })?.modulo === 'string' ? (x as { modulo: string }).modulo : '¿?'
    return { ok: false, problemas: r.error.issues.map((i) => ({ donde: `enchufe de ${modulo} · ${i.path.join('.') || '(raíz)'}`, que: i.message })) }
  }
  const problemas = reglasDeEnchufe(r.data)
  return problemas.length ? { ok: false, problemas } : { ok: true, enchufe: r.data }
}
