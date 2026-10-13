/**
 * D1 en el dominio (PRP-011): al núcleo común solo sube lo aprendido de una consultora con el consentimiento VIGENTE de
 * esa consultora y del cliente de origen. Es la misma regla que la base (`ss_priv.falta_para_el_nucleo`), con los
 * mismos mensajes: dicen QUÉ falta, nunca de quién. Quién puede consentir (una persona de esa organización) lo decide
 * quien llama, que conoce la sesión.
 *
 * Revocar frena lo que no ha subido; lo ya subido, generalizado, se queda (DP-1). Un consentimiento revocado no se
 * reabre: se da uno nuevo, y el historial se conserva.
 */

export interface Consentimiento { readonly por: string; readonly fecha: string; readonly revocado: string | null }
/** El historial de consentimientos de cada organización (consultora o cliente), el más reciente al final. */
export type Consentimientos = Readonly<Record<string, readonly Consentimiento[]>>
/** De dónde nació una enseñanza: la consultora y el cliente de su incidencia. Se guarda aparte, no en la propuesta. */
export interface Origen { readonly consultora: string; readonly cliente: string }

/** El consentimiento vigente de una organización, o null. */
export const vigente = (cs: Consentimientos, organizacion: string): Consentimiento | null =>
  (cs[organizacion] ?? []).find((c) => c.revocado === null) ?? null

/** Lo que le falta a una enseñanza para subir al núcleo, o null. */
export function faltaParaElNucleo(cs: Consentimientos, origen: Origen | null): string | null {
  if (!origen) return 'al núcleo común solo sube lo que tiene su origen registrado (D1)'
  if (!vigente(cs, origen.consultora)) return 'falta el consentimiento de la consultora de origen para el núcleo común (D1)'
  if (!vigente(cs, origen.cliente)) return 'falta el consentimiento del cliente de origen para el núcleo común (D1)'
  return null
}

/** Una organización consiente, a nombre de `por`. Si ya tiene uno vigente, no se duplica. */
export function consiente(cs: Consentimientos, organizacion: string, por: string, fecha: string): Consentimientos {
  if (vigente(cs, organizacion)) throw new Error('ya hay un consentimiento vigente: para cambiarlo, se revoca')
  return { ...cs, [organizacion]: [...(cs[organizacion] ?? []), { por, fecha, revocado: null }] }
}

/** Una organización revoca su consentimiento vigente. Lo ya subido se queda (DP-1). */
export function revoca(cs: Consentimientos, organizacion: string, fecha: string): Consentimientos {
  if (!vigente(cs, organizacion)) throw new Error('no hay un consentimiento vigente que revocar')
  return { ...cs, [organizacion]: (cs[organizacion] ?? []).map((c) => (c.revocado === null ? { ...c, revocado: fecha } : c)) }
}
