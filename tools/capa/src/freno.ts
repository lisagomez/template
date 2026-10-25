/**
 * El freno: lo irreversible (enviar, publicar, pagar, borrar, cancelar…) pide la CITA TEXTUAL de quien lo
 * pidió y un CLIC. Falla cerrado.
 *
 * Adaptado de `.claude/hooks/candado-freno.py` de Arbrain v0.2.10 (829a9e9), Apache-2.0, con cambios: allá
 * frena los comandos de un agente y coteja la cita contra los mensajes del dueño en el transcript; aquí frena
 * las acciones de un módulo y coteja contra los mensajes de la persona en la conversación del producto. Se
 * conservan sus tres ideas: la cita se coteja contra SUS mensajes (un agente no puede inventarla y una página
 * no puede dictarla), vale 15 minutos y sin ella no pasa nada. Se añade el clic: decirlo en voz alta, aun en
 * Modo conversación, no basta.
 */

/** Los verbos que delatan una acción que sale de la casa o no se deshace (los de `candado-freno.py`, en español). */
const IRREVERSIBLE = /\b(envia|enviar|envio|manda|mandar|publica|publicar|publicacion|paga|pagar|pago|cobra|cobrar|borra|borrar|elimina|eliminar|cancela|cancelar|reembolsa|reembolsar|transfiere|transferir|firma|firmar|send|publish|post|pay|delete|trash)\b/

const normaliza = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

export const pareceIrreversible = (texto: string): boolean => IRREVERSIBLE.test(normaliza(texto).replace(/[._-]/g, ' '))

/** Lo que vale una cita (`VIGENCIA_CITA_S` de `candado-freno.py`). */
export const VIGENCIA_MS = 15 * 60 * 1000
/** Una cita más corta no prueba nada: «sí» lo dice cualquiera. */
export const CITA_MINIMA = 8

export type OrigenConfirmacion = 'clic' | 'teclado' | 'voz' | 'texto' | 'agente'
/**
 * Solo un clic humano confirma: ni la voz, ni el texto, ni un agente, ni el teclado. Lo del teclado es de Arbrain
 * (`esClicHumano` de `permisos/lib/confirmacion.ts`, detail 0): un Enter a destiempo, escribiendo en el chat, no
 * puede mandar nada. El precio es que sin ratón lo irreversible no se confirma; está declarado como brecha.
 */
export const ORIGENES_VALIDOS: readonly OrigenConfirmacion[] = ['clic']

/** ¿El evento es un clic humano real? Ni el teclado (detail 0) ni un `click()` sintético (isTrusted false).
 *  Tal cual `esClicHumano` de Arbrain v0.2.10, `arbrain/src/features/permisos/lib/confirmacion.ts`. */
export function esClicHumano(e: { detail: number; isTrusted: boolean }): boolean {
  return e.isTrusted === true && e.detail > 0
}

export type CategoriaFreno = 'enviar' | 'pagar' | 'borrar' | 'publicar' | 'otra'

/** La categoría que se le enseña a la persona (las de `CategoriaConfirmacion` de Arbrain). */
export function categoriaDe(texto: string): CategoriaFreno {
  const t = normaliza(texto)
  if (/\b(paga|pagar|pago|cobra|cobrar|reembols|transfier)/.test(t)) return 'pagar'
  if (/\b(borra|borrar|elimina|eliminar|cancela|cancelar|trash|delete)/.test(t)) return 'borrar'
  if (/\b(publica|publicar|post|publish)/.test(t)) return 'publicar'
  if (/\b(envia|enviar|envio|manda|mandar|send)/.test(t)) return 'enviar'
  return 'otra'
}

/**
 * Lo que no se ve en pantalla pero cambia lo que corre (controles, marcas bidi, ancho cero, guion suave, BOM),
 * hecho visible como ⟨U+…⟩. De `literalVisible` de Arbrain v0.2.10 (`permisos/lib/confirmacion.ts`): el freno
 * enseña la cita y la acción tal cual, y una cita con invisibles se dice.
 */
const INVISIBLES = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g
export function literalVisible(literal: string): { texto: string; invisibles: number } {
  let invisibles = 0
  const texto = literal.replace(INVISIBLES, (ch) => {
    invisibles++
    return `⟨U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}⟩`
  })
  return { texto, invisibles }
}

export interface SolicitudFreno {
  id: string
  accion: string
  categoria: CategoriaFreno
  porque: string
  cita: string
  creada: number
  vence: number
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; motivo: string }

export interface Freno {
  /** Abre una solicitud. La cita tiene que ser palabras de la persona, no del asistente ni de una página. */
  pide(p: { accion: string; porque: string; cita: string; mensajesDeLaPersona: readonly string[] }): Resultado<SolicitudFreno>
  /** La confirma con un gesto físico. Sirve una sola vez. */
  confirma(id: string, c: { origen: OrigenConfirmacion; cita: string }): Resultado<SolicitudFreno>
  descarta(id: string): void
  pendientes(): SolicitudFreno[]
}

export interface OpcionesFreno { ahora?: () => number; vigenciaMs?: number; nuevoId?: () => string }

export function creaFreno(o: OpcionesFreno = {}): Freno {
  const ahora = o.ahora ?? Date.now
  const vigencia = o.vigenciaMs ?? VIGENCIA_MS
  let n = 0
  const nuevoId = o.nuevoId ?? (() => `freno-${ahora().toString(36)}-${(n++).toString(36)}`)
  const abiertas = new Map<string, SolicitudFreno>()
  const vigentes = () => {
    for (const [id, s] of abiertas) if (s.vence <= ahora()) abiertas.delete(id)
    return [...abiertas.values()]
  }
  return {
    pide({ accion, porque, cita, mensajesDeLaPersona }) {
      const c = normaliza(cita)
      if (c.length < CITA_MINIMA) return { ok: false, motivo: 'falta la cita textual de quien lo pidió' }
      const suya = mensajesDeLaPersona.some((m) => normaliza(m).includes(c))
      if (!suya) return { ok: false, motivo: 'la cita no está en lo que dijo la persona: un asistente o una página no pueden dictarla' }
      if (literalVisible(cita).invisibles > 0) return { ok: false, motivo: 'la cita trae caracteres invisibles: lo que se ve no es lo que se pidió' }
      const s: SolicitudFreno = { id: nuevoId(), accion, categoria: categoriaDe(`${accion} ${porque}`), porque, cita: cita.trim(), creada: ahora(), vence: ahora() + vigencia }
      abiertas.set(s.id, s)
      return { ok: true, valor: s }
    },
    confirma(id, { origen, cita }) {
      vigentes()
      const s = abiertas.get(id)
      if (!s) return { ok: false, motivo: 'no hay una solicitud abierta con ese id (venció, ya se usó o nunca existió)' }
      if (!ORIGENES_VALIDOS.includes(origen)) {
        return { ok: false, motivo: origen === 'teclado' ? 'el teclado no confirma lo irreversible: un Enter a destiempo no puede mandar nada; hace falta el clic' : 'decirlo en voz alta o escribirlo no basta: lo irreversible pide su clic' }
      }
      if (normaliza(cita) !== normaliza(s.cita)) return { ok: false, motivo: 'la cita no es la de la solicitud' }
      abiertas.delete(id)
      return { ok: true, valor: s }
    },
    descarta(id) { abiertas.delete(id) },
    pendientes: vigentes,
  }
}
