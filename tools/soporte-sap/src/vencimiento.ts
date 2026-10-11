/**
 * D8 (PRP-012): cuándo vence lo que se guarda, con las mismas reglas que la base, para que la pantalla y el job digan lo
 * mismo. Puro: no lee la base ni el reloj; la fecha de hoy la da quien llama.
 *
 *   · un original vence N días después de la ÚLTIMA resolución (de la incidencia o de una impugnación), nunca con una
 *     impugnación abierta, y sin N en el contrato no vence (DP-3, DP-4; `ss_priv.original_vencido`);
 *   · una baja va sin export, en su gracia, lista para borrar o cumplida, y sin gracia en el contrato no se borra nada
 *     (`ss_priv.baja_vencida`).
 */

/** Dónde va una baja: sin plazo en el contrato, sin export todavía, en su gracia, lista para borrar o cumplida. */
export type EstadoBaja = 'sin_plazo' | 'sin_export' | 'en_gracia' | 'lista' | 'cumplida'

/** El estado de una baja. `vencio`: la gracia ya terminó (lo decide quien tiene el reloj: la base o el laboratorio). */
export const estadoDeBaja = (b: { readonly exportSha256: string | null; readonly borrarDesde: string | null; readonly borradaEn: string | null; readonly vencio: boolean }): EstadoBaja =>
  b.borradaEn ? 'cumplida' : !b.exportSha256 ? 'sin_export' : b.borrarDesde === null ? 'sin_plazo' : b.vencio ? 'lista' : 'en_gracia'

/** Una fecha más unos días; sin días, null («por decidir» no es cero). */
export const masDias = (fecha: string, dias: number | null): string | null =>
  dias === null ? null : new Date(Date.parse(fecha) + dias * 86_400_000).toISOString()

export type EstadoOriginal = 'sin_resolver' | 'impugnada' | 'sin_plazo' | 'vence' | 'vencido'
export interface VencimientoOriginal { readonly estado: EstadoOriginal; readonly fecha: string | null; readonly texto: string }

/** Cuándo vence el original de un adjunto, y la frase que lo dice. */
export function vencimientoDeOriginal(
  p: { readonly resueltaEn: string | null; readonly impugnaciones: ReadonlyArray<{ readonly estado: string; readonly resuelta: string | null }>; readonly dias: number | null },
  ahora: string,
): VencimientoOriginal {
  if (p.resueltaEn === null) return { estado: 'sin_resolver', fecha: null, texto: 'se guarda mientras la incidencia siga abierta' }
  if (p.impugnaciones.some((m) => m.estado === 'abierta')) return { estado: 'impugnada', fecha: null, texto: 'no vence mientras haya una impugnación abierta (D8, DP-3)' }
  if (p.dias === null) return { estado: 'sin_plazo', fecha: null, texto: 'no vence: el contrato todavía no dice cuántos días se guarda (D8, DP-4)' }
  const ultima = [p.resueltaEn, ...p.impugnaciones.map((m) => m.resuelta).filter((f): f is string => f !== null)].sort().at(-1)!
  const fecha = masDias(ultima, p.dias)!
  return fecha <= ahora
    ? { estado: 'vencido', fecha, texto: `venció el ${fecha.slice(0, 10)}: el job de retención borra el original y la fila se queda` }
    : { estado: 'vence', fecha, texto: `se borra el ${fecha.slice(0, 10)}, ${p.dias} días después de la última resolución` }
}
