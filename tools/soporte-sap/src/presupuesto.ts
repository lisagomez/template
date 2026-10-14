/**
 * El presupuesto de una consultora en su MES (PRP-010 H-18). El tope sale de la base (`ss_presupuesto`: una fila por
 * consultora y mes) y lo gastado sale de la CADENA del mes: las páginas de OCR que anotó cada `ADJUNTO_LEIDO` y los
 * tokens que anotó cada `PLAN_PREPARADO`. «Gastado» se define una sola vez (`usoDelMes`), para la base y para el
 * laboratorio en memoria.
 *
 * Sin fila del mes no hay tope declarado, y eso NO es «sin límite». Tampoco lo es un uso sin medir: un plan sin sus
 * tokens, o una lectura de OCR sin sus páginas, hace que lo gastado no se conozca. En los dos casos `veredictoDelMes` no deja llamar al modelo, y
 * `accionAnteElPresupuesto` manda P1 y P2 a una persona y deja esperar a P3 y P4, con aviso. Sin tope de OCR, el OCR
 * no corre: su tope es 0.
 *
 * `veredictoDelMes` sigue las reglas de `guardiaPresupuesto` de la sala (fail-closed, aviso al 80 %); una prueba
 * compara las dos para que no se separen.
 */
import type { Consulta } from './respaldo.js'
import type { Veredicto } from './pricing.js'

export interface EventoDeUso { readonly tipo: string; readonly datos: Readonly<Record<string, unknown>> }
export interface UsoDelMes {
  readonly tokens: number
  readonly paginasOcr: number
  /** Planes sin sus tokens y lecturas de OCR sin sus páginas: mientras sean > 0, lo gastado no se conoce. */
  readonly tokensSinMedir: number
  readonly ocrSinMedir: number
}
export interface PresupuestoDelMes extends UsoDelMes {
  readonly consultora: string
  /** El primer día del mes, `AAAA-MM-01`. */
  readonly mes: string
  readonly topeTokens: number | null
  readonly topePaginasOcr: number | null
}

export const mesDe = (fecha: string): string => `${fecha.slice(0, 7)}-01`
const medida = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null)

/** Lo gastado del mes, desde sus eventos. Un plan sin `tokens` o una lectura de OCR sin `paginasOcr` no cuentan como cero. */
export function usoDelMes(eventos: readonly EventoDeUso[]): UsoDelMes {
  let tokens = 0, paginasOcr = 0, tokensSinMedir = 0, ocrSinMedir = 0
  for (const e of eventos) {
    if (e.tipo === 'PLAN_PREPARADO') {
      const t = medida(e.datos['tokens'])
      if (t === null) tokensSinMedir++; else tokens += t
    } else if (e.tipo === 'ADJUNTO_LEIDO' && e.datos['via'] === 'ocr_local') {
      const p = medida(e.datos['paginasOcr'])
      if (p === null) ocrSinMedir++; else paginasOcr += p
    }
  }
  return { tokens, paginasOcr, tokensSinMedir, ocrSinMedir }
}

/** El tope del mes y lo gastado, leídos de la base con el rol y la tarea de la consultora. */
export async function leePresupuesto(q: Consulta, consultora: string, fecha: string): Promise<PresupuestoDelMes> {
  const mes = mesDe(fecha)
  const [fila] = await q<{ tope_tokens: string | number | null; tope_paginas_ocr: number | null }>(
    'select tope_tokens, tope_paginas_ocr from public.ss_presupuesto where consultora_id = $1 and mes = $2::date', [consultora, mes])
  const eventos = await q<EventoDeUso>(`select tipo, datos from public.ss_evento where consultora_id = $1 and tipo in ('ADJUNTO_LEIDO', 'PLAN_PREPARADO')
    and fecha >= $2::date and fecha < ($2::date + interval '1 month')`, [consultora, mes])
  return { consultora, mes, topeTokens: fila?.tope_tokens == null ? null : Number(fila.tope_tokens), topePaginasOcr: fila?.tope_paginas_ocr ?? null, ...usoDelMes(eventos) }
}

/** ¿Se puede llamar al modelo con este costo? Sin tope o con un uso sin medir, no (fail-closed visible). */
export function veredictoDelMes(p: PresupuestoDelMes, costo: number): Veredicto {
  const periodo = p.mes.slice(0, 7)
  if (p.topeTokens === null) return { permitido: false, motivo: 'sin_presupuesto', texto: `sin tope de tokens de ${p.consultora} para ${periodo}: no se llama al modelo` }
  if (p.tokensSinMedir > 0) return { permitido: false, motivo: 'sin_presupuesto', texto: `${p.tokensSinMedir} plan(es) de ${periodo} sin sus tokens: lo gastado no se conoce y no se llama al modelo` }
  if (p.tokens + costo > p.topeTokens) return { permitido: false, motivo: 'excedido', texto: `el presupuesto de tokens de ${p.consultora} para ${periodo} no alcanza` }
  return { permitido: true, restante: p.topeTokens - p.tokens - costo, aviso: (p.tokens + costo) / p.topeTokens >= 0.8 }
}

/** El tope de OCR del mes para la ingesta: sin tope declarado o con lecturas sin medir, 0 (la imagen queda sin leer y se dice). */
export const ocrDelMes = (p: PresupuestoDelMes): { readonly maximas: number; readonly usadas: number } =>
  ({ maximas: p.ocrSinMedir > 0 ? 0 : (p.topePaginasOcr ?? 0), usadas: p.paginasOcr })
