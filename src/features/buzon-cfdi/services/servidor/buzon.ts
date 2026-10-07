/**
 * Las operaciones del buzón contra el Supabase del despacho, siempre con la sesión de quien llama y la llave
 * anónima: el RLS y los disparadores de la base deciden (C7). Esto traduce lo que la base dice a un aviso en
 * español, y hace lo que la base no puede: leer con el servicio del extractor y emparejar el XML con su impresa.
 *
 * El archivo no se guarda (fase 4): se lee, se toma su huella, y se queda solo la lectura.
 */
import { createHash } from 'node:crypto'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { extraeConElServicio, FalloDeCapacidad, type DocumentoEntrante } from '../../../a2a/servicio-extractor.ts'
import type { ResultadoDeExtraccion } from '../../../a2a/esquema.ts'
import { aCsv, clasifica, empareja, pendientes, revisaCampo, revisaDiscrepancia } from '../lectura.ts'
import { bandera, decodifica, leeListado69B, type BanderaSat, type Situacion } from '../lista-69b.ts'
import type { DocumentoDelBuzon, Revision } from '../../types/index.ts'

export type Resultado<T> = { ok: true; datos: T } | { ok: false; estado: number; aviso: string }
const falla = (estado: number, aviso: string): Resultado<never> => ({ ok: false, estado, aviso })

const SIN_CONSENTIMIENTO = 'esta pyme no tiene un consentimiento escrito vigente: su documento no se lee ni se guarda (RF-1, RF-2)'
const COLUMNAS = 'id, pyme_id, nombre_archivo, tipo, ruta, uuid, rfc_receptor, campos, discrepancias, estado, recibido_en, confirmado_en'

export const huellaDe = (bytes: Uint8Array): string => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

/** El mensaje de la base, en el idioma de quien lo lee: los disparadores ya hablan español. */
function aviso(error: PostgrestError): Resultado<never> {
  if (error.code === '42501') return falla(403, SIN_CONSENTIMIENTO)
  if (error.code === '23505' && error.message.includes('buzon_folio_unico')) return falla(409, 'este folio fiscal ya está en el buzón de la pyme: no se duplica (RF-13)')
  if (error.code === '23505' && error.message.includes('buzon_consentimiento_vigente')) return falla(409, 'esta pyme ya tiene un consentimiento vigente')
  if (error.code === '23505' && error.message.includes('rfc')) return falla(409, 'ya hay una pyme con ese RFC')
  if (error.code === '23505') return falla(409, 'este archivo ya se había subido a esta pyme')
  if (error.code === 'P0001') return falla(422, error.message)
  return falla(500, 'la base no pudo guardar el cambio')
}

export async function soyMiembro(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.rpc('buzon_soy_miembro')
  return data === true
}

export async function altaDePyme(supabase: SupabaseClient, datos: { rfc: string; nombre: string }): Promise<Resultado<{ id: string }>> {
  const { data, error } = await supabase.from('buzon_pymes').insert(datos).select('id').single()
  return error ? aviso(error) : { ok: true, datos: { id: String(data.id) } }
}

/** El consentimiento escrito: de su archivo firmado solo se guarda la huella; el documento se queda en el despacho. */
export async function registraConsentimiento(supabase: SupabaseClient, d: { pyme_id: string; firmado_en: string; bytes: Uint8Array }): Promise<Resultado<{ id: string }>> {
  const { data, error } = await supabase.from('buzon_consentimientos')
    .insert({ pyme_id: d.pyme_id, firmado_en: d.firmado_en, huella_documento: huellaDe(d.bytes) }).select('id').single()
  return error ? aviso(error) : { ok: true, datos: { id: String(data.id) } }
}

/** Revocar: la base borra lo de la pyme y deja la constancia (RF-3, RF-4). Devuelve cuántos documentos se borraron. */
export async function revocaConsentimiento(supabase: SupabaseClient, pymeId: string): Promise<Resultado<{ borrados: number }>> {
  const { data, error } = await supabase.from('buzon_consentimientos')
    .update({ revocado_en: new Date().toISOString() }).eq('pyme_id', pymeId).is('revocado_en', null).select('id')
  if (error) return aviso(error)
  if (!data?.length) return falla(404, 'esta pyme no tiene un consentimiento vigente que revocar')
  const { data: pyme } = await supabase.from('buzon_pymes').select('seudonimo').eq('id', pymeId).single()
  const { data: constancia } = await supabase.from('buzon_constancias').select('documentos_borrados')
    .eq('motivo', 'retiro_de_consentimiento').eq('pyme_seudonimo', pyme?.seudonimo ?? '')
    .order('borrado_en', { ascending: false }).limit(1).maybeSingle()
  return { ok: true, datos: { borrados: Number(constancia?.documentos_borrados ?? 0) } }
}

type Extraer = (d: DocumentoEntrante) => Promise<ResultadoDeExtraccion>

/**
 * Un documento entra al buzón de una pyme. El orden importa: primero el consentimiento (sin él, NO se lee: RF-1),
 * después la lectura, el cotejo del receptor (RF-12) y, si llega el otro de la pareja, el emparejamiento (RF-14).
 */
export async function ingresa(supabase: SupabaseClient, pymeId: string, archivo: DocumentoEntrante, extraer: Extraer = extraeConElServicio):
  Promise<Resultado<{ id: string; estado: string; avisos: string[]; pendientes: string[] }>> {
  const { data: pyme } = await supabase.from('buzon_pymes').select('id, rfc').eq('id', pymeId).maybeSingle()
  if (!pyme) return falla(404, 'no existe esa pyme en este despacho')
  const { data: consiente } = await supabase.rpc('buzon_consiente', { pyme: pymeId })
  if (consiente !== true) return falla(403, SIN_CONSENTIMIENTO)

  let leido: ResultadoDeExtraccion
  try {
    leido = await extraer(archivo)
  } catch (e) {
    return falla(e instanceof FalloDeCapacidad ? 422 : 503, e instanceof FalloDeCapacidad ? e.message : 'no se pudo leer el documento')
  }
  const c = clasifica(leido, String(pyme.rfc))
  let discrepancias = [] as ReturnType<typeof empareja>
  let estado: string = c.estado
  const otro = c.uuid ? (await supabase.from('buzon_documentos').select('id, campos, estado').eq('pyme_id', pymeId)
    .eq('uuid', c.uuid).neq('tipo', c.tipo).maybeSingle()).data : null
  if (otro && c.estado === 'en_revision') {
    if (c.tipo === 'impresa') {
      estado = 'emparejada'
      const nuevas = empareja(otro.campos, c.campos)
      if (nuevas.length && otro.estado === 'en_revision') await supabase.from('buzon_documentos').update({ discrepancias: nuevas }).eq('id', otro.id)
      if (nuevas.length) c.avisos.push(`la impresa no coincide con su XML en: ${nuevas.map((d) => d.clave).join(', ')}. Manda el XML (RF-9)`)
    } else {
      discrepancias = empareja(c.campos, otro.campos)
      if (otro.estado === 'en_revision') await supabase.from('buzon_documentos').update({ estado: 'emparejada' }).eq('id', otro.id)
    }
  }
  const fila = { pyme_id: pymeId, nombre_archivo: archivo.nombre.slice(0, 255), huella: huellaDe(archivo.bytes), tipo: c.tipo, ruta: c.ruta,
    uuid: c.uuid, rfc_receptor: c.rfc_receptor, campos: c.campos, discrepancias, estado }
  const { data, error } = await supabase.from('buzon_documentos').insert(fila).select('id').single()
  if (error) return aviso(error)
  return { ok: true, datos: { id: String(data.id), estado, avisos: c.avisos, pendientes: pendientes({ estado: estado as DocumentoDelBuzon['estado'], campos: c.campos, discrepancias }) } }
}

/** Revisar un campo, dar por revisada una discrepancia o confirmar. La base vuelve a exigir RF-12 y RF-17. */
export async function revisa(supabase: SupabaseClient, documentoId: string, r: Revision): Promise<Resultado<DocumentoDelBuzon>> {
  const { data: doc } = await supabase.from('buzon_documentos').select(COLUMNAS).eq('id', documentoId).maybeSingle<DocumentoDelBuzon>()
  if (!doc) return falla(404, 'no existe ese documento en este despacho')
  let cambio: Partial<Pick<DocumentoDelBuzon, 'campos' | 'discrepancias' | 'estado'>>
  try {
    cambio = r.accion === 'campo' ? { campos: revisaCampo(doc.campos, r.clave, r.valor) }
      : r.accion === 'discrepancia' ? { discrepancias: revisaDiscrepancia(doc.discrepancias, r.clave) }
        : { estado: 'confirmado' }
  } catch (e) {
    return falla(400, e instanceof Error ? e.message : 'revisión no válida')
  }
  const { data, error } = await supabase.from('buzon_documentos').update(cambio).eq('id', documentoId).select(COLUMNAS).single<DocumentoDelBuzon>()
  return error ? aviso(error) : { ok: true, datos: data }
}

export async function documentosDe(supabase: SupabaseClient, pymeId: string): Promise<DocumentoDelBuzon[]> {
  const { data } = await supabase.from('buzon_documentos').select(COLUMNAS).eq('pyme_id', pymeId).order('recibido_en', { ascending: false })
  return (data ?? []) as DocumentoDelBuzon[]
}

export async function exporta(supabase: SupabaseClient, pymeId: string): Promise<string> {
  return aCsv(await documentosDe(supabase, pymeId))
}

// --- El listado 69-B del SAT (fase 5) ----------------------------------------------------------------------------

export interface Lista69B { readonly id: string; readonly fuente: string; readonly actualizada_al: string; readonly registros: number; readonly descartados: number }

/**
 * Importa el listado que el operador bajó fuera (la máquina del despacho no sale a internet). Una sola llamada a la
 * base: la lista y sus filas entran juntas o no entra nada. La fecha es la que el propio listado declara.
 */
export async function importaLista69B(supabase: SupabaseClient, d: { bytes: Uint8Array; fuente: string }):
  Promise<Resultado<{ id: string; registros: number; descartados: number; actualizadaAl: string }>> {
  let leido: ReturnType<typeof leeListado69B>
  try {
    leido = leeListado69B(decodifica(d.bytes))
  } catch (e) {
    return falla(400, e instanceof Error ? e.message : 'no se pudo leer el listado')
  }
  if (!leido.actualizadaAl) return falla(400, 'el listado no dice a qué fecha está actualizado: sin fecha no se importa (RF-18)')
  if (leido.filas.length === 0) return falla(400, 'el listado no trae ninguna fila con RFC válido')
  const { data, error } = await supabase.rpc('buzon_importa_69b', {
    fuente: d.fuente, actualizada_al: leido.actualizadaAl, huella: huellaDe(d.bytes), descartados: leido.descartadas.length, filas: leido.filas,
  })
  if (error?.code === '23505') return falla(409, 'ese mismo archivo del listado ya está importado')
  if (error) return aviso(error)
  return { ok: true, datos: { id: String(data), registros: leido.filas.length, descartados: leido.descartadas.length, actualizadaAl: leido.actualizadaAl } }
}

/** El listado vigente: el de fecha más reciente (y, a igual fecha, el último importado). */
export async function listaVigente(supabase: SupabaseClient): Promise<Lista69B | null> {
  const { data } = await supabase.from('buzon_listas_69b').select('id, fuente, actualizada_al, registros, descartados')
    .order('actualizada_al', { ascending: false }).order('importada_en', { ascending: false }).limit(1).maybeSingle<Lista69B>()
  return data ?? null
}

/** Las banderas de los emisores de un grupo de CFDI, contra el listado vigente (RF-18). Sin listado, ninguna. */
export async function banderasDe(supabase: SupabaseClient, rfcs: readonly string[]): Promise<Map<string, BanderaSat>> {
  const lista = await listaVigente(supabase)
  const unicos = [...new Set(rfcs.map((r) => r.trim().toUpperCase()).filter(Boolean))]
  if (!lista || unicos.length === 0) return new Map()
  const { data } = await supabase.from('buzon_lista_69b_rfc').select('rfc, situacion').eq('lista_id', lista.id).in('rfc', unicos)
  const por = new Map<string, Situacion[]>()
  for (const f of data ?? []) por.set(String(f.rfc), [...(por.get(String(f.rfc)) ?? []), f.situacion as Situacion])
  const banderas = new Map<string, BanderaSat>()
  for (const [rfc, situaciones] of por) {
    const b = bandera(rfc, situaciones, { fuente: lista.fuente, actualizadaAl: lista.actualizada_al })
    if (b) banderas.set(rfc, b)
  }
  return banderas
}

